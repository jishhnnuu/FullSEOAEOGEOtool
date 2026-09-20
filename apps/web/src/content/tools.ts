/**
 * The free tool catalogue.
 *
 * Each of these is a slice of the real engine pointed at one question, not a
 * separate implementation. That matters twice over: the answers agree with the
 * full audit because they come from the same code, and a tool cannot rot
 * independently of the product.
 *
 * `scope` decides how much gets fetched. "page" is one request. "site" adds
 * robots.txt, up to four sitemaps and llms.txt, which is several more round
 * trips, so it is only asked for when a tool actually needs it.
 */

export type ToolScope = "page" | "site";

export type ToolDef = {
  slug: string;
  name: string;
  /** Page title. Written as the thing someone searches for. */
  title: string;
  /** One line, used on the index and as the meta description seed. */
  blurb: string;
  description: string;
  scope: ToolScope;
  /** Placeholder and button wording, so each tool reads as its own thing. */
  inputLabel: string;
  action: string;
  /** What this tool is really checking, in the product's own terms. */
  explains: string[];
  /** The check codes in the catalogue this tool surfaces. */
  checks: string[];
  faq: { q: string; a: string }[];
};

const TOOLS: ToolDef[] = [
  {
    slug: "ai-crawler-check",
    name: "AI crawler access check",
    title: "AI crawler check: can ChatGPT, Claude and Perplexity read your site?",
    blurb: "Reads your robots.txt and tells you which AI crawlers are allowed in, agent by agent.",
    description:
      "Check whether GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended and nine other AI crawlers are allowed to fetch your site. Reads your real robots.txt. No signup.",
    scope: "site",
    inputLabel: "Your website address",
    action: "Check crawler access",
    explains: [
      "An answer engine cannot cite a page it was never allowed to fetch. This is the first thing to rule out when a brand is absent from AI answers, and it is usually an accident rather than a decision.",
      "The check distinguishes agents your file names explicitly from agents that only match a wildcard rule. Several crawlers read only their own block when one exists, so a file with a named group and a wildcard group can behave differently from how it reads.",
    ],
    checks: ["ai_crawler_blocked", "robots_missing"],
    faq: [
      {
        q: "Does allowing AI crawlers mean my content trains a model?",
        a: "It depends on the agent. Retrieval agents such as OAI-SearchBot, ClaudeBot, PerplexityBot and ChatGPT-User fetch a page to answer a question now, and they are the ones that decide whether you appear in an answer. Training agents such as CCBot gather corpora for later. You can allow the first group and refuse the second.",
      },
      {
        q: "I allow them and still do not appear in answers. Why?",
        a: "Access is necessary and not sufficient. The next two questions are whether the content exists in the served HTML before JavaScript runs, and whether any passage states a fact plainly enough to be quoted. Both are checked by the answer readiness tool.",
      },
    ],
  },
  {
    slug: "extractability-check",
    name: "Extractability check",
    title: "Extractability check: does an AI crawler see your content?",
    blurb: "Fetches your page the way GPTBot does, with no JavaScript, and shows what survives.",
    description:
      "AI crawlers do not run JavaScript. This fetches your page as raw HTML and reports how much of your content, your title and your schema actually reaches them.",
    scope: "page",
    inputLabel: "The page to check",
    action: "Fetch it without JavaScript",
    explains: [
      "GPTBot downloads JavaScript on roughly 11.5% of requests and executes none of it. ClaudeBot downloads it on roughly 23.8% and executes none. Onely's February 2026 analysis found 42% of JavaScript-rendered content never reaches AI systems at all.",
      "So the question is not whether your page looks right in a browser. It is what is present in the HTML the server returned, which is what this fetches. If the word count here is near zero and your page is full of text, that text does not exist as far as the answer engines are concerned.",
    ],
    checks: ["content_needs_javascript", "meta_needs_javascript", "content_not_extractable", "seo_injection_script"],
    faq: [
      {
        q: "My page shows plenty of content but this says almost none. What is wrong?",
        a: "The content is rendered client side. A single-page application, or a framework that ships an empty shell and hydrates it, produces exactly this result. The fix is server-side rendering or static generation for the pages you want cited.",
      },
      {
        q: "Does this matter for Google?",
        a: "Less, because Googlebot renders JavaScript. It matters for the answer engines, and it matters for how quickly Google picks up a change, because rendering is a second queue with its own delay.",
      },
    ],
  },
  {
    slug: "answer-readiness",
    name: "Answer readiness score",
    title: "Answer readiness: would an AI engine quote this page?",
    blurb: "Scores a page on the signals that decide whether it gets cited rather than ranked.",
    description:
      "Runs the AEO half of the catalogue against one page: direct answers, citable facts, entity clarity, author attribution, FAQ structure and extractability. Free, no account.",
    scope: "site",
    inputLabel: "The page to score",
    action: "Score this page",
    explains: [
      "Ranking and being cited are different outcomes with different inputs. A page can rank first on Google and never be quoted by an answer engine, because a model synthesises from sources it trusts rather than from a ranked list.",
      "The signals that move it are concrete: a question answered in the opening paragraph rather than the fourth, facts stated with numbers and sources, a clearly defined entity, a named author, and content that exists before JavaScript runs.",
    ],
    checks: [
      "no_direct_answer",
      "no_citable_facts",
      "entity_unclear",
      "no_author_attribution",
      "no_faq_structure",
      "content_not_extractable",
      "ai_crawler_blocked",
      "missing_llms_txt",
    ],
    faq: [
      {
        q: "Is this the same as an AI visibility score?",
        a: "No, and the difference is the whole point. This measures whether an engine could use your page. Visibility measures whether it does, which needs the engines to be asked directly and is a different tool.",
      },
      {
        q: "What is the single highest-return fix?",
        a: "Usually answering the page's own question in its first paragraph. Most pages introduce themselves for three paragraphs and then answer, and the opening is the part a model extracts.",
      },
    ],
  },
  {
    slug: "llms-txt-generator",
    name: "llms.txt generator",
    title: "llms.txt generator: build one from your real sitemap",
    blurb: "Reads your sitemap, ranks your pages by how quotable they are, and writes the file.",
    description:
      "Generate a valid llms.txt from your actual site rather than a blank template. Pages are ranked by real signals, each with a line describing what it answers.",
    scope: "site",
    inputLabel: "Your website address",
    action: "Generate my llms.txt",
    explains: [
      "llms.txt is a curated map of what is worth quoting, not a second sitemap. A sitemap lists everything; this lists the pages that answer something, with a line saying what each one covers.",
      "That description is the part a model cannot derive from a URL, which is why a generator that emits your sitemap with different punctuation is useless. Pages here are ranked by word count, whether someone wrote a description, heading structure and whether the page carries structured data.",
    ],
    checks: ["missing_llms_txt"],
    faq: [
      {
        q: "Do any AI engines actually read llms.txt?",
        a: "It is a convention rather than a standard and no engine has publicly committed to reading it. It costs almost nothing to publish and it makes your own view of your best content explicit, which is worth doing whether or not a specific crawler consumes it today.",
      },
      {
        q: "Where do I put it?",
        a: "At the root, served as text/plain, at /llms.txt. It sits alongside your sitemap rather than replacing it.",
      },
    ],
  },
  {
    slug: "schema-generator",
    name: "Schema generator and validator",
    title: "Schema generator: valid JSON-LD from your actual page",
    blurb: "Reads the page, validates the markup it already has, and writes what is missing.",
    description:
      "Generate Organization, Article, Product, FAQ, LocalBusiness and Breadcrumb JSON-LD from a real page, and validate the markup already there against the properties that gate rich results.",
    scope: "page",
    inputLabel: "The page to read",
    action: "Read and generate",
    explains: [
      "Generated from what the page actually contains, so the markup matches the visible content. Markup describing content that is not on the page is a manual action risk rather than a technicality, and it is the most common way structured data does harm.",
      "Validation resolves @id before it complains. A node carrying an @id is a reference into your entity graph, not an incomplete copy of it, and a validator that proposes completing the reference writes a second conflicting definition and breaks what it was fixing.",
    ],
    checks: ["schema_missing", "schema_invalid", "schema_missing_required", "schema_contradicts_page", "no_organization_schema"],
    faq: [
      {
        q: "Why does it not flag every missing optional property?",
        a: "Because a validator that reports every optional property as a warning trains people to ignore it. Required here means no rich result without it.",
      },
      {
        q: "Can I paste the output straight in?",
        a: "Yes. It is a complete JSON-LD block. Read it first: it is generated from your page, so anything wrong on the page is wrong in the markup.",
      },
    ],
  },
  {
    slug: "serp-preview",
    name: "SERP preview and title rewriter",
    title: "SERP preview: see your title and description as a result",
    blurb: "Renders your real title and meta description at search width, and rewrites them if they do not fit.",
    description:
      "Preview how a page appears in search results using its real title and meta description, with pixel-aware length checks and a rewritten version when it is too long or too short.",
    scope: "page",
    inputLabel: "The page to preview",
    action: "Preview this result",
    explains: [
      "Search truncates by pixel width, not character count, so a count-based checker passes titles that get cut off. Capital letters and wide characters matter.",
      "A title that under-earns its position is the cheapest win available in search, because nothing has to move in the rankings for it to pay.",
    ],
    checks: ["title_missing", "title_too_long", "title_too_short", "meta_description_missing", "meta_description_length", "duplicate_title"],
    faq: [
      {
        q: "Google rewrote my title anyway. Does this still matter?",
        a: "Google rewrites roughly a third of titles, usually when the title is stuffed, duplicated across the site, or does not match the page. A clear, specific, unique title is rewritten less often, so the work still pays.",
      },
    ],
  },
  {
    slug: "sitemap-auditor",
    name: "Sitemap auditor",
    title: "Sitemap auditor: find the pages your sitemap should not list",
    blurb: "Reads your sitemap and flags entries that cannot be indexed, plus live pages it omits.",
    description:
      "Audit an XML sitemap against reality: entries that redirect, 404, are blocked by robots.txt or carry noindex, and indexable pages missing from the file.",
    scope: "site",
    inputLabel: "Your website address",
    action: "Audit my sitemap",
    explains: [
      "A sitemap is a statement about which pages you want indexed. Listing pages that cannot be indexed contradicts that statement and wastes crawl budget on every fetch.",
      "The reverse problem is quieter and usually worse: live, indexable pages that the sitemap never mentions, which on a large site is how whole sections go undiscovered.",
    ],
    checks: ["no_sitemap", "sitemap_contains_non_indexable", "sitemap_missing_pages"],
    faq: [
      {
        q: "Do I need a sitemap if my site is small and well linked?",
        a: "Not strictly. It still helps, because it gives a crawler a complete list rather than making it infer one, and it is the cheapest way to get new pages noticed quickly.",
      },
    ],
  },
  {
    slug: "heading-structure",
    name: "Heading structure check",
    title: "Heading structure check: H1s, hierarchy and question headings",
    blurb: "Shows your heading outline, flags skipped levels, and finds headings that say nothing.",
    description:
      "Check a page's heading structure: missing or duplicated H1s, skipped levels, headings that carry no topical information, and whether questions are marked up as questions.",
    scope: "page",
    inputLabel: "The page to check",
    action: "Show the outline",
    explains: [
      "Headings are the outline a model reads to decide which part of a page answers a question. A page whose headings are 'Overview', 'Features' and 'Get started' has told an answer engine nothing about its subject.",
      "Question-form headings matter more than they used to, because a question heading followed by a direct answer is exactly the shape a model extracts.",
    ],
    checks: ["h1_missing", "h1_multiple", "heading_hierarchy_broken", "no_meaningful_headings", "no_faq_structure"],
    faq: [
      {
        q: "Is more than one H1 really a problem?",
        a: "Rarely a ranking problem, and HTML5 permits it. It is a clarity problem: two H1s means the page has not decided what it is about, and that ambiguity shows up in how a model summarises it.",
      },
    ],
  },
  {
    slug: "robots-txt-generator",
    name: "robots.txt generator",
    title: "robots.txt generator: name every AI crawler explicitly",
    blurb: "Builds a robots.txt that names each search and AI agent, with your sitemap included.",
    description:
      "Generate a robots.txt that explicitly allows or refuses each AI crawler by name, rather than leaving it to a wildcard rule, with your real sitemap URL filled in.",
    scope: "site",
    inputLabel: "Your website address",
    action: "Build my robots.txt",
    explains: [
      "Naming each agent rather than relying on a wildcard removes the ambiguity that causes most accidental blocks, because several crawlers read only their own group when one exists.",
      "The generated file separates retrieval agents, which decide whether you appear in an answer today, from training agents, which build corpora for later. Those are different decisions and a single wildcard cannot express both.",
    ],
    checks: ["robots_missing", "ai_crawler_blocked", "robots_blocks_important"],
    faq: [
      {
        q: "Should I block AI training crawlers?",
        a: "It is a business decision rather than an SEO one. Blocking training does not remove you from answers that retrieval agents produce, and blocking retrieval does remove you. If in doubt, allow retrieval and decide about training separately.",
      },
    ],
  },
  {
    slug: "internal-link-check",
    name: "Internal link and orphan check",
    title: "Internal link check: find orphans and dead internal links",
    blurb: "Maps what a page links to, what links back, and which internal links are broken.",
    description:
      "Check a page's internal linking: outbound internal links, broken ones, and whether the page links to anything at all. Orphan detection across the site with a full crawl.",
    scope: "page",
    inputLabel: "The page to check",
    action: "Map the links",
    explains: [
      "Internal linking is the highest-leverage on-site work available because it costs nothing and needs nobody else's cooperation.",
      "A useful link needs a sentence that already exists and already shares terms with the target. Anywhere else, adding the link means writing a new sentence, which is a content change wearing the clothes of a linking change.",
    ],
    checks: ["no_internal_links_out", "page_404_linked", "orphan_page", "deep_page"],
    faq: [
      {
        q: "How many internal links should a page have?",
        a: "There is no correct number, and any tool quoting one is guessing. The useful questions are whether every important page is reachable, whether anything is orphaned, and whether the anchors describe the destination.",
      },
    ],
  },
];

export const TOOLS_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));

export function allTools(): ToolDef[] {
  return TOOLS;
}
