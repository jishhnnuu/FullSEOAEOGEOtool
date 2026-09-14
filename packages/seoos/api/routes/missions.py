"""Running and scheduling missions."""

from __future__ import annotations

from datetime import UTC, datetime

from croniter import croniter
from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy import select

from seoos.api.schemas import (
    MissionRunOut,
    RunMissionRequest,
    ScheduleOut,
    ScheduleUpsert,
)
from seoos.api.security import Session, Tenant, get_site, require
from seoos.connectors.registry import capabilities_for
from seoos.core.db import TenantContext
from seoos.core.models import AgentRun, MissionRun, Schedule, ToolCall
from seoos.missions.registry import get_mission_registry
from seoos.services.credentials import CredentialService

router = APIRouter(tags=["missions"])


@router.get("/missions")
async def list_missions(tenant: Tenant, session: Session, site_id: str | None = None) -> dict:
    registry = get_mission_registry()
    available = registry.all()
    if site_id:
        site = await get_site(session, tenant, site_id)
        providers = await CredentialService(session).connected_providers(
            org_id=tenant.org_id, site_id=site.id
        )
        available = registry.for_site(
            business_type=site.business_type,
            capabilities=capabilities_for(providers),
            status=site.status,
        )
    return {
        "missions": [
            {
                "key": m.key,
                "name": m.name,
                "description": m.description,
                "steps": len(m.steps),
                "budget_usd": m.budget_usd,
                "schedule_hint": m.schedule_hint,
                "agents": sorted({s.agent for s in m.steps if s.agent}),
                "tags": m.tags,
            }
            for m in available
        ]
    }


@router.post("/sites/{site_id}/run", response_model=MissionRunOut, status_code=status.HTTP_202_ACCEPTED)
async def run_mission(
    site_id: str,
    payload: RunMissionRequest,
    background: BackgroundTasks,
    session: Session,
    tenant: TenantContext = require("editor"),
) -> MissionRun:
    """Queue a mission and return immediately.

    Missions take minutes. Holding an HTTP request open for that is how a
    proxy timeout turns into a half-finished run with no record.
    """
    site = await get_site(session, tenant, site_id)
    registry = get_mission_registry()
    if not registry.has(payload.mission_key):
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"No mission named {payload.mission_key!r}. Known: {', '.join(registry.keys())}",
        )

    running = (
        await session.execute(
            select(MissionRun).where(
                MissionRun.site_id == site.id,
                MissionRun.mission_key == payload.mission_key,
                MissionRun.status == "running",
            )
        )
    ).scalars().first()
    if running is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{payload.mission_key} is already running for this site",
        )

    spec = registry.get(payload.mission_key)
    run = MissionRun(
        org_id=tenant.org_id,
        site_id=site.id,
        mission_key=payload.mission_key,
        title=spec.name,
        trigger="manual",
        triggered_by=tenant.user_id,
        status="queued",
        input=payload.inputs,
        budget_usd=spec.budget_usd,
        steps_total=len(spec.steps),
    )
    session.add(run)
    await session.flush()

    # The row is committed before the background task starts, so the caller
    # gets a real id immediately and the engine resumes that same row rather
    # than creating a second one.
    await session.commit()

    background.add_task(
        _execute,
        run_id=run.id,
        mission_key=payload.mission_key,
        org_id=tenant.org_id,
        site_id=site.id,
        inputs=payload.inputs,
        triggered_by=tenant.user_id,
        dry_run=payload.dry_run,
    )
    return run


async def _execute(*, run_id: str, **kwargs) -> None:
    """Background execution, in its own session and transaction."""
    from seoos.core.db import session_scope
    from seoos.missions.scheduler import run_mission as execute_mission

    try:
        await execute_mission(trigger="manual", resume_run_id=run_id, **kwargs)
    except Exception as exc:  # noqa: BLE001
        from seoos.core.logging import get_logger

        get_logger("seoos.api.missions").exception("background mission failed")
        async with session_scope() as session:
            run = (
                await session.execute(select(MissionRun).where(MissionRun.id == run_id))
            ).scalar_one_or_none()
            if run is not None and run.status in ("queued", "running"):
                run.status = "failed"
                run.error = str(exc)[:2000]
                run.finished_at = datetime.now(UTC)


