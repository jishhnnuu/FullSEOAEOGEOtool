"""First-party performance data: Search Console, Analytics, Core Web Vitals."""

from __future__ import annotations

from datetime import date, timedelta

from seoos.core.models import KpiSnapshot
from seoos.tools._helpers import (
    array,
    compact,
    connector_for,
    integer,
    load_site,
    number,
    schema,
    string,
)
from seoos.tools.registry import ToolContext, ToolOutcome, tool


@tool(
    "analytics.search_performance",
    """Query Google Search Console. This is the only first-party record of
    what the site actually ranks for, so prefer it over any estimate.

    Dimensions can be combined: ["query"] for keyword performance,
    ["page"] for per-URL performance, ["query","page"] to see which page
    ranks for which term, ["date"] for a trend, ["country"] or ["device"]
    for segmentation.""",
    schema(
        dimensions_=array("Dimensions to group by", {"type": "string",
            "enum": ["query", "page", "date", "country", "device", "searchAppearance"]}),
        days_=integer("How many days back", minimum=1, maximum=480, default=28),
        limit_=integer("Maximum rows", minimum=1, maximum=25000, default=200),
        filter_page_=string("Only rows for this page URL"),
        filter_query_contains_=string("Only queries containing this string"),
    ),
    category="analytics",
)
async def search_performance(
    ctx: ToolContext,
    dimensions: list[str] | None = None,
    days: int = 28,
    limit: int = 200,
    filter_page: str | None = None,
    filter_query_contains: str | None = None,
) -> ToolOutcome:
    connector = await connector_for(ctx, "google_search_console")
    filters = []
    if filter_page:
        filters.append({"dimension": "page", "operator": "equals", "expression": filter_page})
    if filter_query_contains:
        filters.append(
            {"dimension": "query", "operator": "contains", "expression": filter_query_contains}
        )
    end = date.today() - timedelta(days=2)
    async with connector:
        result = await connector.query(
            start_date=end - timedelta(days=days),
            end_date=end,
            dimensions=dimensions or ["query"],
            filters=filters or None,
            row_limit=limit,
        )
    if not result.ok:
        return ToolOutcome(ok=False, error=result.error)

    rows = result.data
    totals = {
        "clicks": sum(r["clicks"] for r in rows),
        "impressions": sum(r["impressions"] for r in rows),
    }
    totals["ctr"] = round(totals["clicks"] / totals["impressions"], 4) if totals["impressions"] else 0
    return ToolOutcome(
        ok=True,
        summary=(
            f"{len(rows)} rows over {days} days: "
            f"{totals['clicks']:,} clicks from {totals['impressions']:,} impressions"
        ),
        data={"rows": rows[:limit], "totals": totals, "period_days": days},
    )


@tool(
    "analytics.striking_distance",
    """Find queries ranking between positions 4 and 20 with real impressions.

    These are the cheapest wins available: the page already qualifies for the
    query, it just is not winning yet. Work these before writing anything new.""",
    schema(
        days_=integer("Days of data", minimum=7, maximum=180, default=28),
        min_impressions_=integer("Ignore queries below this", minimum=1, default=50),
    ),
    category="analytics",
)
async def striking_distance(ctx: ToolContext, days: int = 28, min_impressions: int = 50) -> ToolOutcome:
    connector = await connector_for(ctx, "google_search_console")
    async with connector:
        result = await connector.striking_distance(days=days, min_impressions=min_impressions)
    if not result.ok:
        return ToolOutcome(ok=False, error=result.error)
    rows = result.data
    return ToolOutcome(
        ok=True,
        summary=(
            f"{len(rows)} striking-distance opportunities worth about "
            f"{sum(max(r['potential_clicks'], 0) for r in rows):,} extra clicks a month"
        ),
        data={
            "opportunities": compact(
                rows[:100],
                ["query", "page", "position", "impressions", "clicks", "ctr",
                 "potential_clicks", "opportunity"],
            )
        },
    )


