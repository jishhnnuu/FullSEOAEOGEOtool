"""The social measurement core, and the four things it refuses to do.

The refusals are the tests worth having. Any module can produce a number from
nine posts; the value is in not producing one.
"""

from __future__ import annotations

from seoos.analysis.social import (
    BRAND_FLOOR,
    OUTLIER_AT,
    POST_FLOOR,
    AccountProfile,
    Post,
    classify_hook,
    lead_intent,
    read_account,
    share_of_voice,
    strongest_platform,
    what_worked,
)


def _post(i: int, *, kind="image", text="A post", likes=100, comments=10, platform="instagram"):
    return Post(
        id=str(i),
        platform=platform,
        url=f"https://example.com/p/{i}",
        posted_at=f"2026-03-{(i % 27) + 1:02d}T1{i % 9}:00:00Z",
        kind=kind,
        text=text,
        likes=likes,
        comments=comments,
    )


def _profile(posts, *, handle="rival", platform="instagram", followers=20000, unreadable=None):
    return AccountProfile(
        handle=handle, platform=platform, followers=followers, posts=posts, unreadable=unreadable
    )


# ------------------------------------------------------------- the refusals

def test_refuses_a_median_from_too_few_posts():
    read = read_account(_profile([_post(i) for i in range(POST_FLOOR - 1)]))
    assert read.measured is False
    assert str(POST_FLOOR) in read.reason


def test_refuses_an_account_it_could_not_read():
    read = read_account(_profile([], unreadable="TikTok publishes no competitor API."))
    assert read.measured is False
    assert "TikTok" in read.reason


def test_refuses_a_share_of_one():
    read = read_account(_profile([_post(i) for i in range(20)]))
    result = share_of_voice([read])
    assert result["measured"] is False
    assert str(BRAND_FLOOR) in result["reason"]


def test_refuses_an_engagement_rate_without_followers():
    read = read_account(_profile([_post(i) for i in range(20)], followers=None))
    assert read.measured is True
    assert read.engagement_rate.measured is False
    assert read.engagement_rate.value is None


def test_refuses_a_pattern_from_one_winner():
    posts = [_post(i) for i in range(20)]
    posts[0] = _post(99, likes=100_000, comments=9_000)
    read = read_account(_profile(posts))
    assert len(read.winners) == 1
    verdict = what_worked(read)
    assert verdict["measured"] is False
    assert "coincidence" in verdict["reason"]


def test_refuses_a_platform_verdict_on_one_platform():
    read = read_account(_profile([_post(i) for i in range(20)]))
    result = strongest_platform({"instagram": read})
    assert result["measured"] is False


# ------------------------------------------------------------ what it finds

def test_finds_the_format_and_hook_the_winners_share():
    posts = []
    for i in range(30):
        winner = i % 3 == 0
        posts.append(
            _post(
                i,
                kind="reel" if winner else "image",
                text="7 mistakes nobody warns you about" if winner else "New in store today",
                likes=900 if winner else 120,
                comments=90 if winner else 12,
            )
        )
    read = read_account(_profile(posts))
    assert read.measured is True
    assert read.winners, "a 7x median post should clear the bar"
    assert all(w["multiple"] >= OUTLIER_AT for w in read.winners)

    verdict = what_worked(read)
    assert verdict["measured"] is True
    traits = {t["trait"]: t["value"] for t in verdict["traits"]}
    assert traits.get("format") == "reel"
    assert traits.get("hook") == "number"


def test_share_of_voice_separates_loud_from_effective():
    loud = read_account(
        _profile([_post(i, likes=40, comments=2) for i in range(40)], handle="loud", followers=90000)
    )
    effective = read_account(
        _profile([_post(i, likes=2000, comments=300) for i in range(12)], handle="effective", followers=9000)
    )
    result = share_of_voice([loud, effective])
    assert result["measured"] is True
    rows = {r["handle"]: r for r in result["brands"]}
    assert rows["effective"]["share_of_engagement"] > rows["loud"]["share_of_engagement"]
    assert rows["loud"]["efficiency"] < 0
    assert any("not buying attention" in line for line in result["verdict"])


