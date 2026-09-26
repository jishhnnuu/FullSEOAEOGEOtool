/**
 * Every public URL, in one list.
 *
 * The sitemap, the llms.txt, the footer and the internal-link checks all read
 * from here, so a page cannot ship without being reachable. A page that exists
 * and is in no sitemap and linked from nothing is an orphan, which is a
 * finding this product raises against other people's sites.
 */

import { LAB } from "./brand";

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
    title: "Your marketing, handled",
    answers: "A digital marketing agency for founders: a person on your account, AI doing the legwork, across websites, SEO, content, social and paid ads.",
    priority: 1.0,
    changeFrequency: "weekly",
    section: "product",
  },
  {
    path: "/book",
    title: "Book a free call",
    answers: "Tell us about your business and pick a time. Thirty minutes with a person, and a plan you keep whether or not you hire us.",
    priority: 0.95,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/websites",
    title: "Website design and build for new businesses",
    answers: "What a website build includes, who owns it, how SEO is built in from launch, and what it costs against an agency build.",
    priority: 0.95,
    changeFrequency: "monthly",
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
    answers: "From the first call to work going live: who you talk to, what the AI does, what needs your yes, and what each connection adds.",
    priority: 0.8,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/pricing",
    title: "Pricing",
    answers: "How each service is priced, what the specialist on your account does, and where the do-it-yourself tools are.",
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
    path: "/inside",
    title: "Look inside a live account",
    answers: "A real working account, audited live, with no signup and nothing to enter.",
    priority: 0.95,
    changeFrequency: "weekly",
    section: "product",
  },
  {
    path: "/the-firm",
    title: "The team: the people you talk to and the AI behind them",
    answers: "Who looks after your account, how the AI CMO and each desk's AI team work under them, and what each will never do.",
    priority: 0.9,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/seo",
    title: "SEO, done for you by a person and an AI team",
    answers: "What the SEO service does, who does the work, what it refuses, and how it is priced.",
    priority: 0.95,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/content",
    title: "Content marketing, written with you",
    answers: "What the content service does, how your tone is measured, and what it refuses to do.",
    priority: 0.95,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/paid",
    title: "Paid ads that only spend what can be measured",
    answers: "What the paid ads service does, what it refuses, and why tracking is checked before any budget is taken.",
    priority: 0.7,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/social",
    title: "Social media marketing that knows what works",
    answers: "What the social service reads about your competitors, what it plans and drafts, and what each platform lets anyone publish.",
    priority: 0.7,
    changeFrequency: "monthly",
    section: "product",
  },
  {
    path: "/the-whole-agency",
    title: "Full-service marketing: everything, handled",
    answers: "Website, SEO, content, social and paid ads together, with one person on your account and one plan.",
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
    path: "/thymelab",
    title: `${LAB}: all your marketing in one place`,
    answers:
      "The do-it-yourself platform: website, Google data, content, social and ads in one place, with the next step always named and fixes published on approval.",
    priority: 0.9,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/seo",
    title: `${LAB} SEO`,
    answers:
      "Audit a website, see every finding with the fix written out, and run single quick checks on a URL. Free, no account.",
    priority: 0.9,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/seo/audit",
    title: "SEO audit workbench",
    answers:
      "Crawl up to 40 pages of any site, score what can be measured from the crawl, and get the fixes written for you.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/seo/checks",
    title: "SEO quick checks",
    answers:
      "Single checks on one URL: titles, canonicals, schema, robots, AI crawler access and more, each with the fix.",
    priority: 0.8,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/content",
    title: `${LAB} Content`,
    answers:
      "Measure a page's voice and readability against the pages ranking around it, and see what to change.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/content/voice",
    title: "Voice and readability against your rivals",
    answers:
      "Measure a page's rhythm, hedging, filler, specifics and reading grade, then compare it with the pages ranking around it.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/social",
    title: `${LAB} Social`,
    answers:
      "Read a competitor's public posts, find what beats their own median, and name the hook the winners share.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/social/teardown",
    title: "Competitor social teardown",
    answers:
      "Read a competitor's public posts, find the ones that beat their own median, and name the hook the winners share. No account.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/ads",
    title: `${LAB} Ads`,
    answers:
      "Check whether an ad budget can work before it is spent, per platform, with the arithmetic shown.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/ads/budget",
    title: "Will this ad budget actually work",
    answers:
      "Whether a monthly budget clears the conversion volume automated bidding needs, per platform, and what to change if it does not.",
    priority: 0.85,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/website",
    title: `${LAB} Websites (in the works)`,
    answers:
      "A website builder with hosting is being built. Join the list, or have the agency build your site now.",
    priority: 0.6,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/thymelab/pricing",
    title: `${LAB} pricing`,
    answers:
      "What the tool plans cost, what is free, and what each plan adds, for people who want to do it themselves.",
    priority: 0.8,
    changeFrequency: "monthly",
    section: "tools",
  },
  {
    path: "/privacy",
    title: "Privacy policy",
    answers: "What is collected, what never leaves the browser, how connected tokens are sealed, and how to delete everything.",
    priority: 0.4,
    changeFrequency: "yearly",
    section: "company",
  },
  {
    path: "/terms",
    title: "Terms of use",
    answers: "Who owns the accounts and the work, what needs a person's approval, and what is refused in writing before you pay.",
    priority: 0.4,
    changeFrequency: "yearly",
    section: "company",
  },
  {
    path: "/vs",
    title: "An AI-powered agency against a traditional one",
    answers: "One comparison per service against a traditional agency, including the rows the traditional agency still wins.",
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
