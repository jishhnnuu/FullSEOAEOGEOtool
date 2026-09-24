"""The paid desk's gates, and the arithmetic behind them.

As with the social tests, the refusals are the ones worth having. Any module
can produce a media plan; the value is in the plan it declines to produce.
"""

from __future__ import annotations

from seoos.analysis.ad_failures import (
    FAILURES,
    at_stage,
    failure,
    money_risks,
    unconditional_pauses,
)
from seoos.analysis.ad_policy import review, special_category
from seoos.analysis.ad_specs import (
    check_asset,
    check_copy,
    placement,
    required_renders,
    safe_box,
)
from seoos.analysis.ads import (
    CLICK_FLOOR,
    SMART_BIDDING_MONTHLY,
    Measured,
    PlatformResult,
    TrackingSignals,
    budget_viable,
    creative_state,
    expected_outcome,
    find_waste,
    measurement_readiness,
    pacing,
    platform_count_for,
    reconcile,
)
from seoos.connectors.ads import PLATFORMS, access_summary, for_objective

# ----------------------------------------------------------- the gate

def test_no_tracking_blocks_everything():
    """The desk's hard gate. No autonomy level and no plan gets past this."""
    out = measurement_readiness(TrackingSignals())
    assert out.ready is False
    assert out.blocking
    # Blocked means no score at all, because a score invites launching at 80.
    assert out.quality.measured is False
    assert out.quality.value is None


def test_a_tag_that_fires_into_nothing_still_blocks():
    out = measurement_readiness(TrackingSignals(tag_present=True, round_trip_verified=False))
    assert out.ready is False
    assert "did not come back" in out.blocking[0]


def test_readiness_names_every_weakness_rather_than_averaging_them():
    out = measurement_readiness(TrackingSignals(tag_present=True, round_trip_verified=True))
    assert out.ready is True
    # Browser-only, no value, no consent mode, no click id: four separate
    # sentences, not one rounded number.
    assert len(out.degraded) == 4
    assert out.quality.measured is True

    full = measurement_readiness(TrackingSignals(
        tag_present=True, round_trip_verified=True, server_side=True, deduplicated=True,
        value_passed=True, consent_mode=True, click_id_captured=True,
    ))
    assert full.degraded == []
    assert full.quality.value == 100.0


# --------------------------------------------------------- the budget

def test_a_budget_below_the_learning_floor_is_refused():
    """The refusal an agency will not make, because the fee is a share of it."""
    out = budget_viable(600, 75, platforms=3)
    assert out.viable is False
    assert out.implied_monthly.value is not None
    assert out.implied_monthly.value < SMART_BIDDING_MONTHLY
    # A refusal with no remedy is just a complaint.
    assert len(out.remedies) >= 3


def test_the_same_budget_on_one_platform_can_be_viable():
    """Concentration is usually the cheapest fix, so it is offered first."""
    three = budget_viable(2000, 40, platforms=3)
    one = budget_viable(2000, 40, platforms=1)
    assert three.viable is False
    assert one.viable is True
    assert "Run one platform instead of 3" in three.remedies[0]


def test_platform_count_never_returns_zero_or_more_than_the_budget_feeds():
    assert platform_count_for(0, 0) == 1
    assert platform_count_for(600, 75) == 1
    assert platform_count_for(100_000, 50) == 2  # capped by the default ceiling


def test_no_forecast_without_two_measurements():
    """A projection built on assumptions is a sales document."""
    out = expected_outcome(3000, Measured(None, False), Measured(0.02, True))
    assert out.measured is False
    assert "what a click costs" in out.note

    both = expected_outcome(3000, Measured(1.5, True), Measured(0.02, True))
    assert both.measured is True
    assert both.value == 40.0
    # The headline number is a midpoint and the note carries the range.
    assert "Between 28 and 52" in both.note


# --------------------------------------------------------- the pacing

def test_pacing_reads_under_and_over_and_says_what_it_implies():
    on = pacing(500, 1000, 15, 30)
    assert on.state == "on_track"
    assert pacing(900, 1000, 15, 30).state == "over"
    under = pacing(200, 1000, 15, 30)
    assert under.state == "under"
    assert "not a saving" in under.note


