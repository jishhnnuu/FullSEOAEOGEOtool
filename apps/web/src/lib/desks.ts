/**
 * The four desks, as the public site describes them.
 *
 * One definition, four front doors. Search demand is service shaped: nobody
 * types "digital marketing agency run by AI agents", they type "seo agency" or
 * "google ads agency". Each of those is a different keyword universe, a
 * different competitor set and a different objection, so each gets its own
 * page written for its own buyer rather than one page with a word swapped.
 *
 * Two of these desks exist. Two do not, and their pages say so with the
 * quarter they open. A page implying a service that is not built is the one
 * thing this business cannot survive, because not overstating is the whole
 * product.
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
    headline: "An SEO team that ships the fix, not a list of them.",
    audience: "Founders and marketing leads who have had an audit before and still have the same problems.",
    lede:
      "They crawl the site, find what is wrong, write the change, push it through your CMS and check it went live. You approve. You do not open a spreadsheet.",
    worry: "I have paid for an audit before. I got a PDF and a list of things to do, and the list is still on my desk.",
    answer:
      "That is the difference this desk is built around. A finding without a fix is an audit tool, and there are forty of those. Every finding here arrives with the change already written, and where no API exists to apply it we say so in that sentence rather than handing it back to you as a task.",
    work: [
      {
        title: "The crawl and the 90 checks",
        body: "Every page fetched, parsed and run against the full catalogue. Coverage is stated above the score: forty of fifty-five pages is a score of those forty, and you are told so before you read the number.",
        applied: true,
      },
      {
        title: "Fixes written and pushed",
        body: "Titles, meta, headings, canonicals, redirects, robots and sitemaps. Written as complete changes, applied through your CMS, then re-fetched to confirm they are live.",
        applied: true,
      },
      {
        title: "Structured data that respects your graph",
        body: "A node carrying an @id is a reference into your entity graph, not an incomplete copy of it. Completing one writes a second conflicting definition, so this desk resolves it first and writes nothing if the target already exists.",
        applied: true,
      },
      {
        title: "Internal links from sentences that already exist",
        body: "A contextual link is refused unless a paragraph on the source page already shares terms with the target. Inserting one anywhere else means writing a sentence, and that is a content change pretending to be a linking change.",
        applied: true,
      },
      {
        title: "AI answer visibility",
        body: "Whether answer engines can reach, parse and cite you, tracked against named rivals. Brand mentions correlate with AI Overview visibility at 0.664 and backlinks at 0.218, so the programme is weighted to match that rather than to flatter a link report.",
        applied: true,
      },
      {
        title: "Links and local",
        body: "Prospecting with scheme risk and waste risk scored separately, outreach drafted into your own mail client, listings and review replies. Nothing is sent from your domain by us.",
        applied: false,
      },
    ],
    agencyPrice: "£1,800 to £4,000 a month",
    agencyBasis: "A mid-market UK retainer for technical SEO, content briefs and reporting, at 20 to 40 hours.",
    requiresPlan: "starter",
    answers: "What an SEO desk of 39 agents does, what it refuses to do, and what it costs against an agency retainer.",
  },
  {
    key: "content",
    path: "/content",
    label: "Content",
    headline: "Content that argues something, not content that fills a calendar.",
    audience: "Companies publishing regularly, seeing traffic, and seeing nothing else move.",
    lede:
      "They read your business, your buyer and the pages you compete with before a brief exists. One argument per client, written down and approved once, with everything laddering to it.",
    worry: "We publish constantly. Nobody reads it, nobody cites it, and I cannot tell you what any of it was for.",
    answer:
      "That is what happens when production quality is applied to an idea nobody argued about. This desk will not commission anything until there is a point of view you have approved, and the third edit gate asks the question the other two do not: would a person actually finish reading this?",
    work: [
      {
        title: "Read the business first",
        body: "Your pricing page, your customer stories and your documentation, read before a brief exists. Every claim that reaches a draft is in the fact ledger with the page it came from.",
        applied: true,
      },
      {
        title: "Read the field, not the listing",
        body: "The actual pages you compete with, fetched and measured. Length, depth, format, who signs them, and what they all leave out. Median and range, never one example.",
        applied: true,
      },
      {
        title: "A point of view, approved once",
        body: "What the field says, where it breaks, what you say instead, and who it is against. If nobody could argue with it, it is a description rather than an argument and it goes back.",
        applied: true,
      },
      {
        title: "Tone measured, not asserted",
        body: "Rhythm, hedging, filler, specifics and reading grade, yours against the field's median. No verdict on fewer than three readable rivals, because two is one writer's habit and rewriting a site against it is the expensive kind of wrong.",
        applied: true,
      },
      {
        title: "Three gates, checking different things",
        body: "The fact checker asks whether it is true. The editor asks whether it is correct and findable. The story editor asks whether anyone would finish it. Most operations have the first two, and it is why so much published content is accurate, optimised and inert.",
        applied: true,
      },
      {
        title: "Distribution decided before the draft",
        body: "Named destinations, never the word social. Four derived assets pulled out of every finished piece, rewritten per format rather than resized.",
        applied: true,
      },
    ],
    agencyPrice: "£2,000 to £5,000 a month",
    agencyBasis: "A content agency retainer for strategy, four to eight pieces and distribution.",
    requiresPlan: "growth",
    answers: "What a content marketing desk of 14 agents does, how tone is measured, and what it costs.",
  },
  {
    key: "paid",
    path: "/paid",
    label: "Paid ads",
    headline: "Paid media that reads the organic data before it spends.",
    audience: "Anyone paying for clicks on terms they may already own.",
    lede:
      "Search, shopping and paid social, planned against the same research the other desks run on. Not built yet. This page says what it will do and when, because a page implying a service exists is the one thing this business cannot survive.",
    worry: "Our agency bids on our brand and on terms we already rank first for, and calls the result attribution.",
    answer:
      "This desk will read what organic already wins before it recommends spending on it, budget by measured incremental value rather than channel habit, and check every creative claim against the same fact ledger the content desk uses. Until it exists, we will not take money for it.",
    work: [
      { title: "Read organic first", body: "No spend recommendation on a term the organic programme already ranks first for, unless measured incrementality says otherwise.", applied: false },
      { title: "Budget by incrementality", body: "What the spend added, not what it was adjacent to. Reported against outcome, with the losers named.", applied: false },
      { title: "One fact ledger", body: "Every claim in an ad checked against the same source the content desk writes from, so paid and organic cannot contradict each other.", applied: false },
      { title: "Spend is always a person's decision", body: "No budget change applied on its own, at any autonomy level, ever.", applied: false },
    ],
    agencyPrice: "10 to 20 per cent of spend",
    agencyBasis: "The standard UK PPC management fee, which rises with your budget whether or not the work does.",
    requiresPlan: null,
    answers: "What the paid media desk will do, what it refuses, and the quarter it opens.",
  },
  {
    key: "social",
    path: "/social",
    label: "Social",
    headline: "Social that reads the field before it posts, and tells you what it cannot see.",
    audience: "Businesses posting consistently, seeing nothing back, and being shown competitor reach figures by agencies who cannot possibly have them.",
    lede:
      "They read the competitors the platforms actually permit, find the posts that beat those accounts' own medians, and report what the winners had in common. Then they say plainly which platforms publish nothing at all.",
    worry: "Our last agency showed us a competitor's reach and impressions. How did they get those, and why does our own reporting never match anything?",
    answer:
      "They did not get them. Impressions and reach are computed by the platform for the account owner and exposed only through that owner's own token, on every network without exception. Any competitor reach figure you have been shown was estimated from follower count. This desk will not print one, and it publishes the map of what each platform does and does not allow before any work starts.",
    work: [
      {
        title: "The teardown, against their own median",
        body: "For each competitor: the median engagement, every post that cleared twice it, and the traits those winners share. A post at 6x its own account's median is the finding. Four thousand likes on a large account is not.",
        applied: true,
      },
      {
        title: "What the winners had in common",
        body: "Format, hook archetype, opening length, and whether their best posts carry more or less call-to-action machinery than their average. Twelve posts is the floor for a median and three winners is the floor for a pattern, and below either the desk says so instead of assembling a playbook.",
        applied: true,
      },
      {
        title: "Share of voice, with the gap that matters",
        body: "Up to five brands at once. Share of posts is how loud a brand is, share of engagement is how much anyone cared, and the gap between them is the useful number. Forty per cent of the posts and twelve per cent of the engagement is not winning, it is shouting.",
        applied: true,
      },
      {
        title: "Which platform to leave",
        body: "Ranked by engagement rate against each platform's own audience, which is the only cross-platform comparison that survives. Usually the most valuable sentence here is that one platform is not worth the effort.",
        applied: true,
      },
      {
        title: "Hooks built from evidence",
        body: "Ten openings per post, in the archetypes that measurably cleared the bar in this category, about the client's own subject. Reuse the shape, never the sentence.",
        applied: true,
      },
      {
        title: "Replies drafted, never sent",
        body: "Community management in the approved voice, with complaints, legal matters and anything involving a named individual escalated to a person. Nothing leaves the account without approval, at any autonomy level.",
        applied: false,
      },
    ],
    agencyPrice: "£1,200 to £3,000 a month",
    agencyBasis: "A UK social retainer for planning, production, scheduling and community management.",
    requiresPlan: "growth",
    answers: "What a social desk of 12 specialists reads, what every platform refuses to publish, and what it costs.",
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
