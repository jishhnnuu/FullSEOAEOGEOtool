"""Findings, reports and the always-current audit the client sees."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select

from seoos.core.crypto import new_token
from seoos.core.models import (
    AiVisibilityCheck,
    Approval,
    ContentItem,
    Finding,
    KpiSnapshot,
    MissionRun,
    Report,
)
from seoos.services.findings import FindingsService
from seoos.tools._helpers import array, boolean, integer, load_site, obj, schema, string
from seoos.tools.registry import ToolContext, ToolOutcome, tool


@tool(
    "report.findings",
    """List the site's open findings, ranked by priority. This is the work
    queue for every fixing agent: read it before deciding what to do.""",
    schema(
        categories_=array("Filter by category", {"type": "string"}),
        severities_=array("Filter by severity", {"type": "string"}),
        auto_fixable_=boolean("Only findings the platform can fix itself"),
        limit_=integer("How many", minimum=1, maximum=200, default=40),
    ),
    category="reporting",
)
async def report_findings(
    ctx: ToolContext,
    categories: list[str] | None = None,
    severities: list[str] | None = None,
    auto_fixable: bool | None = None,
    limit: int = 40,
) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    rows = await FindingsService(ctx.session).open_findings(
        site.id, categories=categories, severities=severities,
        auto_fixable=auto_fixable, limit=limit,
    )
    return ToolOutcome(
        ok=True,
        summary=f"{len(rows)} open findings",
        data={
            "findings": [
                {
                    "id": r.id, "code": r.code, "category": r.category,
                    "severity": r.severity, "title": r.title, "detail": r.detail,
                    "url": r.url, "affected": r.affected_count,
                    "recommendation": r.recommendation,
                    "priority": r.priority_score, "auto_fixable": r.auto_fixable,
                    "fix_strategy": r.fix_strategy, "status": r.status,
                    "evidence": r.evidence,
                }
                for r in rows
            ]
        },
    )


@tool(
    "report.mark_finding",
    """Update a finding's status. Use 'fixed' after applying a change,
    'verified' once you have confirmed it live, 'wont_fix' with a reason if
    the client has decided against it.""",
    schema(
        finding_id=string("The finding"),
        status=string("New status",
                      enum=["in_progress", "awaiting_approval", "fixed", "verified",
                            "accepted_risk", "wont_fix"]),
        note_=string("Why, in one sentence"),
    ),
    category="reporting",
    mutates=True,
    risk="low",
    auto_from="propose",
)
async def mark_finding(
    ctx: ToolContext, finding_id: str, status: str, note: str | None = None
) -> ToolOutcome:
    row = await FindingsService(ctx.session).mark(finding_id, status, note=note)
    if row is None:
        return ToolOutcome(ok=False, error=f"Finding {finding_id} not found")
    return ToolOutcome(ok=True, summary=f"{row.code} marked {status}")


@tool(
    "report.site_state",
    """A single read of everything currently true about the site: scores,
    open findings by severity, content pipeline, pending approvals, KPI
    movement and connected integrations.

    Call this first in almost any mission. It is one query instead of six and
    it stops agents working from stale assumptions.""",
    schema(),
    category="reporting",
)
async def site_state(ctx: ToolContext) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    severity_counts = dict(
        (
            await ctx.session.execute(
                select(Finding.severity, func.count())
                .where(
                    Finding.site_id == site.id,
                    Finding.status.in_(["open", "regressed", "in_progress"]),
                )
                .group_by(Finding.severity)
            )
        ).all()
    )
    category_counts = dict(
        (
            await ctx.session.execute(
                select(Finding.category, func.count())
                .where(
                    Finding.site_id == site.id,
                    Finding.status.in_(["open", "regressed", "in_progress"]),
                )
                .group_by(Finding.category)
            )
        ).all()
    )
    content_counts = dict(
        (
            await ctx.session.execute(
                select(ContentItem.status, func.count())
                .where(ContentItem.site_id == site.id)
                .group_by(ContentItem.status)
            )
        ).all()
    )
    pending_approvals = (
        await ctx.session.execute(
            select(func.count())
            .select_from(Approval)
            .where(Approval.site_id == site.id, Approval.status == "pending")
        )
    ).scalar() or 0

    from seoos.services.credentials import CredentialService

    providers = await CredentialService(ctx.session).connected_providers(
        org_id=ctx.org_id, site_id=site.id
    )
    from seoos.connectors.registry import capabilities_for

    kpis = await _recent_kpis(ctx, site.id)
    ai_visibility = await _ai_visibility_summary(ctx, site.id)

    return ToolOutcome(
        ok=True,
        summary=(
            f"{site.name}: health {site.health_score}, AEO {site.aeo_score}, "
            f"{sum(severity_counts.values())} open findings, "
            f"{pending_approvals} awaiting the client"
        ),
        data={
            "site": {
                "name": site.name, "domain": site.domain, "url": site.base_url,
                "business_type": site.business_type, "industry": site.industry,
                "is_ymyl": site.is_ymyl, "cms": site.cms_platform,
                "autonomy": site.autonomy, "status": site.status,
                "country": site.primary_country, "language": site.primary_language,
                "goals": site.goals,
            },
            "scores": {
                "health": site.health_score,
                "aeo": site.aeo_score,
                "authority": site.authority_score,
            },
            "last_crawl": site.last_crawl_at.isoformat() if site.last_crawl_at else None,
            "findings": {
                "by_severity": severity_counts,
                "by_category": category_counts,
                "total_open": sum(severity_counts.values()),
            },
            "content_pipeline": content_counts,
            "pending_approvals": pending_approvals,
            "integrations": sorted(providers),
            "capabilities": sorted(capabilities_for(providers)),
            "kpis": kpis,
            "ai_visibility": ai_visibility,
        },
    )


async def _recent_kpis(ctx: ToolContext, site_id: str) -> dict:
    since = date.today() - timedelta(days=90)
    rows = (
        await ctx.session.execute(
            select(KpiSnapshot)
            .where(KpiSnapshot.site_id == site_id, KpiSnapshot.measured_on >= since,
                   KpiSnapshot.dimension == "")
            .order_by(KpiSnapshot.measured_on)
        )
    ).scalars().all()
    series: dict[str, list] = {}
    for row in rows:
        series.setdefault(row.metric, []).append((row.measured_on, row.value))
    out = {}
    for metric, points in series.items():
        if not points:
            continue
        first, last = points[0][1], points[-1][1]
        out[metric] = {
            "latest": last,
            "change_pct": round((last - first) / first * 100, 1) if first else None,
            "points": len(points),
        }
    return out


async def _ai_visibility_summary(ctx: ToolContext, site_id: str) -> dict:
    since = date.today() - timedelta(days=30)
    rows = (
        await ctx.session.execute(
            select(AiVisibilityCheck).where(
                AiVisibilityCheck.site_id == site_id,
                AiVisibilityCheck.captured_on >= since,
            )
        )
    ).scalars().all()
    if not rows:
        return {"measured": False}
    return {
        "measured": True,
        "prompts": len(rows),
        "mention_rate_pct": round(sum(1 for r in rows if r.brand_mentioned) / len(rows) * 100, 1),
        "citation_rate_pct": round(sum(1 for r in rows if r.brand_cited) / len(rows) * 100, 1),
        "engines": sorted({r.engine for r in rows}),
        "accuracy_issues": sum(1 for r in rows if r.accuracy in ("outdated", "wrong", "misattributed")),
    }


@tool(
    "report.build",
    """Write or refresh a client-facing report. The 'live_audit' kind is the
    always-current report the dashboard shows, and rewriting it is how the
    client's view stays fresh rather than monthly.""",
    schema(
        kind=string("Report kind",
                    enum=["live_audit", "monthly", "quarterly", "competitor",
                          "content", "local", "aeo", "backlinks", "incident", "onboarding"]),
        title=string("Report title"),
        narrative_md=string("The written analysis in markdown: what changed, "
                            "why it matters, and what happens next"),
        data_=obj("Structured figures the dashboard renders"),
        period_days_=integer("Period this covers", default=30),
        share_=boolean("Create a shareable link", default=False),
    ),
    category="reporting",
    mutates=True,
    risk="low",
    auto_from="propose",
)
async def report_build(
    ctx: ToolContext,
    kind: str,
    title: str,
    narrative_md: str,
    data: dict | None = None,
    period_days: int = 30,
    share: bool = False,
) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    # The live audit is a single row that gets rewritten, so the dashboard
    # never has to pick between eleven "latest" reports.
    existing = None
    if kind == "live_audit":
        existing = (
            await ctx.session.execute(
                select(Report).where(
                    Report.site_id == site.id, Report.kind == "live_audit"
                )
            )
        ).scalars().first()

    today = date.today()
    report = existing or Report(org_id=ctx.org_id, site_id=site.id, kind=kind, title=title)
    report.title = title
    report.narrative_md = narrative_md
    report.data = data or {}
    report.period_start = today - timedelta(days=period_days)
    report.period_end = today
    report.generated_by = ctx.agent_key
    report.mission_run_id = ctx.mission_run_id
    report.status = "ready"
    report.is_current = True
    if share and not report.share_token:
        report.share_token = new_token(nbytes=18)
        report.share_expires_at = datetime.now(UTC) + timedelta(days=90)
    if existing is None:
        ctx.session.add(report)
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=f"{kind} report {'updated' if existing else 'created'}: {title}",
        data={
            "report_id": report.id,
            "kind": kind,
            "share_token": report.share_token,
            "share_url": (
                f"/shared/reports/{report.share_token}" if report.share_token else None
            ),
        },
    )