@router.get("/sites/{site_id}/runs", response_model=list[MissionRunOut])
async def list_runs(
    site_id: str, tenant: Tenant, session: Session, limit: int = 25
) -> list[MissionRun]:
    site = await get_site(session, tenant, site_id)
    rows = (
        await session.execute(
            select(MissionRun)
            .where(MissionRun.site_id == site.id)
            .order_by(MissionRun.created_at.desc())
            .limit(min(limit, 100))
        )
    ).scalars().all()
    return list(rows)


@router.get("/runs/{run_id}")
async def get_run(run_id: str, tenant: Tenant, session: Session) -> dict:
    """A full trace: steps, agents, and every tool call they made."""
    run = (
        await session.execute(
            select(MissionRun).where(
                MissionRun.id == run_id, MissionRun.org_id == tenant.org_id
            )
        )
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")

    agents = (
        await session.execute(
            select(AgentRun).where(AgentRun.mission_run_id == run.id)
            .order_by(AgentRun.created_at)
        )
    ).scalars().all()
    calls = (
        await session.execute(
            select(ToolCall).where(ToolCall.mission_run_id == run.id)
            .order_by(ToolCall.created_at).limit(300)
        )
    ).scalars().all()

    return {
        "run": MissionRunOut.model_validate(run).model_dump(),
        "steps": (run.output or {}).get("steps", []),
        "agents": [
            {
                "agent": a.agent_key, "status": a.status, "iterations": a.iterations,
                "tool_calls": a.tool_call_count, "cost_usd": round(a.cost_usd, 5),
                "duration_ms": a.duration_ms, "error": a.error,
                "output": (a.output or {}).get("text", "")[:4000],
            }
            for a in agents
        ],
        "tool_calls": [
            {
                "tool": c.tool, "ok": c.ok, "duration_ms": c.duration_ms,
                "is_mutation": c.is_mutation, "summary": c.result_summary,
                "error": c.error, "args": c.args, "at": c.created_at,
            }
            for c in calls
        ],
    }


@router.get("/sites/{site_id}/schedules", response_model=list[ScheduleOut])
async def list_schedules(site_id: str, tenant: Tenant, session: Session) -> list[Schedule]:
    site = await get_site(session, tenant, site_id)
    rows = (
        await session.execute(select(Schedule).where(Schedule.site_id == site.id))
    ).scalars().all()
    return list(rows)


@router.put("/sites/{site_id}/schedules", response_model=ScheduleOut)
async def upsert_schedule(
    site_id: str,
    payload: ScheduleUpsert,
    session: Session,
    tenant: TenantContext = require("editor"),
) -> Schedule:
    site = await get_site(session, tenant, site_id)
    if not croniter.is_valid(payload.cron):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"{payload.cron!r} is not a valid cron expression"
        )
    registry = get_mission_registry()
    if not registry.has(payload.mission_key):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown mission")

    row = (
        await session.execute(
            select(Schedule).where(
                Schedule.site_id == site.id, Schedule.mission_key == payload.mission_key
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = Schedule(
            org_id=tenant.org_id, site_id=site.id, mission_key=payload.mission_key,
            cron=payload.cron,
        )
        session.add(row)
    row.cron = payload.cron
    row.enabled = payload.enabled
    row.input = payload.input
    row.consecutive_failures = 0
    row.next_run_at = (
        croniter(payload.cron, datetime.now(UTC)).get_next(datetime)
        if payload.enabled else None
    )
    await session.flush()
    return row


@router.get("/agents")
async def list_agents(tenant: Tenant) -> dict:
    """The roster, so a client can see who is working on their account."""
    from seoos.agents.registry import get_registry

    registry = get_registry()
    by_department: dict[str, list] = {}
    for spec in registry.all():
        by_department.setdefault(spec.department, []).append(
            {
                "key": spec.key,
                "name": spec.name,
                "role": spec.role,
                "summary": spec.summary,
                "reports_to": spec.reports_to,
                "delegates_to": spec.delegates_to,
                "tools": len(spec.tools),
            }
        )
    return {
        "total": len(registry.keys()),
        "by_department": by_department,
        "org_chart": registry.org_chart(),
    }
