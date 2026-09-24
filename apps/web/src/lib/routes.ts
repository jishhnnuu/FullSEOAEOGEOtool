/**
 * Every public URL, in one list.
 *
 * The sitemap, the llms.txt, the footer and the internal-link checks all read
 * from here, so a page cannot ship without being reachable. A page that exists
 * and is in no sitemap and linked from nothing is an orphan, which is a
 * finding this product raises against other people's sites.
 */

export type PublicRoute = {
  path: string;
  /** Title, used in the llms.txt listing and in navigation. */
  title: string;
  /** What the page answers, in one line. llms.txt is a map of answers. */
  answers: string;
  /** Sitemap priority. The audit and the comparison pages are the funnel. */
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  /** Grouping for the footer and the sitemap page. */
  section: "product" | "compare" | "tools" | "learn" | "company";
};

export const ROUTES: PublicRoute[] = [
  {
    path: "/",
    title: "Everything an agency does. None of the agency.",
    answers: "What the firm is, which desks exist, what each costs, and where to look inside a live account.",
    priority: 1.0,
    changeFrequency: "weekly",
    section: "product",
  },
  {
    path: "/platform",
    title: "The platform",
    answers: "Every capability: crawl, checks, fixes, schema, content, local, links, answer visibility.",
    priority: 0.9,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/ai-search",
    title: "AEO and GEO: getting cited by AI answer engines",
    answers: "How answer engine optimisation differs from SEO, and what is measured rather than monitored.",
    priority: 0.9,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/how-it-works",
    title: "How it works",
    answers: "The sequence from a URL to a shipped fix, and what each connection unlocks.",
    priority: 0.8,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/pricing",
    title: "Pricing",
    answers: "What each plan costs and what it includes. The audit is free and needs no account.",
    priority: 0.9,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/security",
    title: "Security and data handling",
    answers: "Where data lives, what is encrypted, what never leaves the browser.",
    priority: 0.6,
    changeFrequency: "yearly",
    section: "company",
  },
  {
    path: "/proof",
    title: "Our own audit, in public",
    answers: "This site scored by its own catalogue, including the findings not yet fixed.",
    priority: 0.8,
    changeFrequency: "daily",
    section: "company",
  },
  {
    path: "/research/ai-crawler-access",
    title: "AI crawler access across 100 SaaS sites",
    answers:
      "Original measurement: who blocks AI crawlers, who publishes llms.txt, and how many homepages are blank without JavaScript.",
    priority: 0.9,
    changeFrequency: "monthly",
    section: "learn",
  },
  {
    path: "/vs-agency",
    title: "Against an SEO agency",
    answers: "What an agency does that software cannot, and what it charges for work that is now automatic.",
    priority: 0.8,
    changeFrequency: "monthly",
    section: "compare",
  },
  {
    path: "/inside",
    title: "Look inside a live account",
    answers: "A real working account, audited live, with no signup and nothing to enter.",
    priority: 0.95,
    changeFrequency: "weekly",
    section: "product",
  },
  {
    path: "/the-firm",
    title: "The firm: 67 specialists and what each refuses to do",
    answers: "The whole roster in three tiers, with every agent's role and its first guardrail.",
    priority: 0.9,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/seo",
    title: "An SEO team that ships the fix",
    answers: "What the search desk does, who is on it, what it refuses, and what it costs against an agency.",
    priority: 0.95,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/content",
    title: "Content that argues something",
    answers: "What the content desk does, how tone is measured, and what it refuses to do.",
    priority: 0.95,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/paid",
    title: "Paid media that reads the organic data first",
    answers: "What the paid desk will do, what it refuses, and the quarter it opens.",
    priority: 0.7,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/social",
    title: "Social from the argument you already approved",
    answers: "What the social desk will do, what it refuses, and the quarter it opens.",
    priority: 0.7,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/the-whole-agency",
    title: "Every desk on one plan",
    answers: "What all the desks together cost, and why it is not the sum of the parts.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/library",
    title: "The check library: all 90 checks",
    answers: "Every check the crawler runs, with what it fires on, why it matters and the fix it writes.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "learn",
  },
  {
    path: "/tools/social-teardown",
    title: "Competitor social teardown",
    answers:
      "Read a competitor's public posts, find the ones that beat their own median, and name the hook the winners share. No account.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/tools/voice-check",
    title: "Voice and readability against your rivals",
    answers:
      "Measure a page's rhythm, hedging, filler, specifics and reading grade, then compare it with the pages ranking around it.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/vs",
    title: "Against an agency, one comparison per desk",
    answers: "Four comparisons against the kind of agency each desk replaces, including the rows the agency wins.",
    priority: 0.8,
    changeFrequency: "monthly",
    section: "compare",
  },
];

/** Routes that are generated from data rather than hand-written files. */
export function allRoutes(extra: PublicRoute[]): PublicRoute[] {
  const seen = new Set<string>();
  const out: PublicRoute[] = [];
  for (const route of [...ROUTES, ...extra]) {
    if (seen.has(route.path)) continue;
    seen.add(route.path);
    out.push(route);
  }
  return out.sort((a, b) => b.priority - a.priority || a.path.localeCompare(b.path));
}