# -------------------------------------------------- the double count

def test_platform_conversions_are_never_summed_into_the_answer():
    """The category's great lie, refused in the data structure itself."""
    out = reconcile(
        [
            PlatformResult("google_ads", spend=1000, clicks=800, impressions=20000, claimed_conversions=30),
            PlatformResult("meta_ads", spend=1000, clicks=1200, impressions=90000, claimed_conversions=34),
        ],
        site_conversions=41,
    )
    assert out.claimed_total_if_summed == 64
    # The number a person is meant to act on is the measured one.
    assert out.measured_conversions.value == 41
    assert out.blended_cac.value == round(2000 / 41, 2)
    assert "run the business on is 41" in out.gap_note
    # Each platform keeps its own label so nobody reads it as fact.
    assert all("platform-claimed" in row["label"] for row in out.claimed)


def test_without_the_sites_own_numbers_nothing_is_reconciled():
    out = reconcile(
        [PlatformResult("meta_ads", spend=500, clicks=400, impressions=10000, claimed_conversions=20)],
        site_conversions=None,
    )
    assert out.measured_conversions.measured is False
    assert out.blended_cac.measured is False
    assert "marking its own homework" in out.measured_conversions.note


def test_platforms_claiming_sales_the_site_never_saw_reads_as_broken_tracking():
    out = reconcile(
        [PlatformResult("meta_ads", spend=900, clicks=700, impressions=40000, claimed_conversions=18)],
        site_conversions=0,
    )
    assert "broken tracking" in out.gap_note


# ----------------------------------------------------------- the waste

def test_waste_needs_more_than_three_clicks_before_it_excludes_anything():
    rows = [
        {"kind": "search_term", "name": "cheap free thing", "spend": 400, "clicks": 160, "conversions": 0},
        {"kind": "search_term", "name": "promising term", "spend": 40, "clicks": 3, "conversions": 0},
    ]
    out = find_waste(rows, target_cpa=100)
    assert [w.name for w in out] == ["cheap free thing"]
    assert "negative keyword" in out[0].action
    assert CLICK_FLOOR == 100


def test_something_that_converts_expensively_is_repriced_not_excluded():
    out = find_waste(
        [{"kind": "search_term", "name": "works but pricey", "spend": 900, "clicks": 300, "conversions": 2}],
        target_cpa=100,
    )
    assert len(out) == 1
    assert "Lower the bid" in out[0].action


# -------------------------------------------------------- the creative

def test_a_creative_is_not_judged_before_a_thousand_impressions():
    out = creative_state("a", impressions=400, ctr=0.001, best_ctr=0.02, frequency=1.0, conversions=0)
    assert out.state == "too_early"


def test_fatigue_and_never_worked_are_told_apart():
    fatigued = creative_state("a", impressions=50_000, ctr=0.006, best_ctr=0.014, frequency=3.4, conversions=12)
    assert fatigued.state == "fatigued"

    never = creative_state("b", impressions=40_000, ctr=0.004, best_ctr=0.004, frequency=3.6, conversions=0)
    assert never.state == "failing"
    assert "never worked" in never.note


# ----------------------------------------------------------- the specs

def test_one_render_serves_several_placements_and_takes_the_tighter_safe_zone():
    renders = required_renders(["meta_ads", "tiktok_ads", "google_ads"])
    sizes = {(p.width, p.height) for p in renders}
    # Stories, Shorts and TikTok all want 1080x1920 and get one render.
    assert (1080, 1920) in sizes
    assert len(renders) == len(sizes)


def test_the_reels_safe_box_says_how_much_of_the_frame_is_covered():
    box = safe_box(placement("meta_story"))
    # Nearly half the frame is platform interface. An advert that does not
    # know this puts its price behind the caption.
    assert box["covered_fraction"] > 0.4
    assert box["y"] > 0


def test_copy_over_a_limit_shows_what_would_be_cut():
    problems = check_copy(placement("google_rsa"), {"headline": "x" * 48})
    assert problems and problems[0].blocking is True
    assert "18 would be cut" in problems[0].problem