@tool(
    "report.history",
    """Read what the platform has already done for this site: recent mission
    runs, what each changed, and what it cost.

    Read this before planning. Proposing work that was completed last week is
    the fastest way to lose a client's confidence.""",
    schema(limit_=integer("How many runs", minimum=1, maximum=50, default=10)),
    category="reporting",
)
async def report_history(ctx: ToolContext, limit: int = 10) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    runs = (
        await ctx.session.execute(
            select(MissionRun)
            .where(MissionRun.site_id == site.id)
            .order_by(MissionRun.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return ToolOutcome(
        ok=True,
        summary=f"{len(runs)} recent runs",
        data={
            "runs": [
                {
                    "mission": r.mission_key,
                    "status": r.status,
                    "started": r.started_at.isoformat() if r.started_at else None,
                    "summary": r.summary,
                    "outcomes": r.outcomes,
                    "cost_usd": round(r.cost_usd, 4),
                    "escalations": r.escalations,
                }
                for r in runs
            ]
        },
    )


@tool(
    "report.notify",
    """Tell the client something. Use sparingly: a system that pings
    constantly gets muted, and then the one message that mattered is missed.

    Reserve 'action_required' for things that genuinely block progress.""",
    schema(
        title=string("One line, specific"),
        body=string("What happened and what it means, in plain language"),
        severity_=string("How urgent", enum=["info", "warning", "action_required", "critical"],
                         default="info"),
        link_=string("Where to go to act on it"),
    ),
    category="reporting",
    mutates=True,
    risk="internal",
    auto_from="observe",
)
async def report_notify(
    ctx: ToolContext, title: str, body: str, severity: str = "info", link: str | None = None
) -> ToolOutcome:
    from seoos.core.models import Notification

    ctx.session.add(
        Notification(
            org_id=ctx.org_id,
            site_id=ctx.site_id,
            kind="agent_message",
            severity=severity,
            title=title[:400],
            body=body,
            link=link,
            channels=["in_app"] + (["email"] if severity in ("action_required", "critical") else []),
        )
    )
    await ctx.session.flush()
    return ToolOutcome(ok=True, summary=f"Notified: {title}")
