"""The tool registry: everything an agent is allowed to do.

Design rules that the rest of the platform depends on:

* **A tool is the only way an agent touches the world.** No agent writes to
  the database, calls an API, or publishes anything except through a
  registered tool. That makes the blast radius of a hallucinating model
  exactly the set of registered mutations, which is auditable.
* **Mutations are declared, not inferred.** ``mutates=True`` puts a call
  through the approval policy before it executes, and writes an audit row
  after. A tool author cannot forget this: the executor refuses to run any
  tool that touches a connector without a declared risk level.
* **Every call is recorded.** Args, duration, outcome and cost land in
  ``tool_calls`` whether the call succeeded or not.
"""

from __future__ import annotations

import inspect
import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from seoos.core.errors import (
    ApprovalRequired,
    PermissionDenied,
    SafetyRefusal,
    SeoOSError,
)
from seoos.core.logging import get_logger
from seoos.llm.base import ToolSpec

log = get_logger("seoos.tools")

# "internal" is for mutations that only touch the platform's own records
# (a notification, a memory entry, a KPI row). They still get audited, but
# they cannot affect the client's site, so they never need approval.
RISK_LEVELS = ("none", "internal", "low", "medium", "high", "critical")


@dataclass
class ToolContext:
    """Everything a tool needs, handed in rather than imported.

    Passing the session and tenant context explicitly is what keeps tools
    testable and stops a tool from quietly widening its own scope.
    """

    org_id: str
    site_id: str | None = None
    session: Any = None                # AsyncSession
    tenant: Any = None                 # TenantContext
    router: Any = None                 # ModelRouter
    mission_run_id: str | None = None
    agent_run_id: str | None = None
    agent_key: str | None = None
    autonomy: str = "propose"
    dry_run: bool = False
    budget: Any = None                 # SpendGuard
    site: Any = None                   # Site ORM row, loaded once per run
    blackboard: dict[str, Any] = field(default_factory=dict)
    extras: dict[str, Any] = field(default_factory=dict)

    def require_site(self):
        if self.site is None:
            raise SeoOSError("This tool needs a site in context but none was supplied")
        return self.site


@dataclass
class ToolOutcome:
    """What a tool hands back to the runtime."""

    ok: bool
    data: Any = None
    summary: str = ""
    error: str | None = None
    cost_usd: float = 0.0
    approval_id: str | None = None
    degraded: bool = False

    def to_model_text(self, max_chars: int = 12000) -> str:
        """Render for the model. Truncated hard: a 200kB crawl dump pasted
        into a prompt is how agent runs get expensive and stupid."""
        if not self.ok:
            return json.dumps({"error": self.error or "tool failed", "ok": False})
        payload = {"ok": True}
        if self.summary:
            payload["summary"] = self.summary
        if self.approval_id:
            payload["approval_id"] = self.approval_id
            payload["note"] = "Queued for human approval; it has not taken effect yet."
        if self.degraded:
            payload["degraded"] = True
        if self.data is not None:
            payload["data"] = self.data
        text = json.dumps(payload, default=str, ensure_ascii=False)
        if len(text) > max_chars:
            trimmed = json.dumps(
                {
                    "ok": True,
                    "summary": self.summary or "result truncated",
                    "truncated": True,
                    "note": (
                        f"Result was {len(text)} characters and has been truncated to "
                        f"{max_chars}. Narrow the query or request a specific field."
                    ),
                    "data_preview": text[: max_chars - 400],
                },
                ensure_ascii=False,
            )
            return trimmed
        return text


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable
    mutates: bool = False
    risk: str = "none"
    scopes: tuple[str, ...] = ()
    approval_type: str | None = None
    # Minimum autonomy level at which this tool may run without a human.
    # Below it, the call is converted into an approval request.
    auto_from: str | None = None
    category: str = "general"
    cost_hint_usd: float = 0.0
    tags: tuple[str, ...] = ()

    def spec(self) -> ToolSpec:
        return ToolSpec(name=self.name, description=self.description, parameters=self.parameters)


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> Tool:
        if tool.name in self._tools:
            raise ValueError(f"Duplicate tool name: {tool.name}")
        if tool.mutates and tool.risk == "none":
            raise ValueError(
                f"Tool {tool.name} mutates state but declares no risk level. "
                "Declare risk so the approval policy can reason about it. "
                "Use risk='internal' if it only writes platform records."
            )
        if tool.risk not in RISK_LEVELS:
            raise ValueError(
                f"Tool {tool.name} declares unknown risk {tool.risk!r}; "
                f"expected one of {', '.join(RISK_LEVELS)}"
            )
        self._tools[tool.name] = tool
        return tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return sorted(self._tools)

    def all(self) -> list[Tool]:
        return [self._tools[n] for n in sorted(self._tools)]

    def by_category(self, category: str) -> list[Tool]:
        return [t for t in self.all() if t.category == category]

    def resolve(self, patterns: list[str]) -> list[Tool]:
        """Expand an agent's declared tool list.

        Supports exact names, ``category:*`` and a trailing ``*`` wildcard,
        so an agent spec can say ``content.*`` instead of listing nine tools
        and drifting out of date when a tenth is added.
        """
        selected: dict[str, Tool] = {}
        for pattern in patterns:
            if pattern.startswith("category:"):
                for tool in self.by_category(pattern.split(":", 1)[1]):
                    selected[tool.name] = tool
            elif pattern.endswith("*"):
                prefix = pattern[:-1]
                for tool in self.all():
                    if tool.name.startswith(prefix):
                        selected[tool.name] = tool
            elif pattern in self._tools:
                selected[pattern] = self._tools[pattern]
            else:
                log.warning("agent referenced unknown tool %r", pattern)
        return [selected[n] for n in sorted(selected)]


