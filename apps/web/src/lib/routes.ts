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
    title: "Audit any site against 90 checks, then take the fixes",
    answers: "What the product is, and a field to run a real audit with no account.",
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
