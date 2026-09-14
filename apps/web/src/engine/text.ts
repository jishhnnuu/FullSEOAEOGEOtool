/**
 * Text utilities shared by the strategy and fix generators.
 *
 * Deliberately small and deterministic. The value of a keyword set derived
 * from the site's own copy is that it needs no data vendor and no model, so
 * the first audit costs nothing and works before anything is connected.
 */

export const STOPWORDS = new Set(
  ("a about above after again against all am an and any are aren't as at be because been before being below between both but by can cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i if in into is isn't it its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she should shouldn't so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn't we were weren't what when where which while who whom why with won't would wouldn't you your yours yourself yourselves us via get got also may might must shall will just new one two three get make made use used using see read learn find know need want like best top great good better click here page site web home contact us privacy terms cookie policy menu skip content search submit"
  ).split(/\s+/),
);

const WORD = /[a-z][a-z0-9'’-]{1,}/g;

export function tokenise(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Contiguous phrases of n words, skipping any that start or end on a stopword. */
export function ngrams(text: string, n: number): string[] {
  const words = (text.toLowerCase().match(/[a-z][a-z0-9'’-]*/g) ?? []);
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i++) {
    const slice = words.slice(i, i + n);
    if (STOPWORDS.has(slice[0]) || STOPWORDS.has(slice[n - 1])) continue;
    if (slice.some((w) => w.length < 3)) continue;
    out.push(slice.join(" "));
  }
  return out;
}

export function countBy(items: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1);
  return map;
}

export function topTerms(text: string, limit = 20): { term: string; count: number }[] {
  const counts = countBy(tokenise(text));
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

export function titleCase(text: string): string {
  const small = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with", "vs"]);
  return text
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      if (/^[A-Z0-9.&]+$/.test(word) && word.length <= 5) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Cut to `limit` characters on a word boundary, without an ellipsis. */
export function clamp(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70);
}

/** A readable brand name from a host: "acme-dental.co.uk" -> "Acme Dental". */
export function brandFromHost(host: string): string {
  const core = host.replace(/^www\./, "").split(".")[0];
  return titleCase(core.replace(/[-_]+/g, " "));
}

/** Jaccard overlap of two token sets, for cheap similarity. */
export function overlap(a: string, b: string): number {
  const setA = new Set(tokenise(a));
  const setB = new Set(tokenise(b));
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;
  return shared / (setA.size + setB.size - shared);
}

const QUESTION_WORDS = ["what is", "how to", "how much", "how long", "why", "when", "where", "which", "who", "can you", "do i need", "is it worth"];

/** Question phrasings a page about `topic` is likely to be asked. */
export function questionsFor(topic: string, service: string | null = null): string[] {
  const thing = topic.toLowerCase();
  const out = [
    `What is ${thing}?`,
    `How much does ${thing} cost?`,
    `How long does ${thing} take?`,
    `Is ${thing} worth it?`,
    `How do I choose a ${service ?? thing} provider?`,
    `What should I look for in ${thing}?`,
  ];
  return out.slice(0, 6);
}

export const QUESTION_PREFIXES = QUESTION_WORDS;

export function intentOf(term: string): "informational" | "commercial" | "transactional" | "navigational" {
  if (/\b(buy|price|pricing|cost|quote|order|book|hire|deal|discount|near me|cheap)\b/.test(term)) return "transactional";
  if (/\b(best|top|review|compare|comparison|vs|alternative|versus)\b/.test(term)) return "commercial";
  if (/\b(login|sign in|contact|careers|about)\b/.test(term)) return "navigational";
  return "informational";
}
