"""The scheduler and worker.

This is what makes the platform autonomous rather than a tool someone
remembers to run. It is deliberately a simple database-backed loop rather
than a queue broker: it needs no extra infrastructure, it survives a
restart, and a lease column is enough to stop two workers running the same
schedule twice.
"""

from __future__ import annotations

import asyncio
import os
import socket
from datetime import UTC, datetime, timedelta

from croniter import croniter
from sqlalchemy import or_, select

from seoos.core.config import get_settings
from seoos.core.db import session_scope
from seoos.core.logging import get_logger
from seoos.core.models import MissionRun, Org, Schedule, Site
from seoos.llm.router import ModelRouter, ProviderCredential
from seoos.missions.engine import MissionEngine
from seoos.missions.registry import get_mission_registry
from seoos.services.approvals import ApprovalsService
from seoos.services.credentials import CredentialService

log = get_logger("seoos.missions.scheduler")

LEASE_MINUTES = 90
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"

# Model providers a tenant can bring their own keys for. When they do, their
# entire workload runs on their account and never touches the platform's.
TENANT_LLM_PROVIDERS = ("anthropic", "openai", "google", "openrouter", "azure", "ollama")


async def claim_due_schedules(session, *, limit: int = 10, now: datetime | None = None) -> list[Schedule]:
    """Take a lease on schedules that are due.

    The lease is what makes multiple workers safe. A worker that dies mid-run
    releases its lease by expiry rather than holding a schedule forever.
    """
    now = now or datetime.now(UTC)
    rows = (
        await session.execute(
            select(Schedule)
            .where(
                Schedule.enabled.is_(True),
                Schedule.next_run_at.is_not(None),
                Schedule.next_run_at <= now,
                or_(Schedule.locked_until.is_(None), Schedule.locked_until < now),
            )
            .order_by(Schedule.next_run_at)
            .limit(limit)
        )
    ).scalars().all()

    claimed = []
    for row in rows:
        row.locked_by = WORKER_ID
        row.locked_until = now + timedelta(minutes=LEASE_MINUTES)
        claimed.append(row)
    await session.flush()
    return claimed


async def advance_schedule(session, schedule: Schedule, run: MissionRun | None) -> None:
    now = datetime.now(UTC)
    schedule.last_run_at = now
    schedule.last_run_id = run.id if run else None
    schedule.last_status = run.status if run else "failed"
    schedule.locked_by = None
    schedule.locked_until = None

    if run is None or run.status in ("failed",):
        schedule.consecutive_failures += 1
    else:
        schedule.consecutive_failures = 0

    try:
        schedule.next_run_at = croniter(schedule.cron, now).get_next(datetime)
    except (ValueError, KeyError):
        log.error("schedule %s has an invalid cron %r; disabling", schedule.id, schedule.cron)
        schedule.enabled = False
        return

    # Repeated failure means something is structurally wrong. Backing off
    # rather than retrying hourly is how a broken integration stops costing
    # money every cycle.
    if schedule.consecutive_failures >= 3:
        backoff = min(2 ** schedule.consecutive_failures, 48)
        schedule.next_run_at = now + timedelta(hours=backoff)
        log.warning(
            "schedule %s has failed %d times; backing off %dh",
            schedule.id, schedule.consecutive_failures, backoff,
        )
    if schedule.consecutive_failures >= 8:
        schedule.enabled = False
        log.error("schedule %s disabled after repeated failure", schedule.id)


async def router_for_org(session, org: Org, site_id: str | None = None) -> ModelRouter:
    """Build a model router using the tenant's own keys where they have them.

    A client who brings their own provider key gets an entirely separate
    relationship with that provider: their content never passes through the
    platform's account, which several kinds of customer require.
    """
    service = CredentialService(session)
    credentials: list[ProviderCredential] = []
    for provider in TENANT_LLM_PROVIDERS:
        payload = await service.try_load(org_id=org.id, provider=provider, site_id=site_id)
        if not payload:
            continue
        credentials.append(
            ProviderCredential(
                provider=provider,
                api_key=payload.get("api_key"),
                base_url=payload.get("base_url"),
                options={k: v for k, v in payload.items() if k not in ("api_key", "base_url")},
                source="tenant",
            )
        )
    return ModelRouter.for_tenant(credentials, preferred=org.llm_provider or None)


