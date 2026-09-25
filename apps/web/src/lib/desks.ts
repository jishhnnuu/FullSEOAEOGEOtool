/**
 * The four desks, as the public site describes them.
 *
 * One definition, four front doors. Search demand is service shaped: nobody
 * types "digital marketing agency run by AI agents", they type "seo agency" or
 * "google ads agency". Each of those is a different keyword universe, a
 * different competitor set and a different objection, so each gets its own
 * page written for its own buyer rather than one page with a word swapped.
 *
 * Every desk says what it can do today in `ready`, and where one step waits
 * on a platform approving us, the tag says so. A page implying a service that
 * is not running is the one thing this business cannot survive, because not
 * overstating is the whole product.
 *
 * The team counts and the refusals are not written here. They come from
 * `org.ts`, which reads the generated roster, which is built from the agent
 * specs the server installation actually runs. A marketing page cannot claim a
 * headcount the roster does not have.
 */

import { MANAGERS, type Manager, type ManagerKey } from "./org";
import { PLANS, type PlanId, priceLabel as planPrice } from "./plans";

export type Desk = {
  key: ManagerKey;
  /** The public path. Chosen for the query people actually type. */
  path: string;
  /** Nav and tile label. */
  label: string;
  /** The page's h1. One claim, not a category name. */
  headline: string;
  /** The line on a desk tile. Under ten words, and it has to make somebody smile or nod. */
  tagline: string;
  /**
   * What this desk can do today, as a tag small enough to sit on a tile.
   * "go" means it carries the work end to end. "part" means it plans and
   * drafts everything, and one step waits on a platform approving us. Never
   * "coming soon": the desk page names the exact step and the exact queue.
   */
  ready: { tone: "go" | "part"; label: string };
  /** The one free thing a visitor can do on this desk's page, right now. */
  tryIt: { href: string; label: string };
  /** Who this page is written for, named plainly. */
  audience: string;
  /** The standfirst under the h1. */
  lede: string;
  /** What the buyer of this desk is actually worried about, in their words. */
  worry: string;
  /** The answer to that worry, which is the page's argument. */
  answer: string;
  /** What the desk does, as the client would describe it. */
  work: { title: string; body: string; applied: boolean }[];
  /** What an agency charges for the same scope, and where that number comes from. */
  agencyPrice: string;
  agencyBasis: string;
  /**
   * The lowest plan that unlocks this desk's work. Null where the desk is not
   * built. Deliberately not a price of its own: `plans.ts` is the single plan
   * definition and `server/quota.ts` enforces it, so a desk page inventing its
   * own number is exactly the pricing-grid dishonesty this codebase refuses.
   */
  requiresPlan: PlanId | null;
  /** Search terms this page is written to answer. */
  answers: string;
};

