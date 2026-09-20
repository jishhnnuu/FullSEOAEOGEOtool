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
    blurb: "Anyone who wants to see what is actually wrong before deciding anything.",
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
    },
    features: [
      "The full check catalogue on every run",
      "Up to 40 pages crawled per run",
      "Every fix that can be generated, generated",
      "AI crawler access and extractability checks",
      "Content gaps and three briefs",
      "Export everything as JSON",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    amount: 7900,
    currency: "GBP",
    per: "per site, per month",
    blurb: "A single site that wants the work done rather than described.",
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
    },
    features: [
      "Everything in Free",
      "Up to 250 pages crawled per run",
      "Weekly scheduled runs, with nobody watching",
      "Full run history and change reporting",
      "Search Console and Analytics connected",
      "Approval queue with autonomy levels",
      "Publishing to WordPress, Shopify, Webflow or a webhook",
      "AI answer visibility on your own model key",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    amount: 24900,
    currency: "GBP",
    per: "per site, per month",
    blurb: "The plan that actually replaces a retainer. Content, local and links included.",
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
    },
    features: [
      "Everything in Starter",
      "Up to 2,000 pages crawled per run",
      "Content production on your cadence, with the quality gates",
      "Local cycle: profile, posts, review replies, citations",
      "Link prospecting and outreach from your own domain",
      "Monthly narrative report with the trace behind every claim",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    amount: 0,
    currency: "GBP",
    per: "multi-site and white label",
    blurb: "Agencies running this for their own clients, and companies with a portfolio of sites.",
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
    },
    features: [
      "Everything in Growth, across every site",
      "Unlimited sites and seats",
      "Client-facing reports under your own brand",
      "Self-hosted deployment, or we run it",
      "Priority on connector work you need",
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
  if (plan.id === "scale") return "Talk to us";
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
