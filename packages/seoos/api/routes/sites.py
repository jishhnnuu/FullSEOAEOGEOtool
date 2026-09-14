"""Sites: the unit everything else is scoped to, plus the dashboard read."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from seoos.api.schemas import (
    DashboardOut,
    FindingOut,
    MissionRunOut,
    SiteCreate,
    SiteOut,
    SiteUpdate,
)
from seoos.api.security import Session, Tenant, get_site, require
from seoos.connectors.registry import capabilities_for, unlocks_capability
from seoos.core.db import TenantContext
from seoos.core.models import (
    Approval,
    ContentItem,
    Finding,
    MissionRun,
    Page,
    Schedule,
    Site,
)
from seoos.services.audit_log import record_event
from seoos.services.credentials import CredentialService

router = APIRouter(prefix="/sites", tags=["sites"])

# Capabilities worth telling a client they are missing. Anything not here is
# either always available or too niche to nag about.
NOTABLE_CAPABILITIES = [
    "real_keywords", "conversion_attribution", "auto_publish",
    "keyword_research", "backlink_analysis", "gbp_management",
    "push_indexing", "outreach_sending",
]


@router.get("", response_model=list[SiteOut])
async def list_sites(tenant: Tenant, session: Session) -> list[Site]:
    rows = (
        await session.execute(
            select(Site).where(Site.org_id == tenant.org_id).order_by(Site.created_at)
        )
    ).scalars().all()
    return list(rows)


@router.post("", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
async def create_site(
    payload: SiteCreate, session: Session, tenant: TenantContext = require("editor")
) -> Site:
    domain = (urlparse(payload.base_url).hostname or "").lower()
    existing = (
        await session.execute(
            select(Site).where(Site.org_id == tenant.org_id, Site.domain == domain)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{domain} is already being managed")

    site = Site(
        org_id=tenant.org_id,
        name=payload.name,
        domain=domain,
        base_url=payload.base_url,
        business_type=payload.business_type,
        industry=payload.industry,
        is_ymyl=payload.is_ymyl,
        cms_platform=payload.cms_platform,
        primary_country=payload.primary_country,
        primary_language=payload.primary_language,
        autonomy=payload.autonomy,
        status="onboarding",
        onboarding_step="created",
    )
    session.add(site)
    await session.flush()
    await record_event(
        session, org_id=tenant.org_id, site_id=site.id, action="site.created",
        object_type="site", object_id=site.id, actor_type="user",
        actor_id=tenant.user_id, summary=f"Added {domain}",
    )
    return site


@router.get("/{site_id}", response_model=SiteOut)
async def get_one(site_id: str, tenant: Tenant, session: Session) -> Site:
    return await get_site(session, tenant, site_id)


@router.post("/{site_id}/activate", response_model=SiteOut)
async def activate(
    site_id: str, session: Session, tenant: TenantContext = require("editor")
) -> Site:
    """Skip onboarding and start the recurring programme immediately.

    Onboarding normally flips this, but a client who already knows their
    setup should not have to wait for a mission to finish before the weekly
    cycle can be scheduled.
    """
    from seoos.missions.scheduler import bootstrap_schedules

    site = await get_site(session, tenant, site_id)
    if site.status == "archived":
        raise HTTPException(status.HTTP_409_CONFLICT, "This site is archived")
    site.status = "active"
    site.onboarding_step = "complete"
    await session.flush()
    schedules = await bootstrap_schedules(session, site)
    await record_event(
        session, org_id=tenant.org_id, site_id=site.id, action="site.activated",
        object_type="site", object_id=site.id, actor_type="user",
        actor_id=tenant.user_id,
        summary=f"Activated with {len(schedules)} scheduled missions",
    )
    return site


@router.patch("/{site_id}", response_model=SiteOut)
async def update_site(
    site_id: str, payload: SiteUpdate, session: Session, tenant: TenantContext = require("editor")
) -> Site:
    site = await get_site(session, tenant, site_id)
    before = {"autonomy": site.autonomy, "policy": site.policy}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(site, field, value)
    await session.flush()

    # Autonomy is the single most consequential setting a client can change,
    # so it is always audited with the before and after.
    if payload.autonomy and payload.autonomy != before["autonomy"]:
        await record_event(
            session, org_id=tenant.org_id, site_id=site.id,
            action="site.autonomy_changed", object_type="site", object_id=site.id,
            actor_type="user", actor_id=tenant.user_id,
            summary=f"Autonomy {before['autonomy']} -> {payload.autonomy}",
            before=before, after={"autonomy": payload.autonomy}, severity=1,
        )
    return site


@router.get("/{site_id}/dashboard", response_model=DashboardOut)
async def dashboard(site_id: str, tenant: Tenant, session: Session) -> DashboardOut:
    """Everything the main screen needs, in one round trip."""
    site = await get_site(session, tenant, site_id)

    severity = dict(
        (
            await session.execute(
                select(Finding.severity, func.count())
                .where(Finding.site_id == site.id,
                       Finding.status.in_(["open", "regressed", "in_progress"]))
                .group_by(Finding.severity)
            )
        ).all()
    )
    category = dict(
        (
            await session.execute(
                select(Finding.category, func.count())
                .where(Finding.site_id == site.id,
                       Finding.status.in_(["open", "regressed", "in_progress"]))
                .group_by(Finding.category)
            )
        ).all()
    )
    pipeline = dict(
        (
            await session.execute(
                select(ContentItem.status, func.count())
                .where(ContentItem.site_id == site.id)
                .group_by(ContentItem.status)
            )
        ).all()
    )
    pending = (
        await session.execute(
            select(func.count()).select_from(Approval).where(
                Approval.site_id == site.id, Approval.status == "pending"
            )
        )
    ).scalar() or 0

    providers = await CredentialService(session).connected_providers(
        org_id=tenant.org_id, site_id=site.id
    )
    capabilities = capabilities_for(providers)
    missing = {
        cap: unlocks_capability(cap, providers)
        for cap in NOTABLE_CAPABILITIES
        if cap not in capabilities
    }

    runs = (
        await session.execute(
            select(MissionRun)
            .where(MissionRun.site_id == site.id)
            .order_by(MissionRun.created_at.desc())
            .limit(8)
        )
    ).scalars().all()

    next_run = (
        await session.execute(
            select(func.min(Schedule.next_run_at)).where(
                Schedule.site_id == site.id, Schedule.enabled.is_(True)
            )
        )
    ).scalar()

    from seoos.tools.reporting_tools import _ai_visibility_summary, _recent_kpis

    return DashboardOut(
        site=SiteOut.model_validate(site),
        scores={
            "health": site.health_score,
            "aeo": site.aeo_score,
            "authority": site.authority_score,
        },
        findings={
            "by_severity": severity,
            "by_category": category,
            "total_open": sum(severity.values()),
        },
        content_pipeline=pipeline,
        pending_approvals=pending,
        integrations=sorted(providers),
        capabilities=sorted(capabilities),
        missing_capabilities=missing,
        kpis=await _recent_kpis(_Ctx(session), site.id),
        ai_visibility=await _ai_visibility_summary(_Ctx(session), site.id),
        recent_runs=[MissionRunOut.model_validate(r) for r in runs],
        next_scheduled=next_run,
    )


class _Ctx:
    """Minimal shim so the reporting helpers can be reused from the API."""

    def __init__(self, session):
        self.session = session


@router.get("/{site_id}/findings", response_model=list[FindingOut])
async def list_findings(
    site_id: str,
    tenant: Tenant,
    session: Session,
    status_filter: str = "open",
    category: str | None = None,
    severity: str | None = None,
    limit: int = 100,
) -> list[Finding]:
    site = await get_site(session, tenant, site_id)
    stmt = select(Finding).where(Finding.site_id == site.id)
    if status_filter == "open":
        stmt = stmt.where(Finding.status.in_(["open", "regressed", "in_progress"]))
    elif status_filter != "all":
        stmt = stmt.where(Finding.status == status_filter)
    if category:
        stmt = stmt.where(Finding.category == category)
    if severity:
        stmt = stmt.where(Finding.severity == severity)
    rows = (
        await session.execute(
            stmt.order_by(Finding.priority_score.desc().nullslast()).limit(min(limit, 500))
        )
    ).scalars().all()
    return list(rows)


@router.get("/{site_id}/pages")
async def list_pages(
    site_id: str, tenant: Tenant, session: Session, limit: int = 100, order: str = "opportunity"
) -> dict:
    site = await get_site(session, tenant, site_id)
    column = {
        "opportunity": Page.opportunity_score,
        "aeo": Page.aeo_score,
        "depth": Page.depth,
        "words": Page.word_count,
    }.get(order, Page.opportunity_score)
    rows = (
        await session.execute(
            select(Page)
            .where(Page.site_id == site.id)
            .order_by(column.desc().nullslast())
            .limit(min(limit, 500))
        )
    ).scalars().all()
    return {
        "pages": [
            {
                "url": p.url, "title": p.title, "status_code": p.status_code,
                "depth": p.depth, "word_count": p.word_count,
                "indexable": p.is_indexable, "template": p.template_type,
                "aeo_score": p.aeo_score, "opportunity": p.opportunity_score,
                "schema_types": p.schema_types,
                "clicks_28d": p.clicks_28d, "impressions_28d": p.impressions_28d,
                "avg_position": p.avg_position,
                "last_crawled_at": p.last_crawled_at,
            }
            for p in rows
        ]
    }


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site(site_id: str, session: Session, tenant: TenantContext = require("admin")) -> None:
    site = await get_site(session, tenant, site_id)
    # Archived rather than deleted: a client who removes a site by mistake
    # would otherwise lose every finding, report and audit trail with it.
    site.status = "archived"
    for schedule in (
        await session.execute(select(Schedule).where(Schedule.site_id == site.id))
    ).scalars().all():
        schedule.enabled = False
    await record_event(
        session, org_id=tenant.org_id, site_id=site.id, action="site.archived",
        object_type="site", object_id=site.id, actor_type="user",
        actor_id=tenant.user_id, summary=f"Archived {site.domain}", severity=1,
    )
    await session.flush()
