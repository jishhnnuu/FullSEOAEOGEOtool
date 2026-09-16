/**
 * The page comparison, pinned to what separates it from a domain rating.
 *
 * Every difference it reports has to be something a person could close this
 * week. "Their domain is stronger" is true and useless, so it must never
 * appear, and the ordering has to put the substantive differences above the
 * cosmetic ones.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { comparePage, pagesWorthComparing, profileOf } from "../src/engine/content-gap";
import type { CrawledPage, PageSignals } from "../src/engine/types";

function signals(over: Partial<PageSignals> = {}): PageSignals {
  return {
    title: "What commercial solar costs", metaDescription: "A description of reasonable length for a commercial page.",
    canonical: null, robotsMeta: null, viewport: true, lang: "en", charset: "utf-8",
    h1: ["What commercial solar costs"], headings: [{ level: 1, text: "What commercial solar costs" }],
    images: [], links: [], jsonLd: [], jsonLdErrors: [], microdataTypes: [], hreflang: [],
    openGraph: {}, twitter: {}, scripts: [], inlineScriptBytes: 0, stylesheets: [],
    text: "copy", wordCount: 800, lede: "A commercial solar system costs between forty and ninety thousand dollars installed.",
    paragraphs: ["A paragraph."], lists: 2, tables: 0, forms: 0,
    publishedAt: null, modifiedAt: null, author: null,
    analytics: [], cms: null, questionHeadings: [], hasFaqBlock: false,
    numbers: 4, externalCitations: 0, ctaCount: 1, faqPairs: [], contentRegionFound: true,
    ...over,
  };
}

function page(url: string, over: Partial<PageSignals> = {}, status = 200): CrawledPage {
  return {
    url, finalUrl: url, status, depth: 1, contentType: "text/html", bytes: 30000,
    elapsedMs: 90, redirectChain: [], error: null, signals: signals(over), inlinks: [], textHash: "h",
  };
}

test("a page that did not return 200 has no profile, rather than an empty one", () => {
  assert.equal(profileOf(page("https://example.com/a", {}, 404)), null);
  assert.equal(profileOf({ ...page("https://example.com/a"), signals: null }), null);
});

test("nothing to compare against says so instead of inventing a verdict", () => {
  const ours = profileOf(page("https://example.com/a"));
  assert.ok(ours);
  const comparison = comparePage(ours, []);
  assert.equal(comparison.differences.length, 0);
  assert.match(comparison.verdict, /Nothing to compare/);
});

test("only closable differences are reported, and the heavy ones come first", () => {
  const ours = profileOf(page("https://example.com/ours", {
    lede: "Solar is an interesting topic and in this article we will explore many aspects of it in detail over the following sections, beginning with a little history.",
    numbers: 0,
    externalCitations: 0,
    author: null,
    faqPairs: [],
    questionHeadings: [],
  }));
  const theirs = [
    profileOf(page("https://rival.example/a", {
      lede: "A commercial solar system costs between forty and ninety thousand dollars installed.",
      numbers: 14, externalCitations: 6, author: "Sam Reed",
      questionHeadings: ["How much does it cost?", "How long does it take?"],
    })),
    profileOf(page("https://rival.example/b", {
      lede: "Commercial solar costs forty to ninety thousand dollars fitted.",
      numbers: 11, externalCitations: 4, author: "Dana Liu",
      questionHeadings: ["What is the payback?", "Who installs it?"],
    })),
  ].filter((profile): profile is NonNullable<typeof profile> => profile !== null);

  assert.ok(ours);
  const comparison = comparePage(ours, theirs);
  assert.ok(comparison.differences.length > 0);

  for (const difference of comparison.differences) {
    assert.ok(difference.close.length > 10, `${difference.key} has to name the job that closes it`);
    assert.ok(difference.weight >= 0 && difference.weight <= 1);
    assert.ok(
      !/domain (rating|authority)|backlink|traffic estimate/i.test(`${difference.them} ${difference.you} ${difference.close}`),
      "nothing unactionable may be reported as a difference",
    );
  }

  const weights = comparison.differences.map((difference) => difference.weight);
  assert.deepEqual(weights, [...weights].sort((a, b) => b - a), "the heaviest difference has to be first");
  assert.ok(comparison.verdict.length > 20);
});

test("with Search Console the shortlist is measured; without it, the proxy is named", () => {
  const pages = [
    page("https://example.com/one", { wordCount: 1200 }),
    page("https://example.com/two", { wordCount: 300 }),
    page("https://example.com/thin", { wordCount: 80 }),
  ];

  const measured = pagesWorthComparing(pages, {
    queries: [
      { page: "https://example.com/two", impressions: 900, position: 11 },
      { page: "https://example.com/one", impressions: 40, position: 2 },
      { page: "https://example.com/other", impressions: 5, position: 14 },
    ],
  });
  assert.equal(measured.length, 1, "position 2 already ranks and 5 impressions is noise");
  assert.equal(measured[0].url, "https://example.com/two");
  assert.match(measured[0].why, /impressions at position/);

  const proxy = pagesWorthComparing(pages);
  assert.ok(proxy.every((item) => /No Search Console data/.test(item.why)), "the worse basis has to be stated");
  assert.ok(proxy.every((item) => item.url !== "https://example.com/thin"), "an 80 word page is not worth a rewrite");
});
