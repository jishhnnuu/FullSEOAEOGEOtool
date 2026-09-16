/**
 * Content quality, measured rather than assumed.
 *
 * The gap this fills: an audit that counts words and calls it content
 * analysis. Word count tells you a page is long. It does not tell you whether
 * it is worth reading, whether it answers anything, whether a person wrote it,
 * or whether its claims can be checked.
 *
 * The dimensions come from what Google's own quality raters are asked to
 * assess: does the page have a purpose, does it satisfy it, who made it, can
 * you tell, and would you trust it. None of that needs a model to evaluate.
 * Every signal below is countable from the HTML, which means it is the same
 * number every time and can be defended line by line.
 *
 * What this deliberately does not do is grade prose. A score that says "your
 * writing is 72% good" is a number nobody can act on. Every dimension here
 * points at a specific, fixable absence.
 */

import type { CrawledPage, PageSignals } from "./types";

export type QualityDimension = {
  key: string;
  label: string;
  score: number;
  weight: number;
  /** What was counted, so the score can be argued with. */
  detail: string;
  /** What to do, when the score is low. */
  fix: string | null;
};

export type PageQuality = {
  url: string;
  score: number;
  dimensions: QualityDimension[];
  /** Phrases that make copy read as machine-written. */
  fillerPhrases: { phrase: string; count: number }[];
  /** Claims that assert a fact with nothing to check it against. */
  unsourcedClaims: string[];
  wordCount: number;
};

/*
 * Phrases that survive almost no edit by a person who cares.
 *
 * Two kinds. The first is corporate filler that carries no information and
 * would be cut by any editor. The second is the tell of unedited model output:
 * transitions and hedges that a writer working from knowledge would not reach
 * for. Both are listed because both cost the same thing, which is the reader's
 * belief that a person wrote this.
 */
