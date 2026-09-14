"""HTML to structured SEO signals.

One pass over the DOM produces everything the technical, content, schema,
image, link and AEO analysers need, because parsing a page six times is the
easiest way to make a 5000-page crawl take all night.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urldefrag, urljoin, urlparse

from bs4 import BeautifulSoup

BOILERPLATE_TAGS = {"script", "style", "noscript", "template", "svg", "iframe"}
NAV_TAGS = {"nav", "header", "footer", "aside"}


@dataclass
class LinkRef:
    url: str
    anchor: str
    rel: str = ""
    is_internal: bool = True
    in_nav: bool = False
    nofollow: bool = False


@dataclass
class ImageRef:
    src: str
    alt: str | None
    width: str | None = None
    height: str | None = None
    loading: str | None = None
    has_srcset: bool = False
    is_decorative: bool = False
    extension: str = ""


@dataclass
class PageSignals:
    url: str
    title: str | None = None
    meta_description: str | None = None
    h1: list[str] = field(default_factory=list)
    headings: list[tuple[int, str]] = field(default_factory=list)
    canonical: str | None = None
    robots_meta: str | None = None
    lang: str | None = None
    charset: str | None = None
    viewport: str | None = None

    text: str = ""
    main_text: str = ""
    word_count: int = 0
    content_hash: str = ""

    links: list[LinkRef] = field(default_factory=list)
    images: list[ImageRef] = field(default_factory=list)
    jsonld: list[dict[str, Any]] = field(default_factory=list)
    microdata_types: list[str] = field(default_factory=list)
    hreflang: list[dict[str, str]] = field(default_factory=list)
    open_graph: dict[str, str] = field(default_factory=dict)
    twitter_card: dict[str, str] = field(default_factory=dict)

    scripts: int = 0
    inline_script_bytes: int = 0
    stylesheets: int = 0
    html_bytes: int = 0
    has_amp: bool = False
    forms: int = 0
    tables: int = 0
    lists: int = 0
    iframes: int = 0
    video_embeds: int = 0

    author: str | None = None
    published_date: str | None = None
    modified_date: str | None = None

    # AEO signals: what makes a page quotable by an answer engine.
    question_headings: list[str] = field(default_factory=list)
    definition_sentences: list[str] = field(default_factory=list)
    stat_sentences: list[str] = field(default_factory=list)
    has_faq_schema: bool = False
    has_toc: bool = False
    first_paragraph: str = ""

    @property
    def internal_links(self) -> list[LinkRef]:
        return [link for link in self.links if link.is_internal]

    @property
    def external_links(self) -> list[LinkRef]:
        return [link for link in self.links if not link.is_internal]

    @property
    def schema_types(self) -> list[str]:
        found: list[str] = []
        for block in self.jsonld:
            found.extend(_extract_types(block))
        return sorted(set(found + self.microdata_types))

    @property
    def is_indexable(self) -> bool:
        return "noindex" not in (self.robots_meta or "").lower()


_QUESTION_RE = re.compile(
    r"^\s*(what|how|why|when|where|who|which|can|do|does|is|are|should|will)\b.*\?*\s*$",
    re.IGNORECASE,
)
_DEFINITION_RE = re.compile(
    r"\b([A-Z][\w\s\-]{2,60})\s+(?:is|are|refers to|means)\s+(?:a|an|the)\s+[^.]{10,220}\.",
)
# A percent sign is not a word character, so a trailing \b would never match
# after it. Boundaries are applied only to the alphabetic units.
_STAT_RE = re.compile(
    r"[^.]*\b\d+(?:[.,]\d+)?\s?(?:%|(?:percent|million|billion|bn|x|k)\b)[^.]*\."
)
_DATE_META = (
    ("meta", {"property": "article:published_time"}, "content"),
    ("meta", {"itemprop": "datePublished"}, "content"),
    ("meta", {"name": "date"}, "content"),
    ("time", {"datetime": True}, "datetime"),
)


def parse_html(html: str, url: str, *, base_domain: str | None = None) -> PageSignals:
    soup = BeautifulSoup(html or "", "html.parser")
    signals = PageSignals(url=url, html_bytes=len(html or ""))
    host = base_domain or (urlparse(url).hostname or "")

    if soup.title and soup.title.string:
        signals.title = soup.title.string.strip()

    html_tag = soup.find("html")
    if html_tag:
        signals.lang = html_tag.get("lang")

    for meta in soup.find_all("meta"):
        name = (meta.get("name") or "").lower()
        prop = (meta.get("property") or "").lower()
        content = meta.get("content")
        if not content:
            if meta.get("charset"):
                signals.charset = meta.get("charset")
            continue
        if name == "description":
            signals.meta_description = content.strip()
        elif name == "robots":
            signals.robots_meta = content.strip()
        elif name == "viewport":
            signals.viewport = content.strip()
        elif name == "author":
            signals.author = content.strip()
        elif prop.startswith("og:"):
            signals.open_graph[prop[3:]] = content.strip()
        elif name.startswith("twitter:"):
            signals.twitter_card[name[8:]] = content.strip()
        elif prop == "article:modified_time":
            signals.modified_date = content.strip()

    for source, attrs, attr in _DATE_META:
        if signals.published_date:
            break
        tag = soup.find(source, attrs=attrs)
        if tag and tag.get(attr):
            signals.published_date = tag.get(attr)

    for link in soup.find_all("link"):
        rel = " ".join(link.get("rel") or []).lower()
        href = link.get("href")
        if not href:
            continue
        if "canonical" in rel:
            signals.canonical = urljoin(url, href)
        elif "alternate" in rel and link.get("hreflang"):
            signals.hreflang.append({"hreflang": link["hreflang"], "href": urljoin(url, href)})
        elif "amphtml" in rel:
            signals.has_amp = True
        elif "stylesheet" in rel:
            signals.stylesheets += 1

    for level in range(1, 7):
        for tag in soup.find_all(f"h{level}"):
            text = tag.get_text(" ", strip=True)
            if not text:
                continue
            signals.headings.append((level, text))
            if level == 1:
                signals.h1.append(text)
            if _QUESTION_RE.match(text) or text.rstrip().endswith("?"):
                signals.question_headings.append(text)

    for script in soup.find_all("script"):
        stype = (script.get("type") or "").lower()
        if stype == "application/ld+json":
            payload = _parse_jsonld(script.string or script.get_text() or "")
            signals.jsonld.extend(payload)
        else:
            signals.scripts += 1
            if not script.get("src"):
                signals.inline_script_bytes += len(script.get_text() or "")

    signals.microdata_types = sorted(
        {
            (tag.get("itemtype") or "").rsplit("/", 1)[-1]
            for tag in soup.find_all(attrs={"itemtype": True})
            if tag.get("itemtype")
        }
    )
    signals.has_faq_schema = any(
        t in ("FAQPage", "QAPage") for t in signals.schema_types
    )

    nav_hosts = {id(t) for tag in soup.find_all(list(NAV_TAGS)) for t in tag.find_all("a")}
    for anchor in soup.find_all("a"):
        href = anchor.get("href")
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        try:
            absolute = urldefrag(urljoin(url, href))[0]
        except ValueError:
            continue
        rel = " ".join(anchor.get("rel") or []).lower()
        link_host = urlparse(absolute).hostname or ""
        signals.links.append(
            LinkRef(
                url=absolute,
                anchor=anchor.get_text(" ", strip=True)[:300],
                rel=rel,
                is_internal=_same_site(link_host, host),
                in_nav=id(anchor) in nav_hosts,
                nofollow="nofollow" in rel or "sponsored" in rel or "ugc" in rel,
            )
        )

    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        alt = img.get("alt")
        signals.images.append(
            ImageRef(
                src=urljoin(url, src) if src else "",
                alt=alt,
                width=img.get("width"),
                height=img.get("height"),
                loading=img.get("loading"),
                has_srcset=bool(img.get("srcset")),
                is_decorative=alt is not None and alt.strip() == "",
                extension=_extension(src),
            )
        )

    signals.forms = len(soup.find_all("form"))
    signals.tables = len(soup.find_all("table"))
    signals.lists = len(soup.find_all(["ul", "ol"]))
    signals.iframes = len(soup.find_all("iframe"))
    signals.video_embeds = len(soup.find_all(["video", "source"])) + len(
        [f for f in soup.find_all("iframe") if "youtube" in (f.get("src") or "") or "vimeo" in (f.get("src") or "")]
    )
    signals.has_toc = bool(
        soup.find(attrs={"class": re.compile(r"(table-of-contents|toc)", re.I)})
        or soup.find(id=re.compile(r"(table-of-contents|toc)", re.I))
    )

    # Text extraction: strip chrome so word count reflects actual content.
    body = soup.find("main") or soup.find("article") or soup.body or soup
    working = BeautifulSoup(str(body), "html.parser")
    for tag in working.find_all(list(BOILERPLATE_TAGS | NAV_TAGS)):
        tag.decompose()
    signals.main_text = re.sub(r"\s+", " ", working.get_text(" ", strip=True)).strip()

    full = BeautifulSoup(html or "", "html.parser")
    for tag in full.find_all(list(BOILERPLATE_TAGS)):
        tag.decompose()
    signals.text = re.sub(r"\s+", " ", full.get_text(" ", strip=True)).strip()

    source_text = signals.main_text or signals.text
    signals.word_count = len(source_text.split())
    signals.content_hash = hashlib.blake2b(source_text.encode(), digest_size=16).hexdigest()

    paragraphs = [p.get_text(" ", strip=True) for p in working.find_all("p")]
    signals.first_paragraph = next((p for p in paragraphs if len(p) > 60), "")[:600]
    signals.definition_sentences = [m.group(0).strip() for m in _DEFINITION_RE.finditer(source_text)][:10]
    signals.stat_sentences = [m.group(0).strip() for m in _STAT_RE.finditer(source_text)][:10]

    if not signals.author:
        signals.author = _find_author(soup)
    return signals


def _parse_jsonld(raw: str) -> list[dict]:
    raw = (raw or "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Some CMSs emit trailing commas or concatenated blocks. One repair
        # attempt is worth it; beyond that the page has a real schema bug and
        # the schema analyser should report it.
        try:
            data = json.loads(re.sub(r",\s*([}\]])", r"\1", raw))
        except json.JSONDecodeError:
            return [{"@error": "unparseable JSON-LD", "raw_preview": raw[:200]}]
    if isinstance(data, list):
        return [d for d in data if isinstance(d, dict)]
    if isinstance(data, dict):
        if "@graph" in data and isinstance(data["@graph"], list):
            return [d for d in data["@graph"] if isinstance(d, dict)] + [
                {k: v for k, v in data.items() if k != "@graph"}
            ]
        return [data]
    return []


def _extract_types(block: dict) -> list[str]:
    value = block.get("@type")
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [v for v in value if isinstance(v, str)]
    return []


def _same_site(host: str, base: str) -> bool:
    if not host or not base:
        return bool(host) == bool(base)
    from seoos.analysis.http import normalise_domain

    host, base = normalise_domain(host), normalise_domain(base)
    return host == base or host.endswith("." + base)


def _extension(src: str) -> str:
    path = urlparse(src or "").path
    return path.rsplit(".", 1)[-1].lower() if "." in path else ""


def _find_author(soup: BeautifulSoup) -> str | None:
    for selector in (
        {"rel": "author"},
        {"class": re.compile(r"author", re.I)},
        {"itemprop": "author"},
    ):
        tag = soup.find(attrs=selector)
        if tag:
            text = tag.get_text(" ", strip=True)
            if 2 < len(text) < 120:
                return text
    return None
