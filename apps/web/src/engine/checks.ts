/**
 * The checks.
 *
 * Every check emits a draft carrying a catalogue code; severity, impact and
 * the recommendation come from the catalogue, so the same problem is scored
 * the same way wherever it is found. These run in the browser over a crawl
 * the Worker collected.
 */

import { CATALOG } from "./catalog";
import { jsonLdNodes, jsonLdTypes, safeHost } from "./parse";
import type { CrawlOptions, CrawledPage, CrawlReport, Finding, Severity } from "./types";

export type Draft = {
  code: string;
  url?: string | null;
  detail?: string;
  evidence?: Record<string, unknown>;
  affectedUrls?: string[];
  severityOverride?: Severity;
};

const MAX_GOOD_DEPTH = 4;
const THIN_WORDS = 250;
const LARGE_INLINE_JS = 400_000;
const SLOW_MS = 1800;
const HEAVY_BYTES = 2_500_000;

const YMYL = /\b(health|medical|doctor|clinic|dental|therapy|symptom|diagnos|treatment|medicine|drug|legal|lawyer|attorney|solicitor|court|tax|mortgage|loan|insurance|invest|pension|crypto|trading|financial advice)\b/i;
const SUPERLATIVE = /\b(the best|number one|#1|world.?class|guaranteed|100% (safe|effective|secure)|cure|fastest|cheapest|leading provider|award.winning)\b/i;
// Deliberately narrow. A page listing event sponsors is not undisclosed
// affiliate content, and a check that cannot tell the difference is noise.
const AFFILIATE = /\b(affiliate link|affiliate program|affiliate disclosure|we may earn|earn a commission|commission from|paid partnership|sponsored post|sponsored content|#ad\b)/i;
const DISCLOSURE = /\b(disclosure|we may earn|affiliate link|sponsored (post|content)|advertis(ing|ement) disclosure)\b/i;
const LEGACY_IMAGE = /\.(jpe?g|png|gif|bmp|tiff?)(\?|$)/i;
const FACET_PARAMS = /[?&](filter|color|colour|size|sort|orderby|price|brand|attribute|refine|facet)/i;

export function runChecks(report: CrawlReport, options: CrawlOptions): Draft[] {
  const drafts: Draft[] = [];
  const fetched = report.pages.filter((p) => p.status > 0);
  const indexable = fetched.filter((p) => isIndexable(p));

  for (const page of report.pages) {
    drafts.push(...pageChecks(page, report, options));
  }
  drafts.push(...siteChecks(report, fetched, indexable, options));
  return drafts;
}

/* ------------------------------------------------------------- per page */

function pageChecks(page: CrawledPage, report: CrawlReport, options: CrawlOptions): Draft[] {
  const out: Draft[] = [];
  const url = page.url;

  if (page.error === "blocked by robots.txt") {
    return [{ code: "robots_blocks_important", url, detail: "robots.txt disallows this URL, so its content cannot be indexed" }];
  }
  if (page.error?.includes("too many redirects")) {
    return [{ code: "redirect_loop", url, detail: page.error }];
  }
  if (page.status >= 500) {
    return [{ code: "page_5xx", url, detail: `Returned HTTP ${page.status}` }];
  }
  if (page.status === 404 || page.status === 410) {
    if (page.inlinks.length) {
      return [{
        code: "page_404_linked",
        url,
        detail: `HTTP ${page.status}, linked from ${page.inlinks.length} page${page.inlinks.length === 1 ? "" : "s"}`,
        evidence: { linked_from: page.inlinks.slice(0, 10) },
      }];
    }
    return [];
  }
  if (page.status === 0 || !page.signals) {
    // A fetch that produced nothing is worth surfacing, but only once we know
    // it is not simply a non-HTML asset.
    if (page.error && !/^(not html|skipped)/i.test(page.error)) {
      out.push({ code: "page_5xx", url, detail: page.error, severityOverride: "high" });
    }
    return out;
  }

  const s = page.signals;

  if (page.redirectChain.length > 1) {
    out.push({
      code: "redirect_chain",
      url,
      detail: `${page.redirectChain.length} hops before the final URL`,
      evidence: { chain: [...page.redirectChain, page.finalUrl] },
    });
  }

  if (!page.finalUrl.startsWith("https://")) {
    out.push({ code: "no_https", url, detail: "Served over plain HTTP" });
  }

  /* -- indexability -- */
  if (!isIndexable(page)) {
    out.push({ code: "page_noindex", url, detail: `robots directive: ${s.robotsMeta}` });
  }
  if (!s.canonical) {
    out.push({ code: "canonical_missing", url, detail: "No rel=canonical" });
  } else if (canonicalDiffers(s.canonical, page.finalUrl)) {
    out.push({
      code: "canonical_mismatch",
      url,
      detail: `Canonical points to ${s.canonical}`,
      evidence: { canonical: s.canonical, page: page.finalUrl },
    });
  }
  if (page.depth > MAX_GOOD_DEPTH) {
    out.push({ code: "deep_page", url, detail: `${page.depth} clicks from the homepage` });
  }
  if (!s.lang) {
    out.push({ code: "no_lang_attribute", url, detail: "The html element has no lang attribute" });
  }

  /* -- title and meta -- */
  if (!s.title) {
    out.push({ code: "title_missing", url, detail: "No title element" });
  } else {
    const n = s.title.length;
    if (n > 65) out.push({ code: "title_too_long", url, detail: `${n} characters`, evidence: { title: s.title } });
    else if (n < 25) out.push({ code: "title_too_short", url, detail: `${n} characters`, evidence: { title: s.title } });
  }
  if (!s.metaDescription) {
    out.push({ code: "meta_description_missing", url, detail: "No meta description" });
  } else {
    const n = s.metaDescription.length;
    if (n > 170 || n < 70) {
      out.push({ code: "meta_description_length", url, detail: `${n} characters`, evidence: { description: s.metaDescription } });
    }
  }

  /* -- headings -- */
  if (s.h1.length === 0) out.push({ code: "h1_missing", url, detail: "No H1 on the page" });
  else if (s.h1.length > 1) {
    out.push({ code: "h1_multiple", url, detail: `${s.h1.length} H1 elements`, evidence: { h1: s.h1.slice(0, 5) } });
  }
  const skips = headingSkips(s.headings);
  if (skips.length) {
    out.push({ code: "heading_hierarchy_broken", url, detail: skips[0], evidence: { skips } });
  }
  const meaningless = s.headings.filter((h) => h.level > 1 && /^(overview|introduction|more|details|about|info|section|content|welcome)$/i.test(h.text));
  if (s.headings.length >= 4 && meaningless.length >= 2) {
    out.push({ code: "no_meaningful_headings", url, detail: `${meaningless.length} generic headings`, evidence: { headings: meaningless.map((h) => h.text) } });
  }

  /* -- body -- */
  const isUtility = /\/(contact|privacy|terms|cookie|login|cart|checkout|thank|404)/i.test(url);
  if (s.wordCount < THIN_WORDS && !isUtility && isIndexable(page)) {
    if (s.wordCount < 60 && s.scripts.length > 3) {
      out.push({
        code: "content_not_extractable",
        url,
        detail: `Only ${s.wordCount} words in the served HTML, with ${s.scripts.length} scripts. The content is very likely rendered client side.`,
        evidence: { words: s.wordCount, scripts: s.scripts.length },
      });
    } else {
      out.push({ code: "thin_content", url, detail: `${s.wordCount} words of body copy` });
    }
  }
  const internalOut = s.links.filter((l) => l.internal);
  if (internalOut.length === 0 && s.wordCount > 100) {
    out.push({ code: "no_internal_links_out", url, detail: "No internal links from this page" });
  }
  if (s.modifiedAt || s.publishedAt) {
    const when = new Date(s.modifiedAt ?? s.publishedAt ?? "");
    const months = (Date.now() - when.getTime()) / (1000 * 60 * 60 * 24 * 30.4);
    if (Number.isFinite(months) && months > 18 && s.wordCount > 300) {
      out.push({ code: "content_stale", url, detail: `Last updated ${Math.round(months)} months ago` });
    }
  }

  /* -- images -- */
  const missingAlt = s.images.filter((i) => i.alt == null);
  if (missingAlt.length) {
    out.push({
      code: "image_alt_missing",
      url,
      detail: `${missingAlt.length} of ${s.images.length} images have no alt attribute`,
      evidence: { examples: missingAlt.slice(0, 5).map((i) => i.src) },
    });
  }
  const noDims = s.images.filter((i) => !i.width || !i.height);
  if (noDims.length >= 3) {
    out.push({ code: "image_no_dimensions", url, detail: `${noDims.length} images without width and height` });
  }
  const legacy = s.images.filter((i) => LEGACY_IMAGE.test(i.src));
  if (legacy.length >= 4) {
    out.push({ code: "image_legacy_format", url, detail: `${legacy.length} images in JPEG, PNG or GIF` });
  }
  const eager = s.images.slice(3).filter((i) => i.loading !== "lazy");
  if (eager.length >= 5) {
    out.push({ code: "image_no_lazy_loading", url, detail: `${eager.length} below-the-fold images load eagerly` });
  }

  /* -- performance proxies -- */
  if (page.elapsedMs > SLOW_MS) {
    out.push({ code: "slow_response", url, detail: `${(page.elapsedMs / 1000).toFixed(1)}s to first byte and full body` });
  }
  if (page.bytes > HEAVY_BYTES) {
    out.push({ code: "heavy_page", url, detail: `${Math.round(page.bytes / 1024)} kB of HTML alone` });
  }
  if (s.inlineScriptBytes > LARGE_INLINE_JS) {
    out.push({
      code: "excessive_javascript",
      url,
      detail: `${Math.round(s.inlineScriptBytes / 1024)} kB of inline JavaScript`,
      evidence: { inline_bytes: s.inlineScriptBytes, external_scripts: s.scripts.length },
    });
  }
  if (s.stylesheets.length + s.scripts.length > 25) {
    out.push({
      code: "render_blocking_resources",
      url,
      detail: `${s.stylesheets.length} stylesheets and ${s.scripts.length} scripts`,
    });
  }
  const insecure = s.images.filter((i) => i.src.startsWith("http://")).map((i) => i.src);
  if (page.finalUrl.startsWith("https://") && insecure.length) {
    out.push({ code: "mixed_content", url, detail: `${insecure.length} resources loaded over HTTP`, evidence: { examples: insecure.slice(0, 5) } });
  }

  /* -- mobile and social -- */
  if (!s.viewport) out.push({ code: "mobile_unfriendly", url, detail: "No viewport meta tag" });
  if (!s.openGraph["og:title"] && !s.twitter["twitter:card"]) {
    out.push({ code: "no_social_preview", url, detail: "No Open Graph or Twitter card tags" });
  }

  /* -- schema -- */
  const types = jsonLdTypes(s.jsonLd);
  if (s.jsonLdErrors.length) {
    out.push({ code: "schema_invalid", url, detail: s.jsonLdErrors[0], evidence: { errors: s.jsonLdErrors } });
  }
  if (types.length === 0 && s.microdataTypes.length === 0 && s.wordCount > 150) {
    out.push({ code: "schema_missing", url, detail: "No JSON-LD or microdata on the page" });
  }
  out.push(...schemaRequirements(page, types));
  if (!types.includes("BreadcrumbList") && page.depth >= 2) {
    out.push({ code: "no_breadcrumb_schema", url, detail: "No BreadcrumbList markup on a nested page" });
  }

  /* -- AEO -- */
  const looksLikeQuestion = /\?/.test(s.title ?? "") || /^(what|how|why|when|where|who|can|is|are|do|does)\b/i.test(s.h1[0] ?? "");
  if (looksLikeQuestion && !hasDirectAnswer(s.paragraphs[0] ?? "")) {
    out.push({
      code: "no_direct_answer",
      url,
      detail: "The page asks a question in its heading but does not answer it in the opening passage",
      evidence: { opening: (s.paragraphs[0] ?? "").slice(0, 240) },
    });
  }
  if (s.wordCount > 400 && s.numbers < 2 && s.externalCitations < 1) {
    out.push({ code: "no_citable_facts", url, detail: "No specific figures and no outbound citations" });
  }
  if (s.questionHeadings.length >= 3 && !types.includes("FAQPage")) {
    out.push({ code: "no_faq_structure", url, detail: `${s.questionHeadings.length} question headings without FAQPage markup`, evidence: { questions: s.questionHeadings.slice(0, 8) } });
  }
  const editorial = s.wordCount > 600 && /\/(blog|article|news|guide|insight|resource|post)/i.test(url);
  if (editorial && !s.author) {
    out.push({ code: "no_author_attribution", url, detail: "Long-form content with no named author" });
  }

  /* -- conversion -- */
  if (s.ctaCount === 0 && s.forms === 0 && s.wordCount > 150 && !isUtility) {
    out.push({ code: "no_clear_cta", url, detail: "No call to action and no form on the page" });
  }

  /* -- compliance -- */
  const topic = `${s.title ?? ""} ${s.text.slice(0, 4000)}`;
  if (YMYL.test(topic) && !s.author && s.wordCount > 400) {
    out.push({ code: "ymyl_no_credentials", url, detail: "Advice on a health, legal or financial topic with no named, credentialed author" });
  }
  const claim = SUPERLATIVE.exec(topic);
  if (claim && s.externalCitations === 0) {
    out.push({ code: "unsubstantiated_claim", url, detail: `"${claim[0]}" is claimed with no source cited`, evidence: { phrase: claim[0] } });
  }
  if (AFFILIATE.test(s.text) && !DISCLOSURE.test(s.text.slice(0, 3000))) {
    out.push({ code: "missing_disclosure", url, detail: "Commercial relationship mentioned without a visible disclosure" });
  }

  /* -- ecommerce -- */
  if (FACET_PARAMS.test(url) && isIndexable(page) && !s.canonical?.includes("?")) {
    out.push({ code: "faceted_nav_crawl_waste", url, detail: "A filtered URL is indexable" });
  }

  /* -- international -- */
  out.push(...hreflangChecks(page));

  /* -- measurement -- */
  if (page.depth === 0 && s.analytics.length === 0) {
    out.push({ code: "analytics_missing", url, detail: "No analytics snippet found in the served HTML" });
  }

  return out;
}

/* ------------------------------------------------------------- site wide */

function siteChecks(
  report: CrawlReport,
  fetched: CrawledPage[],
  indexable: CrawledPage[],
  options: CrawlOptions,
): Draft[] {
  const out: Draft[] = [];
  const files = report.files;
  const home = report.pages.find((p) => p.depth === 0);

  if (files.robotsStatus !== 200 || !files.robotsTxt) {
    out.push({ code: "robots_missing", url: null, detail: "No robots.txt served at the site root", affectedUrls: [report.baseUrl] });
  }
  if (files.sitemapUrls.length === 0) {
    out.push({
      code: "no_sitemap",
      url: null,
      detail: "No sitemap in robots.txt and none at the usual paths",
      affectedUrls: [report.baseUrl],
    });
  } else {
    const live = new Set(fetched.map((p) => p.finalUrl.replace(/\/$/, "")));
    const nonIndexable = new Set(
      report.pages.filter((p) => p.status >= 400 || !isIndexable(p)).map((p) => p.finalUrl.replace(/\/$/, "")),
    );
    const bad = files.sitemapEntries.filter((u) => nonIndexable.has(u.replace(/\/$/, "")));
    if (bad.length) {
      out.push({
        code: "sitemap_contains_non_indexable",
        url: null,
        detail: `${bad.length} sitemap URLs are redirected, 404 or noindex`,
        affectedUrls: bad.slice(0, 50),
        evidence: { examples: bad.slice(0, 10) },
      });
    }
    const sitemapSet = new Set(files.sitemapEntries.map((u) => u.replace(/\/$/, "")));
    const missing = indexable.filter((p) => !sitemapSet.has(p.finalUrl.replace(/\/$/, "")));
    if (files.sitemapEntries.length > 0 && missing.length >= 3) {
      out.push({
        code: "sitemap_missing_pages",
        url: null,
        detail: `${missing.length} live indexable pages are not in the sitemap`,
        affectedUrls: missing.map((p) => p.url).slice(0, 50),
        evidence: { examples: missing.slice(0, 8).map((p) => p.url) },
      });
    }
  }

  /* -- AI crawler access -- */
  if (files.blockedAiCrawlers.length) {
    out.push({
      code: "ai_crawler_blocked",
      url: null,
      detail: `robots.txt disallows ${files.blockedAiCrawlers.join(", ")}`,
      affectedUrls: [report.baseUrl],
      evidence: { blocked: files.blockedAiCrawlers, allowed: files.allowedAiCrawlers },
    });
  }
  if (!files.llmsTxt) {
    out.push({ code: "missing_llms_txt", url: null, detail: "No /llms.txt", affectedUrls: [report.baseUrl] });
  }

  /* -- entity and organisation -- */
  const homeTypes = home?.signals ? jsonLdTypes(home.signals.jsonLd) : [];
  const orgTypes = ["Organization", "LocalBusiness", "Corporation", "OnlineBusiness", "ProfessionalService", "Store", "Restaurant", "MedicalBusiness", "LegalService"];
  const hasOrg = homeTypes.some((t) => orgTypes.includes(t));
  if (!hasOrg) {
    out.push({ code: "no_organization_schema", url: home?.url ?? null, detail: "The homepage has no Organization or LocalBusiness markup", affectedUrls: [report.baseUrl] });
  }
  const sameAs = home?.signals ? jsonLdNodes(home.signals.jsonLd).some((n) => Array.isArray(n.sameAs) && (n.sameAs as unknown[]).length > 0) : false;
  if (!sameAs) {
    out.push({ code: "entity_unclear", url: home?.url ?? null, detail: "No sameAs profile links tie the brand to its public profiles", affectedUrls: [report.baseUrl] });
  }

  /* -- duplicates and cannibalisation -- */
  out.push(...duplicateChecks(indexable));

  /* -- orphans -- */
  const orphans = indexable.filter((p) => p.depth > 0 && p.inlinks.length === 0);
  if (orphans.length) {
    out.push({
      code: "orphan_page",
      url: null,
      detail: `${orphans.length} pages were found in the sitemap but nothing links to them`,
      affectedUrls: orphans.map((p) => p.url).slice(0, 50),
      evidence: { examples: orphans.slice(0, 8).map((p) => p.url) },
    });
  }

  /* -- privacy policy -- */
  const hasPrivacy = fetched.some((p) => /\/(privacy|datenschutz|privacidad)/i.test(p.url))
    || fetched.some((p) => p.signals?.links.some((l) => /privacy/i.test(l.text)));
  if (!hasPrivacy) {
    out.push({ code: "no_privacy_policy", url: null, detail: "No privacy policy page or footer link found", affectedUrls: [report.baseUrl] });
  }

  /* -- local -- */
  const wantsLocal = options.businessType === "local" || (options.locations?.length ?? 0) > 0;
  if (wantsLocal) {
    const hasLocalSchema = fetched.some((p) => p.signals && jsonLdTypes(p.signals.jsonLd).some((t) => t === "LocalBusiness" || orgTypes.includes(t)));
    if (!hasLocalSchema) {
      out.push({ code: "no_local_schema", url: null, detail: "No LocalBusiness markup anywhere on the site", affectedUrls: [report.baseUrl] });
    }
    const phone = fetched.some((p) => /(\+?\d[\d ().-]{8,}\d)/.test(p.signals?.text ?? ""));
    const address = fetched.some((p) => /\b\d{1,5}\s+\w+(\s+\w+)*\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|boulevard|blvd|suite|floor)\b/i.test(p.signals?.text ?? ""));
    if (!phone || !address) {
      out.push({ code: "nap_missing", url: null, detail: `Site-wide contact details incomplete: ${!phone ? "no phone" : ""}${!phone && !address ? " and " : ""}${!address ? "no street address" : ""} found in the crawled pages`, affectedUrls: [report.baseUrl] });
    }
    for (const location of options.locations ?? []) {
      const slug = location.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const hasPage = fetched.some((p) => p.url.toLowerCase().includes(slug) || (p.signals?.title ?? "").toLowerCase().includes(location.toLowerCase()));
      if (!hasPage) {
        out.push({ code: "missing_location_page", url: null, detail: `No page targets ${location}`, affectedUrls: [report.baseUrl], evidence: { location } });
      }
    }
  }

  /* -- off page: what we cannot see without a source -- */
  out.push({
    code: "backlinks_not_connected",
    url: null,
    detail: "The crawl can read the site but not the web's link graph. Connect Search Console or a link index to work the off-page side with real data.",
    affectedUrls: [report.baseUrl],
  });

  const linkable = fetched.filter((p) => {
    const s = p.signals;
    if (!s) return false;
    return s.wordCount > 1200 || s.tables >= 2 || /\b(study|research|report|survey|data|calculator|tool|index|benchmark)\b/i.test(s.title ?? "");
  });
  if (linkable.length === 0 && fetched.length > 4) {
    out.push({ code: "no_linkable_asset", url: null, detail: "Nothing on the site reads as an asset another site would cite: no original data, no reference guide, no tool", affectedUrls: [report.baseUrl] });
  }

  /* -- ecommerce -- */
  const productPages = fetched.filter((p) => p.signals && jsonLdTypes(p.signals.jsonLd).includes("Product"));
  if (options.businessType === "ecommerce" || productPages.length >= 2) {
    const noReviews = productPages.filter((p) => !jsonLdTypes(p.signals!.jsonLd).includes("AggregateRating")
      && !jsonLdNodes(p.signals!.jsonLd).some((n) => n.aggregateRating));
    if (noReviews.length) {
      out.push({
        code: "no_product_reviews",
        url: null,
        detail: `${noReviews.length} product pages carry no AggregateRating`,
        affectedUrls: noReviews.map((p) => p.url).slice(0, 40),
      });
    }
  }

  return out;
}

/* --------------------------------------------------------------- helpers */

export function isIndexable(page: CrawledPage): boolean {
  const robots = page.signals?.robotsMeta?.toLowerCase() ?? "";
  if (/\bnoindex\b/.test(robots) || /\bnone\b/.test(robots)) return false;
  return page.status >= 200 && page.status < 300;
}

function canonicalDiffers(canonical: string, finalUrl: string): boolean {
  const strip = (u: string) => u.replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "").toLowerCase();
  return strip(canonical) !== strip(finalUrl);
}