def test_strongest_platform_compares_rates_not_raw_engagement():
    big = read_account(
        _profile([_post(i, likes=1000, comments=50) for i in range(20)],
                 platform="youtube", followers=1_000_000)
    )
    small = read_account(
        _profile([_post(i, likes=500, comments=60) for i in range(20)],
                 platform="instagram", followers=10_000)
    )
    result = strongest_platform({"youtube": big, "instagram": small})
    assert result["measured"] is True
    # The smaller account earns far more per follower, and raw totals would
    # have picked the other one.
    assert result["strongest"] == "instagram"


def test_unreadable_platforms_are_named_rather_than_dropped():
    ok = read_account(_profile([_post(i) for i in range(20)], platform="youtube", followers=50_000))
    blocked = read_account(
        _profile([], platform="tiktok", unreadable="No commercial competitor API exists.")
    )
    second = read_account(_profile([_post(i) for i in range(20)], platform="instagram", followers=20_000))
    result = strongest_platform({"youtube": ok, "tiktok": blocked, "instagram": second})
    assert result["measured"] is True
    assert any(row["platform"] == "tiktok" for row in result["not_scored"])


# ------------------------------------------------------------- the details

def test_hook_archetypes_are_read_from_the_first_line_only():
    assert classify_hook("5 ways to do it\nrest of the caption")[0] == "number"
    assert classify_hook("How to fix this")[0] == "how-to"
    assert classify_hook("Is your pricing wrong?")[0] == "question"
    assert classify_hook("Nobody tells you this")[0] == "contrarian"
    assert classify_hook("")[0] == "none"
    # The device has to be in the hook, not buried three lines down.
    assert classify_hook("New collection\n\n5 ways to style it")[0] == "plain"


def test_lead_intent_counts_machinery_not_leads():
    plain = Post(id="1", platform="instagram", url="u", posted_at="2026-01-01T00:00:00Z",
                 kind="image", text="Nice day", likes=10, comments=1)
    selling = Post(id="2", platform="instagram", url="u", posted_at="2026-01-01T00:00:00Z",
                   kind="image", text="Book a free audit. Link in bio. DM us to start.",
                   likes=10, comments=1)
    assert lead_intent(plain) == 0
    # A call to action and a reply prompt, but no actual link: three of five,
    # because "link in bio" is not a link and the score counts what is there.
    assert lead_intent(selling) == 3

    with_link = Post(id="3", platform="instagram", url="u", posted_at="2026-01-01T00:00:00Z",
                     kind="image", text="Book a free audit at example.com. DM us to start.",
                     likes=400, comments=40)
    assert lead_intent(with_link) == 5


def test_engagement_never_counts_views():
    post = Post(id="1", platform="youtube", url="u", posted_at="2026-01-01T00:00:00Z",
                kind="video", text="t", likes=10, comments=2, shares=3, views=1_000_000)
    assert post.engagement == 15


def test_one_format_gets_no_verdict():
    """A single-format account has a 1x multiple by arithmetic, not by finding."""
    read = read_account(_profile([_post(i, kind="image") for i in range(20)]))
    assert read.measured
    only = read.formats[0]
    assert only["format"] == "image"
    assert only["measured"] is False
    assert "nothing to compare" in only["note"]

    # Two formats, both above the floor, and the comparison is real again.
    mixed = [_post(i, kind="image") for i in range(10)]
    mixed += [_post(i + 10, kind="video", likes=400) for i in range(10)]
    read = read_account(_profile(mixed))
    assert all(f["measured"] for f in read.formats)
    assert read.formats[0]["multiple"] != read.formats[1]["multiple"]


def test_caveats_are_reported_above_every_number():
    """A read made by a lesser route says so before it says anything else."""
    caveat = "Read without a key: the 15 most recent uploads only."
    profile = _profile([_post(i) for i in range(20)])
    profile.caveats = [caveat]
    read = read_account(profile)
    assert read.measured
    assert read.notes[0] == caveat

    # And it survives a refusal, because the reason a read is thin is part of
    # the reason it could not be measured.
    thin = _profile([_post(i) for i in range(4)])
    thin.caveats = [caveat]
    assert read_account(thin).notes[0] == caveat
