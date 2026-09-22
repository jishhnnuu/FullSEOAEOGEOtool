"""Research: understand the business, read the field, measure the voice.

The content offering starts where the SEO one does not: before you can decide
what a company should publish, you have to know what it sells, who it sells
to, what it can honestly claim, and how the pages it competes with are
actually written.

Every tool here reads real pages. None of them asks a model what it thinks a
company is like. That distinction is the whole reason the tone advice is worth
reading: a recommendation to change how a company writes arrives with the two
numbers that justify it, or it does not arrive.
"""

from __future__ import annotations

import re

from seoos.analysis.http import SafeHttpClient
from seoos.analysis.parser import parse_html
from seoos.analysis.voice import compare as voice_compare
from seoos.analysis.voice import fingerprint as voice_fingerprint
from seoos.tools._helpers import array, integer, load_site, schema, string
from seoos.tools.registry import ToolContext, ToolOutcome, tool

# Pages that tell you what a company does, in the order they usually say it
# best. Marketing copy lives on the home page; the truth is on pricing.
_PROFILE_PATHS = (
    "", "/about", "/about-us", "/company", "/pricing", "/plans",
    "/products", "/services", "/solutions", "/how-it-works", "/customers",
    "/case-studies", "/who-we-serve",
)

_OFFER = re.compile(
    r"\b(we (?:help|build|make|offer|provide|give|run|design|sell)|"
    r"helps? (?:you|teams?|companies|businesses|brands?)|"
    r"is a (?:platform|tool|service|agency|studio|app|software)|"
    r"built for|designed for|made for)\b[^.]{0,160}\.", re.I,
)
_AUDIENCE = re.compile(
    r"\bfor ((?:small |mid-?market |enterprise |b2b |b2c |early-stage )?"
    r"(?:founders?|marketers?|teams?|agencies|startups?|businesses|brands?|"
    r"retailers?|clinics?|restaurants?|developers?|designers?|schools?|"
    r"hospitals?|manufacturers?|law firms?|accountants?|realtors?))\b", re.I,
)
_PROOF = re.compile(
    r"[^.]{0,120}\b(\d+(?:,\d{3})*(?:\.\d+)?%|\$[\d,]+|₹[\d,]+|"
    r"\d+(?:,\d{3})*\+? (?:customers?|clients?|users?|businesses|brands?|"
    r"companies|teams?|sites?|stores?)|\d+x|\d+ years?)\b[^.]{0,120}\.", re.I,
)
_PRICE = re.compile(r"(?:\$|₹|€|£)\s?\d[\d,]*(?:\.\d{2})?(?:\s?/\s?(?:mo|month|yr|year|user))?", re.I)


async def _read(url: str) -> tuple[str, object] | None:
    async with SafeHttpClient() as client:
        result = await client.get(url)
    if not result.ok or not result.text:
        return None
    return result.text, parse_html(result.text, result.final_url)


