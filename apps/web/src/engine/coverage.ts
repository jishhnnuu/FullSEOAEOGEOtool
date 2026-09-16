/**
 * What was read, and what was not.
 *
 * A crawl that stops at forty pages and then presents four scores for the
 * whole site is scoring a site it has not finished reading. On one real audit
 * that meant every case study, every podcast episode and four blog posts were
 * never fetched, while the header read "48 findings across 40 pages" and the
 * cap sat in grey caption text underneath.
 *
 * The cap is not the problem. Pretending it does not change the conclusion is.
 * So coverage is computed against the sitemap, which is the site's own
 * statement of what exists, and it is reported next to the scores rather than
 * beneath them.
 */

import type { CrawlReport } from "./types";

export type Coverage = {
  /** URLs the site declares in its sitemaps. */
  declared: number;
  /** URLs actually fetched and parsed. */
  read: number;
  /** Declared URLs never fetched. */
  unseen: string[];
  /** read / declared, or 1 when there is no sitemap to compare against. */
  ratio: number;
  complete: boolean;
  /** True when a sitemap exists, so the comparison means something. */
  comparable: boolean;
  /**
   * The unseen URLs grouped by the section they sit in, because "15 unseen"
   * says nothing and "all three case studies" says everything.
   */
  gaps: { section: string; count: number; examples: string[] }[];
  headline: string;
};

/** The first path segment, which is a good enough proxy for a site section. */
function sectionOf(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length === 0) return "homepage";
    if (parts.length === 1) return "top level";
    return `/${parts[0]}`;
  } catch {
    return "elsewhere";
  }
}

/** Compare a URL ignoring the differences that never mean a different page. */
function key(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.host.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function assessCoverage(report: CrawlReport): Coverage {
  const declared = report.files.sitemapEntries ?? [];
  const fetched = new Set(
    report.pages.filter((p) => p.status > 0 && p.status < 400).flatMap((p) => [key(p.url), key(p.finalUrl)]),
  );

  if (declared.length === 0) {
    const read = report.pages.filter((p) => p.status > 0 && p.status < 400).length;
    return {
      declared: 0,
      read,
      unseen: [],
      ratio: 1,
      complete: !report.capped,
      comparable: false,
      gaps: [],
      headline: report.capped
        ? `Read ${read} pages and stopped at the limit. There is no sitemap to say how many exist, so treat these scores as a sample.`
        : `Read ${read} pages. No sitemap was found, so nothing declares how many there should be.`,
    };
  }

  const unseen = declared.filter((url) => !fetched.has(key(url)));
  const read = declared.length - unseen.length;
  const ratio = declared.length > 0 ? read / declared.length : 1;

  const bySection = new Map<string, string[]>();
  for (const url of unseen) {
    const section = sectionOf(url);
    bySection.set(section, [...(bySection.get(section) ?? []), url]);
  }
  const gaps = [...bySection.entries()]
    .map(([section, urls]) => ({ section, count: urls.length, examples: urls.slice(0, 4) }))
    .sort((a, b) => b.count - a.count);

  const complete = unseen.length === 0;
  const worst = gaps.slice(0, 2).map((g) => `${g.count} in ${g.section}`).join(", ");

  return {
    declared: declared.length,
    read,
    unseen,
    ratio,
    complete,
    comparable: true,
    gaps,
    headline: complete
      ? `Read all ${declared.length} pages the sitemap declares.`
      : `Read ${read} of ${declared.length} pages the sitemap declares. ${unseen.length} unseen${worst ? `, including ${worst}` : ""}. These scores describe what was read.`,
  };
}

/**
 * Whether the coverage is thin enough that the scores should carry a warning.
 *
 * Two thirds is the line. Below it, a category can be entirely wrong because
 * the pages that would have changed it were never fetched.
 */
export function coverageIsThin(coverage: Coverage): boolean {
  return coverage.comparable && coverage.ratio < 0.67;
}