function headingSkips(headings: { level: number; text: string }[]): string[] {
  const out: string[] = [];
  let previous = 0;
  for (const h of headings) {
    if (previous && h.level > previous + 1) {
      out.push(`H${previous} is followed by H${h.level} ("${h.text.slice(0, 60)}")`);
    }
    previous = h.level;
  }
  return out;
}

function hasDirectAnswer(opening: string): boolean {
  if (opening.length < 40) return false;
  const sentences = opening.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ");
  // An answer states something; a lede that only sets up the topic does not.
  return /\b(is|are|means|refers to|costs?|takes?|requires?|you (can|should|need)|the answer)\b/i.test(sentences);
}

const SCHEMA_REQUIRED: Record<string, string[]> = {
  Product: ["name", "image", "offers"],
  Article: ["headline", "datePublished"],
  BlogPosting: ["headline", "datePublished"],
  NewsArticle: ["headline", "datePublished", "author"],
  Recipe: ["name", "recipeIngredient", "recipeInstructions"],
  Event: ["name", "startDate", "location"],
  JobPosting: ["title", "datePosted", "hiringOrganization"],
  LocalBusiness: ["name", "address"],
  Organization: ["name", "url"],
  FAQPage: ["mainEntity"],
  VideoObject: ["name", "thumbnailUrl", "uploadDate"],
  Course: ["name", "description", "provider"],
  SoftwareApplication: ["name", "applicationCategory"],
};

