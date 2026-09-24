"""Measured social: what actually worked, and what nobody can know.

The single fact that shapes this entire module: **impressions and reach are
private on every platform.** Meta, YouTube, TikTok and X expose them only to
the account owner, through that owner's own token. No API, no scraper and no
vendor can give you a competitor's impressions. Every tool in this category
that shows you one is estimating from follower count and engagement, and
almost none of them say so.

So this measures what is genuinely public, and says plainly what is not. The
honest comparable is not impressions. It is the **performance multiple**: a
post's engagement divided by that account's own median. It removes follower
count from the comparison entirely, which is what makes a 4,000-follower
account's winner legible next to a 400,000-follower account's, and it is what
a strategist actually computes by hand before saying "this one worked".

Nothing here calls a model. It is counting, ratios and medians, so the same
numbers come out twice and the browser engine can run the identical logic.
"""

from __future__ import annotations

import math
import re
import statistics
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime

# ---------------------------------------------------------------- thresholds
#
# These are the floors below which a verdict is one post's luck rather than a
# pattern. They are set from what a practitioner would accept in a pitch, and
# every one of them is enforced rather than described.

#: Posts needed before an account's median means anything.
POST_FLOOR = 12
#: Engagement multiple of the account's own median that counts as a winner.
OUTLIER_AT = 2.0
#: Winners needed before a shared trait is called a pattern.
PATTERN_FLOOR = 3
#: Posts in one format before that format gets a verdict.
FORMAT_FLOOR = 4
#: Brands with readable data before share of voice is computed.
BRAND_FLOOR = 2
#: Comments on a post before its comment-to-like ratio is worth reading.
_COMMENT_FLOOR = 10

_WORD = re.compile(r"[A-Za-z0-9''#@]+")
_URL = re.compile(r"https?://\S+|\b[a-z0-9-]+\.(?:com|co|io|app|uk|net|org)\b", re.I)
_HASHTAG = re.compile(r"#\w+")
_MENTION = re.compile(r"@\w+")
_QUESTION = re.compile(r"\?")

# Lead intent, as a social strategist reads it off a caption. None of this is
# a lead count. It is the presence of the machinery a business uses to turn
# attention into a conversation, which is a different and honest claim.
_CTA = re.compile(
    r"\b(link in bio|link below|dm (?:me|us)|message (?:me|us)|comment (?:below|)\w*|"
    r"book a|get a quote|free (?:trial|demo|consult\w*|guide|audit|template)|"
    r"sign ?up|register|apply now|enquire|inquire|call us|whats ?app|"
    r"swipe up|tap the link|download|claim your|limited spots?)\b", re.I,
)
_SAVE_BAIT = re.compile(r"\b(save this|bookmark|keep this|screenshot this|steal this)\b", re.I)
_SHARE_BAIT = re.compile(r"\b(share this|send this to|tag (?:a|someone|your))\b", re.I)

# Hook archetypes, in the order a strategist would test them. The first line
# of a caption or a video title is the hook; everything after it is read only
# if the hook worked.
_HOOKS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    ("number", re.compile(r"^\W*\d+\s+\w"), "Opens with a count, which promises a finite read"),
    ("how-to", re.compile(r"^\W*(how (?:to|i|we)|the way to)\b", re.I), "Promises a method"),
    ("question", re.compile(r"^[^.!?]{0,90}\?"), "Opens on a question the reader has to resolve"),
    ("mistake", re.compile(r"\b(mistake|wrong|stop doing|never|don'?t|avoid|worst)\b", re.I),
     "Names an error, which reads as a warning rather than a pitch"),
    ("contrarian", re.compile(r"\b(nobody|no ?one|everyone (?:is|gets)|unpopular|actually|myth|truth about)\b", re.I),
     "Contradicts the consensus"),
    ("result", re.compile(r"\b(\d+[kKmM%]|\$\d|£\d|€\d|₹\d)\b"),
     "Leads with a figure, which is the cheapest proof available"),
    ("story", re.compile(r"^\W*(i |we |my |our |last (?:week|month|year)|when i|the day)", re.I),
     "First person, which buys attention that a claim does not"),
    ("list", re.compile(r"\b(here(?:'| i)s|these are|things? (?:i|we|you))\b", re.I), "Promises a list"),
    ("urgency", re.compile(r"\b(today|right now|before|deadline|last chance|closing)\b", re.I), "Time pressure"),
)


