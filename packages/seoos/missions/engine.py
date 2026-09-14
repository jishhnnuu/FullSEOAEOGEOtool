"""The mission executor.

Runs a mission's steps in dependency waves, keeping a shared blackboard that
every step reads and writes. Three properties matter most:

* **Nothing stops silently.** A failed step goes to the resolver before it
  is allowed to fail the mission, and whatever happens is written to the run
  record with a reason.
* **Cost is bounded.** The mission's budget is enforced before each step,
  not discovered afterwards.
* **State survives.** The blackboard is checkpointed to the database after
  every wave, so an interrupted run resumes instead of starting over.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from seoos.agents.policy import ApprovalPolicy
from seoos.agents.registry import AgentRegistry, get_registry
from seoos.agents.resolver import Resolver, Route
from seoos.agents.runtime import AgentRuntime
from seoos.core.db import session_scope
from seoos.core.errors import BudgetExceeded, SeoOSError
from seoos.core.logging import bind, get_logger, unbind
from seoos.core.models import AgentRun, MissionRun, Site, ToolCall
from seoos.llm.router import ModelRouter, SpendGuard
from seoos.missions.spec import MissionSpec, Step, evaluate, render
from seoos.services.approvals import ApprovalsService
from seoos.tools import load_all_tools
from seoos.tools.registry import ToolContext, ToolExecutor

log = get_logger("seoos.missions.engine")


@dataclass
class StepResult:
    step_id: str
    status: str  # succeeded | failed | skipped | degraded | resolved
    output: Any = None
    error: str | None = None
    cost_usd: float = 0.0
    duration_ms: int = 0
    approvals: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "step": self.step_id,
            "status": self.status,
            "error": self.error,
            "cost_usd": round(self.cost_usd, 5),
            "duration_ms": self.duration_ms,
            "approvals": self.approvals,
        }


class MissionEngine:
    def __init__(
        self,
        session,
        *,
        router: ModelRouter,
        agent_registry: AgentRegistry | None = None,
        dry_run: bool = False,
    ):
        self.session = session
        self.router = router
        self.dry_run = dry_run
        self.tools = load_all_tools()
        self.agents = agent_registry or get_registry()

    async def run(
        self,
        spec: MissionSpec,
        *,
        org_id: str,
        site_id: str | None,
        trigger: str = "manual",
        triggered_by: str | None = None,
        inputs: dict | None = None,
        resume_run_id: str | None = None,
    ) -> MissionRun:
        run, state = await self._start_or_resume(
            spec, org_id, site_id, trigger, triggered_by, inputs, resume_run_id
        )
        token = bind(org=org_id, site=site_id, run=run.id, mission=spec.key)
        started = time.perf_counter()
        deadline = started + spec.timeout_minutes * 60

        site = await self._load_site(site_id)
        budget = SpendGuard(
            run_limit_usd=min(spec.budget_usd, run.budget_usd or spec.budget_usd),
            org_remaining_usd=await self._org_remaining(org_id),
        )
        resolver = Resolver(
            memory=state.setdefault("_resolutions", {}),
            on_resolution=self._make_resolution_recorder(run, site_id, org_id),
        )
        approvals = ApprovalsService(self.session)
        executor = ToolExecutor(
            self.tools,
            recorder=self._make_tool_recorder(run),
            policy=ApprovalPolicy(approvals_service=approvals),
        )
        approvals.executor = executor
        ctx = ToolContext(
            org_id=org_id,
            site_id=site_id,
            session=self.session,
            router=self.router,
            mission_run_id=run.id,
            autonomy=(site.autonomy if site else "propose"),
            dry_run=self.dry_run,
            budget=budget,
            site=site,
            blackboard=state,
        )

        results: list[StepResult] = []
        completed: set[str] = set(state.get("_completed", []))

        try:
            for wave in spec.execution_order():
                pending = [s for s in wave if s.id not in completed]
                if not pending:
                    continue
                if time.perf_counter() > deadline:
                    run.status = "partial"
                    run.error = f"mission exceeded its {spec.timeout_minutes} minute limit"
                    break
                if budget.spent_usd >= budget.run_limit_usd:
                    run.status = "partial"
                    run.error = f"mission budget of ${budget.run_limit_usd:.2f} exhausted"
                    break

                # Bound as a default argument: `guarded` is redefined each
                # wave and would otherwise close over the loop's variable.
                wave_semaphore = asyncio.Semaphore(spec.concurrency)

                async def guarded(step: Step, semaphore=wave_semaphore) -> StepResult:
                    async with semaphore:
                        # A SQLAlchemy AsyncSession cannot be shared between
                        # concurrent tasks, and a wave runs its steps with
                        # asyncio.gather. Each step therefore gets its own
                        # session and its own short transaction, which also
                        # keeps write locks brief enough for SQLite.
                        from dataclasses import replace

                        async with session_scope() as step_session:
                            step_ctx = replace(ctx, session=step_session)
                            step_ctx.site = await self._load_site_in(step_session, site_id)
                            step_executor = ToolExecutor(
                                self.tools,
                                recorder=self._make_tool_recorder(run, step_session),
                                policy=ApprovalPolicy(
                                    approvals_service=self._approvals_for(step_session, step_session)
                                ),
                            )
                            step_runtime = AgentRuntime(
                                self.router,
                                step_executor,
                                registry=self.agents,
                                recorder=self._make_agent_recorder(run, step_session),
                            )
                            return await self._execute_step(
                                step, step_ctx, state, step_runtime, step_executor,
                                resolver, budget, run,
                            )

                wave_results = await asyncio.gather(
                    *(guarded(s) for s in pending), return_exceptions=True
                )
                fatal: str | None = None
                for step, item in zip(pending, wave_results, strict=True):
                    if isinstance(item, BaseException):
                        item = StepResult(step.id, "failed", error=str(item))
                    results.append(item)
                    completed.add(step.id)
                run.steps_done = len(completed)
                run.cost_usd = budget.spent_usd
                for step, item in zip(pending, results[-len(pending):], strict=True):
                    if item.status == "failed" and step.on_error == "fail" and not step.optional:
                        fatal = f"step {step.id} failed: {item.error}"

                state["_completed"] = sorted(completed)
                await self._checkpoint(run, state, results)
                if fatal:
                    run.status = "failed"
                    run.error = fatal
                    break
            else:
                run.status = self._final_status(results)

        except BudgetExceeded as exc:
            run.status = "partial"
            run.error = exc.message
        except asyncio.CancelledError:
            run.status = "cancelled"
            raise
        except Exception as exc:  # noqa: BLE001
            log.exception("mission %s crashed", spec.key)
            run.status = "failed"
            run.error = f"unexpected error: {exc}"
        finally:
            run.finished_at = datetime.now(UTC)
            run.duration_ms = int((time.perf_counter() - started) * 1000)
            run.cost_usd = round(budget.spent_usd, 5)
            run.state = _serialisable(state)
            run.output = {"steps": [r.to_dict() for r in results]}
            run.outcomes = _collect_outcomes(results, state)
            run.summary = _summarise(spec, run, results)
            await self.session.flush()
            unbind(token)

        log.info(
            "mission %s finished: %s in %.1fs, $%.4f",
            spec.key, run.status, run.duration_ms / 1000, run.cost_usd,
        )
        return run

    # -- step execution -----------------------------------------------------

    async def _execute_step(
        self,
        step: Step,
        ctx: ToolContext,
        state: dict,
        runtime: AgentRuntime,
        executor: ToolExecutor,
        resolver: Resolver,
        budget: SpendGuard,
        run: MissionRun,
    ) -> StepResult:
        started = time.perf_counter()
        run.current_step = step.id

        try:
            if not evaluate(step.when, state):
                return StepResult(step.id, "skipped", error="condition not met")
        except SeoOSError as exc:
            return StepResult(step.id, "failed", error=f"bad condition: {exc.message}")

        step_budget = min(step.budget_usd or budget.run_limit_usd,
                          budget.run_limit_usd - budget.spent_usd)
        if step_budget <= 0:
            return StepResult(step.id, "skipped", error="no budget remaining")

        attempt = 0
        last_error: str | None = None
        while attempt <= step.retries:
            attempt += 1
            try:
                result = await asyncio.wait_for(
                    self._dispatch(step, ctx, state, runtime, executor, budget),
                    timeout=step.timeout_s,
                )
                result.duration_ms = int((time.perf_counter() - started) * 1000)
                if result.status != "failed":
                    state[step.output_key] = result.output
                    return result
                last_error = result.error
            except TimeoutError:
                last_error = f"timed out after {step.timeout_s}s"
            except BudgetExceeded:
                raise
            except SeoOSError as exc:
                last_error = f"{exc.code}: {exc.message}"
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)

            if attempt <= step.retries:
                await asyncio.sleep(min(2 ** attempt, 8))

        # Everything failed. Before giving up, the resolver gets a turn.
        if step.on_error == "resolve":
            resolution = await resolver.resolve(
                f"mission step {step.id} ({step.tool or step.agent}) failed: {last_error}",
                self._alternative_routes(step, ctx, state, runtime, executor),
                context={"tool": step.tool, "code": step.id},
                human_atom=(
                    f"The '{step.label or step.id}' step could not complete "
                    f"automatically: {last_error}"
                ),
            )
            if resolution.resolved:
                state[step.output_key] = resolution.value
                return StepResult(
                    step.id,
                    "degraded" if resolution.degraded else "resolved",
                    output=resolution.value,
                    error=None,
                    duration_ms=int((time.perf_counter() - started) * 1000),
                )

        status = "skipped" if step.optional or step.on_error == "continue" else "failed"
        return StepResult(
            step.id, status, error=last_error,
            duration_ms=int((time.perf_counter() - started) * 1000),
        )

    async def _dispatch(
        self,
        step: Step,
        ctx: ToolContext,
        state: dict,
        runtime: AgentRuntime,
        executor: ToolExecutor,
        budget: SpendGuard,
    ) -> StepResult:
        if step.type == "checkpoint":
            return StepResult(step.id, "succeeded", output={"checkpointed": True})

        if step.type == "gate":
            passed = evaluate(step.when, state)
            return StepResult(
                step.id,
                "succeeded" if passed else "failed",
                output={"passed": passed},
                error=None if passed else f"gate not satisfied: {step.when}",
            )

        if step.type == "tool":
            args = _render_args(step.args, state)
            outcome = await executor.execute(step.tool, args, ctx)
            return StepResult(
                step.id,
                "succeeded" if outcome.ok else "failed",
                output=outcome.data if outcome.ok else None,
                error=outcome.error,
                cost_usd=outcome.cost_usd,
                approvals=[outcome.approval_id] if outcome.approval_id else [],
            )

        if step.type == "agent":
            blocks = {
                key.replace("_", " ").title(): _as_text(state.get(key))
                for key in step.context
                if state.get(key) is not None
            }
            result = await runtime.run(
                step.agent,
                render(step.task, state),
                ctx,
                context_blocks=blocks,
                expect_json=step.expect_json,
            )
            budget.record(result.cost_usd)
            return StepResult(
                step.id,
                "succeeded" if result.ok else "failed",
                output=result.structured if result.structured is not None else result.text,
                error=result.error,
                cost_usd=result.cost_usd,
                approvals=result.approvals_raised,
            )

        if step.type == "foreach":
            from seoos.missions.spec import resolve_path

            items = resolve_path(state, step.over) or []
            if not isinstance(items, list):
                return StepResult(step.id, "failed", error=f"{step.over} is not a list")
            outputs, cost = [], 0.0
            for item in items[: step.max_items]:
                scoped = {**state, step.as_: item}
                for child in step.steps:
                    child_result = await self._execute_step(
                        child, ctx, scoped, runtime, executor,
                        Resolver(memory=state.setdefault("_resolutions", {})),
                        budget, MissionRun(org_id=ctx.org_id),
                    )
                    cost += child_result.cost_usd
                    if child_result.status == "failed" and not child.optional:
                        break
                    scoped[child.output_key] = child_result.output
                outputs.append({k: scoped.get(k) for k in (c.output_key for c in step.steps)})
            return StepResult(step.id, "succeeded", output=outputs, cost_usd=cost)

        return StepResult(step.id, "failed", error=f"unknown step type {step.type}")

    def _alternative_routes(
        self, step: Step, ctx: ToolContext, state: dict, runtime, executor
    ) -> list[Route]:
        """Build the ladder's alternative routes for a failed step.

        Deliberately generic: the specific fallbacks live in the tools, which
        already degrade (Search Console for keywords when no paid provider,
        lab data when field data is unavailable). What the engine adds is the
        decomposition and lower-fidelity rungs.
        """
        routes: list[Route] = []

        if step.type == "tool" and step.args:
            async def smaller_scope():
                reduced = dict(_render_args(step.args, state))
                changed = False
                for key in ("max_pages", "limit", "row_limit", "depth", "grid_size"):
                    if isinstance(reduced.get(key), int) and reduced[key] > 10:
                        reduced[key] = max(int(reduced[key] / 4), 10)
                        changed = True
                if not changed:
                    return None
                outcome = await executor.execute(step.tool, reduced, ctx)
                return outcome.data if outcome.ok else None

            routes.append(
                Route("retry_smaller_scope", 2, smaller_scope, 0.7,
                      "Retry with a reduced scope")
            )

        async def note_gap():
            # Rung 5: record the gap explicitly so downstream steps can see
            # what is missing instead of silently reasoning from nothing.
            return {
                "unavailable": True,
                "step": step.id,
                "what_was_missing": step.tool or step.agent,
                "impact": (
                    "Downstream steps must treat this input as unavailable "
                    "rather than assume a default."
                ),
            }

        routes.append(
            Route("record_gap", 5, note_gap, 0.3, "Record the gap and continue")
        )
        return routes


    async def _load_site_in(self, session, site_id: str | None) -> Site | None:
        if not site_id:
            return None
        return (
            await session.execute(select(Site).where(Site.id == site_id))
        ).scalar_one_or_none()

    def _approvals_for(self, session, executor_session):
        service = ApprovalsService(session)
        service.executor = ToolExecutor(self.tools)
        return service

    # -- persistence --------------------------------------------------------

    async def _start_or_resume(
        self, spec, org_id, site_id, trigger, triggered_by, inputs, resume_run_id
    ) -> tuple[MissionRun, dict]:
        if resume_run_id:
            run = (
                await self.session.execute(
                    select(MissionRun).where(MissionRun.id == resume_run_id)
                )
            ).scalar_one_or_none()
            if run is not None:
                run.status = "running"
                run.started_at = run.started_at or datetime.now(UTC)
                run.steps_total = len(spec.steps)
                await self.session.commit()
                return run, dict(run.state or {})

        run = MissionRun(
            org_id=org_id,
            site_id=site_id,
            mission_key=spec.key,
            title=spec.name,
            trigger=trigger,
            triggered_by=triggered_by,
            status="running",
            started_at=datetime.now(UTC),
            input=inputs or {},
            state={},
            budget_usd=spec.budget_usd,
            steps_total=len(spec.steps),
        )
        self.session.add(run)
        await self.session.commit()
        return run, {"input": inputs or {}}

    async def _checkpoint(self, run: MissionRun, state: dict, results) -> None:
        """Persist progress between waves and release the write lock.

        A mission can run for the better part of an hour. Holding a single
        write transaction open for that long starves every other writer, so
        each wave boundary is a real commit rather than a flush.
        """
        run.state = _serialisable(state)
        run.output = {"steps": [r.to_dict() for r in results]}
        await self.session.commit()

    async def _load_site(self, site_id: str | None) -> Site | None:
        if not site_id:
            return None
        return (
            await self.session.execute(select(Site).where(Site.id == site_id))
        ).scalar_one_or_none()

    async def _org_remaining(self, org_id: str) -> float:
        from seoos.core.config import get_settings
        from seoos.core.models import Org

        org = (
            await self.session.execute(select(Org).where(Org.id == org_id))
        ).scalar_one_or_none()
        settings = get_settings()
        if org is None:
            return settings.max_usd_per_org_per_day
        return max(
            min(
                org.monthly_budget_usd - org.spend_mtd_usd,
                settings.max_usd_per_org_per_day,
            ),
            0.0,
        )

    def _make_tool_recorder(self, run: MissionRun, session=None):
        target = session or self.session

        async def record(payload: dict) -> None:
            ctx = payload.pop("ctx", None)
            target.add(
                ToolCall(
                    created_at=datetime.now(UTC),
                    org_id=run.org_id,
                    agent_run_id=getattr(ctx, "agent_run_id", None) or run.id,
                    mission_run_id=run.id,
                    **{k: v for k, v in payload.items() if k != "ctx"},
                )
            )
        return record

    def _make_agent_recorder(self, run: MissionRun, session=None):
        target = session or self.session

        async def record(spec, result, ctx) -> None:
            target.add(
                AgentRun(
                    org_id=run.org_id,
                    site_id=run.site_id,
                    mission_run_id=run.id,
                    agent_key=result.agent_key,
                    task=(result.transcript[0]["text"][:2000] if result.transcript else None),
                    status="succeeded" if result.ok else "failed",
                    provider=self.router.preferred,
                    tokens_in=result.tokens_in,
                    tokens_out=result.tokens_out,
                    cost_usd=result.cost_usd,
                    tool_call_count=result.tool_calls,
                    iterations=result.iterations,
                    output={"text": result.text[:8000], "structured": result.structured},
                    duration_ms=result.duration_ms,
                    error=result.error,
                    finished_at=datetime.now(UTC),
                )
            )
            run.tokens_in += result.tokens_in
            run.tokens_out += result.tokens_out
        return record

    def _make_resolution_recorder(self, run: MissionRun, site_id, org_id):
        async def record(resolution, problem) -> None:
            from seoos.core.models import Resolution as ResolutionRow

            self.session.add(
                ResolutionRow(
                    org_id=org_id,
                    site_id=site_id,
                    scope="site",
                    problem=problem[:4000],
                    signature=resolution.signature,
                    rung_reached=resolution.rung_reached,
                    attempts=[a.to_dict() for a in resolution.attempts],
                    decision=resolution.rationale,
                    resolved_by="resolver",
                    human_required=resolution.human_required,
                    human_atom=resolution.human_atom,
                )
            )
            if resolution.human_required:
                run.escalations = (run.escalations or []) + [
                    {"problem": problem[:500], "atom": resolution.human_atom}
                ]
        return record

    @staticmethod
    def _final_status(results: list[StepResult]) -> str:
        if any(r.status == "failed" for r in results):
            return "partial"
        if any(r.status in ("degraded", "resolved") for r in results):
            return "partial"
        return "succeeded"


def _render_args(args: dict, state: dict) -> dict:
    out: dict[str, Any] = {}
    for key, value in (args or {}).items():
        if isinstance(value, str):
            rendered = render(value, state)
            out[key] = rendered
        elif isinstance(value, dict):
            out[key] = _render_args(value, state)
        elif isinstance(value, list):
            out[key] = [
                render(v, state) if isinstance(v, str) else v for v in value
            ]
        else:
            out[key] = value
    return out


def _as_text(value: Any, limit: int = 14000) -> str:
    if isinstance(value, str):
        return value[:limit]
    import json

    return json.dumps(value, indent=2, default=str)[:limit]


def _serialisable(state: dict) -> dict:
    """Strip anything that will not survive a JSON round trip."""
    import json

    out = {}
    for key, value in state.items():
        if key.startswith("__"):
            continue
        try:
            json.dumps(value, default=str)
            out[key] = value
        except (TypeError, ValueError):
            out[key] = {"unserialisable": type(value).__name__}
    return out


def _collect_outcomes(results: list[StepResult], state: dict) -> dict:
    """What changed in the world. This is what the client's digest reads."""
    approvals = [a for r in results for a in r.approvals]
    return {
        "steps_succeeded": sum(1 for r in results if r.status == "succeeded"),
        "steps_degraded": sum(1 for r in results if r.status in ("degraded", "resolved")),
        "steps_failed": sum(1 for r in results if r.status == "failed"),
        "steps_skipped": sum(1 for r in results if r.status == "skipped"),
        "approvals_raised": approvals,
        "published": state.get("publish", {}).get("url") if isinstance(state.get("publish"), dict) else None,
    }


def _summarise(spec: MissionSpec, run: MissionRun, results: list[StepResult]) -> str:
    succeeded = sum(1 for r in results if r.status == "succeeded")
    failed = [r for r in results if r.status == "failed"]
    parts = [
        f"{spec.name}: {succeeded}/{len(results)} steps succeeded in "
        f"{run.duration_ms / 1000:.0f}s for ${run.cost_usd:.3f}."
    ]
    if failed:
        parts.append("Failed: " + ", ".join(f"{r.step_id} ({r.error})" for r in failed[:3]))
    if run.escalations:
        parts.append(f"{len(run.escalations)} item(s) need a person.")
    return " ".join(parts)