function schemaRequirements(page: CrawledPage, types: string[]): Draft[] {
  const s = page.signals;
  if (!s) return [];
  const out: Draft[] = [];
  const nodes = jsonLdNodes(s.jsonLd);

  for (const node of nodes) {
    const raw = node["@type"];
    const nodeTypes = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
    for (const type of nodeTypes) {
      const required = SCHEMA_REQUIRED[type];
      if (!required) continue;
      const missing = required.filter((key) => node[key] == null || node[key] === "");
      if (missing.length) {
        out.push({
          code: "schema_missing_required",
          url: page.url,
          detail: `${type} is missing ${missing.join(", ")}`,
          evidence: { type, missing },
        });
      }
      if (type === "Product") {
        const offers = node["offers"] as Record<string, unknown> | undefined;
        const offer = Array.isArray(offers) ? offers[0] : offers;
        const merchant = ["price", "priceCurrency", "availability"].filter((k) => !offer || (offer as Record<string, unknown>)[k] == null);
        const identifier = ["gtin", "gtin13", "gtin8", "mpn", "sku"].every((k) => node[k] == null);
        if (merchant.length || identifier) {
          out.push({
            code: "product_schema_incomplete",
            url: page.url,
            detail: [merchant.length ? `offers missing ${merchant.join(", ")}` : null, identifier ? "no GTIN, MPN or SKU" : null]
              .filter(Boolean).join("; "),
            evidence: { missing: merchant, identifier_missing: identifier },
          });
        }
      }
    }
  }

  // Markup describing content the page does not contain is a manual action
  // risk, and the cheapest version of that check is the FAQ one.
  if (types.includes("FAQPage") && s.questionHeadings.length === 0 && !/\?/.test(s.text)) {
    out.push({ code: "schema_contradicts_page", url: page.url, detail: "FAQPage markup on a page with no visible questions" });
  }
  return out;
}