def test_an_asset_is_checked_before_it_is_uploaded_not_after():
    problems = check_asset(placement("meta_feed_square"), width=600, height=900, size_mb=40, fmt="gif")
    kinds = {p.field for p in problems}
    assert {"format", "size", "ratio", "resolution"} <= kinds
    assert any(p.blocking for p in problems)


# ---------------------------------------------------------- the policy

def test_copy_that_would_restrict_the_account_is_never_submitted():
    out = review({"primary_text": "Struggling with debt? Guaranteed relief."}, "meta_ads")
    assert out.can_submit is False
    rules = {b.rule for b in out.blocks}
    assert "personal_attributes" in rules
    assert "guaranteed_outcome" in rules
    # The reason is the platform's, not ours, so it can be argued with.
    assert "Meta prohibits" in next(b.why for b in out.blocks if b.rule == "personal_attributes")


def test_a_rule_firing_in_three_fields_is_reported_once():
    out = review({"a": "guaranteed", "b": "guaranteed", "c": "guaranteed"})
    assert len([b for b in out.blocks if b.rule == "guaranteed_outcome"]) == 1


def test_a_clean_ad_is_not_promised_approval():
    out = review({"headline": "Bookkeeping for builders", "description": "Fixed monthly fee."})
    assert out.can_submit is True
    assert "not a guarantee of approval" in out.note


def test_restricted_categories_err_toward_declaring():
    # Wider than the other rules on purpose: over-declaring costs a campaign's
    # targeting, under-declaring costs the ad account.
    assert special_category("Debt consolidation from 4.9% APR") == "credit"
    assert special_category("We're hiring a site manager") == "employment"
    assert special_category("Two-bed apartments for rent in Leeds") == "housing"
    assert special_category("Handmade ceramic mugs") is None


# --------------------------------------------------------- the failures

def test_every_failure_says_what_happens_rather_than_logging_it():
    assert len(FAILURES) >= 25
    for f in FAILURES:
        assert f.detect and f.respond and f.tell
        assert f.severity in ("money", "blocked", "degraded", "cosmetic")
        assert f.stage in ("connect", "plan", "build", "launch", "run", "report")


def test_only_three_things_pause_spending_without_asking():
    """Pausing somebody's advertising unasked needs a very short list."""
    assert set(unconditional_pauses()) == {"landing_page_down", "spend_no_conversions", "overspend"}
    for code in unconditional_pauses():
        assert failure(code).severity == "money"


def test_the_measurement_gate_states_that_it_has_no_fallback():
    """Every other failure degrades to something. This one refuses, in writing."""
    gate = failure("tracking_absent")
    assert gate.severity == "money"
    assert gate.fallback.startswith("None, deliberately")
    # And the refusal is the product's own argument, not a limitation.
    assert "the thing this product exists to replace" in gate.fallback


def test_a_partial_build_can_never_leave_something_spending():
    partial = failure("partial_build")
    assert partial.severity == "money"
    assert "paused" in partial.respond
    assert "reverse order" in partial.respond


def test_failures_cover_every_stage_of_the_work():
    for stage in ("connect", "plan", "build", "launch", "run", "report"):
        assert at_stage(stage), f"no failures catalogued at {stage}"
    assert len(money_risks()) >= 5


# ------------------------------------------------------- the platforms

def test_the_advertiser_never_handles_a_credential():
    summary = access_summary()
    assert summary["user_ever_handles_a_credential"] is False
    for p in PLATFORMS:
        # Every platform is reached by a login, and every scope has a reason
        # written for the person reading the consent screen.
        assert p.oauth_scopes
        assert p.scope_reasons
        assert p.app_requirements, f"{p.key} claims to need nothing from us, which is never true"
        assert p.user_action


def test_nothing_claims_to_be_live_before_its_approval_exists():
    for p in PLATFORMS:
        assert p.status in ("live", "pending_review", "planned")


def test_both_objectives_have_platforms_worth_the_money():
    assert len(for_objective("lead_gen")) >= 4
    assert len(for_objective("ecommerce")) >= 4
