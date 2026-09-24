/**
 * Paid media, measured. The arithmetic, the gates, and the refusals.
 *
 * A port of `packages/seoos/analysis/ads.py`, kept line for line, because the
 * two engines must not disagree about whether a budget is viable. A plan
 * refused on the server and accepted in the browser is worse than either.
 *
 * Three ideas run through the whole module.
 *
 * **Measurement before money.** Nothing here produces a plan for an account
 * whose conversions cannot be read. A platform optimising toward an event it
 * cannot see does worse than one given no target at all, so advertising
 * without measurement is not a reduced version of this service, it is a
 * different and worse one. `measurementReadiness` is a gate, not a score.
 *
 * **A budget below the learning floor is not a small campaign, it is a broken
 * one.** Every platform's bidding is a model that needs conversions to fit.
 * Below that the model never converges and the money buys noise. An agency
 * takes the budget anyway because the fee is a percentage of it.
 *
 * **Platform-claimed conversions are never summed.** Meta counts a sale it
 * touched, Google counts the same sale, and adding them produces more
 * customers than the business had.
 */

/* ------------------------------------------------------------ thresholds */

/** Conversions behind a cost per acquisition before it is worth believing. */
export const CPA_FLOOR = 30;
/** Clicks before a conversion rate of zero means anything at all. */
export const CLICK_FLOOR = 100;
/** Multiple of target cost per acquisition, with nothing to show, that is waste. */
export const WASTE_MULTIPLE = 3.0;
/** Conversions per week an ad set needs for the platform's model to converge. */
export const LEARNING_CONVERSIONS_WEEKLY = 50;
/** Conversions a month below which smart bidding is worse than manual. */
export const SMART_BIDDING_MONTHLY = 30;
/** How far off the planned spend curve is still fine. */
export const PACING_BAND = 0.15;
/** Meta frequency inside seven days above which a creative is being burnt. */
export const FREQUENCY_CEILING = 3.0;
/** Fall from a creative's own best click-through rate that reads as fatigue. */
export const CTR_DECLINE = 0.30;
/** Impressions behind a click-through rate before it is read at all. */
export const IMPRESSION_FLOOR = 1000;
/** Platforms a plan will spread across at once. */
export const MAX_PLATFORMS_DEFAULT = 2;

export type Measured = { value: number | null; measured: boolean; note: string };

const unmeasured = (note: string): Measured => ({ value: null, measured: false, note });

/* -------------------------------------------------------------- the gate */

export type TrackingSignals = {
  tagPresent: boolean;
  roundTripVerified: boolean;
  serverSide: boolean;
  deduplicated: boolean;
  valuePassed: boolean;
  consentMode: boolean;
  servesEea: boolean;
  clickIdCaptured: boolean;
  objective: "lead_gen" | "ecommerce";
};

export const NO_TRACKING: TrackingSignals = {
  tagPresent: false,
  roundTripVerified: false,
  serverSide: false,
  deduplicated: false,
  valuePassed: false,
  consentMode: false,
  servesEea: true,
  clickIdCaptured: false,
  objective: "lead_gen",
};

export type Readiness = {
  ready: boolean;
  blocking: string[];
  degraded: string[];
  strengths: string[];
  quality: Measured;
};

