"""Local SEO: Business Profile, reviews, citations and map pack ranking."""

from __future__ import annotations

import math
import re
from datetime import UTC, datetime

from sqlalchemy import select

from seoos.core.models import Citation, GbpPost, Location, Review
from seoos.tools._helpers import (
    connector_for,
    has_connector,
    integer,
    load_site,
    number,
    schema,
    string,
)
from seoos.tools.registry import ToolContext, ToolOutcome, tool

# The directories that actually carry weight, in rough order of value. A
# thousand-directory blast is worthless and looks manipulative; these are the
# ones a real local business would be listed on anyway.
CORE_DIRECTORIES = [
    ("Google Business Profile", 10), ("Apple Business Connect", 9),
    ("Bing Places", 8), ("Facebook", 7), ("Yelp", 7), ("Apple Maps", 8),
    ("Yellow Pages", 5), ("Foursquare", 5), ("TripAdvisor", 6),
    ("Better Business Bureau", 6), ("Trustpilot", 6), ("Chamber of Commerce", 5),
]


@tool(
    "local.sync_locations",
    """Pull the client's Business Profile locations and store their current
    state: categories, hours, services, attributes, photos and ratings.""",
    schema(),
    category="local",
)
async def sync_locations(ctx: ToolContext) -> ToolOutcome:
    site = await load_site(ctx)
    if site is None:
        return ToolOutcome(ok=False, error="No site in context")
    if not await has_connector(ctx, "google_business_profile"):
        return ToolOutcome(
            ok=False,
            error=(
                "Google Business Profile is not connected. Note that Google "
                "requires a separate manual approval before any project gets API "
                "quota; until that lands, local work runs on public data and "
                "posts and replies are prepared for manual publishing."
            ),
        )

    connector = await connector_for(ctx, "google_business_profile")
    async with connector:
        accounts = await connector.verify()
        if not accounts.ok:
            return ToolOutcome(ok=False, error=accounts.error)
        stored = 0
        for account in accounts.data.get("accounts", []):
            listing = await connector.list_locations(account["name"])
            if not listing.ok:
                continue
            for location in listing.data:
                await _upsert_location(ctx, site.id, location)
                stored += 1
    await ctx.session.flush()
    return ToolOutcome(ok=True, summary=f"{stored} locations synced", data={"count": stored})


