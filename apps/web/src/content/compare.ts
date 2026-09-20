/**
 * Comparison pages.
 *
 * Every claim here is traceable to `docs/COMPETITORS.md` or
 * `docs/COMPARISON-MAVEK.md`, both of which record where the number came from
 * and when it was checked. Two rules hold and they are not style preferences:
 *
 * 1. **Every page says when to buy theirs instead, and means it.** A comparison
 *    page with no losing column is an advert, and readers know it. The section
 *    is called `theirs` below and it is required by the type, so a page cannot
 *    ship without one.
 *
 * 2. **Prices carry a date.** Vendors change pricing and a stale number on our
 *    site is our error, not theirs. Anything we could not verify from the
 *    vendor's own page is marked unverified rather than repeated.
 *
 * `asOf` is printed on the page. When it goes stale, that is visible to the
 * reader before it is embarrassing.
 */

export type ComparisonPoint = {
  category: string;
  them: string;
  us: string;
};

export type Comparison = {
  slug: string;
  /** The competitor, as they spell it. */
  name: string;
  /** Page title. Written as the query someone actually types. */
  title: string;
  description: string;
  /** When the competitor's claims were last checked. */
  asOf: string;
  /** The honest one-sentence summary, before any table. */
  oneLine: string;
  /** Two or three paragraphs of context. */
  context: string[];
  points: ComparisonPoint[];
  /** Why someone switches. Never more than three. */
  ours: { heading: string; body: string }[];
  /** When to buy theirs. Required. Never fewer than three. */
  theirs: { heading: string; body: string }[];
  /** What moving actually involves, including what is lost. */
  switching: string[];
  faq: { q: string; a: string }[];
};