/** The hard gate. No autonomy level overrides a blocking entry here. */
export function measurementReadiness(s: TrackingSignals): Readiness {
  const out: Readiness = {
    ready: false, blocking: [], degraded: [], strengths: [],
    quality: unmeasured("Not scored while anything is blocking."),
  };

  if (!s.tagPresent) {
    out.blocking.push(
      "No conversion tracking was found on the site. Until a conversion can be counted, the platform " +
      "optimises toward clicks, and clicks are not the thing you are buying.",
    );
  } else if (!s.roundTripVerified) {
    out.blocking.push(
      "A tag is present but a test conversion did not come back from the platform. A tag that fires " +
      "into nothing is worse than no tag, because it looks like measurement.",
    );
  }
  if (out.blocking.length) return out;

  out.strengths.push("A test conversion was sent and read back, so the loop is closed.");

  if (!s.serverSide) {
    out.degraded.push(
      "Browser-side only. Since Apple's tracking changes a large share of conversions never reach the " +
      "platform, so reported results understate reality and bidding is trained on the subset that " +
      "survived. Server-side events fix this and take about an hour to set up.",
    );
  } else {
    out.strengths.push("Server-side events are configured, so measurement survives browser tracking loss.");
    if (!s.deduplicated) {
      out.degraded.push(
        "Server and browser events carry no shared id, so the same conversion is counted twice and " +
        "bidding overpays accordingly.",
      );
    } else {
      out.strengths.push("Events deduplicate against a shared id, so nothing is counted twice.");
    }
  }

  if (!s.valuePassed) {
    out.degraded.push(
      "Conversions carry no value, so every one counts the same. A ten pound order and a ten thousand " +
      "pound order cannot be told apart, and the bidding will chase whichever is easier.",
    );
  } else {
    out.strengths.push("A currency value travels with each conversion, so bidding can chase revenue.");
  }

  if (s.servesEea && !s.consentMode) {
    out.degraded.push(
      "Consent Mode is not configured and you serve the UK or the EEA. Google will not use data from " +
      "visitors who declined, and without the cookieless signal it cannot model them either, so a real " +
      "share of your conversions simply disappears.",
    );
  } else if (s.servesEea) {
    out.strengths.push("Consent Mode is configured, so declined traffic is modelled rather than lost.");
  }

  if (s.objective === "lead_gen" && !s.clickIdCaptured) {
    out.degraded.push(
      "The click id is not captured on your forms. Without it a lead that becomes a customer three weeks " +
      "later can never be reported back, so the platform optimises for form fills rather than for " +
      "revenue. This is the single biggest lever available to a lead generation account.",
    );
  } else if (s.objective === "lead_gen") {
    out.strengths.push(
      "The click id is captured, so a closed sale can be sent back and the bidding can chase customers " +
      "rather than enquiries.",
    );
  }

  out.ready = true;
  const earned = out.strengths.length;
  const possible = earned + out.degraded.length;
  out.quality = {
    value: possible ? Math.round((1000 * earned) / possible) / 10 : 100,
    measured: true,
    note: `${earned} of ${possible} measurement signals in place.`,
  };
  return out;
}

/* ------------------------------------------------------------ the budget */

export type BudgetCheck = {
  viable: boolean;
  reason: string;
  impliedMonthly: Measured;
  remedies: string[];
};

const money = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 0 });

/**
 * Can this budget produce enough conversions for the bidding to learn?
 *
 * The refusal an agency will not make. A small month against a high target is
 * a handful of conversions spread over however many platforms were sold, and
 * no platform's model fits on a handful. The campaign underperforms for
 * structural reasons and the postmortem blames the creative.
 */
export function budgetViable(monthlyBudget: number, targetCpa: number, platforms = 1): BudgetCheck {
  if (monthlyBudget <= 0 || targetCpa <= 0) {
    return {
      viable: false,
      reason: "A budget and a target cost per acquisition are both needed before this can be answered.",
      impliedMonthly: unmeasured("Nothing to compute from."),
      remedies: [],
    };
  }

  const count = Math.max(platforms, 1);
  const perPlatform = monthlyBudget / count;
  const implied = perPlatform / targetCpa;
  const impliedMonthly: Measured = {
    value: Math.round(implied * 10) / 10,
    measured: true,
    note: `${money(perPlatform)} a month per platform at a ${money(targetCpa)} target.`,
  };

  if (implied >= SMART_BIDDING_MONTHLY) {
    return {
      viable: true,
      reason:
        `About ${implied.toFixed(0)} conversions a month per platform, which is above the ` +
        `${SMART_BIDDING_MONTHLY} that automated bidding needs to fit a model.`,
      impliedMonthly,
      remedies: [],
    };
  }

  const needed = SMART_BIDDING_MONTHLY * targetCpa * count;
  const remedies = [
    count > 1
      ? `Run one platform instead of ${count}, which lifts it to about ${(monthlyBudget / targetCpa).toFixed(0)} a month.`
      : null,
    `Raise the budget to about ${money(needed)} a month, which is what ${SMART_BIDDING_MONTHLY} conversions ` +
    "per platform costs at this target.",
    "Raise the target cost per acquisition if the business can carry it. A higher target buys more " +
    "conversions from the same money and lets the model fit.",
    "Use manual or maximise-clicks bidding instead, which does not need a conversion volume to work, and " +
    "accept a worse cost per acquisition in exchange for the campaign functioning at all.",
  ].filter((r): r is string => r !== null);

  return {
    viable: false,
    reason:
      `About ${implied.toFixed(1)} conversions a month per platform. Automated bidding needs roughly ` +
      `${SMART_BIDDING_MONTHLY} to converge, so below that the platform is guessing and the money buys ` +
      "noise rather than customers. This is arithmetic, not pessimism.",
    impliedMonthly,
    remedies,
  };
}