@dataclass
class Post:
    """One public post, with only the fields every platform actually gives.

    `impressions` is deliberately absent. It is not an oversight and it is not
    a field waiting to be filled: no platform exposes it for an account you do
    not own, so carrying the field at all would invite a screen to render it.
    """

    id: str
    platform: str
    url: str
    posted_at: str          # ISO 8601
    kind: str               # video | reel | short | image | carousel | text | link
    text: str               # caption, title, or body
    likes: int = 0
    comments: int = 0
    shares: int | None = None
    views: int | None = None   # public on YouTube and TikTok, absent on IG
    duration_s: int | None = None

    @property
    def engagement(self) -> int:
        """Likes plus comments plus shares where the platform publishes them.

        Views are excluded on purpose. A view is a distribution outcome and an
        engagement is an audience decision, and adding them together makes a
        video platform look better than an image one for reasons that have
        nothing to do with the work.
        """
        return self.likes + self.comments + (self.shares or 0)

    @property
    def hook(self) -> str:
        """The first line. On every platform this is what decides the rest."""
        for line in (self.text or "").splitlines():
            if line.strip():
                return line.strip()
        return ""


@dataclass
class AccountProfile:
    """Everything public about one account on one platform."""

    handle: str
    platform: str
    followers: int | None = None
    posts: list[Post] = field(default_factory=list)
    #: Why this account could not be read, when it could not be.
    unreadable: str | None = None
    #: What is wrong with this read, when a lesser route produced it. A
    #: keyless feed returns fewer posts and fewer fields than the platform's
    #: real API, and that difference has to travel with the numbers.
    caveats: list[str] = field(default_factory=list)


@dataclass
class Measured:
    """A number, and whether anybody actually measured it."""

    value: float | None
    measured: bool
    note: str = ""

    def as_dict(self) -> dict:
        return {"value": None if self.value is None else round(self.value, 3),
                "measured": self.measured, "note": self.note}


def _median(xs: list[float]) -> float:
    return statistics.median(xs) if xs else 0.0


def _iso_day(iso: str) -> tuple[int, int] | None:
    """Weekday and hour in UTC. Local time is unknowable for a competitor."""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(UTC)
    except (ValueError, TypeError):
        return None
    return dt.weekday(), dt.hour


def classify_hook(text: str) -> tuple[str, str]:
    """Which archetype the first line uses, and why that archetype works."""
    first = ""
    for line in (text or "").splitlines():
        if line.strip():
            first = line.strip()
            break
    if not first:
        return "none", "No caption, so the thumbnail or the first frame is the whole hook"
    for name, pattern, why in _HOOKS:
        if pattern.search(first):
            return name, why
    return "plain", "States the subject without a device, which relies entirely on the visual"


def lead_intent(post: Post) -> int:
    """How hard this post tries to start a conversation. Zero to five.

    This is not leads. Nobody outside the business can count a competitor's
    leads, and a tool claiming otherwise is guessing. This counts the
    machinery: a call to action, a route off-platform, a prompt to reply. A
    business running social for leads leaves this everywhere. One running it
    for reach does not.
    """
    text = post.text or ""
    score = 0
    if _CTA.search(text):
        score += 2
    if _URL.search(text):
        score += 1
    if re.search(r"\b(dm|message|comment)\b", text, re.I):
        score += 1
    # An unusually chatty ratio means people are asking things, which is what
    # an enquiry looks like before it becomes one. It needs an absolute floor:
    # one comment on ten likes is a 0.1 ratio and it is also just one comment,
    # and reading intent off that is reading noise.
    if post.comments >= _COMMENT_FLOOR and post.comments / max(post.likes, 1) > 0.06:
        score += 1
    return min(score, 5)


# --------------------------------------------------------------- the account

