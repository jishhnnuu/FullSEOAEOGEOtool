"""Breadth-first site crawler.

Depth-first would find deep pages first and produce a depth map that is
wrong, and depth is one of the more actionable things a crawl measures, so
the frontier is a queue ordered by discovery depth. Sitemaps seed the
frontier so orphan pages (in the sitemap, linked from nowhere) are
detectable as a class rather than invisible.
"""

from __future__ import annotations

import asyncio
import re
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from seoos.analysis.http import (
    FetchResult,
    SafeHttpClient,
    normalise_domain,
    validate_url,
)
from seoos.analysis.parser import PageSignals, parse_html
from seoos.core.logging import get_logger

log = get_logger("seoos.analysis.crawler")

SKIP_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "ico", "pdf", "zip",
    "gz", "tar", "mp4", "mp3", "wav", "avi", "mov", "doc", "docx", "xls",
    "xlsx", "ppt", "pptx", "css", "js", "woff", "woff2", "ttf", "eot",
}
SKIP_PATTERNS = re.compile(
    r"/(wp-admin|wp-json|cart|checkout|my-account|login|logout|signin|"
    r"register|search|\?add-to-cart|feed/?$)", re.I
)


@dataclass
class CrawledPage:
    url: str
    final_url: str
    status: int
    depth: int
    signals: PageSignals | None = None
    fetch: FetchResult | None = None
    discovered_from: str | None = None
    error: str | None = None
    in_sitemap: bool = False

    @property
    def ok(self) -> bool:
        return self.error is None and 200 <= self.status < 300


@dataclass
class CrawlReport:
    base_url: str
    pages: dict[str, CrawledPage] = field(default_factory=dict)
    sitemap_urls: set[str] = field(default_factory=set)
    robots_txt: str | None = None
    sitemaps_found: list[str] = field(default_factory=list)
    inlinks: dict[str, set[str]] = field(default_factory=dict)
    errors: list[dict[str, Any]] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)
    stopped_reason: str = "complete"

    @property
    def ok_pages(self) -> list[CrawledPage]:
        return [p for p in self.pages.values() if p.ok and p.signals]

    @property
    def indexable_pages(self) -> list[CrawledPage]:
        return [p for p in self.ok_pages if p.signals and p.signals.is_indexable]

    def orphans(self) -> list[str]:
        """In the sitemap or crawled, but nothing links to them."""
        linked = {url for targets in self.inlinks.values() for url in targets}
        candidates = {p.url for p in self.ok_pages} | self.sitemap_urls
        root = self.base_url.rstrip("/")
        return sorted(
            u for u in candidates
            if u not in linked and u.rstrip("/") != root
        )

    def duplicate_content(self) -> dict[str, list[str]]:
        by_hash: dict[str, list[str]] = {}
        for page in self.ok_pages:
            if page.signals and page.signals.word_count > 100:
                by_hash.setdefault(page.signals.content_hash, []).append(page.url)
        return {h: urls for h, urls in by_hash.items() if len(urls) > 1}

    def depth_map(self) -> dict[int, int]:
        out: dict[int, int] = {}
        for page in self.pages.values():
            out[page.depth] = out.get(page.depth, 0) + 1
        return dict(sorted(out.items()))