/** How many platforms this budget can actually feed. Usually fewer than asked. */
export function platformCountFor(monthlyBudget: number, targetCpa: number, maximum = MAX_PLATFORMS_DEFAULT): number {
  if (monthlyBudget <= 0 || targetCpa <= 0) return 1;
  const affordable = Math.floor(monthlyBudget / (SMART_BIDDING_MONTHLY * targetCpa));
  return Math.max(1, Math.min(maximum, affordable));
}

/**
 * Conversions a month, as a range, or nothing at all.
 *
 * Refused rather than guessed when either input is unmeasured. A projection
 * built on two assumptions is a sales document.
 */
export function expectedOutcome(
  monthlyBudget: number,
  costPerClick: Measured,
  conversionRate: Measured,
): Measured {
  if (!costPerClick.measured || !conversionRate.measured) {
    const missing: string[] = [];
    if (!costPerClick.measured) missing.push("what a click costs on these terms");
    if (!conversionRate.measured) missing.push("what share of clicks convert on this page");
    return unmeasured(
      `No forecast, because ${missing.join(" and ")} has not been measured. ` +
      "The first two weeks measure it, and the forecast appears then.",
    );
  }
  const cpc = costPerClick.value ?? 0;
  const cvr = conversionRate.value ?? 0;
  if (cpc <= 0 || cvr <= 0) {
    return unmeasured("A cost per click or a conversion rate of zero cannot produce a forecast.");
  }
  const clicks = monthlyBudget / cpc;
  const mid = clicks * cvr;
  return {
    value: Math.round(mid * 10) / 10,
    measured: true,
    note:
      `Between ${Math.floor(mid * 0.7)} and ${Math.ceil(mid * 1.3)} a month, from ${money(clicks)} clicks ` +
      `at a measured ${(cvr * 100).toFixed(1)} per cent conversion rate. The range is the honest width of ` +
      "a forecast built on your own historic numbers.",
  };
}

/* ------------------------------------------------------------ the pacing */

export type Pacing = {
  spent: number;
  planned: number;
  ratio: number;
  state: "on_track" | "under" | "over";
  note: string;
};

export function pacing(spent: number, monthlyBudget: number, dayOfMonth: number, daysInMonth: number): Pacing {
  const days = Math.max(daysInMonth, 1);
  const day = Math.max(0, Math.min(dayOfMonth, days));
  const planned = monthlyBudget * (day / days);
  const ratio = planned > 0 ? spent / planned : 0;

  if (planned <= 0) return { spent, planned: 0, ratio: 0, state: "on_track", note: "The month has not started." };
  if (ratio > 1 + PACING_BAND) {
    const runsOut = Math.round((day * monthlyBudget) / Math.max(spent, 0.01));
    return {
      spent, planned, ratio, state: "over",
      note:
        `Spending ${((ratio - 1) * 100).toFixed(0)} per cent ahead of the curve. At this rate the budget ` +
        `runs out on day ${runsOut} and there is ${money(monthlyBudget - spent)} left for ${days - day} days.`,
    };
  }
  if (ratio < 1 - PACING_BAND) {
    return {
      spent, planned, ratio, state: "under",
      note:
        `Spending ${((1 - ratio) * 100).toFixed(0)} per cent behind the curve, which paces to ` +
        `${money((spent * days) / Math.max(day, 1))} against a ${money(monthlyBudget)} budget. ` +
        "Underspend is a constraint somewhere, not a saving.",
    };
  }
  return { spent, planned, ratio, state: "on_track", note: "Within fifteen per cent of the curve." };
}

/* ----------------------------------------------------- the double count */

export type PlatformResult = {
  platform: string;
  spend: number;
  clicks: number;
  impressions: number;
  /** What the platform says it caused. Its own attribution, its own window. */
  claimedConversions: number;
  claimedRevenue?: number;
};

export type ClaimedRow = {
  platform: string;
  spend: number;
  claimedConversions: number;
  claimedCpa: number | null;
  claimedRevenue: number;
  label: string;
};

