/**
 * Internal linking, built rather than recommended.
 *
 * The usual output of an orphan check is a list: "these 28 pages have no
 * inbound links, add some". That is a list of 28 jobs handed back to the
 * person who bought a tool to avoid doing jobs. Worse, it is usually the wrong
 * diagnosis: 28 orphaned blog posts are almost never 28 problems, they are one
 * missing index page.
 *
 * So this produces the artefact. Given the crawl it writes the listing page
 * that fixes the whole cluster at once, in HTML ready to publish, with the
 * links, the headings and the structured data. And where a page genuinely does
 * need a contextual link from inside prose, it finds the sentence that should
 * carry it, on the page that should carry it, with the anchor text.
 *
 * Nothing here invents a relationship. A suggested link exists because the two
 * pages already share vocabulary the crawl measured.
 */

import type { CrawledPage, CrawlReport } from "./types";

/* ------------------------------------------------------- the missing index */

export type ListingPlan = {
  /** The section that has no index, for example /blog. */
  section: string;
  /** Where the page should live. */
  url: string;
  title: string;
  metaDescription: string;
  /** Every page it should link to, in the order they should appear. */
  entries: { url: string; title: string; summary: string; date: string | null }[];
  /** Ready to publish. */
  html: string;
  /** ItemList markup so the listing is machine-readable too. */
  jsonLd: Record<string, unknown>;
  /** Pages this fixes in one move. */
  fixes: number;
  /** Where it needs linking from, or the index is an orphan itself. */
  linkFrom: string[];
};

function sectionOf(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts.length > 1 ? `/${parts[0]}` : null;
  } catch {
    return null;
  }
}

function titleOf(page: CrawledPage): string {
  const s = page.signals;
  return (s?.h1[0] || s?.title || "").replace(/\s*[|\-–—]\s*.*$/, "").trim() || page.url;
}

function summaryOf(page: CrawledPage): string {
  const s = page.signals;
  const text = (s?.metaDescription || s?.lede || "").trim();
  return text.slice(0, 160);
}

/**
 * Find sections whose pages nothing links to, and write the index.
 *
 * The threshold is three: two orphans in a section is a coincidence, three is
 * a missing page. Below that, contextual links are the right fix and the
 * listing page would be thin.
 */
export function planListings(report: CrawlReport, orphanUrls: string[]): ListingPlan[] {
  const bySection = new Map<string, string[]>();
  for (const url of orphanUrls) {
    const section = sectionOf(url);
    if (!section) continue;
    bySection.set(section, [...(bySection.get(section) ?? []), url]);
  }

  const byUrl = new Map(report.pages.map((p) => [p.url, p]));
  const plans: ListingPlan[] = [];

  for (const [section, urls] of bySection) {
    if (urls.length < 3) continue;

    const entries = urls
      .map((url) => {
        const page = byUrl.get(url);
        return {
          url,
          title: page ? titleOf(page) : url,
          summary: page ? summaryOf(page) : "",
          date: page?.signals?.publishedAt ?? null,
        };
      })
      // Newest first where a date exists, which is what a reader expects of an
      // index, then alphabetical so the order is stable between runs.
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.title.localeCompare(b.title));

    const label = section.replace("/", "").replace(/[-_]+/g, " ");
    const nice = label.charAt(0).toUpperCase() + label.slice(1);
    const indexUrl = `${report.baseUrl.replace(/\/$/, "")}${section}/`;

    const rows = entries
      .map(
        (entry) =>
          `    <li>\n      <a href="${entry.url}">${escape(entry.title)}</a>` +
          (entry.summary ? `\n      <p>${escape(entry.summary)}</p>` : "") +
          (entry.date ? `\n      <time datetime="${entry.date.slice(0, 10)}">${entry.date.slice(0, 10)}</time>` : "") +
          `\n    </li>`,
      )
      .join("\n");

    const html = [
      `<h1>${escape(nice)}</h1>`,
      `<p>Everything we have published on ${escape(label)}, newest first.</p>`,
      `<ul class="listing">`,
      rows,
      `</ul>`,
    ].join("\n");

    plans.push({
      section,
      url: indexUrl,
      title: `${nice} | ${hostOf(report.baseUrl)}`,
      metaDescription: `Every ${label} article we have published, with what each one covers.`.slice(0, 155),
      entries,
      html,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: nice,
        url: indexUrl,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: entries.map((entry, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: entry.url,
            name: entry.title,
          })),
        },
      },
      fixes: entries.length,
      // An index nothing links to is an orphan with a nicer name.
      linkFrom: [report.baseUrl, `${report.baseUrl.replace(/\/$/, "")}/`],
    });
  }

  return plans.sort((a, b) => b.fixes - a.fixes);
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* --------------------------------------------------- contextual link plan */

