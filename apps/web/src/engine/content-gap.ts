/**
 * Whether their page is better than yours, and in what specific way.
 *
 * The existing rivals screen compares how two sites are built: schema, crawler
 * access, median depth. Useful, and not the thing that decides a ranking.
 * What decides a ranking is whether the page answers the query better, and
 * almost nothing in this category measures that because it is easier to sell a
 * traffic estimate.
 *
 * This compares the pages themselves, on the dimensions that separate a page
 * that ranks from one that does not, and every dimension is countable from the
 * HTML so the comparison can be defended line by line. No model, no opinion
 * about writing quality, no score out of a hundred for prose.
 *
 * The output is a small number of specific, closable differences: they answer
 * in the opening and you bury it, they carry a table of figures and you carry
 * adjectives, they name an author and you do not. Those are jobs. "Their
 * content is better" is not.
 */

import type { CrawledPage } from "./types";

export type PageProfile = {
  url: string;
  title: string;
  /** Words in the served HTML, which is what a crawler reads. */
  words: number;
  /** Headings, lists and tables: how scannable it is. */
  structure: { headings: number; lists: number; tables: number };
  /** Does the opening state the answer, rather than introduce the topic. */
  answersUpFront: boolean;
  /** Specific figures, which are what gets quoted. */
  figures: number;
  /** Outbound sources cited. */
  citations: number;
  /** Named author. */
  author: string | null;
  /** Published or updated date. */
  dated: string | null;
  /** Question and answer pairs, from markup or headings. */
  questions: number;
  /** Schema types carried. */
  schema: string[];
  /** Images, which matter for a query that wants to see something. */
  images: number;
};

export function profileOf(page: CrawledPage): PageProfile | null {
  const s = page.signals;
  if (!s || page.status !== 200) return null;

  const lede = s.lede ?? "";
  // The same proxy the checks use: a short declarative opening carrying a
  // definition verb is a page that answers before it warms up.
  const answersUpFront = lede.length > 40 && lede.length < 400 && /\b(is|are|costs?|means?|takes?|requires?|happens?)\b/i.test(lede);

  const schema = new Set<string>();
  for (const block of s.jsonLd) {
    const type = (block as { "@type"?: unknown })?.["@type"];
    if (typeof type === "string") schema.add(type);
    else if (Array.isArray(type)) for (const t of type) if (typeof t === "string") schema.add(t);
  }

  return {
    url: page.url,
    title: (s.title || s.h1[0] || page.url).replace(/\s*[|\-–—]\s*.*$/, "").trim(),
    words: s.wordCount,
    structure: { headings: s.headings.length, lists: s.lists, tables: s.tables },
    answersUpFront,
    figures: s.numbers,
    citations: s.externalCitations,
    author: s.author,
    dated: s.publishedAt ?? s.modifiedAt,
    questions: s.faqPairs.length || s.questionHeadings.length,
    schema: [...schema].sort(),
    images: s.images.length,
  };
}

export type Difference = {
  key: string;
  /** What they do. */
  them: string;
  /** What you do. */
  you: string;
  /** The job that closes it. */
  close: string;
  /** How much it is likely to matter for this query. */
  weight: number;
};

export type PageComparison = {
  ours: PageProfile;
  theirs: PageProfile[];
  differences: Difference[];
  /** The sentence that says whether this page is competitive at all. */
  verdict: string;
};

/**
 * Compare one of our pages against the pages that outrank it.
 *
 * Deliberately narrow: only differences that are both measurable and closable.
 * "Their domain is stronger" is true and useless. "Every one of them answers in
 * the first paragraph and yours does not" is a morning's work.
 */
