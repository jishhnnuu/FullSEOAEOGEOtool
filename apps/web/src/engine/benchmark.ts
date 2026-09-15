/**
 * Measuring a competitor the same way, on the same day.
 *
 * Every tool in this category shows a competitor's traffic estimate, which is
 * a model of a model: a third-party guess at clickstream data, resold. The
 * numbers move when the vendor changes their estimator and nobody can audit
 * them.
 *
 * This does something narrower and true. It runs the same crawl and the same
 * checks against a rival's public site, and compares like with like. It cannot
 * tell you their revenue. It can tell you that their product pages carry
 * schema and yours do not, that they answer the question in the opening
 * paragraph and you bury it, and that they let the AI crawlers in while you
 * block six of them. Those are the differences that are actually actionable,
 * and they come from the page rather than from an estimate.
 *
 * A shallow crawl on purpose. Ten pages tells you how a site is built. Two
 * hundred tells you the same thing and spends twenty times the requests on
 * somebody else's server, which is rude and slow.
 */

import type { AuditResult, CrawlOptions, Finding } from "./types";

export type BenchmarkSide = {
  origin: string;
  label: string;
  scores: { health: number; aeo: number; authority: number; experience: number };
  pages: number;
  /** Counts of what was found, by category, so the gap is legible. */
  findings: { critical: number; high: number; total: number };
  signals: {
    schemaTypes: string[];
    aiCrawlersAllowed: number;
    aiCrawlersChecked: number;
    answersInOpening: number;
    medianWords: number;
    hasLlmsTxt: boolean;
    faqBlocks: number;
    authorBylines: number;
  };
};

export type Benchmark = {
  you: BenchmarkSide;
  them: BenchmarkSide[];
  /** What they do that you do not, ranked by how much it matters. */
  gaps: BenchmarkGap[];
  ranAt: string;
};

