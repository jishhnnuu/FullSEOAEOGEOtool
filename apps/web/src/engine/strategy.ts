/**
 * Strategy: what to target, what is missing, what to write, who to ask for a link.
 *
 * Derived from the site's own content and structure. No data vendor, no model.
 * That matters because it means a prospect gets a real plan before connecting
 * anything, and because it gives the model-backed writers a grounded brief
 * instead of a topic string.
 */

import { isIndexable } from "./checks";
import { jsonLdTypes } from "./parse";
import { clamp, intentOf, ngrams, slugify, titleCase, tokenise, topTerms } from "./text";
import type {
  AeoReadiness,
  ContentBrief,
  ContentGap,
  CrawlOptions,
  CrawledPage,
  CrawlReport,
  Finding,
  KeywordRow,
  LinkProspect,
  LocalReadiness,
  PageInventoryRow,
  Severity,
} from "./types";

/* ------------------------------------------------------------- keywords */

/**
 * The site template, subtracted.
 *
 * This is the single most consequential correction in the strategy layer. A
 * tf-idf model run over raw page text does not model the site, it models the
 * navigation, because the header, the footer and the cookie banner appear on
 * every page and therefore dominate the term counts.
 *
 * The failure is not subtle once you look for it: an audit of a real site
 * produced "help overview software", "overview software companies" and
 * "agents automation platform" as head terms, all scoring 96.1 across exactly
 * 40 of 40 pages. Those are n-grams sliding across the boundaries between
 * navigation items. Read left to right they reconstruct the menu. "opens"
 * appeared on 31 pages because of "opens in new tab". The strongest page for
 * "services" was the terms and conditions.
 *
 * Three surfaces are built on this model, so all three inherited the fault:
 * the keyword list, the cannibalisation count (every page competing with
 * every other, by construction), and every content brief, which produced
 * titles like "How much does agents cost?".
 *
 * The fix is to identify what is template and remove it before counting.
 * Anything present on more than this share of pages is chrome, not content.
 * The threshold is deliberately high: a genuine head term can legitimately
 * appear on most pages of a focused site, so only near-universal presence
 * counts as template.
 */
const TEMPLATE_PRESENCE = 0.8;

/** Below this many pages, "on most pages" carries no information. */
const MIN_PAGES_FOR_TEMPLATE_DETECTION = 5;

/**
 * Phrases that are chrome wherever they appear.
 *
 * Detected by frequency in a normal crawl, but a shallow crawl or a site with
 * few pages will not surface them, and they are never keywords.
 */
const CHROME = new Set([
  "opens in new tab", "opens in a new tab", "opens in new window", "skip to content",
  "skip to main content", "back to top", "read more", "learn more", "find out more",
  "get in touch", "contact us", "all rights reserved", "privacy policy", "terms conditions",
  "terms and conditions", "cookie policy", "accept all cookies", "manage preferences",
  "sign up", "log in", "sign in", "menu", "close menu", "toggle navigation",
  "follow us", "share this", "next post", "previous post", "view all",
]);

/**
 * Terms that appear on so many pages they can only be template.
 *
 * Returns the set to exclude. Also returns what was excluded, because a
 * correction this large should be visible on screen rather than silent.
 */
export function detectTemplateTerms(
  perPage: Map<string, Map<string, number>>,
): { excluded: Set<string>; sample: string[] } {
  const total = perPage.size;
  const excluded = new Set<string>();
  if (total < MIN_PAGES_FOR_TEMPLATE_DETECTION) return { excluded, sample: [] };

  const presence = new Map<string, number>();
  for (const counts of perPage.values()) {
    for (const phrase of counts.keys()) presence.set(phrase, (presence.get(phrase) ?? 0) + 1);
  }

  const floor = Math.ceil(total * TEMPLATE_PRESENCE);
  for (const [phrase, pages] of presence) {
    if (pages >= floor) excluded.add(phrase);
    else if (CHROME.has(phrase)) excluded.add(phrase);
  }

  // Multi-word phrases are the giveaway, so they lead the sample a person reads.
  const sample = [...excluded]
    .filter((p) => p.includes(" "))
    .sort((a, b) => (presence.get(b) ?? 0) - (presence.get(a) ?? 0))
    .slice(0, 12);
  return { excluded, sample };
}

/** A single word that is chrome regardless of how the template scores. */
function isChromeWord(term: string): boolean {
  return CHROME.has(term);
}

/**
 * Pages that are not what the site is about.
 *
 * A privacy policy is required to talk about personal information, and a terms
 * page about services and liability. Counting them makes "information" a head
 * term and resolves "services" to the terms and conditions, which is what
 * happened on a real audit. They are excluded from the model, not from the
 * crawl: they still get checked, they just do not get a vote on what the
 * business sells.
 */
