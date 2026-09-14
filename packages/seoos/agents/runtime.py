"""The agent executor.

One agent, one task, one tool-use loop, bounded in every dimension that can
run away: iterations, tool calls, wall clock, and dollars. The loop is
deliberately plain. Cleverness here costs debuggability, and when a client
asks why their homepage title changed, the answer has to be reconstructable
from ``agent_runs`` and ``tool_calls`` alone.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from seoos.agents.registry import AgentRegistry, get_registry
from seoos.agents.spec import AgentSpec
from seoos.core.errors import BudgetExceeded, SeoOSError
from seoos.core.logging import bind, get_logger, unbind
from seoos.llm.base import Message, ToolResult, ToolUse
from seoos.llm.router import ModelRouter, SpendGuard
from seoos.tools.registry import ToolContext, ToolExecutor, ToolOutcome

log = get_logger("seoos.agents.runtime")


@dataclass
class AgentResult:
    agent_key: str
    ok: bool
    text: str = ""
    structured: Any = None
    iterations: int = 0
    tool_calls: int = 0
    cost_usd: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    duration_ms: int = 0
    error: str | None = None
    degraded: bool = False
    approvals_raised: list[str] = field(default_factory=list)
    artifacts: dict[str, Any] = field(default_factory=dict)
    transcript: list[dict[str, Any]] = field(default_factory=list)

    def summary_line(self) -> str:
        state = "ok" if self.ok else "failed"
        return (
            f"{self.agent_key}: {state} in {self.iterations} turns, "
            f"{self.tool_calls} tool calls, ${self.cost_usd:.4f}"
        )


class AgentRuntime:
    def __init__(
        self,
        router: ModelRouter,
        executor: ToolExecutor,
        *,
        registry: AgentRegistry | None = None,
        recorder=None,
        wall_clock_limit_s: int = 900,
    ):
        self.router = router
        self.executor = executor
        self.registry = registry or get_registry()
        self.recorder = recorder  # async (AgentSpec, AgentResult, ctx) -> str | None
        self.wall_clock_limit_s = wall_clock_limit_s

    async def run(
        self,
        agent_key: str,
        task: str,
        ctx: ToolContext,
        *,
        context_blocks: dict[str, str] | None = None,
        expect_json: bool | None = None,
        depth: int = 0,
        extra_messages: list[Message] | None = None,
    ) -> AgentResult:
        spec = self.registry.get(agent_key)
        token = bind(agent=agent_key, site=ctx.site_id, run=ctx.mission_run_id)
        started = time.perf_counter()
        deadline = started + self.wall_clock_limit_s

        result = AgentResult(agent_key=agent_key, ok=False)
        ctx = _child_context(ctx, agent_key)

        try:
            tools = self.executor.registry.resolve(spec.tools)
            tool_specs = [t.spec() for t in tools]
            if spec.delegates_to:
                tool_specs.append(_delegation_spec(spec))

            want_json = spec.output_schema is not None if expect_json is None else expect_json
            system = spec.render_system_prompt(
                {**(context_blocks or {}), **_schema_block(spec, want_json)}
            )
            messages: list[Message] = [Message.user(task)]
            if extra_messages:
                messages.extend(extra_messages)

            budget = SpendGuard(
                run_limit_usd=spec.cost_ceiling_usd,
                org_remaining_usd=getattr(ctx.budget, "org_remaining_usd", 10_000.0),
            )
            if ctx.budget is not None:
                budget.org_remaining_usd = ctx.budget.org_remaining_usd
            self.router.spend_guard = budget

            for iteration in range(1, spec.max_iterations + 1):
                result.iterations = iteration
                if time.perf_counter() > deadline:
                    result.error = "agent exceeded its wall clock limit"
                    break

                completion = await self.router.complete(
                    messages,
                    system=system,
                    tier=spec.model_tier,
                    model=spec.model_override,
                    tools=tool_specs or None,
                    max_tokens=spec.max_tokens,
                    temperature=spec.temperature,
                    response_format="json" if (want_json and not tool_specs) else None,
                )
                result.cost_usd += completion.usage.usd
                result.tokens_in += completion.usage.input_tokens
                result.tokens_out += completion.usage.output_tokens
                if completion.stop_reason == "degraded":
                    result.degraded = True

                result.transcript.append(
                    {
                        "turn": iteration,
                        "text": (completion.text or "")[:4000],
                        "tools": [t.name for t in completion.tool_uses],
                    }
                )

                if not completion.wants_tools:
                    result.text = completion.text or ""
                    result.ok = True
                    break

                messages.append(
                    Message.assistant(completion.text or None, completion.tool_uses)
                )
                tool_results = await self._run_tools(
                    completion.tool_uses, ctx, result, spec, depth
                )
                messages.append(Message.tool(tool_results))

                if result.tool_calls >= _tool_call_ceiling(spec):
                    messages.append(
                        Message.user(
                            "You have reached this task's tool budget. Produce your "
                            "final answer now from what you already have, and state "
                            "plainly what you could not check."
                        )
                    )
            else:
                # Loop exhausted without a final answer: ask for one rather
                # than returning nothing after spending real money.
                result.text, extra = await self._force_conclusion(messages, system, spec)
                result.cost_usd += extra
                result.ok = bool(result.text)

            if result.ok and want_json:
                result.structured = _parse_structured(result.text)
                if result.structured is None and spec.output_schema:
                    result.ok = False
                    result.error = "agent did not return parseable JSON"

        except BudgetExceeded as exc:
            result.error = exc.message
            result.ok = False
        except SeoOSError as exc:
            result.error = f"{exc.code}: {exc.message}"
            result.ok = False
        except asyncio.CancelledError:
            result.error = "cancelled"
            raise
        except Exception as exc:  # noqa: BLE001
            log.exception("agent %s crashed", agent_key)
            result.error = f"unexpected error: {exc}"
            result.ok = False
        finally:
            result.duration_ms = int((time.perf_counter() - started) * 1000)
            unbind(token)

        if self.recorder:
            await self.recorder(spec, result, ctx)
        log.info(result.summary_line())
        return result

    # -- tool execution -----------------------------------------------------

    async def _run_tools(
        self,
        uses: list[ToolUse],
        ctx: ToolContext,
        result: AgentResult,
        spec: AgentSpec,
        depth: int,
    ) -> list[ToolResult]:
        """Independent calls run concurrently; that is most of the speed."""
        async def one(use: ToolUse) -> ToolResult:
            result.tool_calls += 1
            if use.name == "delegate_to_agent":
                outcome = await self._delegate(use.arguments, ctx, spec, depth)
            else:
                outcome = await self.executor.execute(use.name, use.arguments, ctx)
            if outcome.approval_id:
                result.approvals_raised.append(outcome.approval_id)
            result.cost_usd += outcome.cost_usd
            return ToolResult(
                tool_use_id=use.id,
                name=use.name,
                content=outcome.to_model_text(),
                is_error=not outcome.ok,
            )

        return list(await asyncio.gather(*(one(u) for u in uses)))

    async def _delegate(
        self, args: dict, ctx: ToolContext, spec: AgentSpec, depth: int
    ) -> ToolOutcome:
        target = args.get("agent")
        task = args.get("task", "")
        if target not in spec.delegates_to:
            return ToolOutcome(
                ok=False,
                error=(
                    f"{spec.key} may not delegate to {target!r}. "
                    f"Allowed: {', '.join(spec.delegates_to) or 'none'}"
                ),
            )
        from seoos.core.config import get_settings

        if depth + 1 >= get_settings().max_agent_depth:
            return ToolOutcome(
                ok=False,
                error="delegation depth limit reached; do this work yourself or report it",
            )
        sub = await self.run(target, task, ctx, depth=depth + 1)
        return ToolOutcome(
            ok=sub.ok,
            data={"agent": target, "output": sub.structured or sub.text[:8000]},
            summary=sub.summary_line(),
            error=sub.error,
            cost_usd=sub.cost_usd,
        )

    async def _force_conclusion(
        self, messages: list[Message], system: str, spec: AgentSpec
    ) -> tuple[str, float]:
        messages.append(
            Message.user(
                "You have used every turn available. Give your final answer now "
                "using only what you have already gathered. Be explicit about "
                "what you could not verify."
            )
        )
        completion = await self.router.complete(
            messages,
            system=system,
            tier=spec.model_tier,
            model=spec.model_override,
            max_tokens=spec.max_tokens,
            temperature=spec.temperature,
        )
        return completion.text or "", completion.usage.usd


def _child_context(ctx: ToolContext, agent_key: str) -> ToolContext:
    from dataclasses import replace

    return replace(ctx, agent_key=agent_key)


def _tool_call_ceiling(spec: AgentSpec) -> int:
    from seoos.core.config import get_settings

    return min(get_settings().max_tool_calls_per_run, spec.max_iterations * 8)


def _delegation_spec(spec: AgentSpec):
    from seoos.llm.base import ToolSpec

    return ToolSpec(
        name="delegate_to_agent",
        description=(
            "Hand a self-contained piece of work to another specialist on the "
            "team and get their finished output back. Use this when the work "
            "genuinely belongs to their discipline, not to avoid doing yours. "
            f"You may delegate to: {', '.join(spec.delegates_to)}."
        ),
        parameters={
            "type": "object",
            "properties": {
                "agent": {"type": "string", "enum": spec.delegates_to},
                "task": {
                    "type": "string",
                    "description": (
                        "The complete instruction. They do not see this "
                        "conversation, so include every fact they need."
                    ),
                },
            },
            "required": ["agent", "task"],
        },
    )


def _schema_block(spec: AgentSpec, want_json: bool) -> dict[str, str]:
    if not want_json or not spec.output_schema:
        return {}
    return {
        "Required output format": (
            "Your final message must be a single JSON object matching this "
            "schema, with no prose around it and no code fence:\n\n```json\n"
            + json.dumps(spec.output_schema, indent=2)
            + "\n```"
        )
    }


def _parse_structured(text: str) -> Any:
    from seoos.llm.base import Completion

    try:
        return Completion(text=text).json()
    except (ValueError, TypeError):
        return None


def utcnow() -> datetime:
    return datetime.now(UTC)