export type BenchmarkGap = {
  title: string;
  detail: string;
  /** Who is ahead on this one. */
  leader: string;
  weight: number;
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** Reduce a finished audit to the handful of things worth comparing. */
export function sideFrom(result: AuditResult, label: string): BenchmarkSide {
  const pages = result.crawl.pages.filter((p) => p.status === 200 && p.signals);
  const schemaTypes = new Set<string>();
  let answersInOpening = 0;
  let faqBlocks = 0;
  let authorBylines = 0;
  const words: number[] = [];

  for (const page of pages) {
    const s = page.signals!;
    words.push(s.wordCount);
    if (s.hasFaqBlock) faqBlocks += 1;
    if (s.author) authorBylines += 1;
    for (const block of s.jsonLd) {
      const type = (block as { "@type"?: unknown })?.["@type"];
      if (typeof type === "string") schemaTypes.add(type);
      else if (Array.isArray(type)) for (const t of type) if (typeof t === "string") schemaTypes.add(t);
    }
    // A direct answer is a first paragraph that states something rather than
    // introducing something. Short, declarative, and carrying a number or a
    // definition verb is the cheap proxy the checks already use.
    const lede = s.lede ?? "";
    if (lede.length > 40 && lede.length < 400 && /\b(is|are|costs?|means?|takes?|requires?)\b/i.test(lede)) {
      answersInOpening += 1;
    }
  }

  const bySeverity = (severity: string) => result.findings.filter((f: Finding) => f.severity === severity).length;
  const access = result.aeo.crawlerAccess;

  return {
    origin: result.crawl.baseUrl,
    label,
    scores: {
      health: result.scores.health.score,
      aeo: result.scores.aeo.score,
      authority: result.scores.authority.score,
      experience: result.scores.experience.score,
    },
    pages: pages.length,
    findings: { critical: bySeverity("critical"), high: bySeverity("high"), total: result.findings.length },
    signals: {
      schemaTypes: [...schemaTypes].sort(),
      aiCrawlersAllowed: access.filter((a) => a.allowed).length,
      aiCrawlersChecked: access.length,
      answersInOpening,
      medianWords: median(words),
      hasLlmsTxt: !result.findings.some((f) => f.code === "missing_llms_txt"),
      faqBlocks,
      authorBylines,
    },
  };
}

/**
 * What they are doing that you are not.
 *
 * Only differences that a person could act on this week. A score that is four
 * points higher is not a gap, it is noise, so the thresholds are deliberately
 * coarse.
 */
export function findGaps(you: BenchmarkSide, them: BenchmarkSide[]): BenchmarkGap[] {
  const gaps: BenchmarkGap[] = [];
  if (them.length === 0) return gaps;

  const best = <T,>(pick: (side: BenchmarkSide) => T, better: (a: T, b: T) => boolean) => {
    let leader = them[0];
    for (const side of them) if (better(pick(side), pick(leader))) leader = side;
    return leader;
  };

  // Schema they carry and you do not.
  const yours = new Set(you.signals.schemaTypes);
  const theirs = new Map<string, string>();
  for (const side of them) {
    for (const type of side.signals.schemaTypes) {
      if (!yours.has(type) && !theirs.has(type)) theirs.set(type, side.label);
    }
  }
  if (theirs.size > 0) {
    const list = [...theirs.keys()].slice(0, 8);
    gaps.push({
      title: `They carry schema you do not: ${list.join(", ")}`,
      detail:
        "Structured data is how a page tells an engine what kind of thing it is. Every type on that list is one " +
        "an engine can act on and yours cannot offer.",
      leader: [...theirs.values()][0],
      weight: 0.9,
    });
  }

  // AI crawler access.
  const openest = best((s) => s.signals.aiCrawlersAllowed, (a, b) => a > b);
  if (openest.signals.aiCrawlersAllowed > you.signals.aiCrawlersAllowed) {
    gaps.push({
      title: `${openest.label} lets ${openest.signals.aiCrawlersAllowed} answer engines in; you let ${you.signals.aiCrawlersAllowed}`,
      detail:
        "Every blocked crawler is a set of answers you cannot appear in, and the block is usually a line in " +
        "robots.txt nobody meant to leave there.",
      leader: openest.label,
      weight: 1,
    });
  }

  // Answering in the opening, which is what gets quoted.
  const yourRate = you.pages > 0 ? you.signals.answersInOpening / you.pages : 0;
  const answerer = best(
    (s) => (s.pages > 0 ? s.signals.answersInOpening / s.pages : 0),
    (a, b) => a > b,
  );
  const theirRate = answerer.pages > 0 ? answerer.signals.answersInOpening / answerer.pages : 0;
  if (theirRate - yourRate > 0.2) {
    gaps.push({
      title: `${answerer.label} answers in the opening paragraph on ${Math.round(theirRate * 100)}% of pages; you do on ${Math.round(yourRate * 100)}%`,
      detail:
        "Answer engines quote the passage that states the answer plainly and near the top. A page that warms up " +
        "for three paragraphs first does not get quoted, however good the rest is.",
      leader: answerer.label,
      weight: 0.95,
    });
  }

  // Depth of page.
  const longest = best((s) => s.signals.medianWords, (a, b) => a > b);
  if (longest.signals.medianWords > you.signals.medianWords * 1.6 && longest.signals.medianWords > 400) {
    gaps.push({
      title: `Their median page is ${longest.signals.medianWords} words; yours is ${you.signals.medianWords}`,
      detail:
        "Length is not quality, but a page that covers less than the pages it competes with rarely wins the " +
        "comparison, and it gives an engine less to quote.",
      leader: longest.label,
      weight: 0.6,
    });
  }

  // Bylines, which are the cheapest trust signal there is.
  const bylined = best((s) => s.signals.authorBylines, (a, b) => a > b);
  if (bylined.signals.authorBylines > you.signals.authorBylines && you.signals.authorBylines === 0) {
    gaps.push({
      title: `${bylined.label} attributes its pages to a named person; you do not`,
      detail:
        "An author with a name, a role and a page of their own is the difference between content and a claim. " +
        "It is the cheapest trust signal available and it takes an afternoon.",
      leader: bylined.label,
      weight: 0.7,
    });
  }

  // FAQ blocks.
  const faq = best((s) => s.signals.faqBlocks, (a, b) => a > b);
  if (faq.signals.faqBlocks > you.signals.faqBlocks + 2) {
    gaps.push({
      title: `${faq.label} runs question blocks on ${faq.signals.faqBlocks} pages; you have ${you.signals.faqBlocks}`,
      detail:
        "A question with a short answer under it is the exact shape an answer engine lifts. It is also the " +
        "cheapest content there is, because the questions come from what people already ask you.",
      leader: faq.label,
      weight: 0.75,
    });
  }

  // llms.txt.
  const withFile = them.find((s) => s.signals.hasLlmsTxt);
  if (withFile && !you.signals.hasLlmsTxt) {
    gaps.push({
      title: `${withFile.label} publishes an llms.txt; you do not`,
      detail: "A small file, a small edge, and one this screen will write for you.",
      leader: withFile.label,
      weight: 0.4,
    });
  }

  return gaps.sort((a, b) => b.weight - a.weight);
}

/** How many pages to take from a rival. Shallow on purpose. */
export function benchmarkOptions(origin: string, from: CrawlOptions): CrawlOptions {
  return {
    ...from,
    url: origin,
    maxPages: Math.min(from.maxPages ?? 40, 12),
    maxDepth: 2,
    // Their keywords and brand are theirs. Carrying ours across would score
    // their site against our vocabulary, which is not a comparison.
    brandName: undefined,
    targetKeywords: [],
    competitors: [],
  };
}