async def _upsert_location(ctx: ToolContext, site_id: str, payload: dict) -> Location:
    gbp_id = payload.get("name")
    row = (
        await ctx.session.execute(
            select(Location).where(
                Location.site_id == site_id, Location.gbp_location_id == gbp_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = Location(org_id=ctx.org_id, site_id=site_id, gbp_location_id=gbp_id, name="")
        ctx.session.add(row)

    address = payload.get("storefrontAddress") or {}
    categories = payload.get("categories") or {}
    row.name = payload.get("title", row.name)
    row.address_line1 = (address.get("addressLines") or [None])[0]
    row.city = address.get("locality")
    row.region = address.get("administrativeArea")
    row.postal_code = address.get("postalCode")
    row.country = (address.get("regionCode") or "us").lower()
    row.phone = (payload.get("phoneNumbers") or {}).get("primaryPhone")
    row.landing_page_url = payload.get("websiteUri")
    row.primary_category = (categories.get("primaryCategory") or {}).get("displayName")
    row.secondary_categories = [
        c.get("displayName") for c in (categories.get("additionalCategories") or [])
    ]
    row.services = [
        s.get("structuredServiceItem", {}).get("serviceTypeId")
        or s.get("freeFormServiceItem", {}).get("label", {}).get("displayName")
        for s in (payload.get("serviceItems") or [])
    ]
    row.hours = payload.get("regularHours") or {}
    latlng = payload.get("latlng") or {}
    row.latitude = latlng.get("latitude")
    row.longitude = latlng.get("longitude")
    row.last_synced_at = datetime.now(UTC)
    row.profile_completeness = _completeness(row)
    await ctx.session.flush()
    return row


def _completeness(location: Location) -> float:
    """Profile completeness correlates directly with map pack visibility, so
    it is scored explicitly rather than left as a vague 'fill it in'."""
    checks = [
        bool(location.name), bool(location.address_line1), bool(location.city),
        bool(location.phone), bool(location.landing_page_url),
        bool(location.primary_category), bool(location.secondary_categories),
        bool(location.services), bool(location.hours),
        bool(location.latitude and location.longitude),
    ]
    return round(sum(checks) / len(checks) * 100, 1)


@tool(
    "local.audit_profile",
    """Audit a Business Profile against what actually drives map pack ranking:
    category selection, service coverage, hours, photos, review velocity and
    the consistency of name, address and phone with the website.""",
    schema(location_id_=string("A specific location; defaults to all")),
    category="local",
)
async def audit_profile(ctx: ToolContext, location_id: str | None = None) -> ToolOutcome:
    site = await load_site(ctx)
    stmt = select(Location).where(Location.site_id == site.id)
    if location_id:
        stmt = stmt.where(Location.id == location_id)
    locations = list((await ctx.session.execute(stmt)).scalars().all())
    if not locations:
        return ToolOutcome(
            ok=False,
            error="No locations stored. Run local.sync_locations, or add them manually.",
        )

    audits = []
    for location in locations:
        issues: list[dict] = []
        if not location.primary_category:
            issues.append({"severity": "critical", "issue": "no primary category set"})
        if not location.secondary_categories:
            issues.append({
                "severity": "high",
                "issue": "no secondary categories",
                "fix": "add every category the business genuinely operates in; "
                       "each one is a separate set of queries you can rank for",
            })
        if not location.services:
            issues.append({
                "severity": "high",
                "issue": "no services listed",
                "fix": "list services with descriptions; they match long-tail local queries",
            })
        if not location.hours:
            issues.append({"severity": "high", "issue": "no opening hours"})
        if not location.landing_page_url:
            issues.append({
                "severity": "high",
                "issue": "no website link",
                "fix": "link to a location-specific page, not the homepage",
            })
        elif site and location.landing_page_url.rstrip("/") == site.base_url.rstrip("/"):
            issues.append({
                "severity": "medium",
                "issue": "links to the homepage rather than a location page",
                "fix": "build a page for this location and link it here",
            })
        if (location.photo_count or 0) < 10:
            issues.append({
                "severity": "medium",
                "issue": f"only {location.photo_count or 0} photos",
                "fix": "profiles with 10 or more photos get materially more actions",
            })
        if (location.review_count or 0) < 10:
            issues.append({
                "severity": "medium",
                "issue": f"only {location.review_count or 0} reviews",
                "fix": "ask every satisfied customer, every time, with a direct link",
            })
        if location.is_suspended:
            issues.append({"severity": "critical", "issue": "profile is suspended"})

        audits.append({
            "location_id": location.id,
            "name": location.name,
            "completeness": location.profile_completeness,
            "rating": location.avg_rating,
            "reviews": location.review_count,
            "issues": issues,
        })

    total_issues = sum(len(a["issues"]) for a in audits)
    return ToolOutcome(
        ok=True,
        summary=f"{len(audits)} locations audited, {total_issues} issues found",
        data={"locations": audits},
    )


@tool(
    "local.geo_grid",
    """Measure map pack rank across a grid of points around a location.

    A single city-level rank check is close to meaningless for local search,
    because results change block by block. A grid shows the actual radius the
    business wins in, which is what a client can act on.""",
    schema(
        keyword=string("The search term, e.g. 'emergency dentist'"),
        location_id=string("Which location to centre on"),
        grid_size_=integer("Points per side; 5 gives 25 samples", minimum=3, maximum=9, default=5),
        radius_km_=number("How far out to sample", default=5.0),
    ),
    category="local",
    cost_hint_usd=0.05,
)
async def geo_grid(
    ctx: ToolContext,
    keyword: str,
    location_id: str,
    grid_size: int = 5,
    radius_km: float = 5.0,
) -> ToolOutcome:
    if not await has_connector(ctx, "dataforseo"):
        return ToolOutcome(
            ok=False,
            error="Geo-grid tracking needs DataForSEO for coordinate-level map results.",
        )
    location = (
        await ctx.session.execute(
            select(Location).where(
                Location.id == location_id, Location.site_id == ctx.site_id
            )
        )
    ).scalar_one_or_none()
    if location is None or not (location.latitude and location.longitude):
        return ToolOutcome(ok=False, error="Location has no coordinates stored")

    points = _grid_points(location.latitude, location.longitude, grid_size, radius_km)
    connector = await connector_for(ctx, "dataforseo")
    results: list[dict] = []
    cost = 0.0

    async with connector:
        for lat, lng in points:
            outcome = await connector.local_pack(keyword, latitude=lat, longitude=lng)
            if not outcome.ok:
                continue
            cost += outcome.cost_usd
            rank = None
            for entry in outcome.data:
                if location.name and location.name.lower() in (entry.get("title") or "").lower():
                    rank = entry.get("position")
                    break
            results.append({
                "lat": round(lat, 5), "lng": round(lng, 5), "rank": rank,
                "top_3": [e.get("title") for e in outcome.data[:3]],
            })

    ranked = [r["rank"] for r in results if r["rank"]]
    in_pack = sum(1 for r in ranked if r <= 3)
    average = round(sum(ranked) / len(ranked), 1) if ranked else None

    location.grid_avg_rank = average
    location.grid_captured_at = datetime.now(UTC)
    location.grid_snapshot = {"keyword": keyword, "points": results}
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=(
            f"{keyword!r}: visible at {len(ranked)}/{len(results)} points, "
            f"in the map pack at {in_pack}, average rank "
            + (f"{average}" if average else "not ranking")
        ),
        data={
            "keyword": keyword,
            "grid": results,
            "coverage_pct": round(len(ranked) / max(len(results), 1) * 100, 1),
            "map_pack_pct": round(in_pack / max(len(results), 1) * 100, 1),
            "average_rank": average,
            "competitors_seen": _competitor_frequency(results),
        },
        cost_usd=cost,
    )


def _grid_points(lat: float, lng: float, size: int, radius_km: float) -> list[tuple[float, float]]:
    """Evenly spaced lattice around a centre point.

    Longitude degrees shrink with latitude, so the east-west step is corrected
    by cos(latitude); without it a grid in northern Europe is a tall thin
    rectangle rather than a square.
    """
    km_per_degree_lat = 110.574
    km_per_degree_lng = 111.320 * math.cos(math.radians(lat))
    step = (radius_km * 2) / max(size - 1, 1)
    offset = (size - 1) / 2
    points = []
    for row in range(size):
        for col in range(size):
            d_lat = ((row - offset) * step) / km_per_degree_lat
            d_lng = ((col - offset) * step) / max(km_per_degree_lng, 0.0001)
            points.append((lat + d_lat, lng + d_lng))
    return points


def _competitor_frequency(results: list[dict]) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for point in results:
        for name in point.get("top_3") or []:
            if name:
                counts[name] = counts.get(name, 0) + 1
    return sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:10]


@tool(
    "local.sync_reviews",
    """Pull reviews for a location and classify them: sentiment, topics, and
    whether they need a human rather than an automated reply.""",
    schema(location_id=string("The location")),
    category="local",
)
async def sync_reviews(ctx: ToolContext, location_id: str) -> ToolOutcome:
    location = (
        await ctx.session.execute(
            select(Location).where(
                Location.id == location_id, Location.site_id == ctx.site_id
            )
        )
    ).scalar_one_or_none()
    if location is None:
        return ToolOutcome(ok=False, error="Location not found")
    if not await has_connector(ctx, "google_business_profile"):
        return ToolOutcome(ok=False, error="Google Business Profile is not connected")

    connector = await connector_for(ctx, "google_business_profile")
    account = (location.gbp_location_id or "").split("/locations/")[0]
    async with connector:
        result = await connector.list_reviews(account, location.gbp_location_id)
    if not result.ok:
        return ToolOutcome(ok=False, error=result.error)

    existing = {
        row.external_id: row
        for row in (
            await ctx.session.execute(
                select(Review).where(Review.location_id == location.id)
            )
        ).scalars().all()
    }
    new_count = needs_human = 0
    for entry in result.data:
        row = existing.get(entry["external_id"])
        if row is None:
            row = Review(
                org_id=ctx.org_id, site_id=ctx.site_id, location_id=location.id,
                external_id=entry["external_id"], platform="google",
            )
            ctx.session.add(row)
            new_count += 1
        row.author_name = entry.get("author")
        row.rating = entry.get("rating")
        row.text = entry.get("text")
        row.sentiment = _review_sentiment(entry.get("rating"), entry.get("text"))
        row.topics = _review_topics(entry.get("text") or "")
        row.is_actionable = _is_actionable(entry.get("text") or "")
        row.escalated = (entry.get("rating") or 5) <= 2 or row.is_actionable
        if row.escalated:
            needs_human += 1
        if entry.get("has_reply"):
            row.reply_status = "posted"

    location.review_count = result.meta.get("total", location.review_count)
    location.avg_rating = result.meta.get("average", location.avg_rating)
    await ctx.session.flush()

    return ToolOutcome(
        ok=True,
        summary=(
            f"{len(result.data)} reviews ({new_count} new), "
            f"{needs_human} need a person rather than a drafted reply"
        ),
        data={
            "total": result.meta.get("total"),
            "average": result.meta.get("average"),
            "new": new_count,
            "needing_human": needs_human,
            "unanswered": sum(1 for e in result.data if not e.get("has_reply")),
        },
    )


_COMPLAINT_MARKERS = (
    "refund", "lawyer", "legal", "sue", "discrimination", "injury", "unsafe",
    "misdiagnos", "negligen", "stolen", "fraud", "scam", "never again",
    "health inspector", "reported",
)


def _review_sentiment(rating: int | None, text: str | None) -> str:
    if rating is not None:
        if rating >= 4:
            return "positive"
        if rating <= 2:
            return "negative"
        return "neutral"
    return "neutral"


def _review_topics(text: str) -> list[str]:
    topics = {
        "wait time": r"\b(wait|waiting|queue|late|delay)\b",
        "price": r"\b(price|expensive|cheap|cost|value|charge)\b",
        "staff": r"\b(staff|team|receptionist|nurse|doctor|dentist|rude|friendly|polite)\b",
        "cleanliness": r"\b(clean|dirty|hygien|tidy)\b",
        "booking": r"\b(book|appointment|schedul|cancel)\b",
        "outcome": r"\b(result|pain|fixed|worked|solved|happy with)\b",
        "parking": r"\b(park|parking)\b",
    }
    lowered = (text or "").lower()
    return [name for name, pattern in topics.items() if re.search(pattern, lowered)]


def _is_actionable(text: str) -> bool:
    """A review that alleges harm or threatens action is never auto-replied to."""
    lowered = (text or "").lower()
    return any(marker in lowered for marker in _COMPLAINT_MARKERS)


@tool(
    "local.draft_review_reply",
    """Draft a reply to a review. Positive replies may post automatically at
    higher autonomy levels; anything negative or alleging harm always goes to
    a person first, because a wrong reply to a complaint is a public mistake
    and sometimes a legal one.""",
    schema(
        review_id=string("The review"),
        reply_text=string("The drafted reply, under 350 characters"),
    ),
    category="local",
    mutates=True,
    risk="medium",
    approval_type="review_reply",
    auto_from="managed",
)
async def draft_review_reply(ctx: ToolContext, review_id: str, reply_text: str) -> ToolOutcome:
    review = (
        await ctx.session.execute(
            select(Review).where(Review.id == review_id, Review.site_id == ctx.site_id)
        )
    ).scalar_one_or_none()
    if review is None:
        return ToolOutcome(ok=False, error="Review not found")

    problems = []
    if len(reply_text) > 350:
        problems.append("reply is too long; keep it under 350 characters")
    if review.author_name and review.author_name.lower() not in reply_text.lower():
        problems.append("does not use the reviewer's name")
    if review.sentiment == "negative" and not re.search(
        r"\b(sorry|apolog|understand|regret)\b", reply_text, re.I
    ):
        problems.append("a negative review needs an acknowledgement before anything else")
    if re.search(r"\b(free|discount|voucher|refund)\b", reply_text, re.I):
        problems.append(
            "offering compensation in public invites more of the same; take it to a private channel"
        )

    review.reply_draft = reply_text
    review.reply_status = "awaiting_approval" if review.escalated else "drafted"
    await ctx.session.flush()

    return ToolOutcome(
        ok=not problems,
        error="; ".join(problems) if problems else None,
        summary=(
            f"Reply drafted for a {review.rating}-star review"
            + (" and flagged for a person" if review.escalated else "")
        ),
        data={
            "review_id": review.id,
            "rating": review.rating,
            "escalated": review.escalated,
            "status": review.reply_status,
            "problems": problems,
        },
    )


@tool(
    "local.draft_gbp_post",
    """Draft a Business Profile post. Weekly posting keeps a profile active,
    which is a visible signal to both searchers and the ranking system.""",
    schema(
        location_id=string("The location"),
        summary_text=string("The post body, under 1500 characters"),
        topic_type_=string("Post type", enum=["STANDARD", "EVENT", "OFFER"], default="STANDARD"),
        cta_type_=string("Button", enum=["BOOK", "ORDER", "SHOP", "LEARN_MORE",
                                         "SIGN_UP", "CALL"]),
        cta_url_=string("Where the button goes"),
    ),
    category="local",
    mutates=True,
    risk="medium",
    approval_type="gbp_post",
    auto_from="managed",
)
async def draft_gbp_post(
    ctx: ToolContext,
    location_id: str,
    summary_text: str,
    topic_type: str = "STANDARD",
    cta_type: str | None = None,
    cta_url: str | None = None,
) -> ToolOutcome:
    post = GbpPost(
        org_id=ctx.org_id,
        site_id=ctx.site_id,
        location_id=location_id,
        topic_type=topic_type,
        summary=summary_text[:1500],
        cta_type=cta_type,
        cta_url=cta_url,
        status="drafted",
    )
    ctx.session.add(post)
    await ctx.session.flush()
    return ToolOutcome(
        ok=True,
        summary=f"{topic_type} post drafted for approval",
        data={"post_id": post.id, "characters": len(summary_text)},
    )


@tool(
    "local.audit_citations",
    """Check name, address and phone consistency across the directories that
    matter. Inconsistent NAP undermines the confidence that drives map pack
    ranking, and it is cheap to fix.""",
    schema(location_id=string("The location to check")),
    category="local",
)
async def audit_citations(ctx: ToolContext, location_id: str) -> ToolOutcome:
    location = (
        await ctx.session.execute(
            select(Location).where(
                Location.id == location_id, Location.site_id == ctx.site_id
            )
        )
    ).scalar_one_or_none()
    if location is None:
        return ToolOutcome(ok=False, error="Location not found")

    existing = {
        row.directory: row
        for row in (
            await ctx.session.execute(
                select(Citation).where(Citation.location_id == location.id)
            )
        ).scalars().all()
    }
    canonical = {
        "name": location.name,
        "address": ", ".join(
            filter(None, [location.address_line1, location.city, location.postal_code])
        ),
        "phone": _normalise_phone(location.phone),
    }

    report = []
    for directory, weight in CORE_DIRECTORIES:
        row = existing.get(directory)
        if row is None:
            row = Citation(
                org_id=ctx.org_id, site_id=ctx.site_id, location_id=location.id,
                directory=directory, status="missing", priority=weight,
                requires_human=directory in ("Google Business Profile", "Apple Business Connect",
                                             "Better Business Bureau"),
                human_reason="claiming this listing needs a verification code sent to the business",
            )
            ctx.session.add(row)
        mismatches = []
        if row.status not in ("missing",):
            if row.submitted_name and row.submitted_name != canonical["name"]:
                mismatches.append(f"name: {row.submitted_name!r} vs {canonical['name']!r}")
            if row.submitted_phone and _normalise_phone(row.submitted_phone) != canonical["phone"]:
                mismatches.append("phone differs")
            if row.submitted_address and row.submitted_address != canonical["address"]:
                mismatches.append("address differs")
        row.mismatches = mismatches
        if mismatches:
            row.status = "inconsistent"
        row.last_checked_on = datetime.now(UTC).date()
        report.append({
            "directory": directory,
            "status": row.status,
            "priority": weight,
            "mismatches": mismatches,
            "requires_human": row.requires_human,
            "listing_url": row.listing_url,
        })
    await ctx.session.flush()

    missing = [r for r in report if r["status"] == "missing"]
    inconsistent = [r for r in report if r["status"] == "inconsistent"]
    return ToolOutcome(
        ok=True,
        summary=(
            f"{len(missing)} listings missing, {len(inconsistent)} inconsistent "
            f"across {len(report)} core directories"
        ),
        data={
            "canonical_nap": canonical,
            "citations": sorted(report, key=lambda r: -r["priority"]),
            "missing": [r["directory"] for r in missing],
            "inconsistent": [r["directory"] for r in inconsistent],
        },
    )


def _normalise_phone(phone: str | None) -> str:
    return re.sub(r"[^\d]", "", phone or "")[-10:]