class SiteCrawler:
    def __init__(
        self,
        base_url: str,
        *,
        max_pages: int = 500,
        max_depth: int = 6,
        client: SafeHttpClient | None = None,
        include_subdomains: bool = False,
        url_filter: Callable[[str], bool] | None = None,
        on_page: Callable[[CrawledPage], Any] | None = None,
    ):
        self.base_url = validate_url(base_url)
        parsed = urlparse(self.base_url)
        self.host = (parsed.hostname or "").lower()
        self.scheme = parsed.scheme
        self.max_pages = max_pages
        self.max_depth = max_depth
        self.include_subdomains = include_subdomains
        self.url_filter = url_filter
        self.on_page = on_page
        self._client = client
        self._owns_client = client is None

    async def crawl(self) -> CrawlReport:
        client = self._client or SafeHttpClient()
        report = CrawlReport(base_url=self.base_url)
        try:
            await self._load_robots_and_sitemaps(client, report)

            seen: set[str] = set()
            frontier: deque[tuple[str, int, str | None]] = deque()
            frontier.append((self.base_url, 0, None))
            seen.add(_normalise(self.base_url))

            # Sitemap URLs enter at depth 1 so a page that is only in the
            # sitemap still gets crawled and can be flagged as an orphan.
            for url in sorted(report.sitemap_urls)[: self.max_pages]:
                key = _normalise(url)
                if key not in seen and self._in_scope(url):
                    seen.add(key)
                    frontier.append((url, 1, "sitemap"))

            while frontier and len(report.pages) < self.max_pages:
                batch: list[tuple[str, int, str | None]] = []
                while frontier and len(batch) < 10 and len(report.pages) + len(batch) < self.max_pages:
                    batch.append(frontier.popleft())

                results = await asyncio.gather(
                    *(self._fetch_one(client, url, depth, parent) for url, depth, parent in batch),
                    return_exceptions=True,
                )
                for item in results:
                    if isinstance(item, BaseException):
                        report.errors.append({"error": str(item)})
                        continue
                    page: CrawledPage = item
                    page.in_sitemap = page.url in report.sitemap_urls
                    report.pages[page.url] = page
                    if self.on_page:
                        maybe = self.on_page(page)
                        if asyncio.iscoroutine(maybe):
                            await maybe
                    if not page.ok or not page.signals or page.depth >= self.max_depth:
                        continue
                    for link in page.signals.internal_links:
                        target = link.url
                        report.inlinks.setdefault(page.url, set()).add(target)
                        key = _normalise(target)
                        if key in seen or not self._in_scope(target):
                            continue
                        seen.add(key)
                        frontier.append((target, page.depth + 1, page.url))

            if frontier:
                report.stopped_reason = f"page limit of {self.max_pages} reached"
            report.stats = {
                **client.stats,
                "pages": len(report.pages),
                "ok": len(report.ok_pages),
                "depth_map": report.depth_map(),
            }
        finally:
            if self._owns_client:
                await client.close()
        return report

    async def _fetch_one(
        self, client: SafeHttpClient, url: str, depth: int, parent: str | None
    ) -> CrawledPage:
        result = await client.get(url)
        page = CrawledPage(
            url=url,
            final_url=result.final_url,
            status=result.status,
            depth=depth,
            fetch=result,
            discovered_from=parent,
            error=result.error,
        )
        if result.ok and result.is_html and result.text:
            page.signals = parse_html(result.text, result.final_url, base_domain=self.host)
        return page

    async def _load_robots_and_sitemaps(self, client: SafeHttpClient, report: CrawlReport) -> None:
        origin = f"{self.scheme}://{urlparse(self.base_url).netloc}"
        robots = await client.get(f"{origin}/robots.txt", check_robots=False)
        if robots.ok:
            report.robots_txt = robots.text[:50_000]
            for line in robots.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    candidate = line.split(":", 1)[1].strip()
                    if candidate:
                        report.sitemaps_found.append(candidate)
        if not report.sitemaps_found:
            for guess in ("/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml"):
                probe = await client.get(f"{origin}{guess}", check_robots=False)
                if probe.ok and "<" in probe.text:
                    report.sitemaps_found.append(f"{origin}{guess}")
                    break

        for sitemap_url in list(report.sitemaps_found)[:10]:
            await self._read_sitemap(client, sitemap_url, report, depth=0)

    async def _read_sitemap(
        self, client: SafeHttpClient, url: str, report: CrawlReport, depth: int
    ) -> None:
        if depth > 3 or len(report.sitemap_urls) > self.max_pages * 3:
            return
        try:
            result = await client.get(url, check_robots=False)
        except Exception as exc:  # noqa: BLE001
            report.errors.append({"sitemap": url, "error": str(exc)})
            return
        if not result.ok or not result.text:
            return
        body = result.text
        children = re.findall(r"<sitemap>.*?<loc>\s*(.*?)\s*</loc>.*?</sitemap>", body, re.S | re.I)
        for child in children[:50]:
            if child not in report.sitemaps_found:
                report.sitemaps_found.append(child)
            await self._read_sitemap(client, child.strip(), report, depth + 1)
        if not children:
            for loc in re.findall(r"<url>.*?<loc>\s*(.*?)\s*</loc>", body, re.S | re.I):
                loc = loc.strip()
                if loc and self._in_scope(loc):
                    report.sitemap_urls.add(loc)

    def _in_scope(self, url: str) -> bool:
        try:
            parsed = urlparse(url)
        except ValueError:
            return False
        if parsed.scheme not in ("http", "https"):
            return False
        host = (parsed.hostname or "").lower()
        if self.include_subdomains:
            if not (host == self.host or host.endswith("." + self.host)):
                return False
        elif normalise_domain(host) != normalise_domain(self.host):
            return False
        path = parsed.path.lower()
        if "." in path.rsplit("/", 1)[-1]:
            ext = path.rsplit(".", 1)[-1]
            if ext in SKIP_EXTENSIONS:
                return False
        if SKIP_PATTERNS.search(url):
            return False
        if self.url_filter and not self.url_filter(url):
            return False
        return True


def _normalise(url: str) -> str:
    """Collapse trivial variants so the crawler does not fetch the same page
    three times over a trailing slash."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/") or "/"
    query = parsed.query
    if query:
        # Tracking parameters never change the page; dropping them avoids a
        # combinatorial explosion on sites that link with campaign tags.
        keep = [
            kv for kv in query.split("&")
            if not kv.split("=")[0].lower().startswith(("utm_", "fbclid", "gclid", "msclkid", "ref"))
        ]
        query = "&".join(sorted(keep))
    host = normalise_domain(parsed.hostname)
    return f"{host}{path}?{query}" if query else f"{host}{path}"