REGISTRY = ToolRegistry()

_AUTONOMY_ORDER = {"observe": 0, "propose": 1, "assisted": 2, "managed": 3, "autopilot": 4}


def tool(
    name: str,
    description: str,
    parameters: dict[str, Any] | None = None,
    *,
    mutates: bool = False,
    risk: str = "none",
    scopes: tuple[str, ...] = (),
    approval_type: str | None = None,
    auto_from: str | None = None,
    category: str = "general",
    cost_hint_usd: float = 0.0,
    tags: tuple[str, ...] = (),
    registry: ToolRegistry | None = None,
):
    """Decorator registering an async function as an agent-callable tool."""

    def decorator(fn: Callable) -> Callable:
        if not inspect.iscoroutinefunction(fn):
            raise TypeError(f"Tool {name} must be an async function")
        (registry or REGISTRY).register(
            Tool(
                name=name,
                description=inspect.cleandoc(description),
                parameters=parameters or {"type": "object", "properties": {}},
                handler=fn,
                mutates=mutates,
                risk=risk,
                scopes=scopes,
                approval_type=approval_type,
                auto_from=auto_from,
                category=category,
                cost_hint_usd=cost_hint_usd,
                tags=tags,
            )
        )
        return fn

    return decorator


def autonomy_allows(site_autonomy: str, required: str | None) -> bool:
    """Is this site's autonomy level at or above what the tool needs?"""
    if required is None:
        return True
    return _AUTONOMY_ORDER.get(site_autonomy, 0) >= _AUTONOMY_ORDER.get(required, 99)


