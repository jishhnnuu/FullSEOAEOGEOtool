"""The audit: crawl once, run every deterministic check, score the result.

This runs with no model provider and no third-party data subscription. That
matters commercially as well as technically: the audit a prospect sees on day
one costs the platform almost nothing to produce, and it is real, not a demo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from seoos.analysis.checks.aeo import check_aeo, check_site_aeo, score_page_aeo
from seoos.analysis.checks.content import (
    ai_pattern_score,
    check_content,
    check_site_content,
    readability,
)
from seoos.analysis.checks.links import build_graph, check_link_graph, suggest_internal_links
from seoos.analysis.checks.schema import check_schema
from seoos.analysis.checks.technical import check_site_technical, check_technical
from seoos.analysis.crawler import CrawledPage, CrawlReport, SiteCrawler
from seoos.analysis.findings import FindingDraft
from seoos.analysis.http import SafeHttpClient
from seoos.analysis.scoring import (
    aeo_score,
    authority_score,
    health_score,
    opportunity_score,
)
from seoos.core.logging import get_logger

log = get_logger("seoos.analysis.audit")


@dataclass
class PageAudit:
    url: str
    status: int
    depth: int
    title: str | None = None
    word_count: int = 0
    indexable: bool = True
    template_type: str | None = None
    schema_types: list[str] = field(default_factory=list)
    aeo: dict[str, Any] = field(default_factory=dict)
    readability: dict[str, Any] = field(default_factory=dict)
    ai_patterns: dict[str, Any] = field(default_factory=dict)
    findings: list[FindingDraft] = field(default_factory=list)
    opportunity: float = 0.0

    def to_dict(self) -> dict:
        return {
            "url": self.url,
            "status": self.status,
            "depth": self.depth,
            "title": self.title,
            "word_count": self.word_count,
            "indexable": self.indexable,
            "template_type": self.template_type,
            "schema_types": self.schema_types,
            "aeo_score": self.aeo.get("score"),
            "readability": self.readability.get("score"),
            "issue_count": len(self.findings),
            "opportunity": self.opportunity,
        }


@dataclass
class AuditResult:
    base_url: str
    started_at: datetime
    finished_at: datetime | None = None
    crawl: CrawlReport | None = None
    pages: list[PageAudit] = field(default_factory=list)
    findings: list[FindingDraft] = field(default_factory=list)
    scores: dict[str, Any] = field(default_factory=dict)
    summary: dict[str, Any] = field(default_factory=dict)
    link_suggestions: list[dict] = field(default_factory=list)

    @property
    def duration_s(self) -> float:
        if not self.finished_at:
            return 0.0
        return (self.finished_at - self.started_at).total_seconds()

    def findings_by_severity(self) -> dict[str, list[FindingDraft]]:
        out: dict[str, list[FindingDraft]] = {}
        for finding in self.findings:
            out.setdefault(finding.severity, []).append(finding)
        return out

    def prioritised(self, limit: int = 25) -> list[FindingDraft]:
        return sorted(self.findings, key=lambda f: f.priority_score(), reverse=True)[:limit]

    def quick_wins(self, limit: int = 10) -> list[FindingDraft]:
        """High impact, low effort, auto-fixable. What ships this week."""
        candidates = [
            f for f in self.findings
            if f.definition.auto_fixable and f.definition.effort <= 0.3
        ]
        return sorted(candidates, key=lambda f: f.priority_score(), reverse=True)[:limit]

    def to_dict(self) -> dict:
        by_sev = {k: len(v) for k, v in self.findings_by_severity().items()}
        by_cat: dict[str, int] = {}
        for finding in self.findings:
            by_cat[finding.category] = by_cat.get(finding.category, 0) + 1
        return {
            "base_url": self.base_url,
            "started_at": self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "duration_seconds": round(self.duration_s, 1),
            "scores": self.scores,
            "summary": self.summary,
            "findings_by_severity": by_sev,
            "findings_by_category": by_cat,
            "total_findings": len(self.findings),
            "top_priorities": [
                {
                    "code": f.code,
                    "title": f.title,
                    "severity": f.severity,
                    "category": f.category,
                    "url": f.url,
                    "detail": f.detail,
                    "recommendation": f.definition.recommendation,
                    "affected": len(f.affected_urls) or 1,
                    "priority": f.priority_score(),
                    "auto_fixable": f.definition.auto_fixable,
                }
                for f in self.prioritised(25)
            ],
            "quick_wins": [
                {"code": f.code, "title": f.title, "url": f.url, "priority": f.priority_score()}
                for f in self.quick_wins()
            ],
            "pages": [p.to_dict() for p in self.pages[:500]],
        }


async def run_audit(
    base_url: str,
    *,
    max_pages: int = 200,
    max_depth: int = 5,
    is_ymyl: bool = False,
    money_pages: list[str] | None = None,
    gsc_data: dict[str, dict] | None = None,
    client: SafeHttpClient | None = None,
    include_subdomains: bool = False,
) -> AuditResult:
    """Crawl and analyse a site end to end.

    ``gsc_data`` maps URL to {clicks, impressions, position, ctr}. When it is
    supplied the audit stops guessing about opportunity and starts measuring
    it, which is the single biggest quality jump available from connecting one
    integration.
    """
    started = datetime.now(UTC)
    result = AuditResult(base_url=base_url, started_at=started)
    own_client = client is None
    http = client or SafeHttpClient()

    try:
        crawler = SiteCrawler(
            base_url,
            max_pages=max_pages,
            max_depth=max_depth,
            client=http,
            include_subdomains=include_subdomains,
        )
        report = await crawler.crawl()
        result.crawl = report

        llms_present = await _has_llms_txt(http, base_url)

        for page in report.pages.values():
            result.pages.append(_audit_page(page, is_ymyl=is_ymyl, gsc_data=gsc_data))

        for page_audit in result.pages:
            result.findings.extend(page_audit.findings)

        result.findings.extend(check_site_technical(report))
        result.findings.extend(check_site_content(report))
        result.findings.extend(check_site_aeo(report, llms_txt_present=llms_present))
        result.findings.extend(check_link_graph(report, money_pages=money_pages))

        result.findings = _deduplicate(result.findings)
        result.scores = _score(result, report)
        result.summary = _summarise(result, report, llms_present)

        # Concrete link suggestions for the pages that most need authority.
        for target in (money_pages or [])[:5]:
            result.link_suggestions.extend(suggest_internal_links(report, target, limit=5))

    finally:
        if own_client:
            await http.close()
        result.finished_at = datetime.now(UTC)

    log.info(
        "audit of %s complete: %d pages, %d findings, health %.1f",
        base_url, len(result.pages), len(result.findings),
        result.scores.get("health", {}).get("score", 0),
    )
    return result


def _audit_page(
    page: CrawledPage, *, is_ymyl: bool, gsc_data: dict[str, dict] | None
) -> PageAudit:
    signals = page.signals
    audit = PageAudit(
        url=page.url,
        status=page.status,
        depth=page.depth,
        title=signals.title if signals else None,
        word_count=signals.word_count if signals else 0,
        indexable=signals.is_indexable if signals else False,
        schema_types=signals.schema_types if signals else [],
    )

    audit.findings.extend(check_technical(page))
    audit.findings.extend(check_content(page, is_ymyl=is_ymyl))
    audit.findings.extend(check_schema(page))
    audit.findings.extend(check_aeo(page))

    if signals:
        audit.template_type = _classify_template(page)
        audit.aeo = score_page_aeo(signals)
        text = signals.main_text or signals.text
        if len(text) > 300:
            audit.readability = readability(text)
            audit.ai_patterns = ai_pattern_score(text)

    metrics = (gsc_data or {}).get(page.url) or (gsc_data or {}).get(page.final_url) or {}
    if metrics:
        audit.opportunity = opportunity_score(
            impressions=int(metrics.get("impressions", 0) or 0),
            clicks=int(metrics.get("clicks", 0) or 0),
            position=metrics.get("position"),
            ctr=metrics.get("ctr"),
        )
    return audit


def _classify_template(page: CrawledPage) -> str:
    url = (page.url or "").lower().rstrip("/")
    signals = page.signals
    schema = set(signals.schema_types if signals else [])

    if url.count("/") <= 2:
        return "home"
    if "Product" in schema or any(s in url for s in ("/product", "/p/", "/item")):
        return "product"
    if any(s in schema for s in ("Article", "BlogPosting", "NewsArticle")) or any(
        s in url for s in ("/blog", "/article", "/news", "/guide")
    ):
        return "article"
    if "LocalBusiness" in schema or any(s in url for s in ("/location", "/store", "/branch")):
        return "location"
    if any(s in url for s in ("/category", "/collection", "/c/", "/shop")):
        return "category"
    if any(s in url for s in ("/docs", "/documentation", "/api")):
        return "doc"
    if signals and signals.forms and signals.word_count < 400:
        return "landing"
    return "other"


def _deduplicate(findings: list[FindingDraft]) -> list[FindingDraft]:
    """One finding per fingerprint. Repeats merge their affected URLs so a
    site-wide problem reads as one item with a count, not 400 rows."""
    merged: dict[str, FindingDraft] = {}
    for finding in findings:
        key = finding.fingerprint()
        existing = merged.get(key)
        if existing is None:
            merged[key] = finding
            continue
        for url in finding.affected_urls or ([finding.url] if finding.url else []):
            if url and url not in existing.affected_urls:
                existing.affected_urls.append(url)
    return list(merged.values())


def _score(result: AuditResult, report: CrawlReport) -> dict:
    page_count = max(len(report.ok_pages), 1)
    page_aeo = [p.aeo["score"] for p in result.pages if p.aeo.get("score") is not None]
    return {
        "health": health_score(result.findings, page_count).to_dict(),
        "aeo": aeo_score(result.findings, page_count, page_aeo).to_dict(),
        "authority": authority_score(result.findings, page_count=page_count).to_dict(),
    }


def _summarise(result: AuditResult, report: CrawlReport, llms_present: bool) -> dict:
    ok_pages = report.ok_pages
    indexable = report.indexable_pages
    templates: dict[str, int] = {}
    for page in result.pages:
        if page.template_type:
            templates[page.template_type] = templates.get(page.template_type, 0) + 1

    graph = build_graph(report)
    ranks = graph.pagerank()
    top_authority = sorted(ranks.items(), key=lambda kv: kv[1], reverse=True)[:10]

    word_counts = [p.word_count for p in result.pages if p.word_count]
    ai_scores = [p.ai_patterns["score"] for p in result.pages if p.ai_patterns.get("score")]

    return {
        "pages_crawled": len(report.pages),
        "pages_ok": len(ok_pages),
        "pages_indexable": len(indexable),
        "pages_blocked": len(ok_pages) - len(indexable),
        "orphan_pages": len(report.orphans()),
        "duplicate_clusters": len(report.duplicate_content()),
        "sitemaps": report.sitemaps_found,
        "sitemap_urls": len(report.sitemap_urls),
        "has_llms_txt": llms_present,
        "depth_distribution": report.depth_map(),
        "template_mix": templates,
        "median_word_count": _median(word_counts),
        "median_ai_pattern_score": _median(ai_scores),
        "top_authority_pages": [{"url": u, "share": round(r, 5)} for u, r in top_authority],
        "crawl_stopped_reason": report.stopped_reason,
        "schema_coverage_pct": round(
            100.0 * sum(1 for p in result.pages if p.schema_types) / max(len(result.pages), 1), 1
        ),
    }


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return round(ordered[mid], 1)
    return round((ordered[mid - 1] + ordered[mid]) / 2, 1)


async def _has_llms_txt(client: SafeHttpClient, base_url: str) -> bool:
    from urllib.parse import urlparse

    parsed = urlparse(base_url)
    try:
        result = await client.get(
            f"{parsed.scheme}://{parsed.netloc}/llms.txt", check_robots=False
        )
    except Exception:  # noqa: BLE001
        return False
    return result.ok and "#" in (result.text or "")


async def audit_single_page(url: str, *, is_ymyl: bool = False) -> PageAudit:
    """One page, no crawl. Used by the page-level tool and by the editor's
    pre-publish verification."""
    async with SafeHttpClient() as client:
        crawler = SiteCrawler(url, max_pages=1, max_depth=0, client=client)
        page = await crawler._fetch_one(client, url, 0, None)
    return _audit_page(page, is_ymyl=is_ymyl, gsc_data=None)


__all__ = ["run_audit", "audit_single_page", "AuditResult", "PageAudit"]