@tool(
    "research.company_profile",
    """Read a company's own pages and report what it actually sells, who to,
    and what it can prove. Use this before any content decision: a brief
    written without it is a guess about someone else's business.

    Reads the home page plus the about, pricing, product and customer pages
    where they exist. Reports what it found and what it could not find, so a
    thin result reads as thin rather than as a confident summary of nothing.""",
    schema(
        url_=string("Site to profile. Defaults to the site in context."),
        max_pages_=integer("How many pages to read", minimum=1, maximum=14),
    ),
    category="research",
)
async def research_company_profile(
    ctx: ToolContext, url: str | None = None, max_pages: int = 8
) -> ToolOutcome:
    if not url:
        site = await load_site(ctx)
        if site is None:
            return ToolOutcome(ok=False, error="No site in context and no url given")
        url = site.url
    base = url.rstrip("/")

    read_pages: list[dict] = []
    offers: list[str] = []
    audiences: list[str] = []
    proofs: list[str] = []
    prices: list[str] = []
    corpus: list[str] = []

    for path in _PROFILE_PATHS[:max_pages]:
        got = await _read(base + path)
        if not got:
            continue
        text, signals = got
        body = getattr(signals, "main_text", None) or getattr(signals, "text", "") or ""
        if not body:
            continue
        corpus.append(body)
        read_pages.append({
            "path": path or "/",
            "title": getattr(signals, "title", None),
            "h1": (getattr(signals, "h1", None) or [None])[0],
            "words": getattr(signals, "word_count", len(body.split())),
        })
        offers += [m.group(0).strip() for m in _OFFER.finditer(body)][:3]
        audiences += [m.group(1).strip().lower() for m in _AUDIENCE.finditer(body)][:5]
        proofs += [m.group(0).strip() for m in _PROOF.finditer(body)][:4]
        prices += _PRICE.findall(body)[:6]

    if not read_pages:
        return ToolOutcome(
            ok=False,
            error=f"Could not read any pages at {base}. Check the URL is reachable.",
        )

    missing = []
    found_paths = {p["path"] for p in read_pages}
    for label, candidates in (
        ("pricing", {"/pricing", "/plans"}),
        ("about", {"/about", "/about-us", "/company"}),
        ("proof", {"/customers", "/case-studies"}),
    ):
        if not (candidates & found_paths):
            missing.append(label)

    seen: set[str] = set()
    audience_list = [a for a in audiences if not (a in seen or seen.add(a))][:6]

    return ToolOutcome(
        ok=True,
        summary=(
            f"Read {len(read_pages)} pages. "
            f"{len(offers)} offer statements, {len(audience_list)} audience signals, "
            f"{len(proofs)} provable claims."
        ),
        data={
            "url": base,
            "pages_read": read_pages,
            "offer_statements": offers[:8],
            "audience_signals": audience_list,
            "provable_claims": proofs[:10],
            "prices_seen": list(dict.fromkeys(prices))[:8],
            "pages_not_found": missing,
            "total_words_read": sum(p["words"] for p in read_pages),
            "confidence": (
                "thin" if sum(p["words"] for p in read_pages) < 600
                else "usable" if not missing else "partial"
            ),
        },
        degraded=bool(missing),
    )


@tool(
    "research.voice_fingerprint",
    """Measure how a page or a site actually writes: sentence length and its
    variance, reading grade, how often it says "we" against "you", hedging,
    marketing filler, how many specifics it carries, passive voice.

    These are counts, not impressions. Below about 120 words the ratios are
    noise and the result says so instead of reporting a number.""",
    schema(
        url_=string("Page to measure. Defaults to the site's home page."),
        text_=string("Measure this text directly instead of fetching a URL."),
    ),
    category="research",
)
async def research_voice_fingerprint(
    ctx: ToolContext, url: str | None = None, text: str | None = None
) -> ToolOutcome:
    if not text:
        if not url:
            site = await load_site(ctx)
            if site is None:
                return ToolOutcome(ok=False, error="Give a url or text, or set a site in context")
            url = site.url
        got = await _read(url)
        if not got:
            return ToolOutcome(ok=False, error=f"Could not read {url}")
        _, signals = got
        text = getattr(signals, "main_text", None) or getattr(signals, "text", "") or ""

    fp = voice_fingerprint(text)
    return ToolOutcome(
        ok=True,
        summary=(
            f"{fp.words} words, grade {fp.reading_grade:.1f}, "
            f"rhythm {fp.rhythm:.2f}, {fp.address}"
            + ("" if fp.measured else " (too little text to be reliable)")
        ),
        data=fp.as_dict(),
        degraded=not fp.measured,
    )