async def run_mission(
    *,
    mission_key: str,
    org_id: str,
    site_id: str | None,
    trigger: str = "schedule",
    triggered_by: str | None = None,
    inputs: dict | None = None,
    dry_run: bool | None = None,
    resume_run_id: str | None = None,
) -> MissionRun:
    """Run one mission end to end in its own transaction."""
    settings = get_settings()
    registry = get_mission_registry()
    spec = registry.get(mission_key)

    async with session_scope() as session:
        org = (await session.execute(select(Org).where(Org.id == org_id))).scalar_one_or_none()
        if org is None:
            raise ValueError(f"Org {org_id} not found")
        if org.status != "active":
            log.info("skipping %s: org %s is %s", mission_key, org_id, org.status)
            raise ValueError(f"Org {org_id} is not active")

        router = await router_for_org(session, org, site_id)
        engine = MissionEngine(
            session,
            router=router,
            dry_run=settings.dry_run if dry_run is None else dry_run,
        )
        try:
            run = await engine.run(
                spec,
                org_id=org_id,
                site_id=site_id,
                trigger=trigger,
                triggered_by=triggered_by,
                inputs=inputs,
                resume_run_id=resume_run_id,
            )
            # Spend is tracked on the org so the ceiling is real.
            org.spend_mtd_usd = round(org.spend_mtd_usd + run.cost_usd, 5)
            await _write_cost_ledger(session, run)
            await _post_run_effects(session, run)
            return run
        finally:
            await router.close()


async def _post_run_effects(session, run: MissionRun) -> None:
    """Side effects that belong to the lifecycle, not to any single mission.

    Chiefly: a site that has been onboarded becomes active and gets its
    recurring schedule. Leaving that to a mission step would mean a site
    whose onboarding partially failed never starts its cycle, which is the
    one outcome that must not happen silently.
    """
    if not run.site_id or run.status not in ("succeeded", "partial"):
        return
    site = (
        await session.execute(select(Site).where(Site.id == run.site_id))
    ).scalar_one_or_none()
    if site is None:
        return

    if run.mission_key == "onboard_site" and site.status == "onboarding":
        site.status = "active"
        site.onboarding_step = "complete"
        await session.flush()
        await bootstrap_schedules(session, site)
        log.info("site %s is now active", site.domain)


async def _write_cost_ledger(session, run: MissionRun) -> None:
    from seoos.core.models import CostLedger

    if run.cost_usd <= 0:
        return
    session.add(
        CostLedger(
            created_at=datetime.now(UTC),
            org_id=run.org_id,
            site_id=run.site_id,
            day=datetime.now(UTC).date(),
            category="llm",
            provider="mixed",
            detail=run.mission_key,
            units=run.tokens_in + run.tokens_out,
            unit_kind="tokens",
            usd=run.cost_usd,
            mission_run_id=run.id,
        )
    )


async def tick(*, limit: int = 10) -> int:
    """One scheduler pass. Claims due schedules and runs them."""
    async with session_scope() as session:
        claimed = await claim_due_schedules(session, limit=limit)
        work = [(s.id, s.mission_key, s.org_id, s.site_id, dict(s.input or {})) for s in claimed]

    if not work:
        return 0

    log.info("running %d due schedules", len(work))
    for schedule_id, mission_key, org_id, site_id, inputs in work:
        run = None
        try:
            run = await run_mission(
                mission_key=mission_key,
                org_id=org_id,
                site_id=site_id,
                trigger="schedule",
                triggered_by=schedule_id,
                inputs=inputs,
            )
        except Exception as exc:  # noqa: BLE001 - one bad schedule must not stop the rest
            log.exception("schedule %s (%s) failed: %s", schedule_id, mission_key, exc)
        finally:
            async with session_scope() as session:
                schedule = (
                    await session.execute(select(Schedule).where(Schedule.id == schedule_id))
                ).scalar_one_or_none()
                if schedule is not None:
                    await advance_schedule(session, schedule, run)
    return len(work)