class ToolExecutor:
    """Runs tools on behalf of an agent, applying policy and recording everything."""

    def __init__(self, registry: ToolRegistry | None = None, *, recorder=None, policy=None):
        self.registry = registry or REGISTRY
        self.recorder = recorder      # async (ToolCall fields) -> None
        self.policy = policy          # ApprovalPolicy

    async def execute(self, name: str, args: dict, ctx: ToolContext) -> ToolOutcome:
        tool_def = self.registry.get(name)
        if tool_def is None:
            return ToolOutcome(ok=False, error=f"No such tool: {name}")

        started = time.perf_counter()
        outcome: ToolOutcome
        try:
            outcome = await self._run_with_policy(tool_def, args, ctx)
        except SafetyRefusal as exc:
            # A refusal is a final answer, not an error to retry around.
            outcome = ToolOutcome(ok=False, error=f"refused: {exc.message}")
        except ApprovalRequired as exc:
            outcome = ToolOutcome(
                ok=True,
                summary=exc.message,
                approval_id=exc.approval_id,
                data={"status": "awaiting_approval"},
            )
        except PermissionDenied as exc:
            outcome = ToolOutcome(ok=False, error=f"not permitted: {exc.message}")
        except SeoOSError as exc:
            outcome = ToolOutcome(ok=False, error=f"{exc.code}: {exc.message}")
        except TimeoutError:
            outcome = ToolOutcome(ok=False, error="tool timed out")
        except Exception as exc:  # noqa: BLE001 - a tool crash must not kill the run
            log.exception("tool %s raised", name)
            outcome = ToolOutcome(ok=False, error=f"unexpected error: {exc}")

        duration_ms = int((time.perf_counter() - started) * 1000)
        if self.recorder:
            # A failure to write the audit row must never turn a successful
            # tool call into a failed one. Record the loss and move on.
            try:
                await self._record(tool_def, name, args, outcome, duration_ms, ctx)
            except Exception:  # noqa: BLE001
                log.exception("could not record the tool call for %s", name)
        return outcome

    async def _record(self, tool_def, name, args, outcome, duration_ms, ctx) -> None:
        await self.recorder(
            {
                "tool": name,
                "args": _redact(args),
                "ok": outcome.ok,
                "result_summary": (outcome.summary or outcome.error or "")[:2000],
                "duration_ms": duration_ms,
                "error": outcome.error,
                "is_mutation": tool_def.mutates,
                "cost_usd": outcome.cost_usd,
                "ctx": ctx,
            }
        )

    async def _run_with_policy(self, tool_def: Tool, args: dict, ctx: ToolContext) -> ToolOutcome:
        if tool_def.mutates and ctx.autonomy == "observe":
            raise PermissionDenied(
                f"{tool_def.name} changes live state and this site is in observe-only mode"
            )

        if tool_def.mutates and self.policy is not None:
            decision = await self.policy.evaluate(tool_def, args, ctx)
            if decision.requires_approval:
                approval_id = await self.policy.request_approval(tool_def, args, ctx, decision)
                raise ApprovalRequired(
                    f"'{decision.title}' is queued for approval", approval_id=approval_id
                )
            if decision.refuse:
                raise SafetyRefusal(decision.reason or "policy refused this action")

        if tool_def.mutates and ctx.dry_run:
            return ToolOutcome(
                ok=True,
                summary=f"dry run: {tool_def.name} would have executed",
                data={"dry_run": True, "args": _redact(args)},
            )

        result = await tool_def.handler(ctx, **args)
        if isinstance(result, ToolOutcome):
            return result
        return ToolOutcome(ok=True, data=result, summary=_auto_summary(result))


_SECRET_KEYS = {
    "password", "api_key", "apikey", "token", "secret", "authorization",
    "refresh_token", "access_token", "client_secret", "private_key",
}


def _redact(args: dict) -> dict:
    out = {}
    for key, value in (args or {}).items():
        if any(s in key.lower() for s in _SECRET_KEYS):
            out[key] = "***redacted***"
        elif isinstance(value, str) and len(value) > 2000:
            out[key] = value[:2000] + f"...[{len(value)} chars]"
        elif isinstance(value, dict):
            out[key] = _redact(value)
        else:
            out[key] = value
    return out


def _auto_summary(result: Any) -> str:
    if isinstance(result, dict):
        if "summary" in result:
            return str(result["summary"])[:500]
        return f"returned {len(result)} fields"
    if isinstance(result, list):
        return f"returned {len(result)} items"
    return str(result)[:300]