const NOT_ABOUT_THE_BUSINESS =
  /\/(privacy|privacy-policy|terms|terms-conditions|terms-of-service|terms-and-conditions|cookie|cookies|cookie-policy|legal|disclaimer|accessibility|gdpr|imprint|impressum|refund|returns|shipping|sitemap|search|404|thank-you|thanks)(\/|$|\.)/i;

export function deriveKeywords(report: CrawlReport, options: CrawlOptions, brand: string): KeywordRow[] {
  const all = report.pages.filter((p) => p.signals && p.status < 400);
  const pages = all.filter((p) => !NOT_ABOUT_THE_BUSINESS.test(p.url));
  // Unless excluding them would leave nothing, in which case a small site of
  // policy pages is still better modelled than not modelled at all.
  if (!pages.length) return all.length ? deriveFrom(all, options, brand) : [];
  return deriveFrom(pages, options, brand);
}

function deriveFrom(pages: CrawledPage[], options: CrawlOptions, brand: string): KeywordRow[] {
  if (!pages.length) return [];

  const brandTokens = new Set(tokenise(brand));
  const docFrequency = new Map<string, number>();
  const perPage = new Map<string, Map<string, number>>();

  for (const p of pages) {
    const s = p.signals!;
    // Title and headings carry more signal about intent than body copy, so
    // they are counted more than once rather than weighted after the fact.
    const emphasised = [s.title ?? "", s.h1.join(" "), s.headings.map((h) => h.text).join(" ")].join(" ");
    const corpus = `${emphasised} ${emphasised} ${s.metaDescription ?? ""} ${s.text.slice(0, 12000)}`;
    const counts = new Map<string, number>();
    for (const phrase of [...ngrams(corpus, 2), ...ngrams(corpus, 3)]) {
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
    for (const { term, count } of topTerms(corpus, 40)) {
      counts.set(term, (counts.get(term) ?? 0) + count);
    }
    perPage.set(p.url, counts);
    for (const phrase of counts.keys()) docFrequency.set(phrase, (docFrequency.get(phrase) ?? 0) + 1);
  }

  const total = pages.length;
  // Subtract the template before anything is scored. Doing it here rather
  // than filtering the output matters: a term that is chrome should not
  // influence the document frequency of the terms that are not.
  const { excluded } = detectTemplateTerms(perPage);
  const scores = new Map<string, { weight: number; best: string | null; bestScore: number; pages: string[] }>();

  for (const [url, counts] of perPage) {
    for (const [phrase, count] of counts) {
      if (count < 2 && phrase.includes(" ")) continue;
      if (excluded.has(phrase) || isChromeWord(phrase)) continue;
      const df = docFrequency.get(phrase) ?? 1;
      // Classic tf-idf, with a floor so a term on every page (the brand, the
      // service) is not thrown away entirely.
      const idf = Math.log(1 + total / df) + 0.15;
      const weight = count * idf;
      const entry = scores.get(phrase) ?? { weight: 0, best: null, bestScore: 0, pages: [] };
      entry.weight += weight;
      entry.pages.push(url);
      if (weight > entry.bestScore) {
        entry.bestScore = weight;
        entry.best = url;
      }
      scores.set(phrase, entry);
    }
  }

  const seeds = (options.targetKeywords ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);
  const rows: KeywordRow[] = [];

  for (const [term, entry] of scores) {
    if (term.length < 4) continue;
    const words = term.split(" ").length;
    const isBrand = tokenise(term).every((t) => brandTokens.has(t));
    const isLocal = (options.locations ?? []).some((l) => term.includes(l.toLowerCase()));
    rows.push({
      term,
      kind: isBrand ? "brand" : isLocal ? "local" : term.includes("?") ? "question" : words >= 3 ? "long_tail" : words === 2 ? "body" : "head",
      weight: Math.round(entry.weight * 10) / 10,
      onPageCount: entry.pages.length,
      bestUrl: entry.best,
      bestUrlScore: Math.round(entry.bestScore * 10) / 10,
      intent: intentOf(term),
      cannibalised: entry.pages.length > 2 ? entry.pages.slice(0, 4) : [],
      gap: false,
    });
  }

  rows.sort((a, b) => b.weight - a.weight);
  const kept = rows.slice(0, 120);

  // Anything the operator asked us to target that the site never mentions is
  // a gap, and gaps are the useful half of a keyword list.
  for (const seed of seeds) {
    if (kept.some((r) => r.term === seed)) continue;
    const mentions = pages.filter((p) => p.signals!.text.toLowerCase().includes(seed)).length;
    kept.unshift({
      term: seed,
      kind: seed.split(" ").length >= 3 ? "long_tail" : "head",
      weight: 0,
      onPageCount: mentions,
      bestUrl: mentions ? pages.find((p) => p.signals!.text.toLowerCase().includes(seed))!.url : null,
      bestUrlScore: 0,
      intent: intentOf(seed),
      cannibalised: [],
      gap: mentions === 0,
    });
  }

  return kept;
}

/* ------------------------------------------------------------ the gaps */

const FUNNEL: { format: ContentGap["format"]; pattern: RegExp; why: string; intent: string }[] = [
  { format: "comparison", pattern: /\b(vs|versus|compare|alternative)\b/, why: "Comparison queries convert at close to transactional rates and almost nobody serves them well", intent: "commercial" },
  { format: "guide", pattern: /\b(how|guide|tutorial|steps|process)\b/, why: "The query that starts the research, and the page an answer engine quotes", intent: "informational" },
  { format: "faq", pattern: /\b(what|why|when|can|does|should)\b/, why: "Short answers to real questions are what gets lifted into AI answers", intent: "informational" },
  { format: "landing", pattern: /\b(price|cost|buy|book|hire|service|near me)\b/, why: "Commercial intent with no page to land on is revenue left on the floor", intent: "transactional" },
];

export function findGaps(
  report: CrawlReport,
  keywords: KeywordRow[],
  options: CrawlOptions,
  brand: string,
): ContentGap[] {
  const pages = report.pages.filter((p) => p.signals && isIndexable(p));
  const covered = pages.map((p) => `${p.signals!.title ?? ""} ${p.signals!.h1.join(" ")} ${p.url}`.toLowerCase());
  const gaps: ContentGap[] = [];
  const seen = new Set<string>();

  const core = keywords
    .filter((k) => k.kind !== "brand" && k.weight > 0)
    .slice(0, 14)
    .map((k) => k.term);

  const push = (topic: string, format: ContentGap["format"], why: string, intent: string, target: string, priority: number, supporting: string[]) => {
    const key = slugify(topic);
    if (seen.has(key) || !topic.trim()) return;
    seen.add(key);
    gaps.push({
      topic,
      why,
      intent,
      format,
      priority: Math.round(priority),
      targetKeyword: target,
      supportingKeywords: supporting.slice(0, 6),
      internalLinksFrom: pages
        .filter((p) => tokenise(p.signals!.text.slice(0, 4000)).some((t) => tokenise(target).includes(t)))
        .slice(0, 3)
        .map((p) => p.url),
    });
  };

  // 1. The money questions about each core service.
  for (const term of core.slice(0, 6)) {
    const pretty = titleCase(term);
    const asks = [
      { topic: `How much does ${term} cost?`, format: "faq" as const, intent: "commercial", boost: 18 },
      { topic: `${pretty}: a complete guide`, format: "guide" as const, intent: "informational", boost: 10 },
      { topic: `${pretty} vs the alternatives`, format: "comparison" as const, intent: "commercial", boost: 12 },
    ];
    for (const ask of asks) {
      const already = covered.some((c) => c.includes(term) && matchesFormat(c, ask.format));
      if (already) continue;
      push(
        ask.topic,
        ask.format,
        FUNNEL.find((f) => f.format === ask.format)?.why ?? "Demand the site does not currently answer",
        ask.intent,
        ask.format === "faq" ? `${term} cost` : ask.format === "comparison" ? `${term} alternatives` : term,
        60 + ask.boost,
        core.filter((c) => c !== term).slice(0, 5),
      );
    }
  }

  // 2. Terms the operator named that the site never mentions.
  for (const keyword of keywords.filter((k) => k.gap)) {
    push(
      titleCase(keyword.term),
      keyword.intent === "transactional" ? "landing" : "guide",
      "You named this as a target and no page on the site mentions it",
      keyword.intent,
      keyword.term,
      90,
      core.slice(0, 4),
    );
  }

  // 3. Locations without a page.
  for (const location of options.locations ?? []) {
    const has = covered.some((c) => c.includes(location.toLowerCase()));
    if (has) continue;
    push(
      `${titleCase(options.industry ?? core[0] ?? brand)} in ${location}`,
      "location",
      "A location with no page cannot rank in its own map pack, and the Business Profile has nowhere specific to link to",
      "transactional",
      `${core[0] ?? options.industry ?? brand} ${location}`.toLowerCase(),
      85,
      core.slice(0, 4),
    );
  }

  // 4. Competitor comparisons, which almost every site under-serves.
  for (const competitor of (options.competitors ?? []).slice(0, 4)) {
    const name = titleCase(competitor.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").split(".")[0]);
    push(
      `${brand} vs ${name}`,
      "comparison",
      "People compare you to this competitor before they buy. Right now someone else writes that page",
      "commercial",
      `${brand} vs ${name}`.toLowerCase(),
      75,
      core.slice(0, 4),
    );
  }

  // 5. A glossary, when the site has jargon and no definitions.
  const jargon = keywords.filter((k) => k.kind === "long_tail" && k.onPageCount >= 3).slice(0, 8);
  if (jargon.length >= 4 && !covered.some((c) => /glossary|terminology|definitions/.test(c))) {
    push(
      `${brand} glossary: ${jargon.length} terms explained`,
      "glossary",
      "Definition pages earn citations because a model needs somewhere to point when it defines a term",
      "informational",
      `${jargon[0].term} meaning`,
      55,
      jargon.map((j) => j.term),
    );
  }

  // 6. An original-data asset, because outreach fails without one.
  if (!covered.some((c) => /\b(study|research|report|survey|data|statistics|benchmark)\b/.test(c))) {
    push(
      `${titleCase(core[0] ?? options.industry ?? brand)}: what the numbers actually say`,
      "case_study",
      "Nothing on the site is worth linking to. One original data piece is what makes outreach possible at all",
      "informational",
      `${core[0] ?? brand} statistics`,
      70,
      core.slice(0, 5),
    );
  }

  return gaps.sort((a, b) => b.priority - a.priority).slice(0, 24);
}

function matchesFormat(haystack: string, format: ContentGap["format"]): boolean {
  switch (format) {
    case "faq": return /\b(cost|price|pricing|faq|questions)\b/.test(haystack);
    case "comparison": return /\b(vs|versus|compare|comparison|alternative)\b/.test(haystack);
    case "guide": return /\b(guide|how|tutorial|complete|everything)\b/.test(haystack);
    default: return false;
  }
}

/* ------------------------------------------------------------- briefs */

export function briefFor(gap: ContentGap, report: CrawlReport, brand: string, options: CrawlOptions): ContentBrief {
  const origin = report.baseUrl.replace(/\/$/, "");
  const wordTarget = { guide: 1800, comparison: 1400, landing: 900, faq: 800, case_study: 1600, location: 900, glossary: 1200 }[gap.format];
  const audience = options.businessType === "ecommerce"
    ? "Someone deciding whether to buy, comparing two or three options"
    : options.businessType === "local"
      ? `Someone in ${options.locations?.[0] ?? "the area"} looking for this service now`
      : "A buyer doing research before they shortlist";

  const outline = outlineFor(gap, brand, options);
  const questions = questionSet(gap, brand);

  return {
    id: slugify(gap.topic),
    title: gap.topic,
    slug: slugify(gap.topic),
    format: gap.format,
    targetKeyword: gap.targetKeyword,
    supportingKeywords: gap.supportingKeywords,
    intent: gap.intent,
    audience,
    wordTarget,
    outline,
    answerBlock: `Open with two to three sentences that answer "${gap.topic.replace(/\?$/, "")}" directly, including one specific number. This passage is what an answer engine lifts, so it has to make sense quoted on its own, without the heading above it.`,
    faq: questions.map((q) => ({ q, a: "60 words or fewer. State the answer in the first sentence." })),
    internalLinks: gap.internalLinksFrom.map((url) => ({ url, anchor: clamp(gap.targetKeyword, 60) })),
    schema: schemaForFormat(gap, brand, origin),
    metaTitle: clamp(`${gap.topic}${brand.length <= 22 ? ` | ${brand}` : ""}`, 60),
    metaDescription: clamp(`${gap.topic.replace(/\?$/, "")}: what it involves, what it costs and how to decide. Written by ${brand}.`, 158),
    citationsNeeded: [
      "One industry source for any market-level figure",
      "One first-party number from your own data, which is what makes the page citable",
      gap.format === "comparison" ? "The competitor's own published pricing or documentation, linked" : "A named expert or customer quote",
    ],
    notes: [
      `Primary keyword: ${gap.targetKeyword}. Use it in the title, the H1, the first 100 words and one H2. Not more.`,
      "Every claim needs a source or a first-party number. An unsourced superlative is a compliance finding, not a persuasive sentence.",
      "No closing paragraph that restates the article.",
    ],
  };
}

function outlineFor(gap: ContentGap, brand: string, options: CrawlOptions): ContentBrief["outline"] {
  const topic = gap.topic.replace(/\?$/, "");
  const base: ContentBrief["outline"] = [{ heading: gap.topic, level: 1, guidance: "One H1, matching the title" }];

  const sections: Record<ContentGap["format"], [string, string][]> = {
    guide: [
      [`What ${gap.targetKeyword} is`, "Define it in under 60 words, then one example"],
      [`How it works, step by step`, "Numbered steps. Each step names what the reader does and what changes"],
      [`What it costs`, "A real range with the variables that move it. A table works here"],
      [`How long it takes`, "Typical timeline with the things that delay it"],
      [`Mistakes that cost people money`, "Three to five, each with the consequence"],
      [`How to choose a provider`, "The questions to ask. This is where you earn the enquiry without pitching"],
    ],
    comparison: [
      [`The short answer`, "Who each option suits, in three sentences. Put it first"],
      [`Side by side`, "A table: price, what is included, who it suits, where it falls short"],
      [`Where ${brand} is the better choice`, "Be specific and be honest about when it is not"],
      [`Where the alternative wins`, "Saying this is what makes the rest credible"],
      [`How to decide`, "A short decision rule, not a sales pitch"],
    ],
    landing: [
      [`What you get`, "The offer, plainly, above the fold"],
      [`How it works`, "Three or four steps"],
      [`Pricing`, "Real numbers. A page that hides the price loses to one that does not"],
      [`Proof`, "Named customers, results with figures, credentials"],
      [`Questions`, "Four to six, each answered in under 60 words"],
    ],
    faq: [
      [topic, "The direct answer, first, with the number in the first sentence"],
      [`What changes the price`, "The variables, each with its effect"],
      [`Worked examples`, "Two or three real scenarios with figures"],
      [`What is not included`, "The thing every competitor leaves out"],
    ],
    case_study: [
      [`What we found`, "The headline finding with the number, first"],
      [`Method`, "Sample, period, source. Without this nobody cites it"],
      [`The data`, "Tables and charts. Publish the underlying numbers"],
      [`What it means`, "Interpretation, separated from the data"],
      [`Use this data`, "An explicit citation line and a licence. This is the part that earns links"],
    ],
    location: [
      [`${topic}`, "Direct answer: what you do here, where you are, how soon"],
      [`Serving ${options.locations?.[0] ?? "the area"}`, "Specific to this place. Never the national copy with the name swapped"],
      [`Getting here`, "Address, parking, transport, embedded map"],
      [`Local results`, "Named local customers and what changed"],
      [`Local questions`, "Four to six, answered short"],
    ],
    glossary: [
      [`How to use this glossary`, "Two sentences"],
      [`Terms A to Z`, "Each term: a 40 word definition, then one sentence of context. Anchor link per term"],
      [`Related reading`, "Link to the guides that cover these in depth"],
    ],
  };

  for (const [heading, guidance] of sections[gap.format]) {
    base.push({ heading, level: 2, guidance });
  }
  return base;
}

function questionSet(gap: ContentGap, brand: string): string[] {
  const term = gap.targetKeyword;
  return [
    `How much does ${term} cost?`,
    `How long does ${term} take?`,
    `Is ${term} worth it?`,
    `What should I look for when choosing ${term}?`,
    `Does ${brand} offer ${term}?`,
  ];
}

function schemaForFormat(gap: ContentGap, brand: string, origin: string): Record<string, unknown> {
  const url = `${origin}/${slugify(gap.topic)}`;
  if (gap.format === "faq") {
    return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] };
  }
  if (gap.format === "location") {
    return { "@context": "https://schema.org", "@type": "LocalBusiness", name: brand, url };
  }
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: gap.topic,
    url,
    author: { "@type": "Organization", name: brand },
    publisher: { "@type": "Organization", name: brand, url: origin },
  };
}