function hreflangChecks(page: CrawledPage): Draft[] {
  const s = page.signals;
  if (!s || s.hreflang.length === 0) return [];
  const out: Draft[] = [];
  const valid = /^([a-z]{2,3})(-[A-Za-z]{2,4})?$|^x-default$/;
  const invalid = s.hreflang.filter((h) => !valid.test(h.lang));
  if (invalid.length) {
    out.push({
      code: "hreflang_invalid_code",
      url: page.url,
      detail: `Invalid codes: ${invalid.map((h) => h.lang).join(", ")}`,
      evidence: { invalid: invalid.map((h) => h.lang) },
    });
  }
  if (!s.hreflang.some((h) => h.lang.toLowerCase() === "x-default")) {
    out.push({ code: "no_x_default", url: page.url, detail: "No x-default annotation" });
  }
  const selfRef = s.hreflang.some((h) => h.href.replace(/\/$/, "") === page.finalUrl.replace(/\/$/, ""));
  if (!selfRef) {
    out.push({ code: "hreflang_missing_return", url: page.url, detail: "The page does not list itself among its hreflang alternates, so the set cannot be reciprocal" });
  }
  return out;
}

function duplicateChecks(pages: CrawledPage[]): Draft[] {
  const out: Draft[] = [];
  const byHash = new Map<string, CrawledPage[]>();
  const byTitle = new Map<string, CrawledPage[]>();
  const byDescription = new Map<string, CrawledPage[]>();

  for (const page of pages) {
    const s = page.signals;
    if (!s) continue;
    if (page.textHash && s.wordCount > 120) {
      (byHash.get(page.textHash) ?? byHash.set(page.textHash, []).get(page.textHash)!).push(page);
    }
    if (s.title) {
      const key = s.title.trim().toLowerCase();
      (byTitle.get(key) ?? byTitle.set(key, []).get(key)!).push(page);
    }
    if (s.metaDescription) {
      const key = s.metaDescription.trim().toLowerCase();
      (byDescription.get(key) ?? byDescription.set(key, []).get(key)!).push(page);
    }
  }

  for (const [, group] of byHash) {
    if (group.length < 2) continue;
    out.push({
      code: "duplicate_content",
      url: null,
      detail: `${group.length} URLs serve the same body copy`,
      affectedUrls: group.map((p) => p.url),
      evidence: { urls: group.map((p) => p.url).slice(0, 10) },
    });
  }
  for (const [title, group] of byTitle) {
    if (group.length < 2) continue;
    out.push({
      code: "duplicate_title",
      url: null,
      detail: `${group.length} pages share the title "${title.slice(0, 70)}"`,
      affectedUrls: group.map((p) => p.url),
      evidence: { title, urls: group.map((p) => p.url).slice(0, 10) },
    });
  }
  for (const [, group] of byDescription) {
    if (group.length < 2) continue;
    out.push({
      code: "duplicate_meta_description",
      url: null,
      detail: `${group.length} pages share one meta description`,
      affectedUrls: group.map((p) => p.url),
      evidence: { urls: group.map((p) => p.url).slice(0, 10) },
    });
  }

  // Cannibalisation: distinct pages whose titles target the same head term.
  const byHead = new Map<string, CrawledPage[]>();
  for (const page of pages) {
    const title = page.signals?.title;
    if (!title) continue;
    const key = title.toLowerCase().split(/[|\-–—:]/)[0].replace(/[^a-z0-9 ]/g, "").trim();
    if (key.split(" ").length < 2) continue;
    (byHead.get(key) ?? byHead.set(key, []).get(key)!).push(page);
  }
  for (const [term, group] of byHead) {
    const unique = [...new Set(group.map((p) => p.textHash))];
    if (group.length >= 2 && unique.length === group.length) {
      out.push({
        code: "keyword_cannibalisation",
        url: null,
        detail: `${group.length} distinct pages lead with "${term}"`,
        affectedUrls: group.map((p) => p.url),
        evidence: { term, urls: group.map((p) => p.url) },
      });
    }
  }
  return out;
}

