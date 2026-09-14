"""Crawling, auditing and page inspection."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from seoos.analysis.audit import audit_single_page, run_audit
from seoos.analysis.checks.aeo import blocked_ai_crawlers, score_page_aeo
from seoos.analysis.checks.links import suggest_internal_links
from seoos.analysis.crawler import SiteCrawler
from seoos.analysis.http import SafeHttpClient
from seoos.analysis.parser import parse_html
from seoos.core.models import Crawl, Page
from seoos.services.findings import FindingsService
from seoos.tools._helpers import (
    boolean,
    connector_for,
    has_connector,
    integer,
    load_site,
    schema,
    string,
)
from seoos.tools.registry import ToolContext, ToolOutcome, tool


@tool(
    "crawl.site",
    """Crawl the client's site and run every deterministic check: technical,
    content, schema, AEO and internal linking. This is the backbone of the
    audit. Results are stored, so findings are reconciled against the last
    crawl rather than duplicated.

    Use this at the start of an audit cycle. It is expensive in time, so do
    not call it twice in one mission.""",
    schema(
        max_pages_=integer("How many pages to crawl", minimum=1, maximum=5000, default=250),
        max_depth_=integer("How many clicks deep from the homepage", minimum=1, maximum=10, default=5),
        include_subdomains_=boolean("Include subdomains", default=False),
    ),
    category="crawl",
    cost_hint_usd=0.0,
)
async def crawl_site(ctx: ToolContext, max_pages: int = 250, max_depth: int = 5,
                     include_subdomains: bool = False) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    crawl = Crawl(
        org_id=ctx.org_id,
        site_id=site.id,
        trigger="agent",
        status="running",
        started_at=datetime.now(UTC),
        config={"max_pages": max_pages, "max_depth": max_depth},
    )
    ctx.session.add(crawl)
    # Commit before the network phase. A flush here would hold a write
    # transaction open for the whole crawl, which starves every other writer
    # and, on SQLite, is the entire rest of the platform. It also makes the
    # crawl visible as "running" while it actually runs.
    await ctx.session.commit()

    # Joining Search Console data onto the crawl is what turns "this page has
    # no meta description" into "this page has no meta description and gets
    # 12,000 impressions a month", which is a completely different priority.
    gsc_data = None
    if await has_connector(ctx, "google_search_console"):
        try:
            connector = await connector_for(ctx, "google_search_console")
            async with connector:
                result = await connector.page_metrics(days=28)
            if result.ok:
                gsc_data = result.data
        except Exception as exc:  # noqa: BLE001 - never fail a crawl over this
            crawl.summary = {"gsc_note": f"Search Console data unavailable: {exc}"}

    money_pages = (site.goals or {}).get("money_pages") or []

    try:
        audit = await run_audit(
            site.base_url,
            max_pages=max_pages,
            max_depth=max_depth,
            is_ymyl=site.is_ymyl,
            money_pages=money_pages,
            gsc_data=gsc_data,
            include_subdomains=include_subdomains,
        )
    except Exception as exc:  # noqa: BLE001
        crawl.status = "failed"
        crawl.error = str(exc)[:2000]
        crawl.finished_at = datetime.now(UTC)
        return ToolOutcome(ok=False, error=f"Crawl failed: {exc}")

    await _persist_pages(ctx, site.id, audit)

    reconcile = await FindingsService(ctx.session).reconcile(
        org_id=ctx.org_id,
        site_id=site.id,
        drafts=audit.findings,
        crawl_id=crawl.id,
    )

    crawl.status = "complete"
    crawl.finished_at = datetime.now(UTC)
    crawl.pages_crawled = len(audit.pages)
    crawl.pages_discovered = len(audit.crawl.pages) if audit.crawl else 0
    crawl.pages_failed = sum(1 for p in audit.pages if p.status >= 400 or p.status == 0)
    crawl.summary = {**(crawl.summary or {}), **audit.summary, "findings": reconcile.to_dict()}

    site.last_crawl_at = crawl.finished_at
    site.last_audit_at = crawl.finished_at
    site.health_score = audit.scores["health"]["score"]
    site.aeo_score = audit.scores["aeo"]["score"]
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=(
            f"Crawled {len(audit.pages)} pages in {audit.duration_s:.0f}s. "
            f"Health {site.health_score}, AEO {site.aeo_score}. "
            f"{reconcile.created} new findings, {reconcile.resolved} resolved."
        ),
        data={
            "crawl_id": crawl.id,
            "scores": {k: v["score"] for k, v in audit.scores.items()},
            "summary": audit.summary,
            "findings": reconcile.to_dict(),
            "top_priorities": audit.to_dict()["top_priorities"][:15],
            "quick_wins": audit.to_dict()["quick_wins"],
        },
    )


async def _persist_pages(ctx: ToolContext, site_id: str, audit) -> None:
    """Upsert crawled pages. Updated in place so URL history stays stable."""
    import hashlib

    existing = {
        row.url_hash: row
        for row in (
            await ctx.session.execute(select(Page).where(Page.site_id == site_id))
        ).scalars().all()
    }
    now = datetime.now(UTC)
    crawl_pages = {p.url: p for p in (audit.crawl.pages.values() if audit.crawl else [])}

    for page_audit in audit.pages:
        url_hash = hashlib.blake2b(page_audit.url.encode(), digest_size=20).hexdigest()
        crawled = crawl_pages.get(page_audit.url)
        signals = crawled.signals if crawled else None
        row = existing.get(url_hash)
        if row is None:
            from urllib.parse import urlparse

            row = Page(
                org_id=ctx.org_id,
                site_id=site_id,
                url=page_audit.url,
                url_hash=url_hash,
                path=urlparse(page_audit.url).path or "/",
                first_seen_at=now,
            )
            ctx.session.add(row)

        row.status_code = page_audit.status
        row.depth = page_audit.depth
        row.title = page_audit.title
        row.word_count = page_audit.word_count
        row.is_indexable = page_audit.indexable
        row.template_type = page_audit.template_type
        row.schema_types = page_audit.schema_types
        row.aeo_score = page_audit.aeo.get("score")
        row.opportunity_score = page_audit.opportunity
        row.last_crawled_at = now
        if signals is not None:
            row.meta_description = signals.meta_description
            row.h1 = signals.h1[0] if signals.h1 else None
            row.canonical = signals.canonical
            row.robots_meta = signals.robots_meta
            row.lang = signals.lang
            row.content_hash = signals.content_hash
            row.internal_outlinks = len(signals.internal_links)
            row.external_outlinks = len(signals.external_links)
            row.hreflang = signals.hreflang
            row.images = {
                "total": len(signals.images),
                "missing_alt": sum(1 for i in signals.images if i.alt is None),
            }
            row.signals = {
                "readability": page_audit.readability,
                "ai_patterns": page_audit.ai_patterns,
                "aeo_components": page_audit.aeo,
            }
    await ctx.session.flush()


@tool(
    "crawl.page",
    """Fetch and analyse one URL in detail: on-page elements, schema, AEO
    citability, readability and machine-writing tells. Use this for a single
    page rather than crawling the whole site.""",
    schema(
        url=string("The full URL to analyse"),
    ),
    category="crawl",
)
async def crawl_page(ctx: ToolContext, url: str) -> ToolOutcome:
    site = await load_site(ctx)
    audit = await audit_single_page(url, is_ymyl=bool(site and site.is_ymyl))
    return ToolOutcome(
        ok=audit.status < 400,
        summary=f"{url}: HTTP {audit.status}, {audit.word_count} words, {len(audit.findings)} issues",
        data={
            "url": audit.url,
            "status": audit.status,
            "title": audit.title,
            "word_count": audit.word_count,
            "indexable": audit.indexable,
            "template_type": audit.template_type,
            "schema_types": audit.schema_types,
            "aeo": audit.aeo,
            "readability": audit.readability,
            "ai_patterns": audit.ai_patterns,
            "issues": [
                {
                    "code": f.code,
                    "severity": f.severity,
                    "title": f.title,
                    "detail": f.detail,
                    "recommendation": f.definition.recommendation,
                }
                for f in audit.findings
            ],
        },
    )


@tool(
    "crawl.fetch",
    """Fetch a single URL and return its content. Use this to read a
    competitor page, check whether a fix went live, or look at any page on the
    open web. Private and internal addresses are refused.""",
    schema(
        url=string("The URL to fetch"),
        extract_=string("What to return", enum=["text", "html", "signals"], default="text"),
    ),
    category="crawl",
)
async def crawl_fetch(ctx: ToolContext, url: str, extract: str = "text") -> ToolOutcome:
    async with SafeHttpClient() as client:
        result = await client.get(url)
    if not result.ok:
        return ToolOutcome(
            ok=False, error=f"HTTP {result.status}: {result.error or 'request failed'}"
        )
    if extract == "html":
        return ToolOutcome(ok=True, data={"html": result.text[:60000]},
                           summary=f"{len(result.text)} bytes of HTML")

    signals = parse_html(result.text, result.final_url)
    if extract == "signals":
        return ToolOutcome(
            ok=True,
            summary=f"{signals.title or 'untitled'} ({signals.word_count} words)",
            data={
                "title": signals.title,
                "meta_description": signals.meta_description,
                "h1": signals.h1,
                "headings": signals.headings[:40],
                "word_count": signals.word_count,
                "schema_types": signals.schema_types,
                "internal_links": len(signals.internal_links),
                "external_links": len(signals.external_links),
                "author": signals.author,
                "published_date": signals.published_date,
                "aeo": score_page_aeo(signals),
            },
        )
    return ToolOutcome(
        ok=True,
        summary=f"{signals.title or 'untitled'} ({signals.word_count} words)",
        data={
            "title": signals.title,
            "text": (signals.main_text or signals.text)[:20000],
            "headings": signals.headings[:30],
            "word_count": signals.word_count,
        },
    )


@tool(
    "crawl.robots",
    """Read robots.txt and report which AI and search crawlers are allowed or
    blocked. Blocking retrieval crawlers is the single most common reason a
    site is invisible in AI answers.""",
    schema(),
    category="crawl",
)
async def crawl_robots(ctx: ToolContext) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    from urllib.parse import urlparse

    parsed = urlparse(site.base_url)
    async with SafeHttpClient() as client:
        result = await client.get(f"{parsed.scheme}://{parsed.netloc}/robots.txt",
                                  check_robots=False)
    if not result.ok:
        return ToolOutcome(
            ok=True,
            summary="No robots.txt found; everything is crawlable by default",
            data={"exists": False, "blocked_ai_crawlers": []},
        )
    blocked = blocked_ai_crawlers(result.text)
    return ToolOutcome(
        ok=True,
        summary=(
            f"robots.txt found; {len(blocked)} known AI crawlers blocked"
            if blocked else "robots.txt found; no AI crawlers blocked"
        ),
        data={
            "exists": True,
            "content": result.text[:8000],
            "blocked_ai_crawlers": blocked,
            "sitemaps": [
                line.split(":", 1)[1].strip()
                for line in result.text.splitlines()
                if line.lower().startswith("sitemap:")
            ],
        },
    )


@tool(
    "crawl.internal_link_suggestions",
    """Find pages that should link to a given URL, with the exact anchor text
    to use and the sentence it fits into. Internal linking is the highest
    leverage change available without a developer, and this makes it concrete
    rather than a vague recommendation.""",
    schema(
        target_url=string("The URL that needs more internal links"),
        limit_=integer("How many suggestions", minimum=1, maximum=20, default=8),
    ),
    category="crawl",
)
async def internal_link_suggestions(ctx: ToolContext, target_url: str, limit: int = 8) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    # A fresh shallow crawl beats stored rows here because anchor suggestions
    # need the actual body text, which is not persisted.
    async with SafeHttpClient() as client:
        crawler = SiteCrawler(site.base_url, max_pages=150, max_depth=4, client=client)
        report = await crawler.crawl()
    suggestions = suggest_internal_links(report, target_url, limit=limit)
    if not suggestions:
        return ToolOutcome(
            ok=True,
            summary="No strong internal link opportunities found for this page",
            data={"suggestions": [], "note": (
                "Either nothing on the site covers this topic, or everything "
                "relevant already links here. Consider whether the target page "
                "needs supporting content rather than more links."
            )},
        )
    return ToolOutcome(
        ok=True,
        summary=f"{len(suggestions)} pages could link to {target_url}",
        data={"suggestions": suggestions},
    )