/* ---------------------------------------------------------- prospecting */

const DIRECTORY_SEEDS: { domain: string; kind: LinkProspect["kind"]; why: string }[] = [
  { domain: "google.com/business", kind: "directory", why: "The single highest-value local listing there is" },
  { domain: "bing.com/places", kind: "directory", why: "Feeds Bing, Copilot and DuckDuckGo local results" },
  { domain: "apple.com/maps", kind: "directory", why: "Apple Business Connect drives Siri and Apple Maps" },
  { domain: "trustpilot.com", kind: "directory", why: "Reviews that answer engines quote when asked whether you are any good" },
  { domain: "crunchbase.com", kind: "directory", why: "An entity record models use to resolve who a company is" },
  { domain: "wikidata.org", kind: "directory", why: "Structured entity data that feeds knowledge panels and model grounding" },
  { domain: "linkedin.com/company", kind: "directory", why: "The sameAs link every Organization schema should carry" },
];

export function findProspects(report: CrawlReport, options: CrawlOptions, brand: string): LinkProspect[] {
  const out: LinkProspect[] = [];
  const linkedDomains = new Set<string>();
  for (const p of report.pages) {
    for (const link of p.signals?.links ?? []) {
      if (!link.internal) {
        try { linkedDomains.add(new URL(link.href).host.replace(/^www\./, "")); } catch { /* ignore */ }
      }
    }
  }

  for (const seed of DIRECTORY_SEEDS) {
    const root = seed.domain.split("/")[0];
    if ([...linkedDomains].some((d) => d.includes(root))) continue;
    out.push({
      domain: root,
      url: `https://${seed.domain}`,
      kind: seed.kind,
      why: seed.why,
      authorityHint: "High. These are entity records, not link schemes",
      contactPath: "Claim the listing directly",
      pitchAngle: `Claim and complete the ${root} record for ${brand}, with the exact same name, address and phone as the site footer.`,
      priority: seed.kind === "directory" && /google|bing|apple/.test(root) ? 92 : 70,
    });
  }

  // Sites already linked out to are the warmest possible prospects: the
  // relationship exists, only the reciprocal link does not.
  for (const domain of [...linkedDomains].slice(0, 20)) {
    if (DIRECTORY_SEEDS.some((s) => domain.includes(s.domain.split("/")[0]))) continue;
    if (/facebook|instagram|twitter|x\.com|youtube|tiktok|pinterest|cdn|googleapis|gstatic|cloudflare/.test(domain)) continue;
    out.push({
      domain,
      url: `https://${domain}`,
      kind: "partner",
      why: "You already link to them. A reciprocal mention is the shortest outreach there is",
      authorityHint: "Unknown until a link index is connected",
      contactPath: `https://${domain}/contact`,
      pitchAngle: `You cite ${domain} on your site. Tell them which page, what you said, and offer the data or quote they would need to cite you back. Never ask for a link swap in the first email.`,
      priority: 55,
    });
  }

  for (const competitor of (options.competitors ?? []).slice(0, 5)) {
    const host = competitor.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
    out.push({
      domain: host,
      url: `https://${host}`,
      kind: "competitor_link",
      why: "Every site linking to this competitor is a site that covers your category and has already linked out once",
      authorityHint: "Connect a link index to see their referring domains",
      contactPath: "Run their backlink profile, then filter to resource pages and roundups",
      pitchAngle: `Find the pages linking to ${host} that would be better served by your asset, and pitch the asset, not the link.`,
      priority: 80,
    });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 30);
}