async def housekeeping() -> dict:
    """Periodic work that is not a mission: auto-approvals, expiries, resets."""
    async with session_scope() as session:
        approvals = ApprovalsService(session)
        from seoos.tools import load_all_tools
        from seoos.tools.registry import ToolExecutor

        approvals.executor = ToolExecutor(load_all_tools())
        auto_approved = await approvals.sweep_auto_approvals()
        expired = await approvals.expire_stale()

        # Monthly spend resets on the first of the month.
        reset = 0
        if datetime.now(UTC).day == 1:
            orgs = (await session.execute(select(Org).where(Org.spend_mtd_usd > 0))).scalars().all()
            for org in orgs:
                org.spend_mtd_usd = 0.0
                reset += 1

        # Credentials about to expire are a support ticket waiting to happen.
        expiring = await CredentialService(session).expiring_soon(within_hours=72)
        for credential in expiring:
            from seoos.core.models import Notification

            session.add(
                Notification(
                    org_id=credential.org_id,
                    site_id=credential.site_id,
                    kind="credential_expiring",
                    severity="action_required",
                    title=f"Your {credential.provider} connection expires soon",
                    body=(
                        "Reconnect it so the work that depends on it keeps running. "
                        "It takes about a minute."
                    ),
                    link="/integrations",
                    channels=["in_app", "email"],
                    digest_key=f"cred:{credential.id}",
                )
            )

    return {
        "auto_approved": auto_approved,
        "expired": expired,
        "spend_reset": reset,
        "credentials_expiring": len(expiring),
    }


async def worker_loop(*, interval_seconds: int = 60, housekeeping_every: int = 15) -> None:
    """The long-running worker process."""
    log.info("worker %s starting", WORKER_ID)
    cycles = 0
    while True:
        try:
            ran = await tick()
            cycles += 1
            if cycles % housekeeping_every == 0:
                result = await housekeeping()
                if any(result.values()):
                    log.info("housekeeping: %s", result)
            if ran == 0:
                await asyncio.sleep(interval_seconds)
            else:
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            log.info("worker %s stopping", WORKER_ID)
            raise
        except Exception:  # noqa: BLE001 - the loop must outlive any single failure
            log.exception("worker loop error; continuing")
            await asyncio.sleep(interval_seconds)


async def bootstrap_schedules(session, site: Site, *, business_type: str | None = None) -> list[Schedule]:
    """Give a newly onboarded site its default cadence.

    The cadence is the product. A site with no schedule is a tool the client
    has to remember to use, which is exactly what they were paying an agency
    to avoid.
    """
    registry = get_mission_registry()
    providers = await CredentialService(session).connected_providers(
        org_id=site.org_id, site_id=site.id
    )
    from seoos.connectors.registry import capabilities_for

    capabilities = capabilities_for(providers)
    business = business_type or site.business_type

    created = []
    for spec in registry.for_site(
        business_type=business, capabilities=capabilities, status="active"
    ):
        if not spec.schedule_hint:
            continue
        existing = (
            await session.execute(
                select(Schedule).where(
                    Schedule.site_id == site.id, Schedule.mission_key == spec.key
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue
        schedule = Schedule(
            org_id=site.org_id,
            site_id=site.id,
            mission_key=spec.key,
            cron=spec.schedule_hint,
            enabled=True,
            next_run_at=croniter(spec.schedule_hint, datetime.now(UTC)).get_next(datetime),
        )
        session.add(schedule)
        created.append(schedule)
    await session.flush()
    log.info("bootstrapped %d schedules for %s", len(created), site.domain)
    return created
