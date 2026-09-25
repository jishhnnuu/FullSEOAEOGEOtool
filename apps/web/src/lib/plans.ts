/**
 * The plans, and what each one actually permits.
 *
 * Priced per site, per month, in one place, so the pricing page and the quota
 * enforcement cannot disagree. That matters more than it sounds: the most
 * common dishonesty in this category is a pricing grid ticking a capability
 * the product gates somewhere else, and the only defence against it is having
 * exactly one definition.
 *
 * Deliberately not a credit model. Credits make cost unforecastable for the
 * buyer least able to absorb a surprise, and they need several paragraphs to
 * explain, which is itself the tell. Pages per run is comprehensible on sight
 * and it maps to the one resource a crawl actually consumes.
 *
 * The free tier is not a trial. The audit runs with no account, no card and no
 * time limit, because that property is the product's spine: a deployment with
 * no database still audits. Paying buys scheduling, publishing, history and
 * scale, which are the things that genuinely cost something to run.
 */

export type PlanId = "free" | "starter" | "growth" | "scale";

export type Plan = {
  id: PlanId;
  name: string;
  /** Minor units, in GBP. Zero means free rather than "contact us". */
  amount: number;
  currency: "GBP";
  per: string;
  blurb: string;
  /** Hard limits, enforced at the crawl boundary rather than described here. */
  limits: {
    /** Pages fetched per audit run. */
    pagesPerRun: number;
    /** Sites in one workspace. */
    sites: number;
    /** Stored runs, which is what makes a diff and a trend possible. */
    runHistory: number;
    /** Scheduled unattended runs. */
    scheduling: boolean;
    /** Publishing approved changes into a CMS. */
    publishing: boolean;
    /** Answer visibility measurement, which needs the tenant's own model key. */
    answerVisibility: boolean;
    /** The link programme: prospects, verification, outreach drafting. */
    linkProgramme: boolean;
    /** Local: Business Profile, review replies, citations. */
    local: boolean;
    /** Client-facing reports under the customer's own brand. */
    whiteLabel: boolean;
    /*
     * The desks beyond search.
     *
     * These were missing while three of the four desks shipped, so the
     * pricing grid described an SEO tool and the desk pages quoted a plan the
     * grid never mentioned. A visitor could not work out what content, social
     * or paid cost, and `permits()` could not gate them because there was
     * nothing to read. One plan definition means every desk appears in it.
     */
    /** The content desk: point of view, briefs, drafts, the three edit gates. */
    contentDesk: boolean;
    /** The social desk: teardowns, share of voice, calendar, drafted posts. */
    socialDesk: boolean;
    /** The paid desk: readiness, plan, creative specs, campaigns, reconciliation. */
    paidDesk: boolean;
  };
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    amount: 0,
    currency: "GBP",
    per: "forever, no account",
    blurb: "See what's broken before you decide anything.",
    limits: {
      pagesPerRun: 40,
      sites: 1,
      runHistory: 1,
      scheduling: false,
      publishing: false,
      answerVisibility: false,
      linkProgramme: false,
      local: false,
      whiteLabel: false,
      contentDesk: false,
      socialDesk: false,
      paidDesk: false,
    },
    features: [
      "Every check we run, on up to 40 pages",
      "Every fix written for you",
      "See if AI tools can read your site",
      "Three content briefs",
      "Take it all with you as a file",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    amount: 7900,
    currency: "GBP",
    per: "per site, per month",
    blurb: "Your SEO, fixed for you. One site.",
    limits: {
      pagesPerRun: 250,
      sites: 1,
      runHistory: 26,
      scheduling: true,
      publishing: true,
      answerVisibility: true,
      linkProgramme: false,
      local: false,
      whiteLabel: false,
      contentDesk: false,
      socialDesk: false,
      paidDesk: false,
    },
    features: [
      "Everything in Free, on up to 250 pages",
      "Fixes pushed live to WordPress, Shopify, Webflow and more",
      "Weekly check-ups, while you sleep",
      "Google Search Console and Analytics plugged in",
      "You choose what needs your yes",
      "See if ChatGPT and friends mention you",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    amount: 24900,
    currency: "GBP",
    per: "per site, per month",
    blurb: "The whole team. Replaces your agency.",
    limits: {
      pagesPerRun: 2000,
      sites: 1,
      runHistory: 104,
      scheduling: true,
      publishing: true,
      answerVisibility: true,
      linkProgramme: true,
      local: true,
      whiteLabel: false,
      contentDesk: true,
      socialDesk: true,
      paidDesk: true,
    },
    features: [
      "Everything in Starter, on up to 2,000 pages",
      "The content desk: posts written in your voice",
      "The social desk: rival teardowns and a drafted calendar",
      "The paid desk: ads planned, built and honestly reported",
      "Local: your Google profile, posts and review replies",
      "Link outreach, drafted from your own inbox",
      "A monthly report that shows its working",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    amount: 0,
    currency: "GBP",
    per: "multi-site and white label",
    blurb: "Lots of sites, or an agency with clients.",
    limits: {
      pagesPerRun: 10000,
      sites: 1000,
      runHistory: 520,
      scheduling: true,
      publishing: true,
      answerVisibility: true,
      linkProgramme: true,
      local: true,
      whiteLabel: true,
      contentDesk: true,
      socialDesk: true,
      paidDesk: true,
    },
    features: [
      "Everything in Growth, on every site",
      "Unlimited sites and seats",
      "Reports under your own brand",
      "Run it on your servers, or ours",
      "First in line for the integrations you need",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "scale"];

export function planOf(id: string | null | undefined): Plan {
  // Anything unrecognised falls back to free rather than throwing. A billing
  // record that has not synced yet should degrade a workspace to the free
  // tier, never lock someone out of their own audit.
  return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

export function priceLabel(plan: Plan): string {
  if (plan.id === "scale") return "Custom";
  if (plan.amount === 0) return "£0";
  return `£${Math.round(plan.amount / 100)}`;
}

/**
 * Whether a plan permits a capability, by name.
 *
 * Used by routes and by the UI so a screen and the server agree. A screen that
 * offers a button the server refuses is a worse experience than not showing
 * the button, and it is also how a pricing page ends up lying.
 */
export function permits(plan: Plan, capability: keyof Plan["limits"]): boolean {
  const value = plan.limits[capability];
  return typeof value === "boolean" ? value : value > 0;
}

/** What to tell someone who hit a ceiling, and which plan clears it. */
export function upgradeFor(capability: keyof Plan["limits"]): PlanId | null {
  for (const id of PLAN_ORDER) {
    if (permits(PLANS[id], capability)) return id;
  }
  return null;
}

/**
 * What each tier does not include, derived from the limits rather than
 * written by hand.
 *
 * Written lists go stale the first time a capability moves between tiers, and
 * a pricing page showing a capability as excluded when the product grants it
 * is the same class of error as the reverse. This reads the limits, so it
 * cannot disagree with what the server enforces.
 *
 * Only boolean capabilities appear. A page ceiling is a number and belongs in
 * the feature list, where it can carry its value.
 */
const BOOLEAN_CAPABILITIES = [
  "scheduling",
  "publishing",
  "answerVisibility",
  "linkProgramme",
  "local",
  "contentDesk",
  "socialDesk",
  "paidDesk",
  "whiteLabel",
] as const;

export const EXCLUDED_FOR: Record<PlanId, string[]> = Object.fromEntries(
  PLAN_ORDER.map((id) => {
    const plan = PLANS[id];
    // Only name a gap a higher tier actually fills. Listing something no plan
    // offers reads as a missing feature rather than an upgrade path.
    const missing = BOOLEAN_CAPABILITIES.filter(
      (capability) => !plan.limits[capability] && PLAN_ORDER.some((other) => PLANS[other].limits[capability]),
    );
    return [id, missing as unknown as string[]];
  }),
) as Record<PlanId, string[]>;

/* ----------------------------------------------------------------- quota */

/**
 * The shape a quota decision takes.
 *
 * Defined here rather than in `server/quota.ts` so the two helpers below stay
 * free of any server import. They are the part with real logic in it, so they
 * are the part that has to be testable without a Workers runtime.
 */
export type Allowance = {
  plan: Plan;
  pagesPerRun: number;
  known: boolean;
  note: string | null;
};

/** Clamp a requested page count, and say what happened. */
export function clampPages(requested: number, allowance: Allowance): { pages: number; capped: boolean } {
  const wanted = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : allowance.pagesPerRun;
  const pages = Math.min(wanted, allowance.pagesPerRun);
  return { pages, capped: pages < wanted };
}

/** The sentence a screen shows when a cap bit. Names the plan that lifts it. */
export function capMessage(allowance: Allowance, requested: number): string | null {
  if (requested <= allowance.pagesPerRun) return null;
  const next = allowance.plan.id === "free" ? PLANS.starter : allowance.plan.id === "starter" ? PLANS.growth : null;
  const base =
    `This run covers ${allowance.pagesPerRun} pages of the ${requested} asked for, so every score below is a score ` +
    `of those ${allowance.pagesPerRun}.`;
  if (!next) return base;
  return `${base} ${next.name} raises the ceiling to ${next.limits.pagesPerRun.toLocaleString()}.`;
}