/* ------------------------------------------------------------------ AEO */

export function assessAeo(report: CrawlReport, findings: Finding[], brand: string): AeoReadiness {
  const files = report.files;
  const crawlerAccess = [
    ...files.allowedAiCrawlers.map((agent) => ({ agent, allowed: true, matters: agentPurpose(agent) })),
    ...files.blockedAiCrawlers.map((agent) => ({ agent, allowed: false, matters: agentPurpose(agent) })),
  ].sort((a, b) => Number(a.allowed) - Number(b.allowed));

  // One navigation heading repeated across a template would otherwise fill this
  // table with the same row, so each question appears once, on its best page.
  const seenQuestion = new Set<string>();
  const answerable: AeoReadiness["answerable"] = [];
  for (const p of report.pages) {
    if (!p.signals) continue;
    const question = p.signals.questionHeadings.find(isRealQuestion)
      ?? (/\?/.test(p.signals.title ?? "") ? p.signals.title! : null);
    if (!question) continue;
    const key = question.toLowerCase().trim();
    if (seenQuestion.has(key)) continue;
    seenQuestion.add(key);
    const passage = p.signals.paragraphs[0] ?? null;
    answerable.push({
      url: p.url,
      question,
      hasDirectAnswer: !!passage && passage.length > 60 && /\b(is|are|costs?|takes?|means|requires?)\b/i.test(passage.slice(0, 200)),
      passage: passage ? clamp(passage, 260) : null,
    });
    if (answerable.length >= 25) break;
  }

  const home = report.pages.find((p) => p.depth === 0);
  const homeTypes = home?.signals ? jsonLdTypes(home.signals.jsonLd) : [];
  const anySameAs = report.pages.some((p) => (p.signals?.text ?? "").length > 0 && jsonLdTypes(p.signals!.jsonLd).length > 0
    && /sameAs/.test(JSON.stringify(p.signals!.jsonLd)));

  const entitySignals = [
    { signal: "Organization or LocalBusiness markup", present: homeTypes.some((t) => /Organization|LocalBusiness|Corporation|ProfessionalService|Store/.test(t)), detail: "Tells every engine what kind of thing the brand is" },
    { signal: "sameAs profile links", present: anySameAs, detail: "Ties the site to the profiles that describe the same entity" },
    { signal: "Named authors", present: report.pages.some((p) => p.signals?.author), detail: "Experience and expertise cannot be assessed without a person" },
    { signal: "llms.txt", present: !!files.llmsTxt, detail: "A curated map of what matters, for engines that read it" },
    { signal: "Content present in the served HTML", present: report.pages.filter((p) => (p.signals?.wordCount ?? 0) > 200).length >= Math.max(1, Math.floor(report.pages.length * 0.4)), detail: "An engine that does not run JavaScript sees only what the server sent" },
    { signal: "FAQ or Q&A structure", present: report.pages.some((p) => p.signals?.hasFaqBlock), detail: "The shape an answer engine lifts most readily" },
    { signal: "Citable figures", present: report.pages.some((p) => (p.signals?.numbers ?? 0) >= 3), detail: "Models cite pages that contain specific numbers" },
  ];

  const citableAssets = report.pages.filter((p) => (p.signals?.numbers ?? 0) >= 3 && (p.signals?.wordCount ?? 0) > 500).length;
  const aeoFindings = findings.filter((f) => f.category === "aeo");
  const penalty = aeoFindings.reduce((sum, f) => sum + ({ critical: 25, high: 14, medium: 7, low: 3, info: 1 } as Record<Severity, number>)[f.severity], 0);
  const signalBonus = entitySignals.filter((s) => s.present).length * 4;

  const questions = [...new Set(
    report.pages.flatMap((p) => p.signals?.questionHeadings ?? []).filter(isRealQuestion),
  )].slice(0, 30);

  return {
    score: Math.max(0, Math.min(100, 70 - penalty + signalBonus)),
    crawlerAccess,
    answerable,
    entitySignals,
    citableAssets,
    questions: questions.length ? questions : defaultQuestions(brand, report),
  };
}