@dataclass
class AccountRead:
    """One account, measured. The unit every comparison is built from."""

    handle: str
    platform: str
    followers: int | None
    posts_read: int
    measured: bool
    reason: str = ""

    median_engagement: float = 0.0
    mean_engagement: float = 0.0
    engagement_rate: Measured = field(default_factory=lambda: Measured(None, False))
    posts_per_week: Measured = field(default_factory=lambda: Measured(None, False))
    comment_ratio: float = 0.0
    lead_intent_mean: float = 0.0

    winners: list[dict] = field(default_factory=list)
    formats: list[dict] = field(default_factory=list)
    hooks: list[dict] = field(default_factory=list)
    best_windows: list[dict] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "handle": self.handle,
            "platform": self.platform,
            "followers": self.followers,
            "posts_read": self.posts_read,
            "measured": self.measured,
            "reason": self.reason,
            "median_engagement": round(self.median_engagement, 1),
            "mean_engagement": round(self.mean_engagement, 1),
            "engagement_rate": self.engagement_rate.as_dict(),
            "posts_per_week": self.posts_per_week.as_dict(),
            "comment_ratio": round(self.comment_ratio, 4),
            "lead_intent_mean": round(self.lead_intent_mean, 2),
            "winners": self.winners,
            "formats": self.formats,
            "hooks": self.hooks,
            "best_windows": self.best_windows,
            "notes": self.notes,
        }


