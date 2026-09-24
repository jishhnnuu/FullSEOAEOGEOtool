"""Paid media: what the desk can find out, decide, build, and refuse.

Every tool here that touches money is gated twice. The risk level sets an
autonomy floor, and the tags that matter are in ``ALWAYS_HUMAN``, which no
autonomy level overrides. A campaign launch and a budget rise are the two
actions in this product that convert a mistake directly into an invoice, so
both need a person however confident the agent is.

The read-only tools are deliberately generous, because the expensive failures
in paid media are all failures of not looking first: bidding on terms the site
already ranks first for, building into an account with no billing, writing an
offer the landing page does not mention, spending a month's budget on a target
the budget cannot reach.
"""

from __future__ import annotations

from seoos.analysis.ad_failures import FAILURES, at_stage, unconditional_pauses
from seoos.analysis.ad_policy import review as policy_review
from seoos.analysis.ad_specs import check_asset, check_copy, placement, required_renders, safe_box
from seoos.analysis.ads import (
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
from seoos.connectors.ads import platform as lookup_platform
from seoos.tools._helpers import array, boolean, integer, number, obj, schema, string
from seoos.tools.registry import ToolContext, ToolOutcome, tool

_PLATFORM_KEYS = [p.key for p in PLATFORMS]
_OBJECTIVES = ["lead_gen", "ecommerce"]


# ------------------------------------------------------------ read first

@tool(
    "ads.platforms",
    """What each advertising platform allows, what the advertiser has to do, and
    what we have to clear first.

    Call this before promising anything. The advertiser's half is always the
    same: one button, a login on the platform's own site, a consent screen.
    Our half differs per platform and is the reason a platform is not yet
    live. Never tell a client a platform is available before this says so.""",
    schema(
        platform_=string("One platform, or empty for the whole map", enum=_PLATFORM_KEYS),
        objective_=string("Narrow to platforms worth money for this kind of business", enum=_OBJECTIVES),
    ),
    category="ads",
)
async def ads_platforms(
    ctx: ToolContext, platform: str | None = None, objective: str | None = None
) -> ToolOutcome:
    if platform:
        found = lookup_platform(platform)
        if found is None:
            return ToolOutcome(ok=False, error=f"{platform} is not a platform this desk knows about.")
        return ToolOutcome(
            ok=True,
            data={
                "key": found.key, "name": found.name, "status": found.status,
                "user_action": found.user_action,
                "oauth_scopes": list(found.oauth_scopes),
                "scope_reasons": list(found.scope_reasons),
                "app_requirements": list(found.app_requirements),
                "review_time": found.review_time, "sandbox": found.sandbox,
                "writes": list(found.writes), "cannot": list(found.cannot),
                "objectives": list(found.objectives),
                "lead_forms": found.lead_forms, "product_feed": found.product_feed,
                "offline_conversions": found.offline_conversions,
                "server_events": found.server_events, "worth_it": found.worth_it,
            },
            summary=f"{found.name}: {found.status}. {found.worth_it}",
        )

    chosen = for_objective(objective) if objective else PLATFORMS
    summary = access_summary()
    return ToolOutcome(
        ok=True,
        data={
            "access": summary,
            "platforms": [
                {
                    "key": p.key, "name": p.name, "status": p.status,
                    "objectives": list(p.objectives), "lead_forms": p.lead_forms,
                    "product_feed": p.product_feed, "server_events": p.server_events,
                    "worth_it": p.worth_it, "review_time": p.review_time,
                }
                for p in chosen
            ],
        },
        summary=(
            f"{len(chosen)} platforms. The advertiser never handles a credential on any of them. "
            f"{summary['live']} are live; the rest are waiting on our own application, not on engineering."
        ),
    )


@tool(
    "ads.measurement_check",
    """Whether this account may spend money yet.

    The desk's hard gate, and the one refusal with no fallback. A platform
    optimising toward a conversion it cannot see does worse than one given no
    target at all, so an account without verified tracking does not get a
    reduced service, it gets a blocked one. Everything here is observed rather
    than asked: a questionnaire answer is not evidence, and the commonest way
    tracking is broken is that somebody believes it works.""",
    schema(
        tag_present=boolean("A conversion tag was found and fired in a test load"),
        round_trip_verified=boolean("A test conversion was sent and read back from the platform"),
        server_side_=boolean("Server-side events are configured"),
        deduplicated_=boolean("Browser and server events share an id"),
        value_passed_=boolean("A currency value travels with the conversion"),
        consent_mode_=boolean("Consent Mode v2 or equivalent is configured"),
        serves_eea_=boolean("The advertiser sells into the UK or the EEA"),
        click_id_captured_=boolean("The click id is captured and stored on form submit"),
        objective_=string("What the account is for", enum=_OBJECTIVES),
    ),
    category="ads",
)
async def ads_measurement_check(
    ctx: ToolContext,
    tag_present: bool,
    round_trip_verified: bool,
    server_side: bool = False,
    deduplicated: bool = False,
    value_passed: bool = False,
    consent_mode: bool = False,
    serves_eea: bool = True,
    click_id_captured: bool = False,
    objective: str = "lead_gen",
) -> ToolOutcome:
    out = measurement_readiness(TrackingSignals(
        tag_present=tag_present, round_trip_verified=round_trip_verified,
        server_side=server_side, deduplicated=deduplicated, value_passed=value_passed,
        consent_mode=consent_mode, serves_eea=serves_eea,
        click_id_captured=click_id_captured, objective=objective,
    ))
    return ToolOutcome(
        ok=True,
        data=out.as_dict(),
        summary=(
            out.blocking[0] if out.blocking
            else f"Cleared to spend. {len(out.degraded)} measurement weaknesses named rather than averaged."
        ),
    )


@tool(
    "ads.budget_check",
    """Whether a budget can buy what it is being asked to buy.

    The refusal an agency will not make, because its fee is a percentage of
    the budget. Automated bidding needs roughly thirty conversions a month per
    platform to fit a model. Below that the platform is guessing, the campaign
    underperforms for structural reasons, and the postmortem blames the
    creative. Returns the arithmetic and the remedies in the order worth
    trying, concentration first.""",
    schema(
        monthly_budget=number("The monthly budget, in the account's currency"),
        target_cpa=number("What one conversion is worth paying for"),
        platforms_=integer("How many platforms the budget would be split across", minimum=1, maximum=9),
    ),
    category="ads",
)
async def ads_budget_check(
    ctx: ToolContext, monthly_budget: float, target_cpa: float, platforms: int = 1
) -> ToolOutcome:
    out = budget_viable(monthly_budget, target_cpa, platforms)
    affordable = platform_count_for(monthly_budget, target_cpa)
    return ToolOutcome(
        ok=True,
        data={**out.as_dict(), "platforms_this_budget_feeds": affordable},
        summary=out.reason,
    )


@tool(
    "ads.forecast",
    """Conversions a month, as a range, or nothing at all.

    Refuses rather than guesses when the click cost or the conversion rate has
    not been measured on this account. A projection built on two assumptions
    is a sales document, and this desk does not produce those. Where both are
    measured the range is plus or minus thirty per cent, which is the honest
    width of a forecast from historic account data.""",
    schema(
        monthly_budget=number("The monthly budget"),
        cost_per_click_=number("Measured cost per click. Omit if it has not been measured"),
        conversion_rate_=number("Measured conversion rate as a fraction. Omit if unmeasured"),
    ),
    category="ads",
)
async def ads_forecast(
    ctx: ToolContext,
    monthly_budget: float,
    cost_per_click: float | None = None,
    conversion_rate: float | None = None,
) -> ToolOutcome:
    out = expected_outcome(
        monthly_budget,
        Measured(cost_per_click, cost_per_click is not None),
        Measured(conversion_rate, conversion_rate is not None),
    )
    return ToolOutcome(ok=True, data=out.as_dict(), summary=out.note)


# --------------------------------------------------------------- creative

@tool(
    "ads.creative_specs",
    """Every image size a campaign on these platforms needs, with the safe zones.

    One render serves several placements, so this returns the distinct sizes
    rather than a list per platform. The safe zone is the part of the frame the
    platform's own interface does not cover: nearly half a Reels frame is
    caption, profile and buttons, and a centre crop puts the price behind them.
    The preview in every ad manager shows it looking fine.""",
    schema(platforms=array("Platform keys", string("A platform", enum=_PLATFORM_KEYS))),
    category="ads",
)
async def ads_creative_specs(ctx: ToolContext, platforms: list[str]) -> ToolOutcome:
    renders = required_renders(platforms)
    return ToolOutcome(
        ok=True,
        data={
            "renders": [
                {
                    "key": p.key, "name": p.name, "width": p.width, "height": p.height,
                    "ratio": p.ratio_label, "formats": list(p.formats),
                    "max_mb": p.max_mb, "safe_box": safe_box(p), "note": p.note,
                }
                for p in renders
            ],
            "text_limits": {
                pl.key: pl.text_limits for pl in
                [x for x in required_renders(platforms)] if pl.text_limits
            },
        },
        summary=f"{len(renders)} distinct renders cover {len(platforms)} platforms.",
    )


@tool(
    "ads.check_creative",
    """Check one advert's copy and one asset against a placement, before upload.

    Character limits are checked because every platform truncates silently: a
    headline cut at thirty characters mid-word is not a shorter headline, it is
    a different and worse one. Asset checks happen locally so the upload is not
    the first time anybody finds out.""",
    schema(
        placement_key=string("Which placement"),
        copy_=obj("Field name to text", headline=string("Headline"), description_=string("Description")),
        width_=integer("Asset width in pixels"),
        height_=integer("Asset height in pixels"),
        size_mb_=number("Asset size in megabytes"),
        format_=string("Asset format, such as jpg or mp4"),
    ),
    category="ads",
)
async def ads_check_creative(
    ctx: ToolContext,
    placement_key: str,
    copy: dict | None = None,
    width: int | None = None,
    height: int | None = None,
    size_mb: float | None = None,
    format: str | None = None,
) -> ToolOutcome:
    place = placement(placement_key)
    if place is None:
        return ToolOutcome(ok=False, error=f"{placement_key} is not a placement this desk knows about.")

    problems = check_copy(place, copy or {})
    if width and height:
        problems += check_asset(place, width, height, size_mb or 0.0, format or "jpg")

    blocking = [p for p in problems if p.blocking]
    return ToolOutcome(
        ok=True,
        data={
            "placement": place.key,
            "safe_box": safe_box(place),
            "problems": [p.__dict__ for p in problems],
            "can_upload": not blocking,
        },
        summary=(
            f"{len(blocking)} thing{'s' if len(blocking) != 1 else ''} would be rejected on upload."
            if blocking else f"Fits {place.name}."
        ),
    )


@tool(
    "ads.policy_check",
    """Check copy against the rules that cause rejections in volume.

    Run before every submission. A disapproved advert is an inconvenience; a
    pattern of them restricts the ad account, and a restricted Meta account is
    sometimes never recovered. Every finding carries the platform's own
    reasoning so the advertiser can argue with it rather than with us. A clean
    result means nothing known was tripped, never that approval is certain.""",
    schema(
        copy=obj(
            "The advert's text fields",
            primary_text=string("Body copy"),
            headline=string("Headline"),
            description_=string("Description"),
        ),
        platform_=string("Narrow to one platform's rules", enum=_PLATFORM_KEYS),
    ),
    category="ads",
)
async def ads_policy_check(ctx: ToolContext, copy: dict, platform: str | None = None) -> ToolOutcome:
    verdict = policy_review({k: str(v) for k, v in (copy or {}).items()}, platform)
    return ToolOutcome(ok=True, data=verdict.as_dict(), summary=verdict.note)


# ---------------------------------------------------------------- running

@tool(
    "ads.pacing",
    """Spend against the planned curve, checked daily rather than noticed at
    month end. Underspend is a constraint somewhere, not a saving.""",
    schema(
        spent=number("Spent so far this month"),
        monthly_budget=number("The month's budget"),
        day_of_month=integer("Today's date", minimum=1, maximum=31),
        days_in_month=integer("Days in this month", minimum=28, maximum=31),
    ),
    category="ads",
)
async def ads_pacing(
    ctx: ToolContext, spent: float, monthly_budget: float, day_of_month: int, days_in_month: int
) -> ToolOutcome:
    out = pacing(spent, monthly_budget, day_of_month, days_in_month)
    return ToolOutcome(ok=True, data=out.as_dict(), summary=out.note)


@tool(
    "ads.find_waste",
    """What spent and returned nothing, with the action rather than the list.

    A report of wasted spend is an audit; a negative keyword added is the work.
    Needs a hundred clicks before calling a zero-conversion term wasted,
    because three clicks and no conversion is not evidence and excluding on it
    throws away terms that would have worked. Something converting expensively
    is repriced rather than excluded: it works, it is priced wrong.""",
    schema(
        rows=array(
            "Search terms, placements, audiences or products with their spend",
            obj(
                "One row",
                kind=string("search_term, placement, audience or product"),
                name=string("What it is"),
                spend=number("Spend"),
                clicks=integer("Clicks"),
                conversions=number("Conversions"),
            ),
        ),
        target_cpa=number("What one conversion is worth paying for"),
    ),
    category="ads",
)
async def ads_find_waste(ctx: ToolContext, rows: list[dict], target_cpa: float) -> ToolOutcome:
    items = find_waste(rows, target_cpa)
    total = sum(i.spend for i in items)
    return ToolOutcome(
        ok=True,
        data={"items": [i.__dict__ for i in items], "total_at_risk": round(total, 2)},
        summary=f"{len(items)} things worth acting on, {total:,.0f} of spend behind them.",
    )


@tool(
    "ads.creative_state",
    """Whether a creative is working, burnt out, or has not run long enough.

    Fatigue is real and measurable, and it is also the excuse given for every
    creative that never worked. The two are told apart by whether the
    click-through rate fell from its own peak or was never there to begin
    with. Nothing is judged under a thousand impressions.""",
    schema(
        creative_id=string("Which creative"),
        impressions=integer("Impressions so far"),
        ctr=number("Current click-through rate as a fraction"),
        best_ctr=number("This creative's own best click-through rate"),
        frequency=number("Average times each person has seen it"),
        conversions=number("Conversions"),
    ),
    category="ads",
)
async def ads_creative_state(
    ctx: ToolContext, creative_id: str, impressions: int, ctr: float,
    best_ctr: float, frequency: float, conversions: float,
) -> ToolOutcome:
    out = creative_state(creative_id, impressions, ctr, best_ctr, frequency, conversions)
    return ToolOutcome(ok=True, data=out.__dict__, summary=f"{out.state}: {out.note}")


@tool(
    "ads.reconcile",
    """Platform claims, the measured truth, and the distance between them.

    Meta counts a sale it touched. Google counts the same sale. Every dashboard
    in this category prints the sum, which produces more customers than the
    business had. This keeps them apart, labels each as platform-claimed, and
    answers with the site's own count and the blended cost per acquisition,
    which no attribution window can move.""",
    schema(
        results=array(
            "One row per platform",
            obj(
                "A platform's own reported figures",
                platform=string("Platform key"),
                spend=number("Spend"),
                clicks=integer("Clicks"),
                impressions=integer("Impressions"),
                claimed_conversions=number("Conversions the platform claims"),
                claimed_revenue=number("Revenue the platform claims"),
            ),
        ),
        site_conversions_=integer("What the business itself recorded. Omit if not connected"),
        site_revenue_=number("What the business itself recorded in revenue"),
    ),
    category="ads",
)
async def ads_reconcile(
    ctx: ToolContext,
    results: list[dict],
    site_conversions: int | None = None,
    site_revenue: float | None = None,
) -> ToolOutcome:
    rows = [
        PlatformResult(
            platform=str(r.get("platform", "")),
            spend=float(r.get("spend", 0) or 0),
            clicks=int(r.get("clicks", 0) or 0),
            impressions=int(r.get("impressions", 0) or 0),
            claimed_conversions=float(r.get("claimed_conversions", 0) or 0),
            claimed_revenue=float(r.get("claimed_revenue", 0) or 0),
        )
        for r in results
    ]
    out = reconcile(rows, site_conversions, site_revenue)
    return ToolOutcome(ok=True, data=out.as_dict(), summary=out.gap_note)


@tool(
    "ads.failure_playbook",
    """Every known way a launch can fail at this stage, and what happens instead.

    Not documentation. An agent hitting an unexpected platform response reads
    this to find the classified response rather than improvising one, and the
    three failures that pause spending without asking are listed so nothing
    else ever does.""",
    schema(
        stage_=string("connect, plan, build, launch, run or report"),
        code_=string("One failure code, for the full entry"),
    ),
    category="ads",
)
async def ads_failure_playbook(
    ctx: ToolContext, stage: str | None = None, code: str | None = None
) -> ToolOutcome:
    if code:
        from seoos.analysis.ad_failures import failure as lookup
        found = lookup(code)
        if found is None:
            return ToolOutcome(ok=False, error=f"{code} is not a failure this desk has catalogued.")
        return ToolOutcome(ok=True, data=found.__dict__, summary=found.respond)

    chosen = at_stage(stage) if stage else FAILURES
    return ToolOutcome(
        ok=True,
        data={
            "failures": [
                {"code": f.code, "stage": f.stage, "severity": f.severity, "what": f.what,
                 "respond": f.respond, "tell": f.tell, "fallback": f.fallback}
                for f in chosen
            ],
            "pause_without_asking": unconditional_pauses(),
        },
        summary=(
            f"{len(chosen)} catalogued failures. Only three pause somebody's advertising without asking: "
            + ", ".join(unconditional_pauses())
        ),
    )


# ------------------------------------------------------ the money, gated

@tool(
    "ads.build_campaign",
    """Build a complete campaign in the platform, paused, and verify the tree.

    Nothing this creates can spend. No advertising platform offers a
    transaction, so the campaign, its ad groups, its keywords and its creatives
    are separate calls and the network can drop between any two of them.
    Everything is therefore created paused, every created id is recorded, and
    the whole tree is compared against the approved plan. A failure deletes
    what was created in reverse order. Activation is a different tool.""",
    schema(
        platform=string("Which platform", enum=_PLATFORM_KEYS),
        plan=obj("The approved plan", name=string("Campaign name")),
    ),
    category="ads",
    mutates=True,
    risk="medium",
    approval_type="ads_build",
    auto_from="managed",
)
async def ads_build_campaign(ctx: ToolContext, platform: str, plan: dict) -> ToolOutcome:
    return ToolOutcome(
        ok=False,
        error=(
            f"No {platform} account is connected to this workspace. The advertiser connects it by pressing "
            "Connect and logging in on the platform's own site; nothing is pasted here. Until then a plan "
            "can be built and reviewed but not written."
        ),
    )


@tool(
    "ads.launch",
    """Activate a campaign that is already built, verified and approved.

    The single operation in this product that begins spending somebody's money.
    Tagged so that no autonomy level authorises it: a person activates every
    campaign, on every plan, forever. Re-reads the account at activation and
    refuses on a stale approval, absent billing, a suspended account or a
    destination that does not answer.""",
    schema(
        platform=string("Which platform", enum=_PLATFORM_KEYS),
        campaign_id=string("The paused campaign to activate"),
    ),
    category="ads",
    mutates=True,
    risk="high",
    approval_type="ads_launch",
    # Declared because every mutating tool declares a floor, then overridden by
    # the tag below, which ALWAYS_HUMAN matches. Belt and braces on purpose.
    auto_from="autopilot",
    tags=("ads_spend",),
)
async def ads_launch(ctx: ToolContext, platform: str, campaign_id: str) -> ToolOutcome:
    return ToolOutcome(
        ok=False,
        error=(
            f"No {platform} account is connected to this workspace, so there is nothing to activate."
        ),
    )


@tool(
    "ads.set_budget",
    """Change a budget inside the envelope a person already approved.

    A rise past the envelope is not this tool; it is a new approval. Batched
    into one weekly window where the platform's learning phase would reset,
    because enthusiastic optimisation is how agencies destroy accounts.""",
    schema(
        platform=string("Which platform", enum=_PLATFORM_KEYS),
        campaign_id=string("Which campaign"),
        daily_budget=number("The new daily budget"),
    ),
    category="ads",
    mutates=True,
    risk="high",
    approval_type="ads_budget",
    auto_from="autopilot",
    tags=("ads_spend",),
)
async def ads_set_budget(
    ctx: ToolContext, platform: str, campaign_id: str, daily_budget: float
) -> ToolOutcome:
    return ToolOutcome(ok=False, error=f"No {platform} account is connected to this workspace.")


@tool(
    "ads.pause",
    """Stop a campaign spending.

    The one direction that is safe to take quickly. Pausing costs a client
    nothing they cannot undo in a click, while the three conditions that
    trigger it automatically each cost money every minute they continue: the
    destination is broken, the money is buying nothing, or the ceiling was
    passed. Everything else asks first.""",
    schema(
        platform=string("Which platform", enum=_PLATFORM_KEYS),
        campaign_id=string("Which campaign"),
        reason=string("Which catalogued failure prompted this"),
    ),
    category="ads",
    mutates=True,
    risk="low",
    approval_type="ads_pause",
    auto_from="assisted",
)
async def ads_pause(ctx: ToolContext, platform: str, campaign_id: str, reason: str) -> ToolOutcome:
    return ToolOutcome(ok=False, error=f"No {platform} account is connected to this workspace.")