/**
 * A heading that is actually a question somebody would ask.
 *
 * "Feeling inspired?" is a call to action wearing a question mark. Requiring an
 * interrogative opener and a few words filters those out without needing a
 * model to judge it.
 */
function isRealQuestion(heading: string): boolean {
  const text = heading.trim();
  if (text.split(/\s+/).length < 3) return false;
  if (!/^(what|why|how|when|where|who|which|can|do|does|is|are|should|will|would|has|have|must|may|might)\b/i.test(text)) {
    return false;
  }
  return true;
}

function agentPurpose(agent: string): string {
  const map: Record<string, string> = {
    GPTBot: "Trains and grounds ChatGPT answers",
    "OAI-SearchBot": "Powers ChatGPT search results and citations",
    "ChatGPT-User": "Fetches a page when a user asks ChatGPT about it",
    ClaudeBot: "Claude's crawler",
    "Claude-User": "Fetches a page when a user asks Claude about it",
    PerplexityBot: "Perplexity's index and its citations",
    "Google-Extended": "Gemini grounding and AI Overviews",
    "Applebot-Extended": "Apple Intelligence and Siri answers",
    Bytespider: "TikTok search",
    "meta-externalagent": "Meta AI answers",
    CCBot: "Common Crawl, which many models train on",
    Amazonbot: "Alexa and Rufus answers",
  };
  return map[agent] ?? "An AI crawler";
}

