"""Social platforms, and the truth about what each one will let you read.

This file exists because the most common lie in social media tooling is a
competitor's impressions. Impressions and reach are private on every major
platform: they are computed by the platform for the account owner and exposed
only through that owner's own token. No API sells them, no scraper can see
them, and every dashboard showing you a rival's reach is estimating it from
follower count and calling the estimate data.

So the map below is the honest one. For each platform it records what you can
read about an account you own, what you can read about one you do not, the
mechanism, and where the answer is "nothing", the reason. Every screen and
every agent reads this rather than discovering the limit halfway through a
client engagement.

Sources are the platforms' own developer documentation as of September 2026.
Where a platform changes its terms, this file is the one place to change.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime

from seoos.analysis.http import SafeHttpClient
from seoos.analysis.social import AccountProfile, Post
from seoos.core.logging import get_logger

log = get_logger("seoos.connectors.social")


@dataclass(frozen=True)
class PlatformCapability:
    """What one platform permits, stated before anybody tries."""

    key: str
    name: str
    #: Can the client connect their own account and read their own insights?
    own_account: bool
    #: Can we read a competitor's public posts at all?
    competitor_posts: bool
    #: Which public per-post metrics come back. Never includes impressions.
    competitor_metrics: tuple[str, ...]
    #: What it takes to turn this on.
    requires: str
    #: Free, paid, or gated behind an application.
    access: str
    #: Why a "no" is a no. Empty when everything is available.
    limitation: str
    #: Can we publish on the client's behalf, with approval?
    can_publish: bool


#: Impressions, reach and saves for an account you do not own. The answer is
#: no on every platform in existence, and it is worth naming once.
NEVER_AVAILABLE = (
    "impressions", "reach", "saves", "profile visits", "follower demographics",
    "watch time", "click-throughs", "conversions",
)

PLATFORMS: tuple[PlatformCapability, ...] = (
    PlatformCapability(
        key="youtube",
        name="YouTube",
        own_account=True,
        competitor_posts=True,
        competitor_metrics=("views", "likes", "comments", "duration", "title", "description", "tags", "published"),
        requires=(
            "Nothing for a shallow read: the public channel feed carries views and likes for the "
            "fifteen most recent uploads. A free YouTube Data API v3 key raises that to a hundred, "
            "with comment counts and durations."
        ),
        access="free",
        limitation="",
        can_publish=True,
    ),
    PlatformCapability(
        key="instagram",
        name="Instagram",
        own_account=True,
        competitor_posts=True,
        competitor_metrics=("likes", "comments", "media type", "caption", "permalink", "posted at", "followers"),
        requires=(
            "Your own Instagram Business or Creator account connected to a Facebook Page, plus a "
            "Meta app. Competitor reads go through the Business Discovery edge of the Instagram "
            "Graph API, which only returns accounts that are themselves Business or Creator."
        ),
        access="free",
        limitation=(
            "Impressions, reach and saves are never returned for an account you do not own, and a "
            "personal account cannot be read at all. Stories are owner-only in every case."
        ),
        can_publish=True,
    ),
    PlatformCapability(
        key="reddit",
        name="Reddit",
        own_account=True,
        competitor_posts=True,
        competitor_metrics=("score", "upvote ratio", "comments", "subreddit", "title", "body", "posted at"),
        requires="A Reddit app registration. The public JSON endpoints work without one at low volume.",
        access="free",
        limitation=(
            "Two things. Vote counts are fuzzed by Reddit on purpose, so treat score as "
            "approximate. And Reddit refuses requests from data-centre address ranges, which is "
            "where a hosted deployment runs, so a read from one will often answer 403."
        ),
        can_publish=True,
    ),
    PlatformCapability(
        key="x",
        name="X",
        own_account=True,
        competitor_posts=True,
        competitor_metrics=("likes", "reposts", "replies", "quotes", "text", "posted at"),
        requires="An X API v2 plan. The Basic tier is roughly $200 a month and there is no free read tier.",
        access="paid",
        limitation=(
            "Impression counts are returned only for posts on the authenticated account. Rate "
            "limits on the Basic tier make a wide competitive sweep slow rather than impossible."
        ),
        can_publish=True,
    ),
    PlatformCapability(
        key="tiktok",
        name="TikTok",
        own_account=True,
        competitor_posts=False,
        competitor_metrics=(),
        requires="A TikTok for Developers app for your own account, through the Display API.",
        access="gated",
        limitation=(
            "There is no commercial competitor endpoint. The Research API that returns other "
            "accounts' public videos is restricted to approved academic researchers in the US and "
            "EU, and its terms forbid commercial use. Anything else on the market is scraping, "
            "which breaks TikTok's terms and stops working without warning."
        ),
        can_publish=True,
    ),
    PlatformCapability(
        key="facebook",
        name="Facebook Pages",
        own_account=True,
        competitor_posts=False,
        competitor_metrics=(),
        requires="A Meta app with Pages access for the client's own Page.",
        access="gated",
        limitation=(
            "Reading another company's Page posts needs Page Public Content Access, which Meta "
            "has reviewed case by case since 2018 and grants almost exclusively to research and "
            "moderation use cases. Assume no competitor data here."
        ),
        can_publish=True,
    ),
    PlatformCapability(
        key="linkedin",
        name="LinkedIn",
        own_account=True,
        competitor_posts=False,
        competitor_metrics=(),
        requires="A LinkedIn app with Community Management access for the client's own Page.",
        access="gated",
        limitation=(
            "There is no API that returns another company's Page posts. Competitive reading on "
            "LinkedIn is manual, and a tool claiming otherwise is scraping a logged-in session."
        ),
        can_publish=True,
    ),
    PlatformCapability(
        key="pinterest",
        name="Pinterest",
        own_account=True,
        competitor_posts=False,
        competitor_metrics=(),
        requires="A Pinterest app for the client's own account.",
        access="free",
        limitation="No competitor endpoint. Public boards can be viewed but not read through the API.",
        can_publish=True,
    ),
    PlatformCapability(
        key="threads",
        name="Threads",
        own_account=True,
        competitor_posts=False,
        competitor_metrics=(),
        requires="A Meta app with Threads access for the client's own account.",
        access="free",
        limitation="The Threads API covers your own posts and insights. No competitor endpoint exists.",
        can_publish=True,
    ),
    PlatformCapability(
        key="snapchat",
        name="Snapchat",
        own_account=False,
        competitor_posts=False,
        competitor_metrics=(),
        requires="Nothing available. Snapchat's public APIs are for advertising, not content.",
        access="none",
        limitation=(
            "There is no content API for organic Snapchat, for your own account or anybody "
            "else's. This desk will not pretend to cover it."
        ),
        can_publish=False,
    ),
)

BY_KEY = {p.key: p for p in PLATFORMS}


def capability(key: str) -> PlatformCapability | None:
    return BY_KEY.get(key.lower())


def readable_for_competitors() -> list[PlatformCapability]:
    """The platforms where a competitor teardown is genuinely possible."""
    return [p for p in PLATFORMS if p.competitor_posts]


def capability_report() -> dict:
    """The whole map, for a screen or an agent to read before promising work."""
    return {
        "never_available_for_competitors": list(NEVER_AVAILABLE),
        "platforms": [
            {
                "key": p.key,
                "name": p.name,
                "own_account": p.own_account,
                "competitor_posts": p.competitor_posts,
                "competitor_metrics": list(p.competitor_metrics),
                "requires": p.requires,
                "access": p.access,
                "limitation": p.limitation,
                "can_publish": p.can_publish,
            }
            for p in PLATFORMS
        ],
        "summary": (
            f"{len(readable_for_competitors())} of {len(PLATFORMS)} platforms allow a competitor "
            "teardown. Impressions and reach are owner-only everywhere, so no competitor number "
            "on any screen here is an impression."
        ),
    }


def _unreadable(platform: str) -> AccountProfile:
    cap = capability(platform)
    reason = cap.limitation if cap else f"{platform} is not a platform this desk knows about."
    return AccountProfile(handle="", platform=platform, unreadable=reason)


# ------------------------------------------------------------------ YouTube

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def _attr(block: str, tag: str, name: str) -> str:
    m = re.search(rf'<{tag}\b[^>]*\b{name}="([^"]*)"', block)
    return m.group(1) if m else ""


def _tag_text(block: str, tag: str) -> str:
    m = re.search(rf"<{tag}(?:\s[^>]*)?>([\s\S]*?)</{tag}>", block)
    if not m:
        return ""
    out = m.group(1)
    for entity, char in (
        ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'),
        ("&#39;", "'"), ("&apos;", "'"), ("&amp;", "&"),
    ):
        out = out.replace(entity, char)
    return out


async def read_youtube_public(handle: str) -> AccountProfile:
    """A YouTube channel with no API key at all.

    The only competitor read on any network that needs nothing. YouTube
    publishes an Atom feed per channel carrying the view count and the like
    count of the fifteen most recent uploads, which is above the twelve-post
    floor and therefore enough for a median, the winners and their hooks.

    It is a smaller read than the keyed one and the difference travels with
    it: fifteen recent uploads rather than a hundred, no comment counts, and
    no durations, so Shorts cannot be separated from long-form. Those ride in
    ``caveats`` and are printed above the numbers rather than under them.

    Reddit was going to be the no-key platform. It refuses data-centre address
    ranges, which is where any hosted deployment runs, so the read that was
    meant to need nothing returned a 403 instead.
    """
    clean = re.sub(r"[^A-Za-z0-9_\-.]", "", handle.strip().lstrip("@"))
    async with SafeHttpClient(user_agent=_BROWSER_UA) as http:
        if re.fullmatch(r"UC[A-Za-z0-9_-]{22}", clean):
            channel_id = clean
        else:
            page = await http.get(f"https://www.youtube.com/@{clean}", check_robots=False)
            if not page.ok:
                return AccountProfile(
                    handle=handle, platform="youtube",
                    unreadable=f"YouTube answered {page.status} for @{clean}.",
                )
            m = (re.search(r'"externalId":"(UC[A-Za-z0-9_-]{22})"', page.text)
                 or re.search(r'"channelId":"(UC[A-Za-z0-9_-]{22})"', page.text))
            if not m:
                return AccountProfile(
                    handle=handle, platform="youtube",
                    unreadable=f"No YouTube channel found for @{clean}.",
                )
            channel_id = m.group(1)

        feed = await http.get(
            f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}",
            check_robots=False,
        )
        if not feed.ok:
            return AccountProfile(
                handle=handle, platform="youtube",
                unreadable=f"The public feed answered {feed.status}.",
            )

    posts: list[Post] = []
    for entry in feed.text.split("<entry>")[1:]:
        entry = entry.split("</entry>")[0]
        video_id = _tag_text(entry, "yt:videoId")
        if not video_id:
            continue
        posts.append(Post(
            id=video_id,
            platform="youtube",
            url=f"https://www.youtube.com/watch?v={video_id}",
            posted_at=_tag_text(entry, "published"),
            # No duration in the feed, so a Short and a documentary arrive
            # identical. Calling them all "video" is wrong in a way the caveat
            # names; guessing from the title would be wrong invisibly.
            kind="video",
            text=f"{_tag_text(entry, 'media:title')}\n{_tag_text(entry, 'media:description')}",
            likes=int(_attr(entry, "media:starRating", "count") or 0),
            comments=0,
            views=int(_attr(entry, "media:statistics", "views") or 0) or None,
            duration_s=None,
        ))

    if not posts:
        return AccountProfile(
            handle=handle, platform="youtube",
            unreadable=(
                f"The public feed for {handle} returned no videos. A channel with no uploads, and "
                "one that has hidden them, read the same way from outside."
            ),
        )

    return AccountProfile(
        handle=handle,
        platform="youtube",
        # The feed carries no subscriber count. Absent beats guessed.
        followers=None,
        posts=posts,
        caveats=[
            f"Read without a key, from YouTube's public feed: the {len(posts)} most recent uploads "
            "only, so this is a read of recent work rather than of the channel.",
            "The free feed publishes no comment counts, so engagement here is likes alone and the "
            "comment ratio is not calculated.",
            "It publishes no durations either, so Shorts are not separated from long-form and no "
            "format verdict is given. A free API key fixes all three.",
        ],
    )


async def read_youtube(handle: str, api_key: str, *, limit: int = 40) -> AccountProfile:
    """A public YouTube channel, through the official Data API.

    The most generous competitor surface of any platform: view counts are
    public, which is the one place a competitor's distribution is visible at
    all. It is still not impressions, and the difference matters: a view is
    counted after the viewer stayed, an impression is counted when the
    thumbnail was shown.
    """
    if not api_key:
        # Not an error, a smaller read. The keyless feed is a real answer and
        # says what it is missing.
        return await read_youtube_public(handle)
    clean = handle.lstrip("@")
    async with SafeHttpClient() as http:
        base = "https://www.googleapis.com/youtube/v3"
        chan = await http.get_json(
            f"{base}/channels?part=snippet,statistics,contentDetails&forHandle=@{clean}&key={api_key}"
        )
        items = (chan or {}).get("items") or []
        if not items:
            chan = await http.get_json(
                f"{base}/channels?part=snippet,statistics,contentDetails&id={clean}&key={api_key}"
            )
            items = (chan or {}).get("items") or []
        if not items:
            return AccountProfile(handle=handle, platform="youtube",
                                  unreadable=f"No YouTube channel found for {handle}.")

        channel = items[0]
        followers = int(channel["statistics"].get("subscriberCount") or 0) or None
        uploads = channel["contentDetails"]["relatedPlaylists"]["uploads"]

        ids: list[str] = []
        token = ""
        while len(ids) < limit:
            page = await http.get_json(
                f"{base}/playlistItems?part=contentDetails&playlistId={uploads}"
                f"&maxResults=50&key={api_key}" + (f"&pageToken={token}" if token else "")
            )
            ids += [i["contentDetails"]["videoId"] for i in (page or {}).get("items", [])]
            token = (page or {}).get("nextPageToken") or ""
            if not token:
                break
        ids = ids[:limit]

        posts: list[Post] = []
        for chunk in [ids[i:i + 50] for i in range(0, len(ids), 50)]:
            detail = await http.get_json(
                f"{base}/videos?part=snippet,statistics,contentDetails&id={','.join(chunk)}&key={api_key}"
            )
            for video in (detail or {}).get("items", []):
                stats = video.get("statistics", {})
                snip = video.get("snippet", {})
                duration = video.get("contentDetails", {}).get("duration", "")
                seconds = _iso8601_seconds(duration)
                posts.append(Post(
                    id=video["id"],
                    platform="youtube",
                    url=f"https://www.youtube.com/watch?v={video['id']}",
                    posted_at=snip.get("publishedAt", ""),
                    # Under a minute and vertical is a Short, and Shorts behave
                    # like a different platform, so they are not one bucket.
                    kind="short" if seconds and seconds <= 60 else "video",
                    text=f"{snip.get('title', '')}\n{snip.get('description', '')}",
                    likes=int(stats.get("likeCount") or 0),
                    comments=int(stats.get("commentCount") or 0),
                    views=int(stats.get("viewCount") or 0),
                    duration_s=seconds,
                ))
    return AccountProfile(handle=handle, platform="youtube", followers=followers, posts=posts)


def _iso8601_seconds(value: str) -> int | None:
    m = re.match(r"^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", value or "")
    if not m:
        return None
    h, mi, s = (int(g or 0) for g in m.groups())
    return h * 3600 + mi * 60 + s


# ---------------------------------------------------------------- Instagram

async def read_instagram(
    handle: str, *, ig_user_id: str, access_token: str, limit: int = 40
) -> AccountProfile:
    """A public Instagram Business or Creator account, through Business Discovery.

    This is the only sanctioned route to another account's Instagram posts,
    and it is not widely known. It needs the client's own Instagram Business
    account as the querying identity: you look at a competitor through your
    own account's eyes, which is also why it returns nothing private.
    """
    if not (ig_user_id and access_token):
        return AccountProfile(handle=handle, platform="instagram",
                              unreadable="No Instagram Business account connected to query through.")
    clean = handle.lstrip("@")
    fields = (
        f"business_discovery.username({clean})"
        "{followers_count,media_count,media.limit(" + str(limit) + ")"
        "{id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp}}"
    )
    async with SafeHttpClient() as http:
        data = await http.get_json(
            f"https://graph.facebook.com/v21.0/{ig_user_id}"
            f"?fields={fields}&access_token={access_token}"
        )
    found = (data or {}).get("business_discovery")
    if not found:
        error = ((data or {}).get("error") or {}).get("message", "")
        return AccountProfile(
            handle=handle, platform="instagram",
            unreadable=(
                f"Instagram returned nothing for {handle}. "
                + (error or "Business Discovery only returns Business and Creator accounts, "
                            "so a personal account cannot be read at all.")
            ),
        )

    posts: list[Post] = []
    for media in (found.get("media") or {}).get("data", []):
        product = (media.get("media_product_type") or "").lower()
        mtype = (media.get("media_type") or "").lower()
        kind = "reel" if product == "reels" else (
            "carousel" if mtype == "carousel_album" else ("video" if mtype == "video" else "image")
        )
        posts.append(Post(
            id=media.get("id", ""),
            platform="instagram",
            url=media.get("permalink", ""),
            posted_at=media.get("timestamp", ""),
            kind=kind,
            text=media.get("caption") or "",
            likes=int(media.get("like_count") or 0),
            comments=int(media.get("comments_count") or 0),
            # Deliberately absent: Instagram returns no views, impressions,
            # reach or saves for an account you do not own.
            views=None,
        ))
    return AccountProfile(
        handle=handle, platform="instagram",
        followers=int(found.get("followers_count") or 0) or None, posts=posts,
    )


# ------------------------------------------------------------------- Reddit

async def read_reddit(handle: str, *, limit: int = 40) -> AccountProfile:
    """A public Reddit account's submissions, through the public JSON endpoint.

    Reddit fuzzes vote counts on purpose to frustrate manipulation, so the
    score is approximate and the module says so rather than presenting a
    fuzzed integer as a measurement.
    """
    clean = handle.lstrip("u/").lstrip("@")
    async with SafeHttpClient(user_agent="seoos-social-research/1.0") as http:
        data = await http.get_json(
            f"https://www.reddit.com/user/{clean}/submitted.json?limit={min(limit, 100)}"
        )
    children = ((data or {}).get("data") or {}).get("children") or []
    if not children:
        return AccountProfile(handle=handle, platform="reddit",
                              unreadable=f"No public submissions found for {handle}.")
    posts = []
    for child in children:
        d = child.get("data", {})
        posts.append(Post(
            id=d.get("id", ""),
            platform="reddit",
            url="https://www.reddit.com" + d.get("permalink", ""),
            posted_at=datetime.fromtimestamp(d.get("created_utc", 0), tz=UTC).isoformat(),
            kind="link" if not d.get("is_self") else "text",
            text=f"{d.get('title', '')}\n{d.get('selftext', '')}",
            likes=int(d.get("score") or 0),
            comments=int(d.get("num_comments") or 0),
        ))
    return AccountProfile(handle=handle, platform="reddit", followers=None, posts=posts)


async def read_account(platform: str, handle: str, credentials: dict) -> AccountProfile:
    """Read one public account, or say why this platform will not allow it."""
    key = platform.lower()
    if key == "youtube":
        return await read_youtube(handle, credentials.get("youtube_api_key", ""))
    if key == "instagram":
        return await read_instagram(
            handle,
            ig_user_id=credentials.get("ig_user_id", ""),
            access_token=credentials.get("ig_access_token", ""),
        )
    if key == "reddit":
        return await read_reddit(handle)
    return _unreadable(key)