export function comparePage(ours: PageProfile, theirs: PageProfile[]): PageComparison {
  const differences: Difference[] = [];
  if (theirs.length === 0) {
    return { ours, theirs, differences, verdict: "Nothing to compare against yet." };
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };

  /* Answering up front. The single biggest separator for anything an answer
   * engine might quote, and the cheapest to fix. */
  const theyAnswer = theirs.filter((t) => t.answersUpFront).length;
  if (!ours.answersUpFront && theyAnswer / theirs.length >= 0.5) {
    differences.push({
      key: "answer_up_front",
      them: `${theyAnswer} of ${theirs.length} state the answer in the opening paragraph`,
      you: "Yours introduces the topic before answering it",
      close: "Rewrite the first two sentences to answer the question plainly, then keep everything else. This is an hour and it is the highest-return hour on the page.",
      weight: 1,
    });
  }

  /* Depth, judged against them rather than against a fixed number. */
  const theirWords = median(theirs.map((t) => t.words));
  if (theirWords > ours.words * 1.5 && theirWords > 500) {
    differences.push({
      key: "depth",
      them: `Their median is ${theirWords} words`,
      you: `Yours is ${ours.words}`,
      close: `The gap is roughly ${theirWords - ours.words} words. Look at what they cover that you do not, rather than padding: length is a symptom of coverage, not a target.`,
      weight: 0.7,
    });
  }

  /* Figures. What gets quoted, by people and by answer engines. */
  const theirFigures = median(theirs.map((t) => t.figures));
  if (theirFigures > ours.figures + 2) {
    differences.push({
      key: "figures",
      them: `They carry ${theirFigures} specific figures`,
      you: `You carry ${ours.figures}`,
      close: "Add real numbers with their source. A page with figures is a page that can be quoted, and a page that can be quoted earns links without being asked.",
      weight: 0.85,
    });
  }

  /* Sources. */
  const theirCitations = median(theirs.map((t) => t.citations));
  if (theirCitations > ours.citations + 1) {
    differences.push({
      key: "citations",
      them: `They cite ${theirCitations} outside sources`,
      you: `You cite ${ours.citations}`,
      close: "Link the claims to where they came from. Outbound citation does not leak authority, it demonstrates it.",
      weight: 0.6,
    });
  }

  /* Structure. */
  const theirHeadings = median(theirs.map((t) => t.structure.headings));
  if (theirHeadings > ours.structure.headings + 2 && ours.words > 400) {
    differences.push({
      key: "structure",
      them: `${theirHeadings} headings, so it can be scanned`,
      you: `${ours.structure.headings} headings across ${ours.words} words`,
      close: "Break it every 200 to 300 words with a heading that states what that section answers. Answer engines quote sections, not pages.",
      weight: 0.65,
    });
  }

  /* Tables, which are disproportionately quoted for comparison queries. */
  const withTables = theirs.filter((t) => t.structure.tables > 0).length;
  if (withTables / theirs.length >= 0.5 && ours.structure.tables === 0) {
    differences.push({
      key: "table",
      them: `${withTables} of ${theirs.length} present the comparison as a table`,
      you: "Yours is prose",
      close: "A table is the format an answer engine lifts wholesale for a comparison query. Turn the paragraphs that compare things into rows.",
      weight: 0.8,
    });
  }

  /* Attribution. */
  const authored = theirs.filter((t) => t.author).length;
  if (!ours.author && authored / theirs.length >= 0.5) {
    differences.push({
      key: "author",
      them: `${authored} of ${theirs.length} name the author`,
      you: "Yours is unattributed",
      close: "Name the author with a role and a page of their own. The cheapest trust signal there is, and it takes an afternoon once for the whole site.",
      weight: 0.55,
    });
  }

  /* Freshness. */
  const dated = theirs.filter((t) => t.dated).length;
  if (!ours.dated && dated / theirs.length >= 0.5) {
    differences.push({
      key: "dated",
      them: `${dated} of ${theirs.length} show a date`,
      you: "Yours shows none",
      close: "Publish a date and keep it honest. For anything where the answer changes, an undated page reads as abandoned.",
      weight: 0.5,
    });
  }

  /* Schema they carry and we do not. */
  const ourSchema = new Set(ours.schema);
  const theirSchema = new Map<string, number>();
  for (const page of theirs) {
    for (const type of page.schema) {
      if (!ourSchema.has(type)) theirSchema.set(type, (theirSchema.get(type) ?? 0) + 1);
    }
  }
  const common = [...theirSchema.entries()].filter(([, n]) => n / theirs.length >= 0.5).map(([t]) => t);
  if (common.length > 0) {
    differences.push({
      key: "schema",
      them: `Most of them carry ${common.join(", ")}`,
      you: ours.schema.length > 0 ? `You carry ${ours.schema.join(", ")}` : "You carry none",
      close: `Add ${common.join(", ")}. This one is generated for you on the findings screen.`,
      weight: 0.7,
    });
  }

  /* Questions answered on the page. */
  const theirQuestions = median(theirs.map((t) => t.questions));
  if (theirQuestions > ours.questions + 2) {
    differences.push({
      key: "questions",
      them: `They answer ${theirQuestions} questions on the page`,
      you: `You answer ${ours.questions}`,
      close: "Add the questions your customers actually ask, each with a short answer under it. That shape is what an engine lifts.",
      weight: 0.75,
    });
  }

  differences.sort((a, b) => b.weight - a.weight);

  const serious = differences.filter((d) => d.weight >= 0.7).length;
  const verdict =
    differences.length === 0
      ? "On everything a crawl can measure, your page matches theirs. The remaining difference is off the page: links, brand, and how long each has been there."
      : serious === 0
        ? `${differences.length} small differences. This page is competitive; these are refinements.`
        : `${serious} substantive differences, all of them closable this week. This is why the page is behind, and none of it is about domain strength.`;

  return { ours, theirs, differences, verdict };
}

/** Which of our pages is worth comparing, ranked by how much is at stake. */
export function pagesWorthComparing(
  pages: CrawledPage[],
  options: { queries?: { page: string; impressions: number; position: number }[] } = {},
): { url: string; why: string; priority: number }[] {
  // With Search Console, the answer is measured: pages with impressions and a
  // poor position are where a rewrite pays.
  if (options.queries && options.queries.length > 0) {
    return options.queries
      .filter((q) => q.impressions > 20 && q.position > 5 && q.position < 30)
      .map((q) => ({
        url: q.page,
        why: `${Math.round(q.impressions)} impressions at position ${q.position.toFixed(1)}. It already qualifies, it just is not being chosen.`,
        priority: Math.min(1, (q.impressions / 500) * (1 - Math.abs(q.position - 12) / 20)),
      }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 20);
  }

  // Without it, the best proxy is a substantial page that reads as commercial.
  return pages
    .filter((p) => p.signals && p.status === 200 && p.signals.wordCount > 250)
    .map((p) => ({
      url: p.url,
      why: "No Search Console data, so this is ranked by depth and commercial intent rather than by what is actually close to ranking.",
      priority: Math.min(1, (p.signals!.wordCount / 1500) + (p.signals!.ctaCount > 0 ? 0.2 : 0)),
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);
}