export type Reconciliation = {
  totalSpend: number;
  claimed: ClaimedRow[];
  /** Carried so the gap can be named. Never shown as the conversion count. */
  claimedTotalIfSummed: number;
  measuredConversions: Measured;
  measuredRevenue: Measured;
  blendedCac: Measured;
  blendedRoas: Measured;
  gapNote: string;
};

/**
 * Platform claims, the measured truth, and the distance between them.
 *
 * Every dashboard in this category prints the sum of the first column. This
 * one keeps the columns apart and explains why they disagree.
 */
export function reconcile(
  results: PlatformResult[],
  siteConversions: number | null,
  siteRevenue: number | null = null,
): Reconciliation {
  const totalSpend = results.reduce((n, r) => n + r.spend, 0);
  const claimed: ClaimedRow[] = results.map((r) => ({
    platform: r.platform,
    spend: Math.round(r.spend * 100) / 100,
    claimedConversions: Math.round(r.claimedConversions * 10) / 10,
    claimedCpa: r.claimedConversions > 0 ? Math.round((r.spend / r.claimedConversions) * 100) / 100 : null,
    claimedRevenue: Math.round((r.claimedRevenue ?? 0) * 100) / 100,
    label: "platform-claimed, on that platform's own attribution window",
  }));
  const summed = results.reduce((n, r) => n + r.claimedConversions, 0);

  if (siteConversions === null) {
    const note =
      "The site's own conversion count is not connected, so there is nothing to check the platforms " +
      "against. Until it is, every figure above is a platform marking its own homework.";
    return {
      totalSpend, claimed, claimedTotalIfSummed: summed,
      measuredConversions: unmeasured(note),
      measuredRevenue: unmeasured(note),
      blendedCac: unmeasured("No measured conversion count, so no blended cost."),
      blendedRoas: unmeasured("No measured revenue, so no return."),
      gapNote: "Not calculable without the site's own numbers.",
    };
  }

  const cac: Measured = siteConversions > 0
    ? {
      value: Math.round((totalSpend / siteConversions) * 100) / 100,
      measured: true,
      note: "Total spend over conversions the business actually recorded. No attribution window can move it.",
    }
    : unmeasured("No conversions recorded, so there is no cost per acquisition, only a cost.");

  let gapNote: string;
  if (summed <= 0) {
    gapNote = "The platforms claim nothing, so there is no double count to explain.";
  } else if (siteConversions === 0) {
    gapNote =
      `The platforms claim ${summed.toFixed(0)} between them and the site recorded none. That is either ` +
      "broken tracking or claimed conversions that did not happen, and the first is far more likely.";
  } else {
    const over = summed / siteConversions;
    gapNote = over > 1.15
      ? `The platforms claim ${summed.toFixed(0)} between them. The business recorded ${siteConversions}. ` +
        `That is ${over.toFixed(1)} times as many, which is normal and is not anybody lying: each platform ` +
        "counts a conversion it touched, and a customer often touches two. The number to run the business " +
        `on is ${siteConversions}, at ${cac.value} each.`
      : `The platforms claim ${summed.toFixed(0)} and the business recorded ${siteConversions}, which ` +
        "agree closely enough that either can be used.";
  }

  return {
    totalSpend,
    claimed,
    claimedTotalIfSummed: summed,
    measuredConversions: { value: siteConversions, measured: true, note: "Recorded by the site itself, not by an ad platform." },
    measuredRevenue: siteRevenue !== null
      ? { value: siteRevenue, measured: true, note: "Recorded by the site itself." }
      : unmeasured("Revenue is not connected, so only a cost per conversion is available."),
    blendedCac: cac,
    blendedRoas: siteRevenue !== null && totalSpend > 0
      ? { value: Math.round((siteRevenue / totalSpend) * 100) / 100, measured: true, note: "Measured revenue over total spend." }
      : unmeasured("Needs both measured revenue and spend."),
    gapNote,
  };
}

/* ------------------------------------------------------------- the waste */

export type WasteRow = { kind?: string; name?: string; spend?: number; clicks?: number; conversions?: number };

export type WasteItem = {
  kind: string;
  name: string;
  spend: number;
  clicks: number;
  conversions: number;
  verdict: string;
  action: string;
};

