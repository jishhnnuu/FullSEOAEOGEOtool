/**
 * AI answer visibility: are you actually in the answer?
 *
 * Every check in `catalog.ts` asks whether an answer engine *could* use the
 * site. This asks whether it *does*. They are different questions and the gap
 * between them is where the whole category currently sits: a dozen platforms
 * charge between 29 and 500 dollars a month to tell you that ChatGPT did not
 * mention you, and stop there. Monitoring is the product.
 *
 * Two decisions make this different.
 *
 * The first is that it runs on the tenant's own model key, through the same
 * relay the writer uses, so it costs them a few cents of their own tokens
 * rather than a subscription to us. That is possible because the expensive
 * part of those platforms is not the technology, it is that they are paying
 * for the model calls and reselling them.
 *
 * The second is that every prompt is derived from the crawl rather than typed
 * in by hand. A visibility tool that makes you invent the questions measures
 * the questions you thought of. This measures the questions the site is
 * actually trying to rank for, which is the set that matters.
 *
 * Honesty rules that hold here:
 *  - A model's answer is one sample of a stochastic system. Results say how
 *    many runs mentioned you out of how many asked, never "you rank third".
 *  - A mention is not a citation. Being named in prose and being linked are
 *    tracked separately, because only one of them sends traffic.
 *  - Nothing is inferred about engines that were not asked. If only one
 *    provider has a key, only that provider gets a score.
 */

import type { AuditResult, CrawlReport, KeywordRow } from "./types";

/* ---------------------------------------------------------------- prompts */

export type PromptKind = "category" | "comparison" | "problem" | "local" | "brand";

export type AnswerPrompt = {
  id: string;
  kind: PromptKind;
  text: string;
  /** Why this prompt is worth spending a model call on. */
  why: string;
};

const STOP = new Set([
  "the", "and", "for", "with", "your", "our", "you", "are", "that", "this", "from",
  "have", "has", "was", "were", "will", "can", "all", "how", "what", "why", "who",
  "best", "top", "more", "get", "new", "one", "about", "into", "than", "then",
]);