export const DESKS: Desk[] = [
  {
    key: "search",
    path: "/seo",
    label: "Search",
    headline: "SEO that fixes things. Not a list of things.",
    tagline: "Get found on Google, and in AI answers too.",
    ready: { tone: "go", label: "Live: fixes ship today" },
    tryIt: { href: "/app/new", label: "Audit my site free" },
    audience: "Anyone who has paid for an SEO audit and still has the same problems.",
    lede: "We find what's broken, write the fix and push it to your site. You click yes.",
    worry: "I paid for an audit once. I got a PDF. The problems are still there.",
    answer: "Same. That's why every problem here comes with the fix already written, ready to ship.",
    work: [
      { title: "The full check-up", body: "Every page read, every problem found, in about four minutes.", applied: true },
      { title: "Fixes, written and shipped", body: "Titles, meta, redirects, sitemaps. Written, pushed live, double-checked.", applied: true },
      { title: "Schema that plays nice", body: "Structured data that fits what you already have instead of breaking it.", applied: true },
      { title: "Smarter internal links", body: "Links added where your sentences already make sense for them.", applied: true },
      { title: "Show up in AI answers", body: "Get cited by ChatGPT, Perplexity and Google's AI, not just ranked.", applied: true },
      { title: "Links and local", body: "Outreach drafted for you, reviews answered, listings kept tidy.", applied: false },
    ],
    agencyPrice: "£1,800 to £4,000 a month",
    agencyBasis: "A mid-market UK retainer for technical SEO, content briefs and reporting, at 20 to 40 hours.",
    requiresPlan: "starter",
    answers: "What the search desk does, what it refuses to do, and what it costs against an SEO agency retainer.",
  },
  {
    key: "content",
    path: "/content",
    label: "Content",
    headline: "Content with an opinion. Finally.",
    tagline: "Posts people actually finish reading.",
    ready: { tone: "go", label: "Live today" },
    tryIt: { href: "/tools/voice-check", label: "Test my writing free" },
    audience: "Companies publishing regularly and seeing nothing move.",
    lede: "We figure out what you should be saying, then write it so people read to the end.",
    worry: "We publish every week. Traffic's fine. Nothing else happens.",
    answer: "Because it sounds like everyone else. We find the thing only you can say, and build everything around it.",
    work: [
      { title: "Your big idea", body: "One clear point of view, agreed once, behind everything we write.", applied: true },
      { title: "Research first", body: "We read your business and your rivals before writing a word.", applied: true },
      { title: "Briefs that make sense", body: "Every piece planned from real gaps, not a keyword spreadsheet.", applied: true },
      { title: "Drafts that pass three edits", body: "Fact check, voice check, and one question: would anyone finish this?", applied: true },
      { title: "Your voice, measured", body: "How you actually sound, compared with the pages you compete with.", applied: true },
      { title: "One piece, many uses", body: "Every article turned into posts, emails and snippets.", applied: false },
    ],
    agencyPrice: "£2,000 to £5,000 a month",
    agencyBasis: "A content agency retainer for strategy, four to eight pieces and distribution.",
    requiresPlan: "growth",
    answers: "What the content desk does, how tone of voice is measured, and what it costs against a content agency.",
  },
  {
    key: "paid",
    path: "/paid",
    label: "Paid ads",
    headline: "Ads that earn their keep.",
    tagline: "Ads that don't set your money on fire.",
    ready: { tone: "part", label: "Plans today · launches after approval" },
    tryIt: { href: "/tools/ad-budget-check", label: "Check my ad budget free" },
    audience: "Anyone paying for clicks and not sure the numbers are real.",
    lede: "Google, Meta, TikTok and more. Planned, built and tracked. We won't spend a penny we can't measure.",
    worry: "Our agency reports more sales than we actually made. Which ads are working?",
    answer: "Every platform counts the same sale as its own. We show you your real number, per platform, no double counting.",
    work: [
      { title: "Tracking, checked first", body: "If we can't measure it, we won't spend on it. Full stop.", applied: true },
      { title: "Honest budget maths", body: "Too small to work? We'll say so, and show you how to fix it.", applied: true },
      { title: "The offer that sells", body: "What you're actually promising, sharpened before any ad is made.", applied: true },
      { title: "Every size, done", body: "One image becomes every ad size, with nothing hidden behind the buttons.", applied: true },
      { title: "Built safe", body: "Every campaign built paused. Nothing spends until you press go.", applied: true },
      { title: "Real results", body: "Your own sales count, not the platforms adding each other up.", applied: true },
    ],
    agencyPrice: "10 to 20 per cent of spend",
    agencyBasis: "The standard UK management fee, which rises with your budget whether or not the work does, and which pays more when you spend more.",
    requiresPlan: "growth",
    answers: "What the paid media desk does, what it refuses, and why it checks your tracking before it will take a budget.",
  },
  {
    key: "social",
    path: "/social",
    label: "Social",
    headline: "Socials that know what's working.",
    tagline: "Copy what works for your rivals. Legally.",
    ready: { tone: "part", label: "Drafts today · posts after approval" },
    tryIt: { href: "/tools/social-teardown", label: "Spy on a competitor free" },
    audience: "Businesses posting all the time and hearing crickets.",
    lede: "We study what's working for your competitors, pick your best platforms and write every post for you.",
    worry: "Our last agency showed us a competitor's reach. How did they even get that?",
    answer: "They didn't. Nobody can see a rival's reach. We show you what we can prove: which of their posts beat their usual, and why.",
    work: [
      { title: "Competitor teardowns", body: "Their best posts, and what those winners had in common.", applied: true },
      { title: "Share of voice", body: "Up to five brands side by side. Who's loud, and who's actually heard.", applied: true },
      { title: "The right platforms", body: "Where to show up, and where to stop wasting your time.", applied: true },
      { title: "Hooks that stop the scroll", body: "First lines and first frames, built from what actually worked.", applied: true },
      { title: "A calendar you can keep", body: "A posting rhythm based on your real capacity, not wishful thinking.", applied: true },
      { title: "Every post, drafted", body: "Captions, scripts and replies written in your voice, ready to approve.", applied: false },
    ],
    agencyPrice: "£1,200 to £3,000 a month",
    agencyBasis: "A UK social retainer for planning, production, scheduling and community management.",
    requiresPlan: "growth",
    answers: "What the social desk reads, what every platform refuses to publish, and what it costs against a social agency.",
  },
];

export function deskByKey(key: ManagerKey): Desk | undefined {
  return DESKS.find((d) => d.key === key);
}

export function deskByPath(path: string): Desk | undefined {
  return DESKS.find((d) => d.path === path);
}

/** The roster entry behind a desk, so a page cannot overstate the team. */
export function managerFor(desk: Desk): Manager {
  const manager = MANAGERS.find((m) => m.key === desk.key);
  if (!manager) throw new Error(`No manager in the roster for desk ${desk.key}`);
  return manager;
}

export function liveDesks(): Desk[] {
  return DESKS.filter((d) => managerFor(d).status === "live");
}

/**
 * What this desk costs, read from the plan that unlocks it, or the quarter it
 * opens. Never a number of its own.
 */
export function deskPrice(desk: Desk): string {
  if (desk.requiresPlan === null) return `Opens ${managerFor(desk).opens}`;
  return planPrice(PLANS[desk.requiresPlan]);
}

/**
 * Every desk on one plan, which is the upsell rather than the entry. People
 * arrive wanting one thing and expand once they trust you, so this is where a
 * service page sends someone who has already decided.
 */
export const WHOLE_AGENCY = {
  path: "/the-whole-agency",
  label: "The whole agency",
  plan: "growth" as PlanId,
  reason:
    "Search and content read the same crawl and the same competitor pages, so the research runs once rather than twice. An agency staffs that as two teams, bills it as two teams, and the two teams contradict each other in the same deck.",
};