export type ContextualLink = {
  /** The page that should carry the link. */
  fromUrl: string;
  /** The page it should point at. */
  toUrl: string;
  /** The exact sentence on the source page that should carry it. */
  sentence: string;
  /** The words inside that sentence to make the anchor. */
  anchor: string;
  /** Why these two pages belong linked, from measured overlap. */
  why: string;
  /** The sentence rewritten with the link in place, ready to paste. */
  after: string;
  confidence: number;
};

const STOP = new Set([
  "the", "and", "for", "with", "your", "our", "you", "are", "that", "this", "from", "have",
  "has", "was", "were", "will", "can", "all", "how", "what", "why", "who", "more", "than",
  "into", "about", "they", "them", "their", "there", "when", "which", "would", "could",
]);

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3 && !STOP.has(word)),
  );
}

/**
 * Find the sentence that should carry a link, and write it.
 *
 * A contextual link is only worth anything if it sits inside prose a reader is
 * already following. So this looks for a sentence on the source page that
 * already names what the target page is about, and turns those exact words
 * into the anchor. If no such sentence exists, no link is proposed: inserting
 * one would mean writing a sentence, and that is a content change rather than
 * a linking change.
 */
export function planContextualLinks(
  report: CrawlReport,
  targets: string[],
  options: { maxPerTarget?: number } = {},
): ContextualLink[] {
  const byUrl = new Map(report.pages.map((p) => [p.url, p]));
  const out: ContextualLink[] = [];
  const maxPer = options.maxPerTarget ?? 2;

  for (const targetUrl of targets) {
    const target = byUrl.get(targetUrl);
    if (!target?.signals) continue;

    const targetTitle = titleOf(target);
    const targetTerms = terms(`${targetTitle} ${target.signals.h1.join(" ")}`);
    if (targetTerms.size === 0) continue;

    const candidates: ContextualLink[] = [];

    for (const page of report.pages) {
      if (page.url === targetUrl || !page.signals || page.status !== 200) continue;
      // Already linked, so nothing to do.
      if (page.signals.links.some((l) => l.href === targetUrl)) continue;

      for (const paragraph of page.signals.paragraphs) {
        for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
          if (sentence.length < 40 || sentence.length > 320) continue;
          const sentenceTerms = terms(sentence);
          const shared = [...targetTerms].filter((term) => sentenceTerms.has(term));
          if (shared.length < 2) continue;

          // The anchor is the longest run of the target's own words that
          // actually appears in this sentence, so it reads naturally.
          const anchor = longestPhrase(sentence, shared);
          if (!anchor || anchor.length < 8) continue;

          candidates.push({
            fromUrl: page.url,
            toUrl: targetUrl,
            sentence: sentence.trim(),
            anchor,
            why: `This sentence already talks about ${shared.slice(0, 3).join(", ")}, which is what "${targetTitle}" covers. The link belongs in prose a reader is already following, not in a related-posts box.`,
            after: sentence.trim().replace(anchor, `<a href="${targetUrl}">${anchor}</a>`),
            confidence: Math.min(1, shared.length / 4),
          });
        }
      }
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    // Spread across source pages: two links from one page to one target is a
    // pattern, not a recommendation.
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate.fromUrl)) continue;
      seen.add(candidate.fromUrl);
      out.push(candidate);
      if (seen.size >= maxPer) break;
    }
  }

  return out;
}

/** The longest run of consecutive words in the sentence drawn from the shared set. */
function longestPhrase(sentence: string, shared: string[]): string | null {
  const wanted = new Set(shared);
  const words = sentence.split(/\s+/);
  let best: string[] = [];
  let run: string[] = [];
  for (const word of words) {
    const bare = word.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (wanted.has(bare)) {
      run.push(word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""));
    } else {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  if (run.length > best.length) best = run;
  return best.length > 0 ? best.join(" ") : null;
}
