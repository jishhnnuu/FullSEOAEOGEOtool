/**
 * The JavaScript visibility check, pinned to real measurements.
 *
 * This check underwrites a claim the product makes out loud: that a page whose
 * content only appears after JavaScript is invisible to the engines that write
 * AI answers. A false positive tells a customer their working site is broken.
 * A false negative misses the thing nobody else is looking for. So the numbers
 * below are not invented: each row is what the crawler actually measured
 * against that site, and the check has to sort them correctly.
 *
 * Run with: npm run test:engine
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { runChecks } from "../src/engine/checks";
import type { CrawledPage, CrawlReport, PageSignals } from "../src/engine/types";

type Sample = {
  url: string;
  words: number;
  bytes: number;
  scripts: number;
  inlineScriptBytes: number;
  paragraphs: number;
  /** Whether the served HTML is a shell that needs JavaScript to say anything. */
  shell: boolean;
};

/** Measured, September 2026, through the engine's own fetcher. */
const SAMPLES: Sample[] = [
  { url: "https://excalidraw.com/", words: 1, bytes: 6_862, scripts: 1, inlineScriptBytes: 2_538, paragraphs: 0, shell: true },
  { url: "https://www.tldraw.com/", words: 6, bytes: 13_122, scripts: 2, inlineScriptBytes: 0, paragraphs: 0, shell: true },
  { url: "https://app.netlify.com/", words: 5, bytes: 16_499, scripts: 21, inlineScriptBytes: 9_563, paragraphs: 0, shell: true },
  { url: "https://create-react-app.dev/", words: 224, bytes: 14_305, scripts: 2, inlineScriptBytes: 1_559, paragraphs: 6, shell: false },
  { url: "https://wordpress.org/", words: 519, bytes: 164_908, scripts: 5, inlineScriptBytes: 7_413, paragraphs: 14, shell: false },
  { url: "https://react.dev/", words: 1_201, bytes: 272_438, scripts: 11, inlineScriptBytes: 4_450, paragraphs: 22, shell: false },
  // Tiny but honest: no scripts, so nothing is hiding behind them.
  { url: "https://example.com/", words: 19, bytes: 559, scripts: 0, inlineScriptBytes: 0, paragraphs: 1, shell: false },
];

function signals(sample: Sample, overrides: Partial<PageSignals> = {}): PageSignals {
  return {
    title: "A title", metaDescription: "A description that is long enough to pass the length check comfortably.",
    canonical: sample.url, robotsMeta: null, viewport: true, lang: "en", charset: "utf-8",
    h1: ["A heading"], headings: [{ level: 1, text: "A heading" }], images: [], links: [],
    jsonLd: [], jsonLdErrors: [], microdataTypes: [], hreflang: [], openGraph: {}, twitter: {},
    scripts: Array.from({ length: sample.scripts }, (_, i) => `https://cdn.example.com/bundle-${i}.js`),
    inlineScriptBytes: sample.inlineScriptBytes, stylesheets: [],
    text: "word ".repeat(sample.words).trim(), wordCount: sample.words,
    lede: "An opening sentence.", paragraphs: Array.from({ length: sample.paragraphs }, () => "A paragraph."),
    lists: 0, tables: 0, forms: 0, publishedAt: null, modifiedAt: null, author: "A Person",
    analytics: ["ga4"], cms: null, questionHeadings: [], hasFaqBlock: false,
    numbers: 2, externalCitations: 1, ctaCount: 1, faqPairs: [], contentRegionFound: true,
    ...overrides,
  };
}

function reportFor(sample: Sample, overrides: Partial<PageSignals> = {}): CrawlReport {
  const page: CrawledPage = {
    url: sample.url, finalUrl: sample.url, status: 200, depth: 0,
    contentType: "text/html", bytes: sample.bytes, elapsedMs: 100, redirectChain: [],
    error: null, signals: signals(sample, overrides), inlinks: [], textHash: "hash",
  };
  return {
    baseUrl: new URL(sample.url).origin, host: new URL(sample.url).host,
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    pages: [page],
    files: {
      robotsTxt: "User-agent: *\nAllow: /", robotsStatus: 200, sitemapUrls: [], sitemapEntries: [],
      llmsTxt: null, securityTxt: false, faviconOk: true,
      blockedAiCrawlers: [], allowedAiCrawlers: ["GPTBot", "ClaudeBot", "PerplexityBot"],
    },
    discovered: 1, fetched: 1, capped: false, notes: [],
  };
}

function codesFor(report: CrawlReport): string[] {
  return runChecks(report, { url: report.baseUrl }).map((draft) => draft.code);
}

test("a shell is flagged and a server-rendered page is not", () => {
  for (const sample of SAMPLES) {
    const flagged = codesFor(reportFor(sample)).includes("content_needs_javascript");
    assert.equal(
      flagged,
      sample.shell,
      `${sample.url} (${sample.words} words, ${sample.bytes} bytes, ${sample.scripts} scripts) ` +
        `should ${sample.shell ? "" : "not "}be flagged`,
    );
  }
});

test("a small page with no scripts is left alone", () => {
  // The rule has to separate "nothing here" from "nothing here yet". A short
  // page that ships no JavaScript is simply short.
  const tiny: Sample = { url: "https://tiny.example/", words: 12, bytes: 40_000, scripts: 0, inlineScriptBytes: 0, paragraphs: 1, shell: false };
  assert.ok(!codesFor(reportFor(tiny)).includes("content_needs_javascript"));
});

test("a title set by script is reported separately", () => {
  const page: Sample = { url: "https://spa.example/", words: 400, bytes: 50_000, scripts: 4, inlineScriptBytes: 20_000, paragraphs: 8, shell: false };
  const codes = codesFor(reportFor(page, { title: null }));
  assert.ok(codes.includes("meta_needs_javascript"), "a missing served title on a scripted page is reported");
  assert.ok(!codes.includes("content_needs_javascript"), "the body copy is there, so the page itself is fine");
});

test("a client-side SEO injector is named", () => {
  const page: Sample = { url: "https://injected.example/", words: 600, bytes: 80_000, scripts: 2, inlineScriptBytes: 5_000, paragraphs: 10, shell: false };
  const codes = codesFor(
    reportFor(page, { scripts: ["https://otto.searchatlas.com/pixel.js", "https://cdn.example.com/app.js"] }),
  );
  assert.ok(codes.includes("seo_injection_script"), "fixes applied in the browser are reported");
});

test("an ordinary page trips none of the three", () => {
  const page: Sample = { url: "https://ordinary.example/", words: 900, bytes: 120_000, scripts: 3, inlineScriptBytes: 8_000, paragraphs: 14, shell: false };
  const codes = codesFor(reportFor(page));
  for (const code of ["content_needs_javascript", "meta_needs_javascript", "seo_injection_script"]) {
    assert.ok(!codes.includes(code), `${code} should not fire on an ordinary page`);
  }
});
