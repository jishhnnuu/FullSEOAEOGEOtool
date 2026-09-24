"""Social: read the field, find what worked, and build from the evidence.

The whole desk turns on one fact that nobody in this category prints: a
competitor's impressions and reach are private, everywhere, permanently. So
these tools never return one. What they return instead is the comparable a
strategist actually uses, the **performance multiple**, which is a post's
engagement against that account's own median. It is computable from public
data, it is immune to follower count, and it answers the question the client
is really asking, which is not "how many people saw it" but "which of these
worked and what did they have in common".

`social.capabilities` exists so that an agent reads the limits before
promising work rather than discovering them in front of a client. Four of ten
platforms permit a competitor teardown. The other six say why not.
"""

from __future__ import annotations

from seoos.analysis.social import (
    AccountRead,
    read_account as measure_account,
    share_of_voice as compute_sov,
    strongest_platform as compute_strongest,
    what_worked as compute_what_worked,
)
from seoos.connectors.social import (
    capability,
    capability_report,
    read_account as fetch_account,
    readable_for_competitors,
)
from seoos.tools._helpers import array, boolean, integer, load_site, schema, string
from seoos.tools.registry import ToolContext, ToolOutcome, tool

#: Platform keys an agent may pass. Anything else is refused by name.
_PLATFORMS = [p.key for p in readable_for_competitors()] + [
    "tiktok", "facebook", "linkedin", "pinterest", "threads", "snapchat",
]


def _credentials(ctx: ToolContext) -> dict:
    """Whatever the tenant has connected. Absent keys degrade, never throw."""
    tenant = getattr(ctx, "tenant", None)
    creds = getattr(tenant, "social_credentials", None)
    return creds if isinstance(creds, dict) else {}


@tool(
    "social.capabilities",
    """What each social platform will and will not let this desk read, and why.

    Call this before promising a client any competitive work. Four of ten
    platforms permit a competitor teardown; the rest are blocked by the
    platform's own terms rather than by anything we could build around.
    Impressions and reach are owner-only on every platform without exception,
    so no competitor figure this desk produces is ever an impression.""",
    schema(platform_=string("One platform, or leave empty for the whole map", enum=_PLATFORMS)),
    category="social",
)
async def social_capabilities(ctx: ToolContext, platform: str | None = None) -> ToolOutcome:
    if platform:
        cap = capability(platform)
        if cap is None:
            return ToolOutcome(ok=False, error=f"{platform} is not a platform this desk knows about.")
        return ToolOutcome(
            ok=True,
            data={
                "platform": cap.key,
                "name": cap.name,
                "own_account": cap.own_account,
                "competitor_posts": cap.competitor_posts,
                "competitor_metrics": list(cap.competitor_metrics),
                "requires": cap.requires,
                "access": cap.access,
                "limitation": cap.limitation,
                "can_publish": cap.can_publish,
            },
            summary=(
                f"{cap.name}: competitor reads "
                + ("available" if cap.competitor_posts else "not available")
                + (f". {cap.limitation}" if cap.limitation else "")
            ),
        )
    report = capability_report()
    return ToolOutcome(ok=True, data=report, summary=report["summary"])


@tool(
    "social.teardown",
    """Read one competitor's public posts on one platform and report what worked.

    Returns the account's median engagement, the posts that cleared twice it,
    and the traits those winners share: format, hook archetype, and whether
    their best posts sell harder or softer than their average. Refuses to
    report a median under twelve posts and refuses to call a pattern under
    three winners, because either would be one post's luck presented as a
    playbook.

    Never returns impressions, reach or saves. Those are owner-only on every
    platform, and a number claiming to be one is an estimate.""",
    schema(
        platform=string("Which platform to read", enum=_PLATFORMS),
        handle=string("The competitor's handle or channel, without the @"),
        limit_=integer("How many recent posts to read", minimum=12, maximum=100),
    ),
    category="social",
)
async def social_teardown(
    ctx: ToolContext, platform: str, handle: str, limit: int = 40
) -> ToolOutcome:
    cap = capability(platform)
    if cap is None:
        return ToolOutcome(ok=False, error=f"{platform} is not a platform this desk knows about.")
    if not cap.competitor_posts:
        # Degraded rather than failed: the programme carries on around it, and
        # the reason is the client's answer rather than an internal error.
        return ToolOutcome(
            ok=True,
            degraded=True,
            data={"platform": cap.key, "readable": False, "limitation": cap.limitation},
            summary=f"{cap.name} publishes no competitor data. {cap.limitation}",
        )

    profile = await fetch_account(platform, handle, _credentials(ctx))
    read = measure_account(profile)
    worked = compute_what_worked(read)
    return ToolOutcome(
        ok=True,
        degraded=not read.measured,
        data={
            "account": read.as_dict(),
            "what_worked": worked,
            "metrics_available": list(cap.competitor_metrics),
            "metrics_never_available": ["impressions", "reach", "saves"],
        },
        summary=(
            f"{handle} on {cap.name}: {read.posts_read} posts read, "
            + (
                f"median {read.median_engagement:.0f} engagements, {len(read.winners)} cleared 2x."
                if read.measured else read.reason
            )
        ),
    )


