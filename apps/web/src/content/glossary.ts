/**
 * The glossary.
 *
 * Entity coverage, not filler. Every entry earns its page by being a term this
 * product actually implements a check or a fix for, and every entry links to
 * the thing that does the work. A glossary of terms the product does not touch
 * is thin content, which is a finding this platform raises against other
 * people's sites and would deserve against ours.
 *
 * Each definition opens with a self-contained sentence that states the term
 * and its meaning in one place, because that is the unit an answer engine
 * extracts. That is not a style rule here, it is the same rule
 * `no_direct_answer` enforces against everyone else.
 */

export type GlossaryEntry = {
  slug: string;
  term: string;
  /** One sentence. Must stand alone with no preceding context. */
  definition: string;
  body: string[];
  /** The check or capability in this product that acts on it. */
  relatedTo?: { label: string; href: string };
  seeAlso?: string[];
};

const ENTRIES: GlossaryEntry[] = [
  {
    slug: "answer-engine-optimisation",
    term: "Answer engine optimisation (AEO)",
    definition:
      "Answer engine optimisation is the practice of structuring a site so that AI assistants such as ChatGPT, Claude, Perplexity and Google's AI Overviews name and cite it when answering a question, rather than optimising for a position in a list of links.",
    body: [
      "AEO and SEO overlap because both reward authority and clear writing, but they diverge often enough to matter. A page can rank first on Google and never be cited by an answer engine, and a source a model leans on heavily may not rank at all for the same query.",
      "Three things carry most of the weight. The crawlers have to be allowed in, because GPTBot and its peers cannot cite what they cannot fetch. The content has to be extractable from the served HTML, because none of the major retrieval crawlers execute JavaScript. And the passages have to be self-contained, stating a fact and its context in one place, because that is the unit a model quotes.",
    ],
    relatedTo: { label: "How AEO and GEO are handled here", href: "/ai-search" },
    seeAlso: ["generative-engine-optimisation", "llms-txt", "extractability"],
  },
  {
    slug: "generative-engine-optimisation",
    term: "Generative engine optimisation (GEO)",
    definition:
      "Generative engine optimisation is the practice of influencing how a brand appears inside AI-generated output, covering both whether it is named and how it is described.",
    body: [
      "GEO and AEO describe the same goal with different emphasis. AEO stresses being the cited answer; GEO stresses visibility inside generative output more broadly, including being described accurately rather than merely mentioned.",
      "In practice the tactics are the same: crawler access, extractable content, entity clarity, and mentions on sources the models already trust. Treating them as one discipline is the honest position, and pretending they are two products is a pricing decision rather than a technical one.",
    ],
    relatedTo: { label: "How AEO and GEO are handled here", href: "/ai-search" },
    seeAlso: ["answer-engine-optimisation", "entity"],
  },
  {
    slug: "llms-txt",
    term: "llms.txt",
    definition:
      "llms.txt is a plain-text file at the root of a site that lists the pages worth quoting and says what each one answers, acting as a curated map for language models rather than a complete index.",
    body: [
      "It is not a sitemap. A sitemap lists everything a crawler should know exists; llms.txt lists the handful of pages that are worth an answer engine's attention, with a line describing what each one covers. That description is the part a model cannot work out on its own from a URL.",
      "Support is a convention rather than a standard, and no engine has committed to reading it. It costs almost nothing to publish, it is trivially verifiable, and it makes a site's own view of its best content explicit.",
    ],
    relatedTo: { label: "Generate one from a crawl", href: "/thymelab/seo/checks/llms-txt-generator" },
    seeAlso: ["answer-engine-optimisation", "robots-txt"],
  },
  {
    slug: "extractability",
    term: "Extractability",
    definition:
      "Extractability is whether a page's meaningful content is present in the HTML the server returns, before any JavaScript runs.",
    body: [
      "It matters because the major AI retrieval crawlers do not execute JavaScript. GPTBot downloads JavaScript on roughly 11.5% of requests and runs none of it. ClaudeBot downloads it on roughly 23.8% and runs none. A page whose body arrives only after hydration is, to those crawlers, an empty page.",
      "This is the failure that catches client-side SEO tools: a fix injected by a script is invisible to exactly the engines an AI visibility dashboard measures. Three checks here cover it, one for content that needs JavaScript, one for meta tags set by script, and one that names the injection tools doing it.",
    ],
    relatedTo: { label: "Why AI crawlers and JavaScript do not mix", href: "/ai-crawlers-and-javascript" },
    seeAlso: ["answer-engine-optimisation", "ai-crawler"],
  },
  {
    slug: "ai-crawler",
    term: "AI crawler",
    definition:
      "An AI crawler is an automated fetcher operated by a model provider that reads web pages either to answer a user's question in real time or to build training data.",
    body: [
      "The two purposes behave differently and are worth separating. Retrieval agents such as OAI-SearchBot, ClaudeBot, PerplexityBot and ChatGPT-User fetch a page because someone asked a question now, and they decide whether a brand appears in that answer. Training agents such as CCBot gather corpora for later.",
      "A site can allow one and refuse the other, and robots.txt is where that decision is expressed. Blocking retrieval agents is the most direct way to become invisible in AI answers, and it is usually done by accident rather than on purpose.",
    ],
    relatedTo: { label: "Check which crawlers your site allows", href: "/thymelab/seo/checks/ai-crawler-check" },
    seeAlso: ["robots-txt", "extractability"],
  },
  {
    slug: "robots-txt",
    term: "robots.txt",
    definition:
      "robots.txt is a file at the root of a site that tells automated crawlers which paths they may request, using per-agent rules.",
    body: [
      "It controls crawling, not indexing. A page disallowed in robots.txt can still appear in search results if other pages link to it, because the crawler is told not to fetch it rather than not to list it. To keep a page out of an index, a noindex directive on the page itself is the correct mechanism, and that only works if the crawler is allowed to fetch the page and see it.",
      "The most expensive robots.txt mistake is a blanket rule that catches an AI retrieval agent nobody meant to block. The second most expensive is a file that declares nothing at all, which is what a default managed file usually amounts to.",
    ],
    relatedTo: { label: "Check your robots.txt against every AI agent", href: "/thymelab/seo/checks/ai-crawler-check" },
    seeAlso: ["ai-crawler", "canonical-tag"],
  },
  {
    slug: "entity",
    term: "Entity",
    definition:
      "An entity is a thing a search or answer engine can identify and hold facts about, such as a company, a person, a product or a place, as distinct from the words used to describe it.",
    body: [
      "Search moved from matching strings to resolving entities, and answer engines went further because a model has no link graph, only text. The practical consequence is that a site has to state plainly what it is, what it sells and who runs it, in places a machine reads: an Organization block defined once, a consistent name, and external sources that corroborate it.",
      "Ambiguity is the failure mode. If a brand name is also a common word and nothing on the site disambiguates it, a model will confidently describe a different company.",
    ],
    relatedTo: { label: "Answer visibility, including what engines get wrong", href: "/ai-search" },
    seeAlso: ["structured-data", "unlinked-mention"],
  },
  {
    slug: "structured-data",
    term: "Structured data",
    definition:
      "Structured data is machine-readable markup, usually JSON-LD, that states what a page is about in a defined vocabulary rather than leaving it to be inferred from the prose.",
    body: [
      "Two rules decide whether it helps or hurts. It has to match the visible page, because markup describing content the page does not contain is a manual action risk rather than a technicality. And an entity should be defined once and referenced by @id everywhere else, because a validator that does not resolve the reference will propose completing it, which writes a second conflicting definition and breaks the graph it was trying to fix.",
      "Required properties are the ones that gate a rich result. A validator that reports every optional property as a warning trains people to ignore it.",
    ],
    relatedTo: { label: "Generate valid JSON-LD from a page", href: "/thymelab/seo/checks/schema-generator" },
    seeAlso: ["entity", "answer-engine-optimisation"],
  },
  {
    slug: "canonical-tag",
    term: "Canonical tag",
    definition:
      "A canonical tag is a link element that names the preferred URL for a page, telling search engines which version to index when the same content is reachable at more than one address.",
    body: [
      "Duplicate addresses are normal and mostly accidental: tracking parameters, trailing slashes, http against https, with and without www, print views, faceted navigation. Without a canonical, ranking signals split across the variants.",
      "The common failure is a canonical that points somewhere else by mistake, usually because a template hard-codes one URL. That is more damaging than a missing canonical, because it actively tells the engine to drop the page.",
    ],
    seeAlso: ["robots-txt", "orphan-page"],
  },
  {
    slug: "orphan-page",
    term: "Orphan page",
    definition:
      "An orphan page is a page that exists and is reachable by URL but has no internal links pointing at it from anywhere else on the site.",
    body: [
      "Orphans are found by crawlers through sitemaps or external links, but they receive no internal authority and are usually invisible to visitors. The pattern often appears after a migration or when pages are published outside the normal navigation.",
      "The fix is not always a link. Three orphans in one section usually means the section needs an index page, because inserting links into unrelated paragraphs is a content change wearing the clothes of a linking change.",
    ],
    seeAlso: ["internal-link", "canonical-tag"],
  },
  {
    slug: "internal-link",
    term: "Internal link",
    definition:
      "An internal link is a link from one page of a site to another page on the same site, used to pass authority, establish topical relationships and give crawlers a path through the site.",
    body: [
      "Internal linking is the highest-leverage on-site work available because it costs nothing and needs no external cooperation. The constraint is that a useful link needs a sentence that already exists and already shares terms with the target. Anywhere else, adding the link means writing a new sentence.",
      "Anchor text carries the signal. Repeating the same exact-match anchor across a site is where over-optimisation shows up first.",
    ],
    seeAlso: ["orphan-page", "unlinked-mention"],
  },
  {
    slug: "unlinked-mention",
    term: "Unlinked mention",
    definition:
      "An unlinked mention is an occurrence of a brand name on another site that does not carry a hyperlink back to it.",
    body: [
      "Classic SEO treats these as an opportunity to reclaim a link. That framing is now mostly wrong. Ahrefs measured 75,000 brands in 2026 and found brand mentions correlate with AI Overview visibility at 0.664 against 0.218 for backlinks, because a model has no link graph, it has text.",
      "So the mention is most of the value already delivered, and chasing the link is a marginal improvement rather than a rescue. Both are worth tracking; only one of them was ever the point.",
    ],
    relatedTo: { label: "How the link programme weighs mentions", href: "/platform" },
    seeAlso: ["internal-link", "entity"],
  },
  {
    slug: "striking-distance",
    term: "Striking distance",
    definition:
      "Striking distance describes keywords where a page already ranks roughly between positions four and twenty, close enough that a modest improvement produces a visible traffic change.",
    body: [
      "It is the highest-return segment of a keyword set because the hard part, being considered relevant at all, is already done. A page ranking fortieth needs a different kind of work; a page ranking second has little headroom left.",
      "Identifying striking distance needs real query data rather than a third-party estimate, which is why Search Console is the one connection that changes what this platform can honestly recommend.",
    ],
    seeAlso: ["click-through-rate"],
  },
  {
    slug: "click-through-rate",
    term: "Click-through rate (CTR)",
    definition:
      "Click-through rate is the share of people who saw a result in search and clicked it, calculated as clicks divided by impressions.",
    body: [
      "Its value in SEO is comparative. Expected CTR falls predictably with position, so a page earning well below the expected rate for its position usually has a title or description problem rather than a ranking problem. That is a cheap fix with a fast read.",
      "A CTR gap on a page already ranking well is often the single highest-return change available, because nothing has to move in the rankings for it to pay.",
    ],
    seeAlso: ["striking-distance"],
  },
  {
    slug: "core-web-vitals",
    term: "Core Web Vitals",
    definition:
      "Core Web Vitals are Google's three field-measured performance metrics: Largest Contentful Paint for loading, Interaction to Next Paint for responsiveness, and Cumulative Layout Shift for visual stability.",
    body: [
      "They are measured from real visits, not from a lab run, which is why a synthetic score and the field data often disagree. Only the field data is used for ranking.",
      "Their ranking weight is modest and widely overstated. They matter most as a tie-breaker and as a genuine conversion factor, which is a better reason to fix them than the ranking argument.",
    ],
    seeAlso: ["extractability"],
  },
  {
    slug: "eeat",
    term: "E-E-A-T",
    definition:
      "E-E-A-T stands for experience, expertise, authoritativeness and trustworthiness, the qualities Google's quality rater guidelines ask human evaluators to assess in a page and its author.",
    body: [
      "It is not a score in any algorithm, and no tool can report your E-E-A-T as a number. It is a description of what the systems are trying to approximate, which makes it useful as a checklist and misleading as a metric.",
      "The checkable parts are concrete: a named author with stated credentials, first-hand evidence rather than summary, citations to primary sources, and a site that says who runs it. For health, legal and financial topics, missing credentials is a high-severity problem rather than a nicety.",
    ],
    seeAlso: ["entity", "structured-data"],
  },
];

export const GLOSSARY_BY_SLUG = new Map(ENTRIES.map((e) => [e.slug, e]));

export function allGlossary(): GlossaryEntry[] {
  return [...ENTRIES].sort((a, b) => a.term.localeCompare(b.term));
}
