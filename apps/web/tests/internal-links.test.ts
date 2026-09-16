/**
 * Internal linking, pinned to the two refusals that make it trustworthy.
 *
 * A listing page is only built when the orphans it would fix are real and
 * plural, because a listing page with two entries is thin content that solves
 * nothing. And a contextual link is only proposed when a sentence already on
 * the page names what the target is about, because inserting one otherwise
 * means writing a sentence, which is a content change wearing a linking
 * change's clothes.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { planContextualLinks, planListings } from "../src/engine/internal-links";
import type { CrawledPage, CrawlReport, PageSignals } from "../src/engine/types";

function signals(over: Partial<PageSignals> = {}): PageSignals {
  return {
    title: "A page", metaDescription: "A description long enough to be useful to a reader and a machine alike.",
    canonical: null, robotsMeta: null, viewport: true, lang: "en", charset: "utf-8",
    h1: ["A page"], headings: [{ level: 1, text: "A page" }], images: [], links: [],
    jsonLd: [], jsonLdErrors: [], microdataTypes: [], hreflang: [], openGraph: {}, twitter: {},
    scripts: [], inlineScriptBytes: 0, stylesheets: [],
    text: "Some copy.", wordCount: 400, lede: "An opening sentence about the subject.",
    paragraphs: ["An opening sentence about the subject."],
    lists: 0, tables: 0, forms: 0, publishedAt: null, modifiedAt: null, author: null,
    analytics: [], cms: null, questionHeadings: [], hasFaqBlock: false,
    numbers: 1, externalCitations: 0, ctaCount: 0, faqPairs: [], contentRegionFound: true,
    ...over,
  };
}

function page(url: string, over: Partial<PageSignals> = {}, inlinks: string[] = []): CrawledPage {
  return {
    url, finalUrl: url, status: 200, depth: 1, contentType: "text/html", bytes: 20000,
    elapsedMs: 80, redirectChain: [], error: null, signals: signals(over), inlinks, textHash: "h",
  };
}

function report(pages: CrawledPage[]): CrawlReport {
  return {
    baseUrl: "https://example.com", host: "example.com",
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    pages,
    files: {
      robotsTxt: null, robotsStatus: 200, sitemapUrls: [], sitemapEntries: [],
      llmsTxt: null, securityTxt: false, faviconOk: true,
      blockedAiCrawlers: [], allowedAiCrawlers: [],
    },
    discovered: pages.length, fetched: pages.length, capped: false, notes: [],
  };
}

test("two orphans in a section are a coincidence, three are a missing page", () => {
  const two = planListings(report([]), ["https://example.com/blog/a", "https://example.com/blog/b"]);
  assert.equal(two.length, 0);

  const three = planListings(
    report([
      page("https://example.com/blog/a", { title: "How solar pays back", h1: ["How solar pays back"] }),
      page("https://example.com/blog/b", { title: "Reading a quote", h1: ["Reading a quote"] }),
      page("https://example.com/blog/c", { title: "Rebates in 2026", h1: ["Rebates in 2026"] }),
    ]),
    ["https://example.com/blog/a", "https://example.com/blog/b", "https://example.com/blog/c"],
  );
  assert.equal(three.length, 1);
  assert.equal(three[0].section, "/blog");
  assert.equal(three[0].fixes, 3);
});

test("the listing page is publishable as written, not a description of one", () => {
  const [plan] = planListings(
    report([
      page("https://example.com/guides/a", { title: "One", h1: ["One"] }),
      page("https://example.com/guides/b", { title: "Two", h1: ["Two"] }),
      page("https://example.com/guides/c", { title: "Three", h1: ["Three"] }),
    ]),
    ["https://example.com/guides/a", "https://example.com/guides/b", "https://example.com/guides/c"],
  );

  assert.ok(plan.html.includes("<a href=\"https://example.com/guides/a\""), plan.html.slice(0, 200));
  assert.ok(!/REPLACE|TODO|\{\{/.test(plan.html), "nothing incomplete may reach the queue");
  assert.equal(plan.entries.length, 3);
  assert.equal((plan.jsonLd as { "@type"?: string })["@type"], "CollectionPage");
  assert.ok(plan.metaDescription.length > 20);
});

test("a contextual link is only proposed where a sentence already says the words", () => {
  const target = page("https://example.com/commercial-solar-cost", {
    title: "Commercial solar cost",
    h1: ["Commercial solar cost"],
  });

  const talksAboutIt = page("https://example.com/about", {
    title: "About us",
    paragraphs: ["We install commercial solar across the state and we publish what commercial solar cost looks like in practice."],
  });

  const doesNot = page("https://example.com/contact", {
    title: "Contact",
    paragraphs: ["Call us on the number below and we will get back to you within a day."],
  });

  const links = planContextualLinks(report([target, talksAboutIt, doesNot]), [target.url]);
  assert.ok(links.length >= 1, "the page that already names the subject should be proposed");
  assert.ok(links.every((link) => link.fromUrl !== doesNot.url), "a page that never mentions it must not be proposed");

  const first = links[0];
  assert.ok(first.after.includes(`href="${target.url}"`), first.after);
  assert.ok(first.sentence.length > 0);
  assert.ok(first.anchor.length > 0 && first.sentence.toLowerCase().includes(first.anchor.toLowerCase()));
  assert.ok(first.why.length > 10);
});

test("a page that already links to the target is left alone", () => {
  const target = page("https://example.com/solar-cost", { title: "Solar cost", h1: ["Solar cost"] });
  const source = page("https://example.com/about", {
    title: "About",
    paragraphs: ["We publish what solar cost means for a commercial roof, every year."],
    links: [{ href: "https://example.com/solar-cost", text: "solar cost", internal: true, rel: "" }],
  });
  const links = planContextualLinks(report([target, source]), [target.url]);
  assert.equal(links.length, 0);
});