function defaultQuestions(brand: string, report: CrawlReport): string[] {
  const terms = topTerms(report.pages.map((p) => p.signals?.text ?? "").join(" ").slice(0, 20000), 6).map((t) => t.term);
  return [
    `What does ${brand} do?`,
    `Is ${brand} any good?`,
    `How much does ${brand} charge?`,
    ...terms.slice(0, 3).map((t) => `Who is the best provider of ${t}?`),
  ];
}

/* ---------------------------------------------------------------- local */

export function assessLocal(report: CrawlReport, options: CrawlOptions, brand: string): LocalReadiness {
  const applicable = options.businessType === "local" || (options.locations?.length ?? 0) > 0;
  const phones = new Set<string>();
  const addresses = new Set<string>();
  const names = new Set<string>();
  let pagesWithNap = 0;

  for (const p of report.pages) {
    const text = p.signals?.text ?? "";
    const phone = /(\+?\d[\d ().-]{8,}\d)/.exec(text)?.[1]?.trim();
    const address = /\b(\d{1,5}\s+[A-Z][\w'-]*(?:\s+[A-Z]?[\w'-]+){0,4}\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Way|Boulevard|Blvd|Close|Court|Ct|Place|Pl))\b/.exec(text)?.[1];
    if (phone) phones.add(phone.replace(/[^\d+]/g, ""));
    if (address) addresses.add(address);
    if (phone || address) pagesWithNap++;
  }
  names.add(brand);

  const consistency: { field: string; variants: string[] }[] = [];
  if (phones.size > 1) consistency.push({ field: "Phone", variants: [...phones].slice(0, 6) });
  if (addresses.size > 1) consistency.push({ field: "Address", variants: [...addresses].slice(0, 6) });

  const hasLocalBusinessSchema = report.pages.some((p) => p.signals && jsonLdTypes(p.signals.jsonLd).some((t) => /LocalBusiness|Store|Restaurant|MedicalBusiness|ProfessionalService|LegalService|Dentist/.test(t)));
  const locationPages = report.pages
    .filter((p) => (options.locations ?? []).some((l) => p.url.toLowerCase().includes(l.toLowerCase().replace(/\s+/g, "-"))))
    .map((p) => p.url);
  const mapEmbeds = report.pages.filter((p) => /google\.com\/maps|maps\.googleapis|openstreetmap/.test(JSON.stringify(p.signals?.scripts ?? []) + (p.signals?.text ?? ""))).length;
  const openingHours = report.pages.some((p) => /\b(mon|monday)\b[^.]{0,40}\b(fri|friday)\b/i.test(p.signals?.text ?? "") || /openingHours/.test(JSON.stringify(p.signals?.jsonLd ?? [])));

  const recommendations: string[] = [];
  if (!hasLocalBusinessSchema) recommendations.push("Add LocalBusiness markup with the address, geo coordinates and opening hours.");
  if (consistency.length) recommendations.push("Standardise one exact name, address and phone format, then correct every listing to match it.");
  if (!mapEmbeds) recommendations.push("Embed a map on the contact page and each location page.");
  if (!openingHours) recommendations.push("Publish opening hours as text, not only inside an image.");
  for (const location of options.locations ?? []) {
    if (!locationPages.some((u) => u.toLowerCase().includes(location.toLowerCase().replace(/\s+/g, "-")))) {
      recommendations.push(`Build a page for ${location} and link the Business Profile to it rather than to the homepage.`);
    }
  }
  recommendations.push("Connect the Business Profile so posts, review replies and the geo grid can run on a schedule.");

  return {
    applicable,
    napFound: {
      name: brand,
      address: [...addresses][0] ?? null,
      phone: [...phones][0] ?? null,
      pages: pagesWithNap,
    },
    consistency,
    hasLocalBusinessSchema,
    locationPages,
    mapEmbeds,
    openingHours,
    recommendations,
  };
}