const ACTIONS: Record<string, string> = {
  search_term: "Add as an exact-match negative keyword.",
  placement: "Exclude this placement.",
  audience: "Exclude this audience from the ad set.",
  product: "Exclude this product from the shopping campaign, or fix its page.",
};

/**
 * What spent and returned nothing, with the action rather than the list.
 *
 * The click floor matters: three clicks and no conversion is not evidence,
 * and excluding on it throws away terms that would have worked.
 */
export function findWaste(rows: WasteRow[], targetCpa: number): WasteItem[] {
  if (targetCpa <= 0) return [];
  const ceiling = targetCpa * WASTE_MULTIPLE;
  const out: WasteItem[] = [];

  for (const row of rows) {
    const spend = row.spend ?? 0;
    const clicks = row.clicks ?? 0;
    const conversions = row.conversions ?? 0;
    const kind = row.kind ?? "search_term";
    const name = row.name ?? "";

    if (conversions > 0) {
      const cpa = spend / conversions;
      if (cpa > ceiling) {
        out.push({
          kind, name, spend, clicks, conversions,
          verdict:
            `Converting at ${money(cpa)} against a ${money(targetCpa)} target, which is ` +
            `${(cpa / targetCpa).toFixed(1)} times over.`,
          action: "Lower the bid rather than excluding it. It works, it is just priced wrong.",
        });
      }
      continue;
    }

    if (spend < ceiling) continue;
    if (clicks < CLICK_FLOOR && spend < ceiling * 2) continue;

    out.push({
      kind, name, spend, clicks, conversions,
      verdict: `${money(spend)} spent across ${clicks} clicks and nothing back, against a ${money(targetCpa)} target.`,
      action: ACTIONS[kind] ?? "Exclude it.",
    });
  }
  return out.sort((a, b) => b.spend - a.spend);
}

/* ---------------------------------------------------------- the creative */

export type CreativeVerdict = {
  creativeId: string;
  state: "working" | "fatigued" | "too_early" | "failing";
  note: string;
  action: string;
};

/**
 * Whether a creative is working, burnt out, or has not run long enough.
 *
 * Fatigue is real and measurable, and it is also the excuse given for every
 * creative that never worked. The two are told apart by whether the
 * click-through rate fell from its own peak, or was never there.
 */
export function creativeState(
  creativeId: string,
  impressions: number,
  ctr: number,
  bestCtr: number,
  frequency: number,
  conversions: number,
): CreativeVerdict {
  if (impressions < IMPRESSION_FLOOR) {
    return {
      creativeId, state: "too_early",
      note:
        `${impressions.toLocaleString("en-GB")} impressions, and ${IMPRESSION_FLOOR.toLocaleString("en-GB")} ` +
        "is the floor for reading a click-through rate. Nothing is called yet.",
      action: "Leave it alone.",
    };
  }

  if (bestCtr > 0 && ctr < bestCtr * (1 - CTR_DECLINE)) {
    return {
      creativeId, state: "fatigued",
      note:
        `Click-through rate is ${(ctr * 100).toFixed(2)} per cent against its own best of ` +
        `${(bestCtr * 100).toFixed(2)} per cent, a fall of ${((1 - ctr / bestCtr) * 100).toFixed(0)} per cent` +
        (frequency >= FREQUENCY_CEILING ? `, at a frequency of ${frequency.toFixed(1)}.` : "."),
      action:
        "Replace the creative. The audience has seen it. Refreshing the copy on the same image rarely " +
        "recovers it.",
    };
  }

  if (frequency >= FREQUENCY_CEILING && conversions <= 0) {
    return {
      creativeId, state: "failing",
      note:
        `Seen ${frequency.toFixed(1)} times each by the same people and nothing has converted. This is ` +
        "not fatigue, it never worked.",
      action: "Stop it and try a different angle, not a different crop.",
    };
  }

  if (conversions <= 0 && impressions >= IMPRESSION_FLOOR * 5) {
    return {
      creativeId, state: "failing",
      note: `${impressions.toLocaleString("en-GB")} impressions and no conversions.`,
      action: "Stop it. The next test should change the offer or the hook, not the colour.",
    };
  }

  return {
    creativeId, state: "working",
    note:
      `Click-through rate ${(ctr * 100).toFixed(2)} per cent at a frequency of ${frequency.toFixed(1)}, ` +
      `${conversions.toFixed(0)} conversions.`,
    action: "Leave it running and build the next one from it.",
  };
}