/** The words the site is most about, cleaned of the ones that say nothing. */
function coreTerms(keywords: KeywordRow[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of keywords) {
    const term = row.term.trim().toLowerCase();
    if (term.length < 4) continue;
    if (term.split(/\s+/).every((word) => STOP.has(word))) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    out.push(row.term);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The prompts a buyer would actually type.
 *
 * Five shapes, because they fail differently. A category prompt tests whether
 * you exist in the model's world at all. A comparison prompt tests whether you
 * survive being put next to a named rival. A problem prompt tests whether your
 * content answers a question rather than describing a product. A local prompt
 * tests the map pack's equivalent. A brand prompt tests whether the model
 * knows what you do when it is handed your name, which is the one that catches
 * a model confidently describing a different company.
 */
export function buildPrompts(
  result: Pick<AuditResult, "keywords" | "crawl">,
  options: { brand: string; competitors: string[]; locations: string[]; industry?: string },
  limit = 12,
): AnswerPrompt[] {
  const terms = coreTerms(result.keywords, 8);
  const head = terms[0] ?? options.industry ?? "this category";
  const prompts: AnswerPrompt[] = [];
  const add = (kind: PromptKind, text: string, why: string) => {
    if (prompts.length >= limit) return;
    if (prompts.some((p) => p.text.toLowerCase() === text.toLowerCase())) return;
    prompts.push({ id: `p${prompts.length + 1}`, kind, text, why });
  };

  for (const term of terms.slice(0, 3)) {
    add("category", `What are the best ${term} options available right now?`,
      "The plain category question. If you are absent here you are absent from the market as the model understands it.");
  }
  add("category", `Who are the leading providers of ${head}?`,
    "Tests whether the model holds you as a named entity in the category rather than only as a page it once read.");

  for (const competitor of options.competitors.slice(0, 3)) {
    add("comparison", `How does ${options.brand} compare to ${competitor}?`,
      `Tests whether the model can describe you accurately next to ${competitor}, and whether it repeats their framing or yours.`);
  }

  for (const term of terms.slice(0, 3)) {
    add("problem", `How do I choose ${term}? What should I look for?`,
      "The advice question. Answering it in your own copy is how you get quoted rather than listed.");
  }

  for (const location of options.locations.slice(0, 2)) {
    add("local", `Who provides ${head} in ${location}?`,
      "The local equivalent of the map pack. Answer engines assemble this from your profile, your site and third-party mentions.");
  }

  add("brand", `What is ${options.brand} and what do they do?`,
    "The sanity check. A model that describes you wrongly is worse than one that has never heard of you, and it is fixable.");

  return prompts;
}

/* ---------------------------------------------------------------- reading */

export type Mention = {
  /** Named anywhere in the answer. */
  named: boolean;
  /** The domain appears, which is the only form that can send traffic. */
  cited: boolean;
  /** Roughly how early: 0 is the opening, 1 is the end. Null when absent. */
  position: number | null;
  /** The sentence that named you, for the screen to quote. */
  passage: string | null;
  /** Everyone else the answer named, so share of voice is measurable. */
  rivals: string[];
};

/** Escape a string so it can sit inside a regular expression literally. */
function literal(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Read one answer.
 *
 * Deliberately conservative. A brand name that appears only as a substring of
 * a longer word does not count, and a domain has to appear with its extension
 * to count as a citation, because "acme" in prose is a mention and "acme.com"
 * is a link the reader can follow.
 */
export function readAnswer(
  answer: string,
  options: { brand: string; domain: string; competitors: string[] },
): Mention {
  const text = answer ?? "";
  if (!text.trim()) return { named: false, cited: false, position: null, passage: null, rivals: [] };

  const brand = options.brand.trim();
  const bare = options.domain.replace(/^www\./, "");
  const namePattern = brand.length >= 3 ? new RegExp(`\\b${literal(brand)}\\b`, "i") : null;
  const domainPattern = new RegExp(literal(bare), "i");

  const nameHit = namePattern ? text.search(namePattern) : -1;
  const domainHit = text.search(domainPattern);
  const first = [nameHit, domainHit].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;

  const rivals: string[] = [];
  for (const competitor of options.competitors) {
    const name = competitor.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const stem = name.split(".")[0];
    if (stem.length < 3) continue;
    if (new RegExp(`\\b${literal(stem)}\\b`, "i").test(text)) rivals.push(name);
  }

  let passage: string | null = null;
  if (first >= 0) {
    // The sentence around the first hit, trimmed to something quotable.
    const start = Math.max(0, text.lastIndexOf(".", first) + 1);
    const end = text.indexOf(".", first);
    passage = text.slice(start, end === -1 ? Math.min(text.length, first + 220) : end + 1).trim().slice(0, 280);
  }

  return {
    named: nameHit >= 0 || domainHit >= 0,
    cited: domainHit >= 0,
    position: first >= 0 && text.length > 0 ? first / text.length : null,
    passage,
    rivals,
  };
}

/* ----------------------------------------------------------------- result */

export type AnswerRun = {
  promptId: string;
  prompt: string;
  kind: PromptKind;
  provider: string;
  model: string;
  askedAt: string;
  answer: string;
  mention: Mention;
};

export type EngineScore = {
  provider: string;
  model: string;
  asked: number;
  named: number;
  cited: number;
  /** Mentions as a share of prompts asked. The headline number. */
  presence: number;
};

export type RivalScore = { name: string; appearances: number; share: number };

export type AnswerVisibility = {
  runs: AnswerRun[];
  engines: EngineScore[];
  rivals: RivalScore[];
  /** Mentions across every engine asked, over every prompt asked. */
  presence: number;
  /** The share of mentions that carried the domain rather than the name alone. */
  citationRate: number;
  /** Prompts where nobody named you and a rival was named instead. */
  losses: { prompt: string; wonBy: string[] }[];
  askedAt: string;
  notes: string[];
};

/** Fold a set of runs into the numbers a screen can show. */
export function summarise(runs: AnswerRun[]): AnswerVisibility {
  const engines = new Map<string, EngineScore>();
  const rivalCounts = new Map<string, number>();
  const losses: { prompt: string; wonBy: string[] }[] = [];
  let named = 0;
  let cited = 0;

  for (const run of runs) {
    const key = `${run.provider}:${run.model}`;
    const engine = engines.get(key) ?? { provider: run.provider, model: run.model, asked: 0, named: 0, cited: 0, presence: 0 };
    engine.asked += 1;
    if (run.mention.named) engine.named += 1;
    if (run.mention.cited) engine.cited += 1;
    engines.set(key, engine);

    if (run.mention.named) named += 1;
    if (run.mention.cited) cited += 1;

    for (const rival of run.mention.rivals) {
      rivalCounts.set(rival, (rivalCounts.get(rival) ?? 0) + 1);
    }
    if (!run.mention.named && run.mention.rivals.length > 0) {
      losses.push({ prompt: run.prompt, wonBy: run.mention.rivals });
    }
  }

  for (const engine of engines.values()) {
    engine.presence = engine.asked > 0 ? engine.named / engine.asked : 0;
  }

  const total = runs.length;
  const rivals: RivalScore[] = [...rivalCounts.entries()]
    .map(([name, appearances]) => ({ name, appearances, share: total > 0 ? appearances / total : 0 }))
    .sort((a, b) => b.appearances - a.appearances);

  const notes: string[] = [];
  if (total > 0 && named === 0) {
    notes.push(
      "Nothing named the site across every prompt asked. That is a starting point rather than a verdict: " +
        "the fixes on the findings screen are what change it, and the next run measures whether they did.",
    );
  }
  if (named > 0 && cited === 0) {
    notes.push(
      "The site is named but never linked. Being described is worth less than being cited, and the difference " +
        "usually comes down to whether a page states a fact plainly enough to be quoted with a source.",
    );
  }

  return {
    runs,
    engines: [...engines.values()],
    rivals,
    presence: total > 0 ? named / total : 0,
    citationRate: named > 0 ? cited / named : 0,
    losses: losses.slice(0, 12),
    askedAt: new Date().toISOString(),
    notes,
  };
}

/* ------------------------------------------------------------- llms.txt */

/**
 * Generate the llms.txt the site should publish.
 *
 * The convention is a curated map of what matters, not a sitemap. A sitemap
 * lists everything; this lists the pages worth quoting and says what each one
 * answers, which is the part an answer engine cannot work out on its own.
 */
export function buildLlmsTxt(
  report: CrawlReport,
  options: { brand: string; summary?: string },
): string {
  const lines: string[] = [];
  lines.push(`# ${options.brand}`);
  lines.push("");
  if (options.summary) {
    lines.push(`> ${options.summary}`);
    lines.push("");
  }

  // Ranked by how much a page looks like an answer rather than a stub: real
  // prose, a heading structure, and a description someone wrote.
  const ranked = [...report.pages]
    .filter((page) => page.status === 200 && page.signals !== null)
    .filter((page) => !/noindex/i.test(page.signals!.robotsMeta ?? ""))
    .map((page) => {
      const s = page.signals!;
      return {
        page,
        weight: s.wordCount / 500 + (s.metaDescription ? 1 : 0) + (s.h1.length ? 0.5 : 0) + (s.jsonLd.length ? 0.5 : 0),
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 40);

  lines.push("## Pages");
  lines.push("");
  for (const { page } of ranked) {
    const s = page.signals!;
    const label = s.title?.trim() || s.h1[0]?.trim() || page.url;
    const note = (s.metaDescription?.trim() || s.lede?.trim() || "").slice(0, 160);
    lines.push(note ? `- [${label}](${page.url}): ${note}` : `- [${label}](${page.url})`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("This file lists the pages worth quoting and what each one covers.");
  lines.push("It is maintained alongside the sitemap, not instead of it.");
  lines.push("");
  return lines.join("\n");
}