@tool(
    "research.rival_content",
    """Read the pages you are competing with and measure how they are built:
    length, heading depth, format, schema, author attribution, freshness, and
    the same voice fingerprint used on the client.

    This is what a content brief should be built on. "Write something better"
    is not a brief; "they average 1,400 words across nine H2s, all three cite
    original data, none of them answer the question in the first screen" is.""",
    schema(
        urls=array("Competitor page URLs to read", {"type": "string"}, max_items=10),
    ),
    category="research",
)
async def research_rival_content(ctx: ToolContext, urls: list[str]) -> ToolOutcome:
    pages: list[dict] = []
    unreadable: list[str] = []

    for url in urls[:10]:
        got = await _read(url)
        if not got:
            unreadable.append(url)
            continue
        _, signals = got
        body = getattr(signals, "main_text", None) or getattr(signals, "text", "") or ""
        fp = voice_fingerprint(body)
        # headings are (level, text) pairs, so the depth of a page is the
        # shape of its H2s rather than the raw count of every heading.
        headings = getattr(signals, "headings", []) or []
        pages.append({
            "url": url,
            "title": getattr(signals, "title", None),
            "words": getattr(signals, "word_count", len(body.split())),
            "h2_count": sum(1 for level, _ in headings if level == 2),
            "heading_count": len(headings),
            "schema_types": getattr(signals, "schema_types", []) or [],
            "author": getattr(signals, "author", None),
            "published": getattr(signals, "published_date", None),
            "external_links": len(getattr(signals, "external_links", []) or []),
            "voice": fp.as_dict(),
        })

    if not pages:
        return ToolOutcome(ok=False, error="None of those URLs could be read")

    lengths = sorted(p["words"] for p in pages)
    mid = lengths[len(lengths) // 2]
    with_author = sum(1 for p in pages if p["author"])
    with_schema = sum(1 for p in pages if p["schema_types"])

    return ToolOutcome(
        ok=True,
        summary=(
            f"Read {len(pages)} of {len(urls)} pages. Median {mid} words, "
            f"{with_author} name an author, {with_schema} carry schema."
        ),
        data={
            "pages": pages,
            "median_words": mid,
            "word_range": [lengths[0], lengths[-1]],
            "authored": with_author,
            "with_schema": with_schema,
            "unreadable": unreadable,
            "sample_size": len(pages),
        },
        degraded=bool(unreadable),
    )


@tool(
    "research.voice_gap",
    """Compare how the client writes against how the pages they compete with
    write, and say whether the tone should change.

    Only differences large enough to matter are reported, and each one carries
    the client's number and the rivals' median. Fewer than three measurable
    rival pages and this refuses to reach a verdict rather than inventing one:
    two pages is one writer's habit, not a norm.""",
    schema(
        site_url_=string("Client page to measure. Defaults to the site in context."),
        rival_urls=array("Competitor pages to compare against", {"type": "string"}, max_items=10),
    ),
    category="research",
)
async def research_voice_gap(
    ctx: ToolContext, rival_urls: list[str], site_url: str | None = None
) -> ToolOutcome:
    if not site_url:
        site = await load_site(ctx)
        if site is None:
            return ToolOutcome(ok=False, error="No site in context and no site_url given")
        site_url = site.url

    got = await _read(site_url)
    if not got:
        return ToolOutcome(ok=False, error=f"Could not read {site_url}")
    _, signals = got
    mine = voice_fingerprint(
        getattr(signals, "main_text", None) or getattr(signals, "text", "") or ""
    )

    rivals = []
    for url in rival_urls[:10]:
        rgot = await _read(url)
        if not rgot:
            continue
        _, rsig = rgot
        rivals.append(voice_fingerprint(
            getattr(rsig, "main_text", None) or getattr(rsig, "text", "") or ""
        ))

    verdict = voice_compare(mine, rivals)
    return ToolOutcome(
        ok=True,
        summary=verdict.get("verdict") or verdict.get("reason", "No verdict"),
        data={"site": mine.as_dict(), "comparison": verdict},
        degraded=not verdict.get("measured", False),
    )


@tool(
    "research.story_seeds",
    """Find the things this business can write about that nobody else can:
    its own numbers, its own customers, its own process, its own refusals.

    Pulls from the fact ledger and the pages already read. Everything returned
    is something the company has already published or recorded, so a writer
    can use it without inventing a claim that then has to be defended.""",
    schema(
        url_=string("Site to mine. Defaults to the site in context."),
    ),
    category="research",
)
async def research_story_seeds(ctx: ToolContext, url: str | None = None) -> ToolOutcome:
    profile = await research_company_profile(ctx, url=url)
    if not profile.ok:
        return profile

    data = profile.data or {}
    claims = data.get("provable_claims", [])
    prices = data.get("prices_seen", [])
    audiences = data.get("audience_signals", [])

    seeds = []
    for claim in claims[:8]:
        seeds.append({
            "kind": "proprietary_number",
            "seed": claim,
            "angle": "The number is already public. The story is how it was reached.",
            "sourced": True,
        })
    for audience in audiences[:4]:
        seeds.append({
            "kind": "audience_specific",
            "seed": f"What {audience} get wrong about this, and what it costs them",
            "angle": "Named audience, specific failure, measurable cost.",
            "sourced": True,
        })
    if prices:
        seeds.append({
            "kind": "pricing_transparency",
            "seed": f"What the price actually buys, at {prices[0]}",
            "angle": "Published pricing is rare enough that explaining it is content.",
            "sourced": True,
        })

    return ToolOutcome(
        ok=True,
        summary=f"{len(seeds)} story seeds, all traceable to something already published.",
        data={
            "seeds": seeds,
            "source_pages": data.get("pages_read", []),
            "note": (
                "These are starting points grounded in the client's own published "
                "material. Anything not on this list needs a source before it is written."
            ),
        },
        degraded=len(seeds) < 3,
    )
