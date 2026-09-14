"""Keyword research, SERP analysis and topic clustering."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date

from sqlalchemy import select

from seoos.analysis.http import normalise_domain, same_domain
from seoos.core.models import Cluster, Competitor, Keyword
from seoos.tools._helpers import (
    array,
    boolean,
    connector_for,
    has_connector,
    integer,
    load_site,
    schema,
    string,
)
from seoos.tools.registry import ToolContext, ToolOutcome, tool

INTENT_PATTERNS = {
    "transactional": r"\b(buy|order|price|pricing|cost|cheap|discount|deal|coupon|for sale|hire|book)\b",
    "commercial": r"\b(best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives)\b",
    "local": r"\b(near me|nearby|in [a-z]+|local|open now|directions)\b",
    "navigational": r"\b(login|sign in|download|app|contact|careers)\b",
    "informational": r"\b(what|how|why|when|guide|tutorial|meaning|definition|examples?|tips)\b",
}


@tool(
    "keywords.research",
    """Find keyword ideas around a seed term, with volume, difficulty and
    intent. Falls back to Search Console queries when no paid data provider
    is connected, which is often better anyway because those are terms the
    site already appears for.""",
    schema(
        seed=string("The seed keyword or topic"),
        limit_=integer("How many ideas", minimum=10, maximum=1000, default=100),
        country_=string("Two-letter country code", default="us"),
    ),
    category="keywords",
    cost_hint_usd=0.05,
)
async def keyword_research(
    ctx: ToolContext, seed: str, limit: int = 100, country: str = "us"
) -> ToolOutcome:
    if await has_connector(ctx, "dataforseo"):
        connector = await connector_for(ctx, "dataforseo")
        async with connector:
            result = await connector.keyword_ideas(
                seed, location_code=_location_code(country), limit=limit
            )
        if result.ok:
            rows = [r for r in result.data if r.get("keyword")]
            for row in rows:
                row.setdefault("intent", classify_intent(row["keyword"]))
            return ToolOutcome(
                ok=True,
                summary=f"{len(rows)} keyword ideas for {seed!r}",
                data={"keywords": rows[:limit], "source": "dataforseo"},
                cost_usd=result.cost_usd,
            )

    # No paid provider. Search Console is a genuinely good substitute: it is
    # real demand this specific site already touches.
    if await has_connector(ctx, "google_search_console"):
        connector = await connector_for(ctx, "google_search_console")
        async with connector:
            result = await connector.query(
                start_date=date.today().replace(day=1),
                end_date=date.today(),
                dimensions=["query"],
                filters=[{"dimension": "query", "operator": "contains", "expression": seed}],
                row_limit=limit,
            )
        if result.ok:
            rows = [
                {
                    "keyword": r["query"],
                    "volume": None,
                    "impressions": r["impressions"],
                    "position": round(r["position"], 1),
                    "clicks": r["clicks"],
                    "intent": classify_intent(r["query"]),
                }
                for r in result.data
            ]
            return ToolOutcome(
                ok=True,
                degraded=True,
                summary=(
                    f"{len(rows)} queries this site already appears for, containing {seed!r}. "
                    "No keyword volume provider is connected, so impressions stand in for volume."
                ),
                data={"keywords": rows, "source": "search_console"},
            )

    return ToolOutcome(
        ok=False,
        error=(
            "No keyword data source is available. Connect DataForSEO for volumes, "
            "or Search Console to work from queries the site already ranks for."
        ),
    )


@tool(
    "keywords.serp",
    """Fetch the live search results for a keyword: who ranks, what format
    they use, which SERP features appear, and the People Also Ask questions.

    Read the SERP before writing anything. The format that ranks tells you
    what the query actually wants far more reliably than the wording does.""",
    schema(
        keyword=string("The search query"),
        country_=string("Two-letter country code", default="us"),
        depth_=integer("How many results", minimum=10, maximum=100, default=20),
    ),
    category="keywords",
    cost_hint_usd=0.002,
)
async def keyword_serp(
    ctx: ToolContext, keyword: str, country: str = "us", depth: int = 20
) -> ToolOutcome:
    for provider in ("dataforseo", "serper"):
        if not await has_connector(ctx, provider):
            continue
        connector = await connector_for(ctx, provider)
        async with connector:
            result = (
                await connector.serp(keyword, location_code=_location_code(country), depth=depth)
                if provider == "dataforseo"
                else await connector.search(keyword, country=country, num=depth)
            )
        if result.ok:
            data = result.data
            site = await load_site(ctx)
            our_position = None
            if site:
                for row in data.get("organic", []):
                    if same_domain(site.domain, row.get("domain")):
                        our_position = row.get("position")
                        break
            data["our_position"] = our_position
            data["dominant_format"] = _dominant_format(data.get("organic", []))
            return ToolOutcome(
                ok=True,
                summary=(
                    f"{keyword!r}: {len(data.get('organic', []))} results"
                    + (f", we rank #{our_position}" if our_position else ", we do not rank")
                ),
                data=data,
                cost_usd=result.cost_usd,
            )
    return ToolOutcome(
        ok=False,
        error="No SERP provider is connected. Connect DataForSEO or Serper.",
    )


@tool(
    "keywords.save",
    """Store keywords against the site so they can be tracked and assigned to
    clusters and pages. Only save keywords you intend to act on; a list of
    ten thousand terms nobody targets is noise.""",
    schema(
        keywords=array(
            "Keywords to store",
            {
                "type": "object",
                "properties": {
                    "phrase": {"type": "string"},
                    "volume": {"type": "integer"},
                    "difficulty": {"type": "number"},
                    "intent": {"type": "string"},
                    "target_url": {"type": "string"},
                    "cluster_name": {"type": "string"},
                    "business_value": {"type": "number",
                                       "description": "0 to 1: how much revenue this term could drive"},
                },
                "required": ["phrase"],
            },
            max_items=500,
        ),
        track_=boolean("Mark these for ongoing rank tracking", default=False),
        country_=string("Country code", default="us"),
    ),
    category="keywords",
)
async def keywords_save(
    ctx: ToolContext, keywords: list[dict], track: bool = False, country: str = "us"
) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    existing = {
        (row.phrase.lower(), row.country): row
        for row in (
            await ctx.session.execute(select(Keyword).where(Keyword.site_id == site.id))
        ).scalars().all()
    }
    clusters = {
        row.name.lower(): row
        for row in (
            await ctx.session.execute(select(Cluster).where(Cluster.site_id == site.id))
        ).scalars().all()
    }

    created = updated = 0
    for entry in keywords[:500]:
        phrase = (entry.get("phrase") or "").strip()
        if not phrase:
            continue
        cluster_id = None
        cluster_name = (entry.get("cluster_name") or "").strip()
        if cluster_name:
            cluster = clusters.get(cluster_name.lower())
            if cluster is None:
                cluster = Cluster(
                    org_id=ctx.org_id, site_id=site.id, name=cluster_name,
                    slug=re.sub(r"[^a-z0-9]+", "-", cluster_name.lower()).strip("-"),
                    status="proposed",
                )
                ctx.session.add(cluster)
                await ctx.session.flush()
                clusters[cluster_name.lower()] = cluster
            cluster_id = cluster.id

        row = existing.get((phrase.lower(), country))
        if row is None:
            row = Keyword(
                org_id=ctx.org_id, site_id=site.id, phrase=phrase,
                country=country, language=site.primary_language,
            )
            ctx.session.add(row)
            created += 1
        else:
            updated += 1

        row.volume = entry.get("volume", row.volume)
        row.difficulty = entry.get("difficulty", row.difficulty)
        row.intent = entry.get("intent") or row.intent or classify_intent(phrase)
        row.target_url = entry.get("target_url") or row.target_url
        row.business_value = entry.get("business_value", row.business_value)
        row.cluster_id = cluster_id or row.cluster_id
        row.is_tracked = track or row.is_tracked
        row.priority_score = _keyword_priority(row)

    await ctx.session.flush()
    return ToolOutcome(
        ok=True,
        summary=f"{created} keywords added, {updated} updated",
        data={"created": created, "updated": updated, "clusters": len(clusters)},
    )


@tool(
    "keywords.cluster",
    """Group keywords into topic clusters by shared terms and intent.

    Clustering decides page architecture: one page per cluster, not one page
    per keyword. Getting this wrong produces thin pages that cannibalise each
    other, which is the most common structural mistake in content SEO.""",
    schema(
        keywords=array("Keywords to cluster", {"type": "string"}, max_items=1000),
        min_cluster_size_=integer("Smallest group to keep", minimum=2, maximum=20, default=3),
    ),
    category="keywords",
)
async def keywords_cluster(
    ctx: ToolContext, keywords: list[str], min_cluster_size: int = 3
) -> ToolOutcome:
    clusters = cluster_keywords(keywords, min_size=min_cluster_size)
    return ToolOutcome(
        ok=True,
        summary=f"{len(clusters)} clusters from {len(keywords)} keywords",
        data={
            "clusters": [
                {
                    "name": c["name"],
                    "intent": c["intent"],
                    "keywords": c["keywords"][:40],
                    "size": len(c["keywords"]),
                    "suggested_page_type": _page_type_for(c["intent"]),
                }
                for c in clusters
            ],
            "unclustered": [
                k for k in keywords
                if not any(k in c["keywords"] for c in clusters)
            ][:50],
        },
    )


@tool(
    "keywords.competitors",
    """Identify and store the domains that actually compete for this site's
    queries, based on who ranks alongside it. This is more useful than the
    client's own list of competitors, which is usually about who they meet in
    sales meetings rather than who outranks them.""",
    schema(
        seed_keywords=array("Keywords to sample", {"type": "string"}, max_items=20),
        country_=string("Country code", default="us"),
    ),
    category="keywords",
    cost_hint_usd=0.04,
)
async def keywords_competitors(
    ctx: ToolContext, seed_keywords: list[str], country: str = "us"
) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")

    appearances: dict[str, list[int]] = defaultdict(list)
    checked = 0
    cost = 0.0
    for keyword in seed_keywords[:20]:
        result = await keyword_serp(ctx, keyword, country=country, depth=20)
        if not result.ok:
            continue
        checked += 1
        cost += result.cost_usd
        for row in result.data.get("organic", []):
            domain = normalise_domain(row.get("domain"))
            if domain and not same_domain(domain, site.domain):
                appearances[domain].append(row.get("position") or 100)

    if not checked:
        return ToolOutcome(ok=False, error="Could not fetch any SERPs")

    ranked = sorted(
        (
            {
                "domain": domain,
                "appearances": len(positions),
                "overlap_pct": round(len(positions) / checked * 100, 1),
                "avg_position": round(sum(positions) / len(positions), 1),
            }
            for domain, positions in appearances.items()
        ),
        key=lambda r: (-r["appearances"], r["avg_position"]),
    )

    existing = {
        row.domain: row
        for row in (
            await ctx.session.execute(select(Competitor).where(Competitor.site_id == site.id))
        ).scalars().all()
    }
    for entry in ranked[:15]:
        row = existing.get(entry["domain"])
        if row is None:
            row = Competitor(
                org_id=ctx.org_id, site_id=site.id, domain=entry["domain"], kind="organic"
            )
            ctx.session.add(row)
        row.overlap_keywords = entry["appearances"]
        row.is_primary = entry["overlap_pct"] >= 40
        row.intel = {**(row.intel or {}), "avg_position": entry["avg_position"]}
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=f"{len(ranked)} competing domains across {checked} SERPs",
        data={"competitors": ranked[:20], "serps_sampled": checked},
        cost_usd=cost,
    )


# ---------------------------------------------------------------------------
# Pure functions, kept importable so they can be unit tested without a session.
# ---------------------------------------------------------------------------

def classify_intent(keyword: str) -> str:
    """Classify search intent from the wording.

    Checked most-specific first: "best crm pricing" is transactional, not
    commercial, because the buying signal outranks the research signal.
    """
    lowered = (keyword or "").lower()
    for intent in ("transactional", "local", "commercial", "navigational", "informational"):
        if re.search(INTENT_PATTERNS[intent], lowered):
            return intent
    return "informational"


STOPWORDS = {
    "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "my",
    "your", "is", "are", "how", "what", "why", "best", "top", "near", "me",
}


def cluster_keywords(keywords: list[str], *, min_size: int = 3) -> list[dict]:
    """Group by shared content terms and matching intent.

    A lexical clustering rather than a SERP-overlap one, because SERP overlap
    costs a request per keyword and this is close enough to decide page
    architecture. The cluster agent upgrades to SERP overlap for the terms
    that actually matter.
    """
    def terms(phrase: str) -> set[str]:
        return {
            w for w in re.findall(r"[a-z0-9]+", phrase.lower())
            if w not in STOPWORDS and len(w) > 2
        }

    remaining = [k for k in dict.fromkeys(keywords) if k and terms(k)]
    clusters: list[dict] = []

    while remaining:
        seed = max(remaining, key=lambda k: len(terms(k)))
        seed_terms = terms(seed)
        seed_intent = classify_intent(seed)

        members, leftover = [], []
        for keyword in remaining:
            shared = seed_terms & terms(keyword)
            overlap = len(shared) / max(min(len(seed_terms), len(terms(keyword))), 1)
            if overlap >= 0.5 and classify_intent(keyword) == seed_intent:
                members.append(keyword)
            else:
                leftover.append(keyword)

        if len(members) >= min_size:
            # Name the cluster after the terms every member shares, which reads
            # like a topic rather than like the longest keyword in the group.
            common = set.intersection(*(terms(m) for m in members)) or seed_terms
            clusters.append(
                {
                    "name": " ".join(sorted(common)[:4]) or seed,
                    "intent": seed_intent,
                    "keywords": members,
                }
            )
            remaining = leftover
        else:
            remaining = [k for k in leftover] + [m for m in members if m != seed]
            if seed in remaining:
                remaining.remove(seed)
        if not members:
            break
    return clusters


def _page_type_for(intent: str) -> str:
    return {
        "transactional": "product or service page with pricing",
        "commercial": "comparison or best-of page",
        "local": "location page",
        "navigational": "existing brand page",
        "informational": "guide or article",
    }.get(intent, "article")


def _dominant_format(organic: list[dict]) -> str:
    """What format is winning this query, judged from the titles that rank."""
    if not organic:
        return "unknown"
    titles = " ".join((r.get("title") or "").lower() for r in organic[:10])
    signals = {
        "listicle": len(re.findall(r"\b\d+\s+(best|top|ways|tips|tools|examples)", titles)),
        "comparison": titles.count(" vs ") + titles.count("compare") + titles.count("alternative"),
        "guide": titles.count("guide") + titles.count("how to") + titles.count("tutorial"),
        "product": titles.count("buy") + titles.count("price") + titles.count("shop"),
        "definition": titles.count("what is") + titles.count("meaning"),
    }
    best = max(signals.items(), key=lambda kv: kv[1])
    return best[0] if best[1] >= 2 else "mixed"


def _keyword_priority(row) -> float:
    """Volume, closeness to ranking, and business value, in one number."""
    volume = (row.volume or 0) ** 0.5
    difficulty_factor = 1.0 - min((row.difficulty or 50) / 100, 0.95)
    value = row.business_value if row.business_value is not None else 0.5
    proximity = 1.0
    if row.current_position:
        proximity = 1.6 if 4 <= row.current_position <= 20 else 0.6
    return round(min(volume * difficulty_factor * value * proximity * 3, 100), 1)


# DataForSEO location codes for the markets most clients start in.
_LOCATION_CODES = {
    "us": 2840, "gb": 2826, "uk": 2826, "ca": 2124, "au": 2036, "in": 2356,
    "de": 2276, "fr": 2250, "es": 2724, "it": 2380, "nl": 2528, "ie": 2372,
    "nz": 2554, "sg": 2702, "ae": 2784, "za": 2710, "br": 2076, "mx": 2484,
    "jp": 2392, "se": 2752, "pl": 2616, "ch": 2756, "at": 2040, "be": 2056,
}


def _location_code(country: str) -> int:
    return _LOCATION_CODES.get((country or "us").lower(), 2840)