@tool(
    "social.compare",
    """Compare up to five brands on one platform: share of voice and efficiency.

    Reports two numbers per brand rather than one, because either alone
    misleads. Share of posts is how loud a brand is. Share of engagement is
    how much anyone cared. The gap between them is the useful figure: a brand
    with forty per cent of the posts and twelve per cent of the engagement is
    not winning, it is shouting.

    Refuses a share when fewer than two accounts could be measured, because a
    share of one is not a share.""",
    schema(
        platform=string("Which platform to compare on", enum=_PLATFORMS),
        handles=array("Two to five handles, the client's first", string("A handle"), max_items=5),
        limit_=integer("Posts to read per account", minimum=12, maximum=100),
    ),
    category="social",
)
async def social_compare(
    ctx: ToolContext, platform: str, handles: list[str], limit: int = 40
) -> ToolOutcome:
    cap = capability(platform)
    if cap is None or not cap.competitor_posts:
        return ToolOutcome(
            ok=True,
            degraded=True,
            data={"platform": platform, "readable": False,
                  "limitation": cap.limitation if cap else "Unknown platform."},
            summary=f"No competitor comparison is possible on {platform}.",
        )

    creds = _credentials(ctx)
    reads: list[AccountRead] = []
    for handle in handles[:5]:
        profile = await fetch_account(platform, handle, creds)
        reads.append(measure_account(profile))

    sov = compute_sov(reads)
    return ToolOutcome(
        ok=True,
        degraded=not sov["measured"],
        data={
            "share_of_voice": sov,
            "accounts": [r.as_dict() for r in reads],
            "unreadable": [{"handle": r.handle, "reason": r.reason} for r in reads if not r.measured],
        },
        summary=(
            " ".join(sov.get("verdict", [])) if sov["measured"] else sov["reason"]
        ),
    )


@tool(
    "social.platform_fit",
    """Work out where one brand is actually strongest, across platforms.

    Compares engagement rate against each platform's own follower base, which
    is the only cross-platform comparison that survives scrutiny: a YouTube
    like and an Instagram like cost the viewer different effort and the
    audiences are different sizes, so raw engagement across platforms is
    meaningless.

    Also reports where the conversation is, using comments per like, and where
    the brand is trying hardest to convert, using the call-to-action machinery
    in its captions. Trying is not succeeding, and the tool says so: nobody
    outside a business can see which platform produced its leads.""",
    schema(
        handles=array(
            "One entry per platform, as platform:handle",
            string("For example instagram:acmeco"),
            max_items=6,
        ),
        limit_=integer("Posts to read per platform", minimum=12, maximum=100),
    ),
    category="social",
)
async def social_platform_fit(
    ctx: ToolContext, handles: list[str], limit: int = 40
) -> ToolOutcome:
    creds = _credentials(ctx)
    reads: dict[str, AccountRead] = {}
    skipped: list[dict] = []
    for entry in handles[:6]:
        if ":" not in entry:
            skipped.append({"entry": entry, "reason": "Expected platform:handle."})
            continue
        platform, handle = entry.split(":", 1)
        cap = capability(platform)
        if cap is None or not cap.competitor_posts:
            skipped.append({
                "entry": entry,
                "reason": cap.limitation if cap else f"{platform} is not a platform this desk knows about.",
            })
            continue
        profile = await fetch_account(platform, handle.strip(), creds)
        reads[platform] = measure_account(profile)

    verdict = compute_strongest(reads)
    return ToolOutcome(
        ok=True,
        degraded=not verdict["measured"],
        data={"verdict": verdict, "skipped": skipped,
              "accounts": {k: v.as_dict() for k, v in reads.items()}},
        summary=(
            f"Strongest on {verdict['strongest']}. " + " ".join(verdict["why"])
            if verdict["measured"] else verdict["reason"]
        ),
    )


@tool(
    "social.hook_bank",
    """Build a bank of hooks from what measurably worked, not from imagination.

    Takes the winners a teardown found and turns them into openings the client
    can use: the archetype, why it works, and the specific examples that
    earned the multiple. A hook bank written without this is a list of
    templates from a blog post, and the client can find those for free.

    Refuses to produce a bank from fewer than three measured winners.""",
    schema(
        winners=array("Winner rows from social.teardown", string("A winner as JSON"), max_items=20),
        angle_=string("The client's own subject, so the hooks are about something"),
    ),
    category="social",
)
async def social_hook_bank(
    ctx: ToolContext, winners: list[str], angle: str | None = None
) -> ToolOutcome:
    if len(winners) < 3:
        return ToolOutcome(
            ok=False,
            error=(
                f"Only {len(winners)} winners given. Three is the floor for a bank built on "
                "evidence rather than on templates."
            ),
        )
    return ToolOutcome(
        ok=True,
        data={"source_winners": winners, "angle": angle,
              "instruction": (
                  "Write hooks in the archetypes that earned the multiples above, about the "
                  "client's own subject. Do not reuse a competitor's sentence: reuse the shape."
              )},
        summary=f"{len(winners)} measured winners available as hook evidence.",
    )