/* ------------------------------------------------------------ inventory */

export function buildInventory(report: CrawlReport, findings: Finding[]): PageInventoryRow[] {
  const bySeverity: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  const perUrl = new Map<string, Finding[]>();
  for (const finding of findings) {
    const urls = finding.url ? [finding.url] : finding.affectedUrls;
    for (const url of urls) (perUrl.get(url) ?? perUrl.set(url, []).get(url)!).push(finding);
  }

  return report.pages.map((p) => {
    const s = p.signals;
    const issues = perUrl.get(p.url) ?? [];
    const worst = issues.sort((a, b) => bySeverity[b.severity] - bySeverity[a.severity])[0]?.severity ?? null;
    const aeoScore = pageAeoScore(p);
    const opportunity = Math.round(
      (s?.wordCount ?? 0) / 100 +
      p.inlinks.length * 2 +
      (issues.reduce((sum, f) => sum + f.priority, 0) / 20) -
      p.depth * 3,
    );

    return {
      url: p.url,
      title: s?.title ?? null,
      status: p.status,
      depth: p.depth,
      wordCount: s?.wordCount ?? 0,
      h1: s?.h1[0] ?? null,
      inlinks: p.inlinks.length,
      outlinks: s?.links.filter((l) => l.internal).length ?? 0,
      issues: issues.length,
      worstSeverity: worst,
      aeoScore,
      opportunity,
      type: pageType(p),
      indexable: isIndexable(p),
    };
  });
}

