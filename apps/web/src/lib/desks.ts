/**
 * The four desks, as the public site describes them.
 *
 * A desk is the AI team behind one service. Every client also has a person on
 * the account (see `services.ts`), so these pages describe what the AI team
 * does and who the founder talks to, in that order of importance reversed:
 * the person first, the desk behind them.
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
  /**
   * One sentence under the hero buttons saying what waits for the visitor's
   * yes, and, where a platform has to approve us first, that too. Every desk
   * asks before anything goes live, so every desk says so the same way.
   */
  readyNote: string;
  /** The word in the headline the mascot flies in and sits on. Must appear in `headline`. */
  seat: string;
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
    ready: { tone: "go", label: "Fixes ready today" },
    readyNote: "Nothing goes live until you say yes.",
    seat: "SEO",
    tryIt: { href: "/thymelab/seo/audit", label: "Check any website's SEO free" },
    audience: "Founders whose website isn't bringing in customers from Google or from AI answers.",
    lede: "Your specialist and our AI team find what's holding your site back, fix it, and show you what changed. You just say yes.",
    worry: "I don't really know what SEO is. I just know nobody finds us.",
    answer: "You don't need to know. Your specialist explains it in plain English, and the AI team does the fixing.",
    work: [
      { title: "The full check-up", body: "Every page read, every problem found, in about four minutes.", applied: true },
      { title: "Fixes, written and shipped", body: "Titles, meta, redirects, sitemaps. Written, pushed live, double-checked.", applied: true },
      { title: "Schema that plays nice", body: "Structured data that fits what you already have instead of breaking it.", applied: true },
      { title: "Smarter internal links", body: "Links added where your sentences already make sense for them.", applied: true },
      { title: "Show up in AI answers", body: "Get cited by ChatGPT, Perplexity and Google's AI, not just ranked.", applied: true },
      { title: "Links and local", body: "Outreach drafted for you, reviews answered, listings kept tidy.", applied: false },
    ],
    requiresPlan: "starter",
    answers: "What the search desk does, what it refuses to do, and what it costs against an SEO agency retainer.",
  },
  {
    key: "content",
    path: "/content",
    label: "Content",
    headline: "Content with an opinion. Finally.",
    tagline: "Posts people actually finish reading.",
    ready: { tone: "go", label: "Drafts ready today" },
    readyNote: "Every draft waits for your yes before it goes anywhere.",
    seat: "Content",
    tryIt: { href: "/thymelab/content/voice", label: "Test my writing free" },
    audience: "Founders who need to explain what they do, and be found for it.",
    lede: "We work out with you what you should be saying, then write it so people read to the end.",
    worry: "I know we should be writing things. I never have the time, and I don't know what to say.",
    answer: "Your specialist agrees one clear idea with you on a call. The AI team researches and drafts. You approve.",
    work: [
      { title: "Your big idea", body: "One clear point of view, agreed once, behind everything we write.", applied: true },
      { title: "Research first", body: "We read your business and your rivals before writing a word.", applied: true },
      { title: "Briefs that make sense", body: "Every piece planned from real gaps, not a keyword spreadsheet.", applied: true },
      { title: "Drafts that pass three edits", body: "Fact check, voice check, and one question: would anyone finish this?", applied: true },
      { title: "Your voice, measured", body: "How you actually sound, compared with the pages you compete with.", applied: true },
      { title: "One piece, many uses", body: "Every article turned into posts, emails and snippets.", applied: false },
    ],
    requiresPlan: "growth",
    answers: "What the content desk does, how tone of voice is measured, and what it costs against a content agency.",
  },
  {
    key: "paid",
    path: "/paid",
    label: "Paid ads",
    headline: "Ads that earn their keep.",
    tagline: "Ads that don't set your money on fire.",
    ready: { tone: "part", label: "Plans ready today" },
    readyNote: "Every campaign is built paused and waits for your yes. Launching opens as each ad platform approves us.",
    seat: "Ads",
    tryIt: { href: "/thymelab/ads/budget", label: "Check my ad budget free" },
    audience: "Founders ready to pay for customers, who want to know the numbers are real.",
    lede: "Google, Meta, TikTok and more, planned with your specialist and built by our AI team. We won't spend a penny we can't measure.",
    worry: "We tried ads once. We spent the money and couldn't tell what it bought.",
    answer: "We check your tracking before we spend anything, and report your real sales, not what each platform claims.",
    work: [
      { title: "Tracking, checked first", body: "If we can't measure it, we won't spend on it. Full stop.", applied: true },
      { title: "Honest budget maths", body: "Too small to work? We'll say so, and show you how to fix it.", applied: true },
      { title: "The offer that sells", body: "What you're actually promising, sharpened before any ad is made.", applied: true },
      { title: "Every size, done", body: "One image becomes every ad size, with nothing hidden behind the buttons.", applied: true },
      { title: "Built safe", body: "Every campaign built paused. Nothing spends until you press go.", applied: true },
      { title: "Real results", body: "Your own sales count, not the platforms adding each other up.", applied: true },
    ],
    requiresPlan: "growth",
    answers: "What the paid media desk does, what it refuses, and why it checks your tracking before it will take a budget.",
  },
  {
    key: "social",
    path: "/social",
    label: "Social",
    headline: "Socials that know what's working.",
    tagline: "See what's working for your rivals.",
    ready: { tone: "part", label: "Drafts ready today" },
    readyNote: "Every post waits for your yes. Auto-posting opens as each platform approves us.",
    seat: "Socials",
    tryIt: { href: "/thymelab/social/teardown", label: "Scout a competitor free" },
    audience: "Founders who know they should be posting and never have the time.",
    lede: "Your specialist picks the right platforms with you. Our AI team studies what works for your competitors and drafts every post.",
    worry: "We post when we remember. Nothing happens.",
    answer: "Posting more won't fix that. We look at which of your competitors' posts actually worked, and plan yours from that.",
    work: [
      { title: "Competitor teardowns", body: "Their best posts, and what those winners had in common.", applied: true },
      { title: "Share of voice", body: "Up to five brands side by side. Who's loud, and who's actually heard.", applied: true },
      { title: "The right platforms", body: "Where to show up, and where to stop wasting your time.", applied: true },
      { title: "Hooks that stop the scroll", body: "First lines and first frames, built from what actually worked.", applied: true },
      { title: "A calendar you can keep", body: "A posting rhythm based on your real capacity, not wishful thinking.", applied: true },
      { title: "Every post, drafted", body: "Captions, scripts and replies written in your voice, ready to approve.", applied: false },
    ],
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