/* ------------------------------------------------------- materialisation */

export function fingerprint(code: string, url: string | null): string {
  const basis = `${code}|${url ?? "site-wide"}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function priorityOf(def: { impact: number; effort: number; confidence: number }, affected: number): number {
  const effort = Math.max(def.effort, 0.05);
  const breadth = 1 + Math.min(affected / 50, 1);
  return Math.round(Math.min((def.impact * def.confidence) / effort * breadth * 12, 100) * 10) / 10;
}

/** Turn drafts into findings, folding the catalogue in. */
export function materialise(drafts: Draft[], now: string): Finding[] {
  const merged = new Map<string, Finding>();

  for (const draft of drafts) {
    const def = CATALOG[draft.code];
    if (!def) continue;
    const id = fingerprint(draft.code, draft.url ?? null);
    const affected = draft.affectedUrls?.length ?? (draft.url ? 1 : 1);
    const existing = merged.get(id);
    if (existing) {
      existing.affectedUrls = [...new Set([...existing.affectedUrls, ...(draft.affectedUrls ?? [])])];
      existing.affectedCount = Math.max(existing.affectedCount, existing.affectedUrls.length || 1);
      continue;
    }
    merged.set(id, {
      id,
      code: def.code,
      category: def.category,
      severity: draft.severityOverride ?? def.severity,
      title: def.title,
      why: def.why,
      recommendation: def.recommendation,
      detail: draft.detail ?? "",
      url: draft.url ?? null,
      affectedUrls: draft.affectedUrls ?? (draft.url ? [draft.url] : []),
      affectedCount: affected,
      evidence: draft.evidence ?? {},
      priority: priorityOf(def, affected),
      impact: def.impact,
      effort: def.effort,
      confidence: def.confidence,
      autoFixable: def.autoFixable,
      fixStrategy: def.fixStrategy,
      fix: null,
      status: "open",
      firstSeen: now,
      lastSeen: now,
    });
  }

  return [...merged.values()].sort((a, b) => b.priority - a.priority);
}