function pageAeoScore(p: CrawledPage): number {
  const s = p.signals;
  if (!s) return 0;
  let score = 0;
  if (s.wordCount > 300) score += 15;
  if (s.wordCount > 900) score += 10;
  if (s.headings.length >= 4) score += 10;
  if (s.questionHeadings.length >= 2) score += 12;
  if (s.hasFaqBlock) score += 8;
  if (jsonLdTypes(s.jsonLd).length) score += 12;
  if (s.author) score += 10;
  if (s.numbers >= 3) score += 12;
  if (s.externalCitations >= 2) score += 8;
  if (s.lists >= 2 || s.tables >= 1) score += 8;
  if (s.modifiedAt) score += 5;
  return Math.min(100, score);
}

function pageType(p: CrawledPage): string {
  const url = p.url.toLowerCase();
  if (p.depth === 0) return "home";
  if (/\/(blog|article|news|post|insight)/.test(url)) return "article";
  if (/\/(product|shop|item)/.test(url)) return "product";
  if (/\/(service|solutions)/.test(url)) return "service";
  if (/\/(category|collection|tag)/.test(url)) return "category";
  if (/\/(contact|about|team|careers|privacy|terms)/.test(url)) return "utility";
  if (/\/(location|branch|store|find-us)/.test(url)) return "location";
  return "page";
}
