/**
 * The research dataset, and the rules it is published under.
 *
 * This is the one piece of marketing that is also a proof of the
 * architecture. The audit uses no language model and no data vendor, so
 * measuring a hundred sites costs bandwidth and nothing else. Every competitor
 * measuring the same thing pays a model call or a data credit per site, which
 * is why none of them publishes a dataset.
 *
 * Four rules hold for anything on this page, and they are not negotiable
 * because one wrong number makes the whole dataset worth nothing:
 *
 * 1. **Every rate states its denominator.** Ten of the hundred sampled sites
 *    refused the crawler outright, so every percentage divides by the ninety
 *    that answered and says so.
 * 2. **The sample is described honestly.** This is a convenience sample of
 *    well-known companies, not a random draw and not a ranking. That is said
 *    on the page rather than left to be assumed.
 * 3. **A measurement that could be a false positive is tightened until it is
 *    not.** The first run of this reported that 70% of the sample published an
 *    llms.txt. That was wrong: plenty of sites answer 200 with an HTML shell
 *    at any path. Requiring a text/plain response and a Markdown heading moved
 *    the real figure to 57.8%.
 * 4. **Anyone can check it.** Two requests per site, both public, both
 *    reproducible in a browser. The script is in the repository.
 */

import data from "./research-data.json";

export type ResearchStat = { count: number; pct: number; note?: string };

export type ResearchSummary = {
  sampled: number;
  reachable: number;
  unreachable: number;
  generated_at: string;
  blocking_any_retrieval_agent: ResearchStat;
  blocked_per_agent: Record<string, ResearchStat>;
  no_robots_txt: ResearchStat;
  names_no_agent_explicitly: ResearchStat;
  has_llms_txt: ResearchStat;
  no_sitemap_directive: ResearchStat;
  thin_served_html: ResearchStat;
  almost_no_served_html: ResearchStat;
  no_structured_data: ResearchStat;
  no_organization_entity: ResearchStat;
  no_meta_description: ResearchStat;
  median_served_words: number;
};

export type ResearchSite = {
  domain: string;
  reachable: boolean;
  status: number;
  blocked_agents: string[];
  names_agents: number;
  has_llms_txt: boolean;
  has_robots: boolean;
  has_sitemap_directive: boolean;
  words: number;
  jsonld_blocks: number;
  has_organization: boolean;
  has_description: boolean;
  question_headings: number;
};

export const RESEARCH = data as unknown as { summary: ResearchSummary; sites: ResearchSite[] };

export const SAMPLE_DESCRIPTION =
  "A convenience sample of 100 well-known SaaS, developer-tool and marketing-tool companies. " +
  "Not a random sample and not a ranking. These are companies whose marketing sites are public, " +
  "well-resourced and widely imitated, which makes them the interesting case: if sites like these " +
  "get AI crawler access wrong, the long tail is worse rather than better.";

export const METHOD = [
  "Two requests per domain, both public: robots.txt and the homepage. Nothing else was crawled, " +
    "nothing was stored about anyone, and there was a delay between sites.",
  "Crawler access is read from robots.txt for the six retrieval agents that decide whether a brand " +
    "can appear in an AI answer today: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot " +
    "and Google-Extended. Training-only crawlers are excluded, because refusing those is a defensible " +
    "business decision while refusing these makes you invisible.",
  "Everything else is read from the HTML the server returned, before any JavaScript ran, because that " +
    "is what a retrieval crawler receives.",
  "An llms.txt counts only when the response is 200, served as text/plain, and begins with a Markdown " +
    "heading. A first pass without those conditions reported 70%; the real figure is 57.8%.",
];

/** The findings worth leading with, in the order they are worth reading. */
export function headlines(summary: ResearchSummary) {
  return [
    {
      stat: `${summary.unreachable} of ${summary.sampled}`,
      claim: "refused an ordinary crawler outright",
      detail:
        "Ten sites answered 403, 429 or 400 to a plain, identified, rate-limited request. Bot protection " +
        "does not distinguish between a research crawler and an answer engine as reliably as its buyers " +
        "assume, and the same defences that stop scrapers can stop citations.",
    },
    {
      stat: `${summary.names_no_agent_explicitly.pct}%`,
      claim: "name no AI crawler in robots.txt at all",
      detail:
        `${summary.names_no_agent_explicitly.count} of ${summary.reachable} reachable sites leave every AI ` +
        "agent to fall through to a wildcard rule. That usually works, and it means nobody made a decision. " +
        "Several crawlers read only their own group when one exists, so a file with both a named group and a " +
        "wildcard can behave differently from how it reads.",
    },
    {
      stat: `${summary.has_llms_txt.pct}%`,
      claim: "publish an llms.txt",
      detail:
        `${summary.has_llms_txt.count} of ${summary.reachable}. Higher than expected, and the clearest sign ` +
        "in this dataset that AEO has moved from an idea to a default for well-resourced marketing teams. " +
        "No engine has committed to reading the file, which makes the adoption rate a statement about where " +
        "these teams think search is going.",
    },
    {
      stat: `${summary.no_organization_entity.pct}%`,
      claim: "have no Organization entity on the homepage",
      detail:
        `${summary.no_organization_entity.count} of ${summary.reachable} publish no Organization, ` +
        "LocalBusiness or Corporation markup anywhere on their front page. A model resolving a brand name has " +
        "nothing authoritative to resolve it against, which is how a confident answer ends up describing a " +
        "different company.",
    },
    {
      stat: `${summary.thin_served_html.pct}%`,
      claim: "serve under 200 words before JavaScript runs",
      detail:
        `${summary.thin_served_html.count} of ${summary.reachable}, and ${summary.almost_no_served_html.count} ` +
        "serve under fifty. To a crawler that executes no client-side code, and none of the major retrieval " +
        "crawlers do, those homepages are close to blank. The median across the sample is " +
        `${summary.median_served_words} words.`,
    },
    {
      stat: `${summary.blocking_any_retrieval_agent.pct}%`,
      claim: "deliberately block a retrieval crawler",
      detail:
        "Only two of the reachable sites disallow one of the six agents from the root. Outright blocking is " +
        "rare and mostly confined to companies whose product is the content itself. The invisibility problem " +
        "in this sample is not refusal, it is everything above.",
    },
  ];
}