@tool(
    "analytics.ctr_gaps",
    """Find pages that rank well but are not clicked. Almost always a title
    and meta description problem, which makes them the fastest fix in SEO:
    no new content, no developer, measurable within two weeks.""",
    schema(
        days_=integer("Days of data", minimum=7, maximum=180, default=28),
        min_impressions_=integer("Ignore pages below this", minimum=1, default=200),
    ),
    category="analytics",
)
async def ctr_gaps(ctx: ToolContext, days: int = 28, min_impressions: int = 200) -> ToolOutcome:
    connector = await connector_for(ctx, "google_search_console")
    async with connector:
        result = await connector.low_ctr_pages(days=days, min_impressions=min_impressions)
    if not result.ok:
        return ToolOutcome(ok=False, error=result.error)
    rows = result.data
    return ToolOutcome(
        ok=True,
        summary=(
            f"{len(rows)} pages underperforming their rank, worth about "
            f"{sum(r['missed_clicks'] for r in rows):,} clicks a month"
        ),
        data={"pages": rows[:60]},
    )


@tool(
    "analytics.index_status",
    """Ask Google directly whether a URL is indexed, what canonical it chose,
    and why it is excluded if it is. Use this when a page is not appearing and
    you need the actual reason rather than a guess.""",
    schema(url=string("The URL to inspect")),
    category="analytics",
)
async def index_status(ctx: ToolContext, url: str) -> ToolOutcome:
    connector = await connector_for(ctx, "google_search_console")
    async with connector:
        result = await connector.inspect_url(url)
    if not result.ok:
        return ToolOutcome(ok=False, error=result.error)
    data = result.data
    verdict = data.get("verdict")
    return ToolOutcome(
        ok=True,
        summary=f"{url}: {verdict} ({data.get('coverage_state')})",
        data=data,
    )


@tool(
    "analytics.traffic_and_conversions",
    """Organic sessions, conversions and revenue by landing page from GA4.

    This is what turns a ranking report into a business report. Use it to
    decide which pages deserve investment, not just which rank.""",
    schema(days_=integer("Days of data", minimum=7, maximum=365, default=28)),
    category="analytics",
)
async def traffic_and_conversions(ctx: ToolContext, days: int = 28) -> ToolOutcome:
    connector = await connector_for(ctx, "google_analytics_4")
    async with connector:
        result = await connector.organic_landing_pages(days=days)
    if not result.ok:
        return ToolOutcome(ok=False, error=result.error)
    rows = result.data
    totals = {
        "sessions": sum(r.get("sessions", 0) for r in rows),
        "conversions": sum(r.get("conversions", 0) for r in rows),
        "revenue": round(sum(r.get("totalRevenue", 0) for r in rows), 2),
    }
    rows.sort(key=lambda r: r.get("sessions", 0), reverse=True)
    return ToolOutcome(
        ok=True,
        summary=(
            f"{totals['sessions']:,.0f} organic sessions, "
            f"{totals['conversions']:,.0f} conversions, "
            f"{totals['revenue']:,.2f} revenue over {days} days"
        ),
        data={"landing_pages": rows[:100], "totals": totals},
    )


