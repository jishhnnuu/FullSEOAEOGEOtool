"""Paid media, measured. The arithmetic, the gates, and the refusals.

Ported line for line to ``apps/web/src/engine/ads.ts``, because the two
engines must not disagree about whether a budget is viable.

Three ideas run through the whole module.

**Measurement before money.** Nothing here will produce a plan for an account
whose conversions cannot be read. A platform optimising toward an event it
cannot see does worse than a platform given no target at all, so advertising
without measurement is not a reduced version of this service, it is a
different and worse one. ``measurement_readiness`` is a gate, not a score.

**A budget below the learning floor is not a small campaign, it is a broken
one.** Every major platform's bidding is a model that needs conversions to
fit. Meta publishes fifty per ad set per week; Google's smart bidding wants
roughly thirty a month per campaign. Below that the model never converges and
the money buys noise. An agency will take a budget it knows is too small
because the fee is a percentage of it. ``budget_viable`` says no instead, and
says what would fix it.

**Platform-claimed conversions are never summed.** Meta counts a sale it
touched. Google counts the same sale. Adding them produces more customers
than the business had, which is the single most common lie in paid media
reporting. ``reconcile`` keeps them apart and reports the gap.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# ------------------------------------------------------------- thresholds

#: Conversions behind a cost per acquisition before it is worth believing.
#: Below this the figure is one lucky week, and scaling on it loses money.
CPA_FLOOR = 30
#: Clicks before a conversion rate of zero means anything at all.
CLICK_FLOOR = 100
#: Multiple of target cost per acquisition, with nothing to show, that counts
#: as waste rather than as patience.
WASTE_MULTIPLE = 3.0
#: Conversions per week an ad set needs for the platform's model to converge.
#: Meta publishes fifty. Google's smart bidding is looser but not by much.
LEARNING_CONVERSIONS_WEEKLY = 50
#: Conversions a month below which smart bidding on search is worse than
#: manual. Google's own guidance, and the number most small accounts miss.
SMART_BIDDING_MONTHLY = 30
#: How far off the planned spend curve is still fine.
PACING_BAND = 0.15
#: Meta frequency inside seven days above which a creative is being burnt.
FREQUENCY_CEILING = 3.0
#: Fall from a creative's own best click-through rate that reads as fatigue.
CTR_DECLINE = 0.30
#: Impressions behind a click-through rate before it is read at all.
IMPRESSION_FLOOR = 1000
#: Platforms a plan will spread across at once. More than this on a small
#: budget guarantees every one of them is below its learning floor.
MAX_PLATFORMS_DEFAULT = 2


@dataclass
class Measured:
    """A number, and whether anybody actually measured it."""

    value: float | None
    measured: bool
    note: str = ""

    def as_dict(self) -> dict:
        return {"value": self.value, "measured": self.measured, "note": self.note}


# ------------------------------------------------------------ the gate

@dataclass
class TrackingSignals:
    """What was actually observed about this advertiser's measurement.

    Every field is something checked rather than asked. A questionnaire
    answer is not evidence, and the commonest way tracking is broken is that
    somebody believes it works.
    """

    #: A conversion tag was found on the site and fired in a test load.
    tag_present: bool = False
    #: A test conversion was sent and read back from the platform.
    round_trip_verified: bool = False
    #: Server-side events are configured, which is what survives browser loss.
    server_side: bool = False
    #: Browser and server events carry a shared id, so they deduplicate.
    deduplicated: bool = False
    #: A currency value travels with the conversion, not just a count.
    value_passed: bool = False
    #: Consent Mode v2 or equivalent, required for EEA traffic on Google.
    consent_mode: bool = False
    #: The advertiser sells to the EEA or the UK, so consent is not optional.
    serves_eea: bool = True
    #: The click id is captured and stored, which is what makes a closed sale
    #: reportable back to the platform weeks later.
    click_id_captured: bool = False
    #: Lead generation: a sale happens offline, so the above matters most.
    objective: str = "lead_gen"


@dataclass
class Readiness:
    """Whether this account may spend money yet."""

    ready: bool
    blocking: list[str] = field(default_factory=list)
    degraded: list[str] = field(default_factory=list)
    strengths: list[str] = field(default_factory=list)
    #: Nought to one hundred, and only shown once ``ready`` is true. A score
    #: on a blocked account invites somebody to launch at eighty.
    quality: Measured = field(default_factory=lambda: Measured(None, False))

    def as_dict(self) -> dict:
        return {
            "ready": self.ready,
            "blocking": self.blocking,
            "degraded": self.degraded,
            "strengths": self.strengths,
            "quality": self.quality.as_dict(),
        }


def measurement_readiness(s: TrackingSignals) -> Readiness:
    """The hard gate. No autonomy level overrides a blocking entry here."""
    out = Readiness(ready=False)

    if not s.tag_present:
        out.blocking.append(
            "No conversion tracking was found on the site. Until a conversion can be counted, the "
            "platform optimises toward clicks, and clicks are not the thing you are buying."
        )
    elif not s.round_trip_verified:
        out.blocking.append(
            "A tag is present but a test conversion did not come back from the platform. A tag that "
            "fires into nothing is worse than no tag, because it looks like measurement."
        )

    if out.blocking:
        return out

    out.strengths.append("A test conversion was sent and read back, so the loop is closed.")

    if not s.server_side:
        out.degraded.append(
            "Browser-side only. Since Apple's tracking changes a large share of conversions never reach "
            "the platform, so reported results understate reality and bidding is trained on the subset "
            "that survived. Server-side events fix this and take about an hour to set up."
        )
    else:
        out.strengths.append("Server-side events are configured, so measurement survives browser tracking loss.")
        if not s.deduplicated:
            out.degraded.append(
                "Server and browser events carry no shared id, so the same conversion is counted twice "
                "and bidding overpays accordingly."
            )
        else:
            out.strengths.append("Events deduplicate against a shared id, so nothing is counted twice.")

    if not s.value_passed:
        out.degraded.append(
            "Conversions carry no value, so every one counts the same. A ten pound order and a ten "
            "thousand pound order cannot be told apart, and the bidding will chase whichever is easier."
        )
    else:
        out.strengths.append("A currency value travels with each conversion, so bidding can chase revenue.")

    if s.serves_eea and not s.consent_mode:
        out.degraded.append(
            "Consent Mode is not configured and you serve the UK or the EEA. Google will not use data "
            "from visitors who declined, and without the cookieless signal it cannot model them either, "
            "so a real share of your conversions simply disappears."
        )
    elif s.serves_eea:
        out.strengths.append("Consent Mode is configured, so declined traffic is modelled rather than lost.")

    if s.objective == "lead_gen" and not s.click_id_captured:
        out.degraded.append(
            "The click id is not captured on your forms. Without it a lead that becomes a customer three "
            "weeks later can never be reported back, so the platform optimises for form fills rather than "
            "for revenue. This is the single biggest lever available to a lead generation account."
        )
    elif s.objective == "lead_gen":
        out.strengths.append(
            "The click id is captured, so a closed sale can be sent back and the bidding can chase "
            "customers rather than enquiries."
        )

    out.ready = True
    earned = len(out.strengths)
    possible = earned + len(out.degraded)
    out.quality = Measured(
        round(100 * earned / possible, 1) if possible else 100.0,
        True,
        f"{earned} of {possible} measurement signals in place.",
    )
    return out


# ----------------------------------------------------------- the budget

@dataclass
class BudgetCheck:
    """Whether this budget can buy what it is being asked to buy."""

    viable: bool
    reason: str = ""
    #: Conversions a month this budget implies at the target cost.
    implied_monthly: Measured = field(default_factory=lambda: Measured(None, False))
    #: What would make it work, in the order worth trying.
    remedies: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "viable": self.viable,
            "reason": self.reason,
            "implied_monthly": self.implied_monthly.as_dict(),
            "remedies": self.remedies,
        }


def budget_viable(monthly_budget: float, target_cpa: float, platforms: int = 1) -> BudgetCheck:
    """Can this budget produce enough conversions for the bidding to learn?

    The refusal an agency will not make. A £600 month against a £75 target is
    eight conversions, spread over however many platforms were sold, and no
    platform's model fits on eight. The campaign will underperform for
    structural reasons that have nothing to do with the creative, and the
    postmortem will blame the creative.
    """
    if monthly_budget <= 0 or target_cpa <= 0:
        return BudgetCheck(False, "A budget and a target cost per acquisition are both needed before this can be answered.")

    per_platform = monthly_budget / max(platforms, 1)
    implied = per_platform / target_cpa
    out = BudgetCheck(
        viable=implied >= SMART_BIDDING_MONTHLY,
        implied_monthly=Measured(
            round(implied, 1),
            True,
            f"{per_platform:,.0f} a month per platform at a {target_cpa:,.0f} target.",
        ),
    )
    if out.viable:
        out.reason = (
            f"About {implied:.0f} conversions a month per platform, which is above the {SMART_BIDDING_MONTHLY} "
            "that automated bidding needs to fit a model."
        )
        return out

    needed = SMART_BIDDING_MONTHLY * target_cpa * max(platforms, 1)
    out.reason = (
        f"About {implied:.1f} conversions a month per platform. Automated bidding needs roughly "
        f"{SMART_BIDDING_MONTHLY} to converge, so below that the platform is guessing and the money buys "
        "noise rather than customers. This is arithmetic, not pessimism."
    )
    out.remedies = [
        f"Run one platform instead of {platforms}, which lifts it to about {monthly_budget / target_cpa:.0f} a month."
        if platforms > 1
        else "There is only one platform already, so concentration cannot help further.",
        f"Raise the budget to about {needed:,.0f} a month, which is what {SMART_BIDDING_MONTHLY} conversions "
        f"per platform costs at this target.",
        "Raise the target cost per acquisition if the business can carry it. A higher target buys more "
        "conversions from the same money and lets the model fit.",
        "Use manual or maximise-clicks bidding instead, which does not need a conversion volume to work, "
        "and accept a worse cost per acquisition in exchange for the campaign functioning at all.",
    ]
    if platforms == 1:
        out.remedies = out.remedies[1:]
    return out


def platform_count_for(monthly_budget: float, target_cpa: float, maximum: int = MAX_PLATFORMS_DEFAULT) -> int:
    """How many platforms this budget can actually feed. Usually fewer than asked.

    Spreading a small budget across five networks is how an agency makes a
    plan look thorough and makes every campaign fail at once.
    """
    if monthly_budget <= 0 or target_cpa <= 0:
        return 1
    affordable = int(monthly_budget / (SMART_BIDDING_MONTHLY * target_cpa))
    return max(1, min(maximum, affordable))


def expected_outcome(
    monthly_budget: float,
    cost_per_click: Measured,
    conversion_rate: Measured,
) -> Measured:
    """Conversions a month, as a range, or nothing at all.

    Refused rather than guessed when either input is unmeasured. A projection
    built on two assumptions is a sales document, and this product does not
    produce those. Where both are measured the range is plus or minus thirty
    per cent, which is the honest width of a forecast from historic account
    data.
    """
    if not cost_per_click.measured or not conversion_rate.measured:
        missing = []
        if not cost_per_click.measured:
            missing.append("what a click costs on these terms")
        if not conversion_rate.measured:
            missing.append("what share of clicks convert on this page")
        return Measured(
            None,
            False,
            "No forecast, because " + " and ".join(missing) + " has not been measured. "
            "The first two weeks measure it, and the forecast appears then.",
        )

    cpc = cost_per_click.value or 0.0
    cvr = conversion_rate.value or 0.0
    if cpc <= 0 or cvr <= 0:
        return Measured(None, False, "A cost per click or a conversion rate of zero cannot produce a forecast.")

    mid = (monthly_budget / cpc) * cvr
    return Measured(
        round(mid, 1),
        True,
        f"Between {math.floor(mid * 0.7)} and {math.ceil(mid * 1.3)} a month, from "
        f"{monthly_budget / cpc:,.0f} clicks at a measured {cvr * 100:.1f} per cent conversion rate. "
        "The range is the honest width of a forecast built on your own historic numbers.",
    )


# ----------------------------------------------------------- the pacing

@dataclass
class Pacing:
    spent: float
    planned: float
    ratio: float
    state: str  # "on_track" | "under" | "over"
    note: str

    def as_dict(self) -> dict:
        return {
            "spent": round(self.spent, 2),
            "planned": round(self.planned, 2),
            "ratio": round(self.ratio, 3),
            "state": self.state,
            "note": self.note,
        }


def pacing(spent: float, monthly_budget: float, day_of_month: int, days_in_month: int) -> Pacing:
    """Spend against a flat curve, checked daily rather than noticed at month end."""
    days_in_month = max(days_in_month, 1)
    day = max(0, min(day_of_month, days_in_month))
    planned = monthly_budget * (day / days_in_month)
    ratio = (spent / planned) if planned > 0 else 0.0

    if planned <= 0:
        return Pacing(spent, 0.0, 0.0, "on_track", "The month has not started.")
    if ratio > 1 + PACING_BAND:
        remaining = monthly_budget - spent
        return Pacing(
            spent, planned, ratio, "over",
            f"Spending {(ratio - 1) * 100:.0f} per cent ahead of the curve. At this rate the budget runs "
            f"out on day {int(day * monthly_budget / max(spent, 0.01))} and there is "
            f"{remaining:,.0f} left for {days_in_month - day} days.",
        )
    if ratio < 1 - PACING_BAND:
        return Pacing(
            spent, planned, ratio, "under",
            f"Spending {(1 - ratio) * 100:.0f} per cent behind the curve, which paces to "
            f"{spent * days_in_month / max(day, 1):,.0f} against a {monthly_budget:,.0f} budget. "
            "Underspend is a constraint somewhere, not a saving.",
        )
    return Pacing(spent, planned, ratio, "on_track", "Within fifteen per cent of the curve.")


# ------------------------------------------------------- reconciliation

@dataclass
class PlatformResult:
    platform: str
    spend: float
    clicks: int
    impressions: int
    #: What the platform says it caused. Its own attribution, its own window.
    claimed_conversions: float
    claimed_revenue: float = 0.0


@dataclass
class Reconciliation:
    """Three numbers, kept apart on purpose."""

    total_spend: float
    #: Per platform, never summed. Summing these is the category's great lie.
    claimed: list[dict]
    claimed_total_if_summed: float
    #: What the business actually recorded. The only ground truth here.
    measured_conversions: Measured
    measured_revenue: Measured
    #: Spend over measured conversions. Cannot be gamed by a attribution window.
    blended_cac: Measured
    blended_roas: Measured
    gap_note: str

    def as_dict(self) -> dict:
        return {
            "total_spend": round(self.total_spend, 2),
            "claimed": self.claimed,
            "claimed_total_if_summed": round(self.claimed_total_if_summed, 1),
            "measured_conversions": self.measured_conversions.as_dict(),
            "measured_revenue": self.measured_revenue.as_dict(),
            "blended_cac": self.blended_cac.as_dict(),
            "blended_roas": self.blended_roas.as_dict(),
            "gap_note": self.gap_note,
        }


def reconcile(
    results: list[PlatformResult],
    site_conversions: int | None,
    site_revenue: float | None = None,
) -> Reconciliation:
    """Platform claims, the measured truth, and the distance between them.

    ``claimed_total_if_summed`` exists so the gap can be named. It is carried
    as a number to be argued with, never as a headline, and no screen in this
    product presents it as the conversion count.
    """
    total_spend = sum(r.spend for r in results)
    claimed = [
        {
            "platform": r.platform,
            "spend": round(r.spend, 2),
            "claimed_conversions": round(r.claimed_conversions, 1),
            "claimed_cpa": round(r.spend / r.claimed_conversions, 2) if r.claimed_conversions > 0 else None,
            "claimed_revenue": round(r.claimed_revenue, 2),
            "label": "platform-claimed, on that platform's own attribution window",
        }
        for r in results
    ]
    summed = sum(r.claimed_conversions for r in results)

    if site_conversions is None:
        unmeasured = Measured(
            None, False,
            "The site's own conversion count is not connected, so there is nothing to check the platforms "
            "against. Until it is, every figure above is a platform marking its own homework.",
        )
        return Reconciliation(
            total_spend=total_spend,
            claimed=claimed,
            claimed_total_if_summed=summed,
            measured_conversions=unmeasured,
            measured_revenue=Measured(None, False, unmeasured.note),
            blended_cac=Measured(None, False, "No measured conversion count, so no blended cost."),
            blended_roas=Measured(None, False, "No measured revenue, so no return."),
            gap_note="Not calculable without the site's own numbers.",
        )

    measured = Measured(float(site_conversions), True, "Recorded by the site itself, not by an ad platform.")
    cac = Measured(
        round(total_spend / site_conversions, 2) if site_conversions > 0 else None,
        site_conversions > 0,
        "Total spend over conversions the business actually recorded. No attribution window can move it."
        if site_conversions > 0
        else "No conversions recorded, so there is no cost per acquisition, only a cost.",
    )
    revenue = (
        Measured(float(site_revenue), True, "Recorded by the site itself.")
        if site_revenue is not None
        else Measured(None, False, "Revenue is not connected, so only a cost per conversion is available.")
    )
    roas = (
        Measured(round(site_revenue / total_spend, 2), True, "Measured revenue over total spend.")
        if site_revenue is not None and total_spend > 0
        else Measured(None, False, "Needs both measured revenue and spend.")
    )

    if summed <= 0:
        gap = "The platforms claim nothing, so there is no double count to explain."
    elif site_conversions == 0:
        gap = (
            f"The platforms claim {summed:.0f} between them and the site recorded none. That is either "
            "broken tracking or claimed conversions that did not happen, and the first is far more likely."
        )
    else:
        over = summed / site_conversions
        gap = (
            f"The platforms claim {summed:.0f} between them. The business recorded {site_conversions}. "
            f"That is {over:.1f} times as many, which is normal and is not anybody lying: each platform "
            "counts a conversion it touched, and a customer often touches two. The number to run the "
            f"business on is {site_conversions}, at {cac.value} each."
            if over > 1.15
            else
            f"The platforms claim {summed:.0f} and the business recorded {site_conversions}, which agree "
            "closely enough that either can be used."
        )

    return Reconciliation(
        total_spend=total_spend,
        claimed=claimed,
        claimed_total_if_summed=summed,
        measured_conversions=measured,
        measured_revenue=revenue,
        blended_cac=cac,
        blended_roas=roas,
        gap_note=gap,
    )


# ----------------------------------------------------------------- waste

@dataclass
class WasteItem:
    kind: str          # search_term | placement | audience | product
    name: str
    spend: float
    clicks: int
    conversions: float
    verdict: str
    action: str


def find_waste(rows: list[dict], target_cpa: float) -> list[WasteItem]:
    """What spent and returned nothing, with the action rather than the list.

    A report of wasted spend is an audit. A negative keyword added is the work.
    The click floor matters: three clicks and no conversion is not evidence,
    and excluding on it throws away terms that would have worked.
    """
    out: list[WasteItem] = []
    if target_cpa <= 0:
        return out
    ceiling = target_cpa * WASTE_MULTIPLE

    for row in rows:
        spend = float(row.get("spend", 0) or 0)
        clicks = int(row.get("clicks", 0) or 0)
        conversions = float(row.get("conversions", 0) or 0)
        kind = str(row.get("kind", "search_term"))
        name = str(row.get("name", ""))

        if conversions > 0:
            cpa = spend / conversions
            if cpa > ceiling:
                out.append(WasteItem(
                    kind, name, spend, clicks, conversions,
                    f"Converting at {cpa:,.0f} against a {target_cpa:,.0f} target, which is "
                    f"{cpa / target_cpa:.1f} times over.",
                    "Lower the bid rather than excluding it. It works, it is just priced wrong.",
                ))
            continue

        if spend < ceiling:
            continue
        if clicks < CLICK_FLOOR and spend < ceiling * 2:
            continue

        out.append(WasteItem(
            kind, name, spend, clicks, conversions,
            f"{spend:,.0f} spent across {clicks} clicks and nothing back, against a "
            f"{target_cpa:,.0f} target.",
            {
                "search_term": "Add as an exact-match negative keyword.",
                "placement": "Exclude this placement.",
                "audience": "Exclude this audience from the ad set.",
                "product": "Exclude this product from the shopping campaign, or fix its page.",
            }.get(kind, "Exclude it."),
        ))

    return sorted(out, key=lambda w: -w.spend)


# ------------------------------------------------------------- creative

@dataclass
class CreativeVerdict:
    creative_id: str
    state: str   # "working" | "fatigued" | "too_early" | "failing"
    note: str
    action: str


def creative_state(
    creative_id: str,
    impressions: int,
    ctr: float,
    best_ctr: float,
    frequency: float,
    conversions: float,
) -> CreativeVerdict:
    """Whether a creative is working, burnt out, or has not run long enough.

    Fatigue is a real and measurable thing on paid social, and it is also the
    excuse given for every creative that never worked. The two are told apart
    by whether the click-through rate fell from its own peak, or was never
    there to begin with.
    """
    if impressions < IMPRESSION_FLOOR:
        return CreativeVerdict(
            creative_id, "too_early",
            f"{impressions:,} impressions, and {IMPRESSION_FLOOR:,} is the floor for reading a "
            "click-through rate. Nothing is called yet.",
            "Leave it alone.",
        )

    if best_ctr > 0 and ctr < best_ctr * (1 - CTR_DECLINE):
        return CreativeVerdict(
            creative_id, "fatigued",
            f"Click-through rate is {ctr * 100:.2f} per cent against its own best of "
            f"{best_ctr * 100:.2f} per cent, a fall of {(1 - ctr / best_ctr) * 100:.0f} per cent"
            + (f", at a frequency of {frequency:.1f}." if frequency >= FREQUENCY_CEILING else "."),
            "Replace the creative. The audience has seen it. Refreshing the copy on the same image "
            "rarely recovers it.",
        )

    if frequency >= FREQUENCY_CEILING and conversions <= 0:
        return CreativeVerdict(
            creative_id, "failing",
            f"Seen {frequency:.1f} times each by the same people and nothing has converted. This is not "
            "fatigue, it never worked.",
            "Stop it and try a different angle, not a different crop.",
        )

    if conversions <= 0 and impressions >= IMPRESSION_FLOOR * 5:
        return CreativeVerdict(
            creative_id, "failing",
            f"{impressions:,} impressions and no conversions.",
            "Stop it. The next test should change the offer or the hook, not the colour.",
        )

    return CreativeVerdict(
        creative_id, "working",
        f"Click-through rate {ctr * 100:.2f} per cent at a frequency of {frequency:.1f}, "
        f"{conversions:.0f} conversions.",
        "Leave it running and build the next one from it.",
    )