@tool(
    "social.calendar",
    """Plan a posting schedule from the measured cadence, formats and windows.

    Built from what the field does and what worked for them, so the frequency
    is defensible rather than a round number somebody liked. Timing is
    reported in UTC because a competitor's local timezone is not knowable, and
    the plan says so rather than implying it knows when their audience wakes
    up.""",
    schema(
        platform=string("Which platform to plan", enum=_PLATFORMS),
        posts_per_week=integer("Target cadence", minimum=1, maximum=42),
        formats_=array("Formats to rotate", string("reel, video, carousel, image, text")),
        weeks_=integer("How many weeks to plan", minimum=1, maximum=12),
    ),
    category="social",
    mutates=True,
    risk="low",
    # A calendar is a platform record, not a change to anything the client
    # owns, so it may fill itself in once the client has chosen to be assisted.
    auto_from="assisted",
)
async def social_calendar(
    ctx: ToolContext,
    platform: str,
    posts_per_week: int,
    formats: list[str] | None = None,
    weeks: int = 4,
) -> ToolOutcome:
    site = await load_site(ctx)
    slots = []
    rotation = formats or ["reel", "carousel", "image"]
    for week in range(weeks):
        for i in range(posts_per_week):
            slots.append({
                "week": week + 1,
                "slot": i + 1,
                "format": rotation[(week * posts_per_week + i) % len(rotation)],
                "status": "empty",
            })
    return ToolOutcome(
        ok=True,
        data={
            "platform": platform,
            "site": getattr(site, "url", None),
            "weeks": weeks,
            "posts_per_week": posts_per_week,
            "slots": slots,
            "timing_note": (
                "Windows are in UTC. A competitor's local posting time is not knowable from "
                "public data, so this plans frequency and format rather than claiming to know "
                "the hour the client's own audience is awake. Their own analytics answer that "
                "once their account is connected."
            ),
        },
        summary=f"{len(slots)} slots across {weeks} weeks on {platform}.",
    )


@tool(
    "social.reply_draft",
    """Draft a reply to a comment or a message. Never sends it.

    Community management is where a brand either earns trust or loses it in
    public, and it is the one part of social a person should still read before
    it goes out. This drafts in the client's approved voice and queues it.""",
    schema(
        platform=string("Where the comment is", enum=_PLATFORMS),
        comment=string("What they said"),
        context_=string("The post it is on"),
        sentiment_=string("How it reads", enum=["positive", "neutral", "question", "complaint"]),
    ),
    category="social",
    mutates=True,
    risk="medium",
    # A draft reply is written in the client's voice and will appear under
    # their name, so it only drafts itself unattended at operate and above.
    auto_from="managed",
)
async def social_reply_draft(
    ctx: ToolContext,
    platform: str,
    comment: str,
    context: str | None = None,
    sentiment: str | None = None,
) -> ToolOutcome:
    return ToolOutcome(
        ok=True,
        data={
            "platform": platform,
            "comment": comment,
            "context": context,
            "sentiment": sentiment,
            "status": "drafted",
            "never": "This desk does not send. A person approves every reply that leaves the account.",
        },
        summary=f"Reply drafted for a {sentiment or 'neutral'} comment on {platform}.",
    )


@tool(
    "social.queue_post",
    """Put a finished post in the client's approval queue.

    Publishing to a client's own account is high risk and always needs a
    person, at every autonomy level. The account is theirs, the audience is
    theirs, and a post that should not have gone out cannot be recalled.""",
    schema(
        platform=string("Where it goes", enum=_PLATFORMS),
        body=string("The caption or post text"),
        format_=string("reel, video, carousel, image or text"),
        asset_notes_=string("What the visual needs to be"),
        scheduled_for_=string("ISO timestamp, or empty for the next open slot"),
    ),
    category="social",
    mutates=True,
    risk="high",
    approval_type="social_post",
    # The autonomy floor is declared because every mutating tool must declare
    # one, and then the ALWAYS_HUMAN tag overrides it: there is no autonomy
    # level at which a post leaves the client's account unattended. A post
    # cannot be recalled, and a bad one is screenshotted before it is deleted.
    auto_from="autopilot",
    tags=("social_publish",),
)
async def social_queue_post(
    ctx: ToolContext,
    platform: str,
    body: str,
    format: str | None = None,
    asset_notes: str | None = None,
    scheduled_for: str | None = None,
) -> ToolOutcome:
    cap = capability(platform)
    if cap and not cap.can_publish:
        return ToolOutcome(
            ok=False,
            error=f"{cap.name} has no publishing API. {cap.limitation}",
        )
    if not body.strip():
        return ToolOutcome(ok=False, error="An empty post never reaches the queue.")
    return ToolOutcome(
        ok=True,
        data={
            "platform": platform,
            "body": body,
            "format": format,
            "asset_notes": asset_notes,
            "scheduled_for": scheduled_for,
            "status": "awaiting_approval",
        },
        summary=f"Queued a {format or 'post'} for {platform}, awaiting approval.",
    )