@tool(
    "analytics.page_speed",
    """Run PageSpeed Insights on a URL: lab metrics, real-user Core Web Vitals
    where available, and the specific opportunities with their time savings.""",
    schema(
        url=string("URL to test"),
        strategy_=string("Device", enum=["mobile", "desktop"], default="mobile"),
    ),
    category="analytics",
    cost_hint_usd=0.0,
)
async def page_speed(ctx: ToolContext, url: str, strategy: str = "mobile") -> ToolOutcome:
    try:
        connector = await connector_for(ctx, "pagespeed")
    except Exception:  # noqa: BLE001
        # PageSpeed works without a key at a lower rate limit, so a missing
        # credential should degrade rather than block.
        from seoos.connectors.google import PageSpeedConnector

        connector = PageSpeedConnector({})
    async with connector:
        result = await connector.analyse(url, strategy=strategy)
    if not result.ok:
        return ToolOutcome(ok=False, error=result.error)
    data = result.data
    field = data.get("field") or {}
    lab = data.get("lab") or {}
    source = "real users" if field.get("lcp_ms") else "lab only"
    return ToolOutcome(
        ok=True,
        summary=(
            f"{url} ({strategy}): performance {data['scores'].get('performance')}, "
            f"LCP {(field.get('lcp_ms') or lab.get('lcp_ms') or 0):.0f}ms, {source}"
        ),
        data=data,
        degraded=not field.get("lcp_ms"),
    )


@tool(
    "analytics.record_kpi",
    """Store a KPI measurement so trends and regressions can be detected
    later. Use this after measuring anything the client should see move over
    time.""",
    schema(
        metric=string("Metric name, e.g. organic_clicks, ai_share_of_voice, health_score"),
        value=number("The measured value"),
        measured_on_=string("ISO date; defaults to today"),
        dimension_=string("Optional breakdown, e.g. a country or page type"),
        source_=string("Where it came from", default="gsc"),
    ),
    category="analytics",
)
async def record_kpi(
    ctx: ToolContext,
    metric: str,
    value: float,
    measured_on: str | None = None,
    dimension: str = "",
    source: str = "gsc",
) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    day = date.fromisoformat(measured_on) if measured_on else date.today()

    from sqlalchemy import select

    existing = (
        await ctx.session.execute(
            select(KpiSnapshot).where(
                KpiSnapshot.site_id == site.id,
                KpiSnapshot.measured_on == day,
                KpiSnapshot.metric == metric,
                KpiSnapshot.dimension == (dimension or ""),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.value = float(value)
        existing.source = source
    else:
        ctx.session.add(
            KpiSnapshot(
                org_id=ctx.org_id,
                site_id=site.id,
                measured_on=day,
                metric=metric,
                dimension=dimension or "",
                value=float(value),
                source=source,
            )
        )
    await ctx.session.flush()
    return ToolOutcome(ok=True, summary=f"{metric}={value} recorded for {day}")


@tool(
    "analytics.kpi_trend",
    """Read a stored KPI's history, with the change over the period. Use this
    to tell whether what we did is working, and to catch a decline early.""",
    schema(
        metric=string("Metric name"),
        days_=integer("How far back", minimum=7, maximum=730, default=90),
    ),
    category="analytics",
)
async def kpi_trend(ctx: ToolContext, metric: str, days: int = 90) -> ToolOutcome:
    from sqlalchemy import select

    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    since = date.today() - timedelta(days=days)
    rows = (
        await ctx.session.execute(
            select(KpiSnapshot)
            .where(
                KpiSnapshot.site_id == site.id,
                KpiSnapshot.metric == metric,
                KpiSnapshot.measured_on >= since,
            )
            .order_by(KpiSnapshot.measured_on)
        )
    ).scalars().all()
    if not rows:
        return ToolOutcome(
            ok=True,
            summary=f"No history for {metric} yet",
            data={"points": [], "note": "Nothing recorded in this window."},
        )
    points = [{"date": r.measured_on.isoformat(), "value": r.value} for r in rows]
    first, last = rows[0].value, rows[-1].value
    change_pct = ((last - first) / first * 100) if first else None
    return ToolOutcome(
        ok=True,
        summary=(
            f"{metric}: {first:.1f} to {last:.1f} over {len(points)} points"
            + (f" ({change_pct:+.1f}%)" if change_pct is not None else "")
        ),
        data={
            "points": points,
            "first": first,
            "last": last,
            "change_pct": round(change_pct, 1) if change_pct is not None else None,
            "peak": max(r.value for r in rows),
            "trough": min(r.value for r in rows),
        },
    )