const FILLER: { pattern: RegExp; phrase: string }[] = [
  { pattern: /\bgame[- ]chang(er|ing)\b/gi, phrase: "game-changer" },
  { pattern: /\bcutting[- ]edge\b/gi, phrase: "cutting-edge" },
  { pattern: /\bstate[- ]of[- ]the[- ]art\b/gi, phrase: "state-of-the-art" },
  { pattern: /\bseamless(ly)?\b/gi, phrase: "seamless" },
  { pattern: /\brobust\b/gi, phrase: "robust" },
  { pattern: /\bleverage(s|d|ing)?\b/gi, phrase: "leverage" },
  { pattern: /\bunlock(s|ing)? (the|your|new)\b/gi, phrase: "unlock" },
  { pattern: /\belevate (your|the)\b/gi, phrase: "elevate" },
  { pattern: /\bdelve (in)?to\b/gi, phrase: "delve into" },
  { pattern: /\bin today'?s (fast[- ]paced|digital|competitive|ever[- ]changing)\b/gi, phrase: "in today's fast-paced world" },
  { pattern: /\bit'?s (important|worth) (to note|noting)\b/gi, phrase: "it's important to note" },
  { pattern: /\bwhen it comes to\b/gi, phrase: "when it comes to" },
  { pattern: /\bnavigate the (complex|ever|landscape)\b/gi, phrase: "navigate the landscape" },
  { pattern: /\ba testament to\b/gi, phrase: "a testament to" },
  { pattern: /\bin the realm of\b/gi, phrase: "in the realm of" },
  { pattern: /\bplays? a (crucial|vital|pivotal|key) role\b/gi, phrase: "plays a crucial role" },
  { pattern: /\bworld[- ]class\b/gi, phrase: "world-class" },
  { pattern: /\bbest[- ]in[- ]class\b/gi, phrase: "best-in-class" },
  { pattern: /\bturn[- ]?key\b/gi, phrase: "turnkey" },
  { pattern: /\bsynerg(y|ies|istic)\b/gi, phrase: "synergy" },
  { pattern: /\bholistic(ally)?\b/gi, phrase: "holistic" },
  { pattern: /\bmoreover\b/gi, phrase: "moreover" },
  { pattern: /\bfurthermore\b/gi, phrase: "furthermore" },
];

/** A sentence asserting a measurable fact. Those are the ones that need a source. */
const CLAIM = /[^.!?]*\b(\d+\s?%|\d+x|[0-9][0-9,.]*\s?(million|billion|thousand)|studies show|research shows|according to|proven to|statistics show|the average|most companies|industry standard)\b[^.!?]*[.!?]/gi;

/** A source, in any of the forms a page normally offers one. */
function hasCitationNear(text: string, claim: string, signals: PageSignals): boolean {
  const at = text.indexOf(claim);
  if (at === -1) return false;
  const window = text.slice(Math.max(0, at - 200), at + claim.length + 200);
  if (/\((?:source|via|per)[^)]*\)/i.test(window)) return true;
  if (/\bsource:\s/i.test(window)) return true;
  // An outbound link inside the same paragraph counts, which is the usual shape.
  return signals.links.some((link) => !link.internal && link.text && window.includes(link.text));
}

function dimension(key: string, label: string, score: number, weight: number, detail: string, fix: string | null): QualityDimension {
  return { key, label, score: Math.max(0, Math.min(100, Math.round(score))), weight, detail, fix };
}

/**
 * Assess one page.
 *
 * Returns null for anything that is not a content page, because scoring a
 * checkout or a login as content produces a number that means nothing and
 * drags the site average down for no reason.
 */
export function assessPage(page: CrawledPage): PageQuality | null {
  const s = page.signals;
  if (!s || page.status !== 200) return null;
  if (s.wordCount < 60) return null;

  const text = s.text;
  const dimensions: QualityDimension[] = [];

  /* Purpose: does the page say what it is for, near the top. */
  const lede = s.lede ?? "";
  const statesPurpose = lede.length > 60 && /\b(is|are|helps?|provides?|offers?|means?|costs?|shows?|explains?)\b/i.test(lede);
  dimensions.push(dimension(
    "purpose", "States its purpose", statesPurpose ? 100 : 35, 0.2,
    statesPurpose ? "The opening states what the page is about" : "The opening does not say what the page is for",
    statesPurpose ? null : "Open with two or three sentences that state the answer, then expand.",
  ));

  /* Depth: enough to satisfy the intent, judged against the page's own type. */
  const isArticle = /\/(blog|article|guide|news|insight|resource|post)/i.test(page.url) || s.wordCount > 700;
  const floor = isArticle ? 700 : 250;
  const depthScore = Math.min(100, (s.wordCount / floor) * 100);
  dimensions.push(dimension(
    "depth", "Covers the subject", depthScore, 0.15,
    `${s.wordCount} words against a floor of ${floor} for this page type`,
    depthScore >= 80 ? null : `Thin for its type. Either expand past ${floor} words or merge it into the page that covers the topic properly.`,
  ));

  /* Structure: headings, lists and tables, which is how a reader scans. */
  const structureUnits = s.headings.length + s.lists + s.tables;
  const structureScore = Math.min(100, (structureUnits / Math.max(2, s.wordCount / 250)) * 100);
  dimensions.push(dimension(
    "structure", "Can be scanned", structureScore, 0.12,
    `${s.headings.length} headings, ${s.lists} lists, ${s.tables} tables across ${s.wordCount} words`,
    structureScore >= 70 ? null : "Break it with subheadings every 200 to 300 words, and turn any sequence into a list.",
  ));

  /* Evidence: specific figures and outbound sources beat adjectives. */
  const evidenceScore = Math.min(100, s.numbers * 12 + s.externalCitations * 15);
  dimensions.push(dimension(
    "evidence", "Carries evidence", evidenceScore, 0.18,
    `${s.numbers} specific figures, ${s.externalCitations} outbound sources`,
    evidenceScore >= 70 ? null : "Add specific numbers and link the source. A page with figures is a page an answer engine can quote.",
  ));

  /* Attribution: who wrote it, and when. */
  const attributionScore = (s.author ? 60 : 0) + (s.publishedAt || s.modifiedAt ? 40 : 0);
  dimensions.push(dimension(
    "attribution", "Says who wrote it", attributionScore, 0.15,
    `${s.author ? `attributed to ${s.author}` : "no named author"}, ${s.publishedAt || s.modifiedAt ? "dated" : "undated"}`,
    attributionScore >= 80 ? null : "Name the author with a role and a page of their own, and publish a date.",
  ));

  /* Originality: filler phrases as a negative signal. */
  const filler: { phrase: string; count: number }[] = [];
  for (const { pattern, phrase } of FILLER) {
    const count = (text.match(pattern) ?? []).length;
    if (count > 0) filler.push({ phrase, count });
  }
  const fillerTotal = filler.reduce((sum, f) => sum + f.count, 0);
  const per1000 = s.wordCount > 0 ? (fillerTotal / s.wordCount) * 1000 : 0;
  const originalityScore = Math.max(0, 100 - per1000 * 22);
  dimensions.push(dimension(
    "originality", "Reads as written by a person", originalityScore, 0.2,
    fillerTotal === 0
      ? "No filler phrases found"
      : `${fillerTotal} filler phrase${fillerTotal === 1 ? "" : "s"}, ${per1000.toFixed(1)} per thousand words`,
    originalityScore >= 80 ? null : `Cut or rewrite: ${filler.slice(0, 5).map((f) => f.phrase).join(", ")}.`,
  ));

  /* Claims without sources, listed rather than scored, because each is specific. */
  const unsourcedClaims: string[] = [];
  for (const match of text.matchAll(CLAIM)) {
    const claim = match[0].trim();
    if (claim.length < 25 || claim.length > 300) continue;
    if (!hasCitationNear(text, claim, s)) unsourcedClaims.push(claim);
    if (unsourcedClaims.length >= 8) break;
  }

  const total = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
  const weightSum = dimensions.reduce((sum, d) => sum + d.weight, 0);

  return {
    url: page.url,
    score: Math.round(total / weightSum),
    dimensions,
    fillerPhrases: filler.sort((a, b) => b.count - a.count),
    unsourcedClaims,
    wordCount: s.wordCount,
  };
}

export type SiteQuality = {
  pages: PageQuality[];
  average: number;
  weakest: PageQuality[];
  /** Filler phrases across the whole site, which is how a house style is caught. */
  fillerAcrossSite: { phrase: string; count: number; pages: number }[];
  totalUnsourcedClaims: number;
  assessed: number;
};

export function assessSite(pages: CrawledPage[]): SiteQuality {
  const assessed = pages.map(assessPage).filter((q): q is PageQuality => q !== null);
  if (assessed.length === 0) {
    return { pages: [], average: 0, weakest: [], fillerAcrossSite: [], totalUnsourcedClaims: 0, assessed: 0 };
  }

  const counts = new Map<string, { count: number; pages: number }>();
  for (const page of assessed) {
    for (const { phrase, count } of page.fillerPhrases) {
      const entry = counts.get(phrase) ?? { count: 0, pages: 0 };
      entry.count += count;
      entry.pages += 1;
      counts.set(phrase, entry);
    }
  }

  return {
    pages: assessed,
    average: Math.round(assessed.reduce((sum, p) => sum + p.score, 0) / assessed.length),
    weakest: [...assessed].sort((a, b) => a.score - b.score).slice(0, 10),
    fillerAcrossSite: [...counts.entries()]
      .map(([phrase, v]) => ({ phrase, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    totalUnsourcedClaims: assessed.reduce((sum, p) => sum + p.unsourcedClaims.length, 0),
    assessed: assessed.length,
  };
}