const COMPARISONS: Comparison[] = [
  {
    slug: "search-atlas",
    name: "Search Atlas (OTTO)",
    title: "Search Atlas and OTTO alternative: fixes you own rather than rent",
    description:
      "OTTO applies SEO fixes through a JavaScript pixel. No major AI crawler executes JavaScript, and the fixes revert when you cancel. Here is what that means and what to do instead.",
    asOf: "September 2026",
    oneLine:
      "OTTO finds the same problems and applies the fix by injecting it with JavaScript, which means AI crawlers never see it and it disappears the day you stop paying.",
    context: [
      "Search Atlas is the closest direct rival to this platform and the comparison is genuinely narrow: both crawl a site, both find on-page, schema, internal linking and alt text problems, and both apply fixes rather than listing them. The disagreement is entirely about how the fix reaches the page.",
      "OTTO works through a pixel. You add a script tag, and the script rewrites titles, meta descriptions, schema and internal links in the browser after the page loads. That is a real engineering achievement and it solves a real problem, which is that most people cannot get a developer to change their templates.",
      "It also has two consequences that their marketing does not put next to each other. The first is that no major AI crawler runs JavaScript, so every fix applied this way is invisible to the exact engines their AI visibility dashboard measures. The second is that the fix lives in their script, not your HTML, so cancelling removes it. Their own documentation confirms the second point.",
    ],
    points: [
      {
        category: "How a fix reaches the page",
        them: "Injected by a JavaScript pixel after the page loads",
        us: "Written into your CMS through its API, so it is in the served HTML",
      },
      {
        category: "Visible to GPTBot, ClaudeBot, PerplexityBot",
        them: "No. Those crawlers fetch raw HTML and execute no client-side code",
        us: "Yes. The change is in the HTML before any script runs",
      },
      {
        category: "What happens when you cancel",
        them: "Schema, meta changes and redirects revert, per their own docs",
        us: "The change is in your CMS. There is nothing to remove",
      },
      {
        category: "Undo",
        them: "Remove the pixel, lose everything at once",
        us: "Every publish reads and stores the previous value first. Reversing runs the same route backwards",
      },
      {
        category: "Detecting the problem",
        them: "Not reported",
        us: "Three checks: content that needs JavaScript, meta set by script, and a named list of the injectors doing it",
      },
      {
        category: "Audit cost",
        them: "Paid plan required",
        us: "Free, no account, no card, no API key",
      },
    ],
    ours: [
      {
        heading: "The fix is in your HTML, so an answer engine can read it",
        body: "Vercel's crawler study and the 2026 measurements that followed agree that GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Meta-ExternalAgent and Bytespider fetch raw HTML and execute none of it. GPTBot downloads JavaScript on about 11.5% of requests and runs none. ClaudeBot about 23.8%, and runs none. A schema fix that only exists after hydration cannot help a visibility score those same engines produce.",
      },
      {
        heading: "Cancelling does not undo your SEO",
        body: "A fix written into WordPress, Shopify, Webflow or a pull request is yours. It survives churn, a billing failure, or a decision to bring the work in house. That is the difference between owning an asset and renting one.",
      },
      {
        heading: "We check whether anyone is doing this to you",
        body: "If a previous agency left an injection tool on the site, the audit names it. That check exists because the failure is silent: the dashboard says fixed and the served HTML says otherwise.",
      },
    ],
    theirs: [
      {
        heading: "You genuinely cannot change your own templates",
        body: "If your site is on a platform with no API and no template access, and nobody will give you developer time, a pixel is the only mechanism that works at all. An invisible fix that ships beats a correct fix that does not. Be clear-eyed about what it buys you, which is Google, not the answer engines.",
      },
      {
        heading: "You want one dashboard across a large client roster",
        body: "Their agency tooling, white-label reporting and client management are more developed than ours. We are per site, per month, and Scale is the tier that handles a portfolio.",
      },
      {
        heading: "You need their keyword and backlink database",
        body: "They resell a large index. We read your Search Console directly and connect DataForSEO or Moz when you want volumes and link data. If the database itself is the product you are buying, buy theirs.",
      },
      {
        heading: "You want the fix applied in ten seconds with no CMS connection",
        body: "Adding a script tag is faster than authorising a CMS. If the site is a brochure that will never be measured in an AI answer, the trade may be worth it to you.",
      },
    ],
    switching: [
      "There is no data to migrate, and that is the uncomfortable part: the fixes applied by the pixel were never in your site, so removing the pixel removes them. Run our audit before you cancel, take the generated fixes, and publish them into your CMS first. Then cancel.",
      "Expect the audit to find work that their dashboard reported as done. That is not a disagreement about severity. It is the difference between a fix in a script and a fix in the HTML.",
    ],
    faq: [
      {
        q: "Do AI crawlers really not run JavaScript?",
        a: "Not the major ones. GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Meta-ExternalAgent and Bytespider fetch raw HTML and execute no client-side code. Google's Gemini is the exception because it rides Googlebot's renderer, and Applebot renders too. Onely's February 2026 analysis found that 42% of JavaScript-rendered content never reaches AI systems at all.",
      },
      {
        q: "So OTTO's fixes do nothing?",
        a: "They work for Google, which renders JavaScript. They do not reach the answer engines. The specific problem is that the same product sells an AI visibility dashboard and a script-injected schema fix on the same screen, and the second cannot move the first.",
      },
      {
        q: "Is this a reason to avoid all client-side SEO tools?",
        a: "It is a reason to know which half of your traffic a given fix can reach, and to put anything you care about into the served HTML. For a site where AI answers are irrelevant, injection is a legitimate trade.",
      },
    ],
  },
  {
    slug: "semrush",
    name: "Semrush",
    title: "Semrush alternative: a platform that does the work, not one that reports it",
    description:
      "Semrush answers questions about search. It does not write the page, fix the title or publish the post. That gap is a person, and the person is the real cost of the tool.",
    asOf: "September 2026",
    oneLine:
      "Semrush is a research platform and this is an execution platform, so the right question is not which is better but whether you already employ the person who reads the data.",
    context: [
      "Semrush answers questions: what are people searching for, who ranks for it, what links do they have, how did that change. It answers them well, across an index built over more than a decade, and nothing here replaces that index.",
      "What it does not do is write the page, fix the title, generate the schema, publish the post or send the outreach. That work is filled by a person, and that person costs more than the subscription. For a team without a dedicated SEO hire, a research subscription generates work rather than absorbing it.",
      "If you already employ someone whose job is to read data and decide what to do, a research platform is exactly the right shape of tool and this page is not trying to talk you out of it.",
    ],
    points: [
      { category: "Shape", them: "Research and data. You interpret and act", us: "Execution. The fix arrives written" },
      { category: "Backlink index", them: "Years of crawling, very large", us: "Connect DataForSEO or Moz. Verification reads rel from HTML, which most tools get wrong" },
      { category: "Historical archive", them: "Years of position and traffic history", us: "Live data from your Search Console. No archive of other people's sites" },
      { category: "On-page fixes", them: "Listed as recommendations", us: "Generated as titles, meta, JSON-LD, sitemaps, robots.txt, llms.txt and link plans" },
      { category: "Publishing", them: "None", us: "WordPress, Shopify, Webflow, Ghost, GitHub and a webhook" },
      { category: "AI answer visibility", them: "Add-on, about $99 per domain", us: "Included. Runs on your own model key at cost, not resold" },
      { category: "Free tier", them: "Limited queries per day", us: "Full audit, all 90 checks, every fix generated, no account" },
    ],
    ours: [
      {
        heading: "The deliverable is the change, not the export",
        body: "A crawl ends with a title rewritten, a JSON-LD block generated, a sitemap cleaned and an internal link plan that names the source paragraph. You approve it. Nothing about that requires you to know what a canonical is.",
      },
      {
        heading: "Answer engines are treated as work, not a dashboard",
        body: "Eleven of the 90 checks are AEO. Answer visibility is measured by running prompts derived from your crawl against the engines, recording named separately from cited, and naming which rival was recommended instead.",
      },
      {
        heading: "The audit costs nothing per run",
        body: "It uses no model and no data vendor, so there is no per-site cost to pass on. That is why it can be free without an account.",
      },
    ],
    theirs: [
      {
        heading: "You need the backlink index",
        body: "Semrush has spent years building a link database, and nothing here replaces it. If your work is link prospecting at scale, disavow audits, or auditing someone else's link profile before an acquisition, that database is the product and you should buy it.",
      },
      {
        heading: "You need deep historical data",
        body: "Years of position history and traffic estimates across millions of domains, and the ability to reconstruct what a competitor did three years ago. That archive cannot be built on demand.",
      },
      {
        heading: "You already have an SEO team",
        body: "If you employ people whose job is to read data and decide, a research platform is the right shape. Our value is doing the work, which is worth less when the doing is already covered.",
      },
      {
        heading: "You run audits across twenty clients",
        body: "An agency serving a large roster gets more from a research subscription than from an execution platform pointed at one site at a time, unless you are ready to run us per site.",
      },
    ],
    switching: [
      "There is nothing to migrate except your project settings and tracked keyword list. Connect Search Console and Analytics over read-only OAuth, paste the keywords you were tracking, and rank tracking picks them up on the next run.",
      "The adjustment is behavioural rather than technical. A research tool leaves every decision with you. An execution platform proposes work and waits for approval, which is a different habit. Most people approve too carefully for the first fortnight, and that is the right instinct.",
    ],
    faq: [
      {
        q: "Can I run both?",
        a: "Yes, and plenty of teams should. The overlap is mostly keyword research. We read Search Console and GA4 directly, so running both creates no conflict.",
      },
      {
        q: "What does Semrush do that this does not?",
        a: "Three things, honestly. A far larger backlink database. A historical archive going back years where we read live data. And competitive traffic estimates across a breadth of domains a younger platform has not indexed.",
      },
    ],
  },
  {
    slug: "profound",
    name: "Profound",
    title: "Profound alternative: measurement is one job, changing the answer is the other",
    description:
      "Profound built the deepest AI visibility analytics in the category. This platform measures a narrower slice and then does the work that changes it.",
    asOf: "September 2026",
    oneLine:
      "Profound tells you that ChatGPT recommends two competitors instead of you, in more depth than anyone else. This tells you the same thing less deeply and then writes the pages, fixes the HTML and publishes.",
    context: [
      "Profound defined the answer engine optimisation category and has the analytics to match: citation and sentiment breakdowns, agent traffic showing which AI crawlers fetch which pages, prompt volume drawn from real conversations, and coverage across a long list of engines on enterprise plans. It is priced and built for enterprise buyers.",
      "This is a different shape of product. Answer visibility here is one module inside a search platform that also crawls, audits, generates fixes, writes briefs, publishes to a CMS and runs a link programme. The visibility number tells you there is a problem. The rest of the platform is the treatment.",
      "This page does not claim to beat Profound at Profound's job. It does not. It claims that for a team of one to five, the measurement is rarely the bottleneck.",
    ],
    points: [
      { category: "What it is", them: "AI visibility analytics, enterprise", us: "Search platform: crawl, fixes, content, links, plus answer visibility" },
      { category: "Visibility depth", them: "Citation graph, sentiment, prompt volumes, agent traffic, many engines", us: "Named, cited, rival share and lost prompts, across the providers you hold a key for" },
      { category: "Agent traffic analytics", them: "Yes, and it has no equivalent here", us: "Not offered" },
      { category: "Who pays for the model calls", them: "Priced into the subscription", us: "Your own key, at cost. We hold no model account" },
      { category: "Execution", them: "Agents draft content and stage it", us: "Crawl, 90 checks, generated fixes, briefs, drafts, publishing, rank tracking, link programme" },
      { category: "Technical SEO", them: "Not the core product", us: "The core product" },
      { category: "Entry price", them: "Free trial, then enterprise quote", us: "Free audit with no account. Paid plans published" },
    ],
    ours: [
      {
        heading: "Visibility is a diagnosis, not a programme",
        body: "Knowing you are absent from ChatGPT does not change it. What changes it is crawler access, extractable content, entity clarity, schema that matches the page, and mentions on sources the models already trust. All of that is work, and all of it is here.",
      },
      {
        heading: "The prompts come from the crawl",
        body: "A visibility tool that makes you invent the questions measures the questions you thought of. Prompts here are derived from what the site is actually trying to rank for, in five shapes that fail differently: category, comparison, problem, local and brand.",
      },
      {
        heading: "Measurement runs at cost",
        body: "The expensive part of a monitoring subscription is not the technology, it is paying for model calls and reselling them. Relay your own key and the same measurement costs a few cents of your own tokens.",
      },
    ],
    theirs: [
      {
        heading: "You need the citation graph",
        body: "Which sources each engine cites, how that shifts over time, across a long list of engines. If reconstructing the citation graph is the work, that is their product and it has no equivalent here.",
      },
      {
        heading: "You need agent traffic analytics",
        body: "Which AI crawlers fetch which pages, and how bots see your site over time. We do not offer this at all. For a large site trying to understand what GPTBot is actually reading, buy theirs.",
      },
      {
        heading: "You track thousands of prompts across regions",
        body: "A global brand with regional teams needs that volume, with API access and long history. A twelve-person company does not, and this is built for the second case.",
      },
      {
        heading: "You need SSO, SOC 2 and procurement-grade support",
        body: "If your security review requires those on paper, they have the paperwork and we do not.",
      },
    ],
    switching: [
      "Most teams reading this are not switching, they are deciding whether to buy enterprise analytics at all. If you have a contract, keep the prompt sets you built. They are the most valuable thing in the account and they paste straight in as the questions to monitor.",
      "What you lose is depth: no citation graph, no prompt volume modelling, no crawler traffic. What you gain is that the same platform writes the brief, drafts the page, generates the schema, publishes it and re-measures.",
    ],
    faq: [
      {
        q: "Can I use both?",
        a: "Yes. The overlap is only the visibility tracking. We read Search Console and GA4 over read-only connections, so there is no conflict with another analytics tool.",
      },
      {
        q: "Is your visibility tracking live or in beta?",
        a: "Live. It runs on whichever providers you have supplied a key for, and it reports only on engines it actually asked. Nothing is inferred about an engine that was not queried.",
      },
    ],
  },
  {
    slug: "mavek",
    name: "Mavek",
    title: "Mavek alternative: a search platform, not a marketing department",
    description:
      "Mavek runs ads, social, CRM and search with six named agents. This does one lane and goes several layers deeper into it. Which you want depends on whether your problem is marketing or search.",
    asOf: "September 2026",
    oneLine:
      "Mavek is a marketing department sold as software and search is one of six lanes; this is a search platform and search is the only lane, which is why the check catalogue, the fix generation and the measurement discipline go much deeper.",
    context: [
      "Mavek covers paid ads, SEO, content, social, outreach and analytics through six named agents, with human marketers reviewing the plan. If your problem is that nobody is doing your marketing, that is a coherent and well-argued answer, and their pricing page makes the cost case cleanly.",
      "This platform does not touch paid media, social or CRM and has no plans to. It crawls, runs 90 checks, generates the fix as a shippable artefact, writes briefs and drafts, publishes into your CMS, runs a link programme with a two-number risk model, and measures whether answer engines actually name you.",
      "Their own SEO pages are worth reading and are unusually honest: the AI SEO page carries a section on what AI cannot do, and the rank tracker page lists what it does not track before you buy. We would rather compete with that than with marketing that hides its limits.",
    ],
    points: [
      { category: "Scope", them: "Ads, social, CRM, email, content and search", us: "Search, answer engines, local and links. Nothing else" },
      { category: "Technical checks", them: "Not enumerated publicly", us: "90, published with impact, effort, confidence and the fix" },
      { category: "Fixes", them: "Drafted and staged for approval", us: "Generated as meta, HTML, JSON-LD, files, redirects and link plans. Incomplete ones cannot reach the queue" },
      { category: "Measurement honesty", them: "Not addressed", us: "A score whose main input is missing renders as not measured, with the reason and the fix" },
      { category: "Free tier", them: "14-day trial, account required", us: "Full audit, no account, no card, no key, no time limit" },
      { category: "Human layer", them: "Real marketers review the plan", us: "Software only. We do not pretend otherwise" },
      { category: "Self-hosting", them: "No", us: "Yes. Apache-2.0, Docker Compose, your own database" },
    ],
    ours: [
      {
        heading: "Depth in one lane beats breadth across six",
        body: "Six lanes across one team means each lane gets a fraction of the attention. If search is the channel you are betting on, the difference shows up in the check catalogue, in whether a fix arrives written, and in whether a score with no data behind it still renders as a number.",
      },
      {
        heading: "Nothing is gated behind a sales call",
        body: "The audit runs on a URL. No onboarding call, no OAuth consent screen, no card. You see the findings and the written fixes before you decide anything.",
      },
      {
        heading: "You can run it yourself, forever",
        body: "Apache-2.0, self-hostable, with a database you own. If we disappear, your installation does not.",
      },
    ],
    theirs: [
      {
        heading: "Your problem is marketing, not search",
        body: "If you need Google Ads and Meta campaigns managed, social posted, a CRM synced and email sequences sent, we do none of that and building it would be four more products with stronger incumbents. Buy theirs.",
      },
      {
        heading: "You want people, not only software",
        body: "Their plans include real marketers reviewing the strategy. That is roughly the 70% of an agency's value that software does not replace, and we do not offer it.",
      },
      {
        heading: "You want one bill for every channel",
        body: "A single subscription covering six lanes is genuinely simpler than assembling a stack, and simplicity has real value when nobody on the team is a specialist.",
      },
      {
        heading: "You want an onboarding call and a person to ask",
        body: "They do onboarding calls and sell a live audit session with the founder. If being walked through it matters more than depth, that is a reasonable way to choose.",
      },
    ],
    switching: [
      "There is no migration. Run the audit on your site, compare what it finds against what you were told was already done, and decide from there.",
      "If you keep Mavek for ads and social, nothing here conflicts. We read Search Console and GA4 read-only and publish into your CMS, which is a different surface from the one their ad agents touch.",
    ],
    faq: [
      {
        q: "Is this a full marketing platform?",
        a: "No, and it will not become one. It covers search, answer engines, local and links. Paid media, social and CRM are out of scope on purpose.",
      },
      {
        q: "What does Mavek do better?",
        a: "Breadth, a human review layer, and being a company you can phone. Those are real advantages and they are the reason the comparison table above has a column that is not ours.",
      },
    ],
  },
  {
    slug: "seo-agency",
    name: "an SEO agency",
    title: "SEO agency alternative: what software replaces, and what it does not",
    description:
      "An agency's value is roughly 30% knowing what is wrong and 70% doing it every week for a year. Software has taken the first part completely. Here is an honest accounting of the second.",
    asOf: "September 2026",
    oneLine:
      "Software has fully replaced the audit and most of the technical work, has partly replaced content and links, and has not replaced relationships, original research or judgement about your specific business.",
    context: [
      "A mid-market retainer runs roughly £2,500 to £15,000 a month. A large share of that is work that is now deterministic: crawling, auditing, prioritising, writing titles and meta descriptions, generating schema, planning internal links, cleaning sitemaps, checking crawler access.",
      "The rest is not. A good link builder has people who take their call. Digital PR needs someone to have the idea. Answering a journalist well and within the hour is a human job. Deciding whether a particular link on a particular page is worth the effort is judgement.",
      "So the honest framing is not agency versus software. It is that the deterministic 70% of the hours should cost near nothing, and you should pay a human for the part that is actually hard.",
    ],
    points: [
      { category: "The audit", them: "Weeks, then a PDF", us: "Ten minutes, free, with the fixes already written" },
      { category: "Technical fixes", them: "A ticket for your developer", us: "Generated and published into your CMS on approval" },
      { category: "Content", them: "Written by a person, on their schedule", us: "Brief and draft generated, quality gated, a person still edits and approves" },
      { category: "Links", them: "Relationships and outreach", us: "Prospects found, qualified, verified and drafted. A person still sends" },
      { category: "Reporting", them: "A monthly deck", us: "A report that reads flat as flat and says so in the first paragraph" },
      { category: "Cost", them: "£2,500 to £15,000 a month", us: "Free to audit. Published plans below that by an order of magnitude" },
      { category: "What you keep on cancelling", them: "Whatever is in your CMS", us: "Whatever is in your CMS, which is everything we shipped" },
    ],
    ours: [
      {
        heading: "The deterministic work costs nothing to repeat",
        body: "A crawl and 90 checks use no model and no data vendor, so running it weekly costs the same as running it once. An agency bills the same audit every quarter because a person does it.",
      },
      {
        heading: "Nothing is done that you cannot see",
        body: "Every finding carries its evidence, every fix carries the previous value, every publish is logged and reversible. An agency's work is visible in a report they wrote about themselves.",
      },
      {
        heading: "The timeline is stated honestly",
        body: "Scores move in days. Rankings move in three to six months. Anyone promising otherwise is selling the demo, and a tool that implies otherwise sets up a refund conversation in month two.",
      },
    ],
    theirs: [
      {
        heading: "You need links that come from relationships",
        body: "The highest-authority links available to a small company come from someone answering a reporter well, within the hour. No software produces that decision, and ours does not send a single email on its own.",
      },
      {
        heading: "You need digital PR",
        body: "Original research, a survey, a data story. The one link tactic with no ceiling, and it needs a person to have the idea and place it.",
      },
      {
        heading: "You need someone accountable",
        body: "A retainer buys a name you can call when traffic drops. Software does not answer the phone and should not pretend it does.",
      },
      {
        heading: "Nobody on your side will approve anything",
        body: "This model requires one person to approve work. If that person does not exist, a done-for-you retainer is the honest answer and you should pay for it.",
      },
    ],
    switching: [
      "Run the audit before you give notice. It is free and it will tell you how much of the retainer was hygiene that is now automatic, which is the number the conversation should be about.",
      "Keep the agency for links and PR if those are working. The technical and on-page half is where the substitution is clean.",
    ],
    faq: [
      {
        q: "Will this replace my agency?",
        a: "It replaces the audit, the technical work, the on-page work, the schema, the internal linking, the reporting, and the research half of link building. It does not replace relationships, PR or judgement about your business. If your retainer is mostly the first list, the answer is yes.",
      },
      {
        q: "How long until I see results?",
        a: "Scores in the app move within days because they measure the site. Rankings take three to six months because Google takes weeks to recrawl and longer to re-rank. Anyone quoting two to four weeks for organic is quoting a paid media timeline.",
      },
    ],
  },
];

export const COMPARISONS_BY_SLUG = new Map(COMPARISONS.map((c) => [c.slug, c]));

export function allComparisons(): Comparison[] {
  return COMPARISONS;
}
