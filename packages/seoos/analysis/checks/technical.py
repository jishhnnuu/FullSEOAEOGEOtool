"""Technical checks: can this page be crawled, indexed and served at all."""

from __future__ import annotations

from urllib.parse import urlparse

from seoos.analysis.crawler import CrawledPage, CrawlReport
from seoos.analysis.findings import FindingDraft

MAX_GOOD_DEPTH = 4
LARGE_JS_BYTES = 500_000


def check_technical(page: CrawledPage) -> list[FindingDraft]:
    out: list[FindingDraft] = []
    url = page.url

    if page.status >= 500:
        out.append(FindingDraft("page_5xx", url, f"Returned HTTP {page.status}"))
        return out
    if page.error == "blocked by robots.txt":
        out.append(
            FindingDraft(
                "robots_blocks_important", url,
                "robots.txt disallows this URL, so its content cannot be indexed",
            )
        )
        return out
    if page.error and "too many redirects" in page.error:
        out.append(FindingDraft("redirect_loop", url, page.error))
        return out

    if page.fetch and len(page.fetch.redirect_chain) > 1:
        chain = page.fetch.redirect_chain + [page.final_url]
        out.append(
            FindingDraft(
                "redirect_chain", url,
                f"{len(page.fetch.redirect_chain)} hops before the final URL",
                evidence={"chain": chain},
                auto_fix_payload={"from": url, "to": page.final_url},
            )
        )

    if urlparse(page.final_url).scheme != "https":
        out.append(FindingDraft("no_https", url, "Served over plain HTTP"))

    signals = page.signals
    if signals is None:
        return out

    if not signals.is_indexable:
        out.append(
            FindingDraft("page_noindex", url, f"robots meta: {signals.robots_meta}")
        )

    if signals.canonical is None:
        out.append(
            FindingDraft(
                "canonical_missing", url, "No rel=canonical",
                auto_fix_payload={"canonical": page.final_url},
            )
        )
    elif _canonical_differs(signals.canonical, page.final_url):
        out.append(
            FindingDraft(
                "canonical_mismatch", url,
                f"Canonical points to {signals.canonical}",
                evidence={"canonical": signals.canonical, "page": page.final_url},
            )
        )

    if page.depth > MAX_GOOD_DEPTH:
        out.append(
            FindingDraft("deep_page", url, f"{page.depth} clicks from the homepage")
        )

    if signals.inline_script_bytes > LARGE_JS_BYTES:
        out.append(
            FindingDraft(
                "excessive_javascript", url,
                f"{signals.inline_script_bytes // 1024} kB of inline JavaScript",
                evidence={"inline_bytes": signals.inline_script_bytes,
                          "external_scripts": signals.scripts},
            )
        )

    if page.fetch and page.fetch.final_url.startswith("https://"):
        insecure = [
            img.src for img in signals.images if img.src.startswith("http://")
        ]
        if insecure:
            out.append(
                FindingDraft(
                    "mixed_content", url,
                    f"{len(insecure)} resources loaded over HTTP",
                    evidence={"examples": insecure[:5]},
                )
            )

    if not signals.viewport:
        out.append(
            FindingDraft("mobile_unfriendly", url, "No viewport meta tag")
        )

    if not _has_analytics(page):
        out.append(FindingDraft("analytics_missing", url, "No analytics snippet detected"))

    return out


def check_site_technical(report: CrawlReport) -> list[FindingDraft]:
    """Checks that only make sense across the whole crawl."""
    out: list[FindingDraft] = []

    if not report.sitemaps_found:
        out.append(
            FindingDraft(
                "no_sitemap", None,
                "No sitemap referenced in robots.txt and none at the usual paths",
                affected_urls=[report.base_url],
            )
        )
    else:
        non_indexable = []
        for url in list(report.sitemap_urls)[:2000]:
            page = report.pages.get(url)
            if page and (not page.ok or (page.signals and not page.signals.is_indexable)):
                non_indexable.append(url)
        if non_indexable:
            out.append(
                FindingDraft(
                    "sitemap_contains_non_indexable", None,
                    f"{len(non_indexable)} sitemap URLs are not indexable",
                    affected_urls=non_indexable[:100],
                    evidence={"count": len(non_indexable)},
                    auto_fix_payload={"remove": non_indexable[:500]},
                )
            )

    # Broken internal links, attributed to the pages that contain them.
    #
    # Only a real 4xx counts. A status of 0 means the fetch itself failed:
    # a timeout, a reset connection, an SSL error, a rate limit that dropped
    # the request. That says something about our crawl, not about their site,
    # and reporting it as a broken internal link at high severity is a false
    # positive. Two of them showed up on a real audit of a site whose pages
    # both returned 200 on the very next request.
    #
    # The TypeScript engine has always been right here, firing on 404 and 410
    # alone. This brings the two back into step.
    broken: dict[str, list[str]] = {}
    for page in report.pages.values():
        if page.status in (404, 410):
            for source, targets in report.inlinks.items():
                if page.url in targets:
                    broken.setdefault(page.url, []).append(source)
    for target, sources in broken.items():
        out.append(
            FindingDraft(
                "page_404_linked", target,
                f"Linked from {len(sources)} page(s) but returns {report.pages[target].status}",
                evidence={"linked_from": sources[:10]},
                affected_urls=sources[:50],
            )
        )

    orphans = report.orphans()
    if orphans:
        out.append(
            FindingDraft(
                "orphan_page", None,
                f"{len(orphans)} pages have no internal links pointing to them",
                affected_urls=orphans[:200],
                evidence={"count": len(orphans), "examples": orphans[:10]},
            )
        )

    for _hash, urls in report.duplicate_content().items():
        out.append(
            FindingDraft(
                "duplicate_content", urls[0],
                f"{len(urls)} URLs share identical content",
                affected_urls=urls,
                evidence={"urls": urls[:20]},
            )
        )

    return out


def _canonical_differs(canonical: str, page_url: str) -> bool:
    from seoos.analysis.http import normalise_domain

    def norm(u: str) -> str:
        p = urlparse(u)
        return f"{normalise_domain(p.hostname)}{p.path.rstrip('/') or '/'}"

    return norm(canonical) != norm(page_url)


_ANALYTICS_MARKERS = (
    "gtag(", "googletagmanager.com", "google-analytics.com", "plausible.io",
    "matomo", "piwik", "segment.com/analytics.js", "fathom", "posthog",
    "clarity.ms", "hotjar", "umami",
)


def _has_analytics(page: CrawledPage) -> bool:
    body = (page.fetch.text if page.fetch else "") or ""
    return any(marker in body for marker in _ANALYTICS_MARKERS)