def read_account(profile: AccountProfile) -> AccountRead:
    """Measure one account from its public posts.

    Under twelve posts the median is not a median, it is a small number, and
    everything derived from it would inherit that. The read says so and stops
    rather than producing a confident teardown of nine posts.
    """
    out = AccountRead(
        handle=profile.handle,
        platform=profile.platform,
        followers=profile.followers,
        posts_read=len(profile.posts),
        measured=False,
    )

    # Caveats come first, before any number, for the same reason coverage is
    # printed above a score: a limit read after the conclusion is a footnote,
    # and a footnote is not a disclosure.
    out.notes.extend(profile.caveats)

    if profile.unreadable:
        out.reason = profile.unreadable
        out.notes.append(profile.unreadable)
        return out

    posts = [p for p in profile.posts if p.posted_at]
    if len(posts) < POST_FLOOR:
        out.reason = (
            f"Only {len(posts)} posts could be read. {POST_FLOOR} is the floor for a median "
            "that means anything, and every judgement below one would inherit the noise."
        )
        out.notes.append(out.reason)
        return out

    out.measured = True
    engagements = [float(p.engagement) for p in posts]
    out.median_engagement = _median(engagements)
    out.mean_engagement = statistics.fmean(engagements)

    total_likes = sum(p.likes for p in posts)
    total_comments = sum(p.comments for p in posts)
    out.comment_ratio = total_comments / max(total_likes, 1)
    out.lead_intent_mean = statistics.fmean([lead_intent(p) for p in posts])

    # Engagement rate needs a follower count, which some platforms withhold.
    if profile.followers and profile.followers > 0:
        out.engagement_rate = Measured(
            (out.median_engagement / profile.followers) * 100, True,
            "Median engagement as a percentage of followers. The comparable practitioners use.",
        )
    else:
        out.engagement_rate = Measured(
            None, False, "No public follower count on this platform, so the rate cannot be computed.",
        )

    # Cadence, from the span the read actually covers.
    stamps = sorted(p.posted_at for p in posts)
    try:
        d0 = datetime.fromisoformat(stamps[0].replace("Z", "+00:00"))
        d1 = datetime.fromisoformat(stamps[-1].replace("Z", "+00:00"))
        weeks = max((d1 - d0).days / 7.0, 0.14)
        out.posts_per_week = Measured(len(posts) / weeks, True, f"Across {(d1 - d0).days} days of posts read.")
    except (ValueError, TypeError):
        out.posts_per_week = Measured(None, False, "Timestamps could not be parsed.")

    # The winners. A post at twice this account's own median is a post that
    # worked for this account, whatever the follower count is.
    threshold = out.median_engagement * OUTLIER_AT
    winners = [p for p in posts if p.engagement >= threshold and out.median_engagement > 0]
    winners.sort(key=lambda p: p.engagement, reverse=True)
    for p in winners[:10]:
        kind, why = classify_hook(p.text)
        out.winners.append({
            "url": p.url,
            "posted_at": p.posted_at,
            "format": p.kind,
            "multiple": round(p.engagement / out.median_engagement, 2),
            "engagement": p.engagement,
            "likes": p.likes,
            "comments": p.comments,
            "views": p.views,
            "hook": p.hook[:180],
            "hook_type": kind,
            "hook_why": why,
            "lead_intent": lead_intent(p),
        })

    # Format. Only formats with enough posts behind them get a verdict.
    by_format: dict[str, list[float]] = {}
    for p in posts:
        by_format.setdefault(p.kind or "unknown", []).append(float(p.engagement))
    # One format is not a comparison. An account that posts nothing but video
    # has a video multiple of exactly 1x against its own median, by arithmetic,
    # and printing that as a finding is printing a tautology as insight.
    one_format = len(by_format) < 2
    for kind, values in sorted(by_format.items(), key=lambda kv: -len(kv[1])):
        entry = {
            "format": kind,
            "posts": len(values),
            "median": round(_median(values), 1),
            "share_of_posts": round(len(values) / len(posts), 3),
        }
        if not one_format and len(values) >= FORMAT_FLOOR and out.median_engagement > 0:
            entry["multiple"] = round(_median(values) / out.median_engagement, 2)
            entry["measured"] = True
        elif one_format:
            entry["measured"] = False
            entry["note"] = "Every post read is this format, so there is nothing to compare it against."
        else:
            entry["measured"] = False
            entry["note"] = f"Only {len(values)} posts in this format. {FORMAT_FLOOR} is the floor."
        out.formats.append(entry)

    # Hooks. Which opening they use, and whether it is the one that wins.
    hook_counts: Counter[str] = Counter()
    hook_eng: dict[str, list[float]] = {}
    for p in posts:
        kind, _ = classify_hook(p.text)
        hook_counts[kind] += 1
        hook_eng.setdefault(kind, []).append(float(p.engagement))
    for kind, count in hook_counts.most_common():
        entry = {"hook_type": kind, "posts": count, "median": round(_median(hook_eng[kind]), 1)}
        if count >= PATTERN_FLOOR and out.median_engagement > 0:
            entry["multiple"] = round(_median(hook_eng[kind]) / out.median_engagement, 2)
            entry["measured"] = True
        else:
            entry["measured"] = False
            entry["note"] = f"Only {count} posts open this way. {PATTERN_FLOOR} is the floor."
        out.hooks.append(entry)

    # Posting windows, in UTC. A competitor's local timezone is not knowable,
    # so the window is reported in UTC and labelled, rather than guessed at.
    windows: dict[tuple[int, int], list[float]] = {}
    for p in posts:
        slot = _iso_day(p.posted_at)
        if slot:
            windows.setdefault((slot[0], slot[1] // 3 * 3), []).append(float(p.engagement))
    days = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    ranked = sorted(
        (w for w in windows.items() if len(w[1]) >= 2),
        key=lambda kv: _median(kv[1]), reverse=True,
    )
    for (day, hour), values in ranked[:3]:
        out.best_windows.append({
            "day": days[day],
            "hour_utc": hour,
            "posts": len(values),
            "median": round(_median(values), 1),
            "multiple": round(_median(values) / out.median_engagement, 2) if out.median_engagement else None,
        })
    if not out.best_windows:
        out.notes.append("No posting window had two posts in it, so timing is not called.")

    if not winners:
        out.notes.append(
            "Nothing cleared twice the median. This account is consistent rather than spiky, "
            "which is a finding: there is no breakout format to copy."
        )
    elif len(winners) < PATTERN_FLOOR:
        out.notes.append(
            f"Only {len(winners)} posts cleared the bar. That is enough to look at and not enough "
            "to call a pattern, so the traits below are observations rather than a playbook."
        )
    return out


# ------------------------------------------------------------ what worked

def what_worked(read: AccountRead) -> dict:
    """The traits the winners share, where enough winners share them.

    This is the question the client is actually asking, and it is the one most
    social tools answer with a leaderboard of top posts and no analysis. A
    leaderboard tells you which post won. This tells you what the winners have
    in common, which is the only part you can act on.
    """
    if not read.measured:
        return {"measured": False, "reason": read.reason, "traits": []}
    if len(read.winners) < PATTERN_FLOOR:
        return {
            "measured": False,
            "reason": (
                f"{len(read.winners)} posts cleared {OUTLIER_AT}x the median and {PATTERN_FLOOR} is the "
                "floor for calling a shared trait a pattern rather than a coincidence."
            ),
            "traits": [],
        }

    traits: list[dict] = []
    winners = read.winners

    fmt = Counter(w["format"] for w in winners)
    top_fmt, top_fmt_n = fmt.most_common(1)[0]
    if top_fmt_n / len(winners) >= 0.5:
        base = next((f for f in read.formats if f["format"] == top_fmt), None)
        traits.append({
            "trait": "format",
            "value": top_fmt,
            "share_of_winners": round(top_fmt_n / len(winners), 2),
            "evidence": f"{top_fmt_n} of {len(winners)} winners are {top_fmt}."
                        + (f" That format runs at {base['multiple']}x their own median overall."
                           if base and base.get("measured") else ""),
        })

    hooks = Counter(w["hook_type"] for w in winners)
    top_hook, top_hook_n = hooks.most_common(1)[0]
    if top_hook_n >= PATTERN_FLOOR and top_hook != "plain":
        why = next((w["hook_why"] for w in winners if w["hook_type"] == top_hook), "")
        traits.append({
            "trait": "hook",
            "value": top_hook,
            "share_of_winners": round(top_hook_n / len(winners), 2),
            "evidence": f"{top_hook_n} of {len(winners)} winners open this way. {why}.",
        })

    win_intent = statistics.fmean([w["lead_intent"] for w in winners])
    if abs(win_intent - read.lead_intent_mean) >= 0.8:
        direction = "more" if win_intent > read.lead_intent_mean else "less"
        traits.append({
            "trait": "lead intent",
            "value": f"{direction} than their average post",
            "share_of_winners": None,
            "evidence": (
                f"Winners score {win_intent:.1f} out of 5 on call-to-action machinery against "
                f"{read.lead_intent_mean:.1f} across everything. "
                + ("Their best posts sell harder, not softer."
                   if win_intent > read.lead_intent_mean
                   else "Their best posts are the ones that ask for nothing.")
            ),
        })

    lengths = [len(w["hook"]) for w in winners]
    if lengths and statistics.pstdev(lengths) < 30:
        traits.append({
            "trait": "hook length",
            "value": f"about {int(statistics.fmean(lengths))} characters",
            "share_of_winners": None,
            "evidence": "The winning hooks are consistently the same length, which usually means "
                        "a template rather than an accident.",
        })

    return {
        "measured": True,
        "reason": "",
        "winner_count": len(winners),
        "threshold": f"{OUTLIER_AT}x this account's own median engagement",
        "traits": traits,
    }


# ---------------------------------------------------------- share of voice

def share_of_voice(reads: list[AccountRead]) -> dict:
    """Who owns the conversation on one platform, and who is efficient at it.

    Two numbers, because one is misleading. Share of posts is how loud a brand
    is. Share of engagement is how much anybody cared. A brand with 40% of the
    posts and 12% of the engagement is not winning, it is shouting, and that
    gap is the most useful single figure in a competitive social review.
    """
    usable = [r for r in reads if r.measured]
    if len(usable) < BRAND_FLOOR:
        return {
            "measured": False,
            "reason": (
                f"Only {len(usable)} of {len(reads)} accounts could be measured, and "
                f"{BRAND_FLOOR} is the floor for a share. A share of one is not a share."
            ),
            "platform": reads[0].platform if reads else "",
            "brands": [],
        }

    total_posts = sum(r.posts_read for r in usable)
    total_eng = sum(r.median_engagement * r.posts_read for r in usable)
    rows = []
    for r in usable:
        eng = r.median_engagement * r.posts_read
        post_share = r.posts_read / total_posts if total_posts else 0.0
        eng_share = eng / total_eng if total_eng else 0.0
        rows.append({
            "handle": r.handle,
            "followers": r.followers,
            "posts_read": r.posts_read,
            "share_of_posts": round(post_share, 3),
            "share_of_engagement": round(eng_share, 3),
            # Positive means they earn more attention than their volume buys.
            "efficiency": round(eng_share - post_share, 3),
            "engagement_rate": r.engagement_rate.as_dict(),
            "median_engagement": round(r.median_engagement, 1),
        })
    rows.sort(key=lambda row: row["share_of_engagement"], reverse=True)

    verdict = []
    leader = rows[0]
    verdict.append(
        f"{leader['handle']} takes {leader['share_of_engagement'] * 100:.0f}% of the engagement "
        f"from {leader['share_of_posts'] * 100:.0f}% of the posts."
    )
    loud = [r for r in rows if r["efficiency"] <= -0.08]
    for row in loud:
        verdict.append(
            f"{row['handle']} publishes {row['share_of_posts'] * 100:.0f}% of the posts and takes "
            f"{row['share_of_engagement'] * 100:.0f}% of the engagement. Volume is not buying attention."
        )

    return {
        "measured": True,
        "reason": "",
        "platform": usable[0].platform,
        "sample": f"{total_posts} posts across {len(usable)} accounts",
        "brands": rows,
        "verdict": verdict,
        "caveat": (
            "Shares are of the posts this read covered, not of the whole platform. Nobody can see "
            "the whole platform, and a tool that implies it can is estimating."
        ),
    }


# -------------------------------------------------------- platform verdict

def strongest_platform(reads_by_platform: dict[str, AccountRead]) -> dict:
    """Where one brand is actually strongest, and why.

    Comparing raw engagement across platforms is meaningless: a YouTube like
    and an Instagram like cost the viewer different amounts of effort and the
    audiences are different sizes. Engagement rate against their own follower
    base is the only comparison that survives, and where a platform withholds
    the follower count there is no comparison to make and the function says so.
    """
    scored = []
    unscored = []
    for platform, read in reads_by_platform.items():
        if not read.measured:
            unscored.append({"platform": platform, "reason": read.reason})
            continue
        if not read.engagement_rate.measured or read.engagement_rate.value is None:
            unscored.append({"platform": platform, "reason": read.engagement_rate.note})
            continue
        scored.append({
            "platform": platform,
            "engagement_rate": round(read.engagement_rate.value, 3),
            "followers": read.followers,
            "posts_read": read.posts_read,
            "posts_per_week": read.posts_per_week.as_dict(),
            "lead_intent_mean": round(read.lead_intent_mean, 2),
            "comment_ratio": round(read.comment_ratio, 4),
        })

    if len(scored) < 2:
        return {
            "measured": False,
            "reason": (
                f"{len(scored)} platforms had both a follower count and enough posts. Two is the "
                "floor for saying one is stronger than another."
            ),
            "ranked": scored,
            "not_scored": unscored,
        }

    scored.sort(key=lambda row: row["engagement_rate"], reverse=True)
    best, second = scored[0], scored[1]
    gap = best["engagement_rate"] / second["engagement_rate"] if second["engagement_rate"] else math.inf
    why = []
    if gap >= 1.5:
        why.append(
            f"{best['platform']} earns {best['engagement_rate']:.2f}% against "
            f"{second['engagement_rate']:.2f}% on {second['platform']}, which is a real gap rather than noise."
        )
    else:
        why.append(
            f"{best['platform']} leads on engagement rate but only by {gap:.2f}x, which is inside "
            "the range a quarter of different posting could move. Treat them as level."
        )
    chatty = max(scored, key=lambda row: row["comment_ratio"])
    why.append(
        f"{chatty['platform']} draws the most comments per like at {chatty['comment_ratio']:.3f}, "
        "which is where conversations start and therefore where enquiries come from."
    )
    intent = max(scored, key=lambda row: row["lead_intent_mean"])
    why.append(
        f"{intent['platform']} carries the most call-to-action machinery at "
        f"{intent['lead_intent_mean']:.1f} out of 5. That is where they are trying to convert, "
        "which is not the same as where they succeed, and nobody outside the business can see which."
    )

    return {
        "measured": True,
        "reason": "",
        "strongest": best["platform"],
        "ranked": scored,
        "not_scored": unscored,
        "why": why,
        "caveat": (
            "Strongest means best engagement rate against their own audience on the posts read. It "
            "does not mean most revenue, and no public data can tell you that."
        ),
    }
