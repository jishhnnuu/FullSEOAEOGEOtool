/**
 * Fix generation.
 *
 * An audit tool stops at "your titles are duplicated". This produces the
 * replacement title, the JSON-LD block, the sitemap, the robots.txt and the
 * link plan, so the finding arrives with the work already done and a human
 * only has to say yes.
 *
 * Nothing here calls a model. Every artefact is derived from the site's own
 * content, which is why the first run costs nothing and works before any
 * credential is connected.
 */

import { jsonLdNodes, jsonLdTypes } from "./parse";
import { brandFromHost, clamp, sentences, slugify, titleCase, tokenise, topTerms } from "./text";
import type { CrawlOptions, CrawledPage, CrawlReport, Finding, Fix } from "./types";

export type FixContext = {
  report: CrawlReport;
  options: CrawlOptions;
  brand: string;
  pages: Map<string, CrawledPage>;
};

export function buildContext(report: CrawlReport, options: CrawlOptions): FixContext {
  const pages = new Map(report.pages.map((p) => [p.url, p]));
  const home = report.pages.find((p) => p.depth === 0);
  const brand =
    options.brandName ||
    siteNameFromSchema(home) ||
    brandFromSiteTitle(home) ||
    brandFromHost(report.host);
  return { report, options, brand, pages };
}

function siteNameFromSchema(home: CrawledPage | undefined): string | null {
  if (!home?.signals) return null;
  for (const node of jsonLdNodes(home.signals.jsonLd)) {
    const types = typeof node["@type"] === "string" ? [node["@type"]] : Array.isArray(node["@type"]) ? node["@type"] : [];
    if (types.some((t) => typeof t === "string" && /Organization|LocalBusiness|WebSite/.test(t))) {
      const name = node["name"];
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  return null;
}

function brandFromSiteTitle(home: CrawledPage | undefined): string | null {
  const title = home?.signals?.title;
  if (!title) return null;
  const parts = title.split(/\s[|\-–—]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // Brand is conventionally the shortest segment, and usually the last.
  const candidate = parts[parts.length - 1];
  return candidate.length <= 40 ? candidate : null;
}

/* ------------------------------------------------------------ generators */

export function generateFix(finding: Finding, ctx: FixContext): Fix | null {
  switch (finding.fixStrategy) {
    case "rewrite_title": return titleFix(finding, ctx);
    case "rewrite_meta": return metaFix(finding, ctx);
    case "add_h1": return h1Fix(finding, ctx);
    case "add_self_canonical": return canonicalFix(finding, ctx);
    case "set_lang": return langFix(finding, ctx);
    case "add_viewport": return viewportFix(finding);
    case "generate_og": return ogFix(finding, ctx);
    case "generate_schema": return schemaFix(finding, ctx);
    case "fix_schema": return schemaPatchFix(finding, ctx);
    case "generate_sitemap": return sitemapFix(ctx);
    case "clean_sitemap": return cleanSitemapFix(finding, ctx);
    case "generate_robots": return robotsFix(ctx, false);
    case "update_robots_ai": return robotsFix(ctx, true);
    case "generate_llms_txt": return llmsFix(ctx);
    case "write_alt_text": return altFix(finding, ctx);
    case "add_internal_link": return linkPlanFix(finding, ctx);
    case "repoint_internal_link": return repointFix(finding, ctx);
    case "flatten_redirect": return redirectFix(finding);
    case "add_answer_block": return answerFix(finding, ctx);
    case "fix_heading_hierarchy": return headingFix(finding, ctx);
    case "rewrite_headings": return headingRewriteFix(finding, ctx);
    case "set_image_dimensions": return imageDimensionFix(finding, ctx);
    case "set_image_loading": return imageLoadingFix(finding, ctx);
    case "add_disclosure": return disclosureFix(finding);
    case "add_nap": return napFix(ctx);
    case "draft_location_page": return locationPageFix(finding, ctx);
    default: return null;
  }
}

function page(finding: Finding, ctx: FixContext): CrawledPage | null {
  if (finding.url) return ctx.pages.get(finding.url) ?? null;
  const first = finding.affectedUrls[0];
  return first ? ctx.pages.get(first) ?? null : null;
}

/** The topic of a page, in the page's own words. */
function topicOf(p: CrawledPage, ctx: FixContext): string {
  const s = p.signals;
  if (!s) return ctx.brand;
  const fromH1 = s.h1[0];
  if (fromH1 && fromH1.length > 3) return fromH1;
  const fromTitle = (s.title ?? "").split(/\s[|\-–—]\s/)[0];
  if (fromTitle && fromTitle.length > 3) return fromTitle;
  const path = new URL(p.finalUrl).pathname.split("/").filter(Boolean).pop();
  return path ? titleCase(path.replace(/[-_]+/g, " ").replace(/\.\w+$/, "")) : ctx.brand;
}

function titleFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const topic = topicOf(p, ctx);
  const terms = topTerms(p.signals.text.slice(0, 6000), 6).map((t) => t.term);
  const qualifier = pickQualifier(terms, topic, ctx);
  const suffix = ctx.brand.length <= 22 ? ` | ${ctx.brand}` : "";
  const core = clamp(titleCase(topic), 60 - suffix.length - (qualifier ? qualifier.length + 3 : 0));
  const after = `${core}${qualifier ? ` ${qualifier}` : ""}${suffix}`;

  return {
    kind: "meta",
    label: "Title tag",
    target: p.url,
    before: p.signals.title,
    after: clamp(after, 62),
    applyVia: "CMS page settings, or the <title> element in the template",
    risk: "low",
    reversible: true,
    instructions: "Replace the page title. Keep the distinguishing words first so nothing important is truncated in the result.",
  };
}

function pickQualifier(terms: string[], topic: string, ctx: FixContext): string {
  const topicTokens = new Set(tokenise(topic));
  const location = ctx.options.locations?.[0];
  if (location && !topicTokens.has(location.toLowerCase())) return `in ${location}`;
  const extra = terms.find((t) => !topicTokens.has(t) && t.length > 4);
  return extra ? `- ${titleCase(extra)}` : "";
}

function metaFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const topic = topicOf(p, ctx);
  const body = sentences(p.signals.paragraphs.join(" ") || p.signals.text);
  const lead = body[0] ? clamp(body[0], 110) : `${topic} from ${ctx.brand}.`;
  const action = p.signals.forms > 0 || p.signals.ctaCount > 0
    ? "Get a quote or book in minutes."
    : "See what is covered and what it costs.";
  const after = clamp(`${lead}${lead.endsWith(".") ? "" : "."} ${action}`, 158);

  return {
    kind: "meta",
    label: "Meta description",
    target: p.url,
    before: p.signals.metaDescription,
    after,
    applyVia: "CMS page settings, or the meta description in the template",
    risk: "low",
    reversible: true,
    instructions: "Replace the meta description. It does not affect ranking directly; it affects whether the result is clicked.",
  };
}

function h1Fix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const topic = titleCase(topicOf(p, ctx));
  return {
    kind: "html",
    label: "H1 heading",
    target: p.url,
    before: null,
    after: `<h1>${escapeHtml(topic)}</h1>`,
    applyVia: "The page template, above the body copy",
    risk: "low",
    reversible: true,
    instructions: "Add one H1 at the top of the content area. If a styled heading already exists visually, change its tag rather than adding a second heading.",
  };
}

function canonicalFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p) return null;
  return {
    kind: "html",
    label: "Self-referencing canonical",
    target: p.url,
    before: null,
    after: `<link rel="canonical" href="${escapeHtml(p.finalUrl)}" />`,
    applyVia: "The <head> of the page template",
    risk: "low",
    reversible: true,
    instructions: "Add this to the head. In most CMSes an SEO plugin sets it for every page at once, which is the better fix.",
  };
}

function langFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p) return null;
  return {
    kind: "html",
    label: "Document language",
    target: p.url,
    before: "<html>",
    after: `<html lang="en">`,
    applyVia: "The site's base template",
    risk: "low",
    reversible: true,
    instructions: "Set lang on the html element to the language the page is actually written in.",
  };
}

function viewportFix(finding: Finding): Fix {
  return {
    kind: "html",
    label: "Viewport meta tag",
    target: finding.url,
    before: null,
    after: `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    applyVia: "The <head> of the base template",
    risk: "low",
    reversible: true,
    instructions: "Add this to the head. Without it a phone renders the page at desktop width and zooms out.",
  };
}

function ogFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const title = p.signals.title ?? titleCase(topicOf(p, ctx));
  const description = p.signals.metaDescription ?? clamp(p.signals.paragraphs[0] ?? "", 150);
  const image = p.signals.images[0]?.src ?? `${new URL(p.finalUrl).origin}/og-image.png`;
  const after = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(p.finalUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n");
  return {
    kind: "html",
    label: "Social preview tags",
    target: p.url,
    before: null,
    after,
    applyVia: "The <head> of the page template",
    risk: "low",
    reversible: true,
    instructions: "Add these to the head. Check the og:image is at least 1200x630 or it will be cropped.",
  };
}

/* -------------------------------------------------------------- schema */

function schemaFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx) ?? ctx.report.pages.find((x) => x.depth === 0) ?? null;
  if (!p) return null;
  const origin = new URL(p.finalUrl).origin;

  let node: Record<string, unknown>;
  let label: string;

  if (finding.code === "no_organization_schema" || finding.code === "entity_unclear" || p.depth === 0) {
    const local = ctx.options.businessType === "local" || (ctx.options.locations?.length ?? 0) > 0;
    node = {
      "@context": "https://schema.org",
      "@type": local ? "LocalBusiness" : "Organization",
      name: ctx.brand,
      url: origin,
      description: clamp(p.signals?.metaDescription ?? p.signals?.paragraphs[0] ?? "", 200),
      logo: p.signals?.images[0]?.src ?? `${origin}/logo.png`,
      sameAs: socialProfiles(ctx),
      ...(local
        ? {
            address: {
              "@type": "PostalAddress",
              streetAddress: "REPLACE: street address",
              addressLocality: ctx.options.locations?.[0] ?? "REPLACE: city",
              postalCode: "REPLACE: postcode",
              addressCountry: "REPLACE: country code",
            },
            telephone: guessPhone(ctx) ?? "REPLACE: phone",
            openingHoursSpecification: [
              {
                "@type": "OpeningHoursSpecification",
                dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                opens: "09:00",
                closes: "17:00",
              },
            ],
          }
        : {}),
    };
    label = local ? "LocalBusiness JSON-LD" : "Organization JSON-LD";
  } else if (finding.code === "no_faq_structure" && p.signals?.questionHeadings.length) {
    node = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: p.signals.questionHeadings.slice(0, 8).map((q, i) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: {
          "@type": "Answer",
          text: clamp(p.signals!.paragraphs[i] ?? p.signals!.paragraphs[0] ?? "REPLACE: the answer as it appears on the page", 320),
        },
      })),
    };
    label = "FAQPage JSON-LD";
  } else if (finding.code === "no_breadcrumb_schema") {
    const segments = new URL(p.finalUrl).pathname.split("/").filter(Boolean);
    node = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin },
        ...segments.map((segment, i) => ({
          "@type": "ListItem",
          position: i + 2,
          name: titleCase(segment.replace(/[-_]+/g, " ")),
          item: `${origin}/${segments.slice(0, i + 1).join("/")}`,
        })),
      ],
    };
    label = "BreadcrumbList JSON-LD";
  } else if (finding.code === "no_local_schema") {
    node = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: ctx.brand,
      url: origin,
      telephone: guessPhone(ctx) ?? "REPLACE: phone",
      address: {
        "@type": "PostalAddress",
        streetAddress: "REPLACE: street address",
        addressLocality: ctx.options.locations?.[0] ?? "REPLACE: city",
        postalCode: "REPLACE: postcode",
        addressCountry: "REPLACE: country code",
      },
      geo: { "@type": "GeoCoordinates", latitude: "REPLACE", longitude: "REPLACE" },
      priceRange: "££",
    };
    label = "LocalBusiness JSON-LD";
  } else {
    const type = guessPageType(p);
    node = {
      "@context": "https://schema.org",
      "@type": type,
      name: p.signals?.title ?? topicOf(p, ctx),
      headline: p.signals?.h1[0] ?? p.signals?.title ?? topicOf(p, ctx),
      description: clamp(p.signals?.metaDescription ?? p.signals?.paragraphs[0] ?? "", 200),
      url: p.finalUrl,
      ...(type === "Article" || type === "BlogPosting"
        ? {
            datePublished: p.signals?.publishedAt ?? new Date().toISOString().slice(0, 10),
            dateModified: p.signals?.modifiedAt ?? new Date().toISOString().slice(0, 10),
            author: { "@type": "Person", name: p.signals?.author ?? "REPLACE: author name" },
            publisher: { "@type": "Organization", name: ctx.brand, url: origin },
          }
        : {}),
    };
    label = `${type} JSON-LD`;
  }

  return {
    kind: "jsonld",
    label,
    target: p.url,
    before: p.signals && p.signals.jsonLd.length ? JSON.stringify(p.signals.jsonLd, null, 2).slice(0, 4000) : null,
    after: `<script type="application/ld+json">\n${JSON.stringify(node, null, 2)}\n</script>`,
    applyVia: "The <head> of the page, or a schema field in the CMS",
    risk: "low",
    reversible: true,
    instructions: "Replace every REPLACE placeholder with the real value before publishing. Markup that describes something the page does not show is a manual action risk, not a shortcut.",
  };
}

function schemaPatchFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const missing = (finding.evidence.missing as string[]) ?? [];
  const type = (finding.evidence.type as string) ?? jsonLdTypes(p.signals.jsonLd)[0] ?? "Thing";
  const existing = jsonLdNodes(p.signals.jsonLd).find((n) => {
    const t = n["@type"];
    return t === type || (Array.isArray(t) && t.includes(type));
  });
  const patched: Record<string, unknown> = { ...(existing ?? { "@context": "https://schema.org", "@type": type }) };
  for (const key of missing) patched[key] = suggestValue(key, p, ctx);
  if (finding.code === "product_schema_incomplete") {
    patched.offers = {
      "@type": "Offer",
      price: "REPLACE: 0.00",
      priceCurrency: "REPLACE: GBP",
      availability: "https://schema.org/InStock",
      url: p.finalUrl,
      ...(typeof (patched.offers as Record<string, unknown>)?.["priceValidUntil"] === "string" ? {} : {}),
    };
    if (!patched.sku && !patched.gtin13 && !patched.mpn) patched.sku = "REPLACE: your SKU";
  }
  return {
    kind: "jsonld",
    label: `${type} markup, completed`,
    target: p.url,
    before: existing ? JSON.stringify(existing, null, 2) : null,
    after: `<script type="application/ld+json">\n${JSON.stringify(patched, null, 2)}\n</script>`,
    applyVia: "Replace the existing JSON-LD block on the page",
    risk: "low",
    reversible: true,
    instructions: "Fill the placeholders from the live page data, ideally from the template variables rather than by hand.",
  };
}

function suggestValue(key: string, p: CrawledPage, ctx: FixContext): unknown {
  const s = p.signals;
  switch (key) {
    case "name": case "headline": case "title": return s?.h1[0] ?? s?.title ?? topicOf(p, ctx);
    case "image": case "thumbnailUrl": return s?.images[0]?.src ?? "REPLACE: image URL";
    case "datePublished": case "uploadDate": case "datePosted": return s?.publishedAt ?? new Date().toISOString().slice(0, 10);
    case "description": return clamp(s?.metaDescription ?? s?.paragraphs[0] ?? "", 200);
    case "url": return p.finalUrl;
    case "author": return { "@type": "Person", name: s?.author ?? "REPLACE: author name" };
    case "provider": case "hiringOrganization": return { "@type": "Organization", name: ctx.brand };
    case "address": return { "@type": "PostalAddress", streetAddress: "REPLACE", addressLocality: ctx.options.locations?.[0] ?? "REPLACE", postalCode: "REPLACE", addressCountry: "REPLACE" };
    default: return `REPLACE: ${key}`;
  }
}

function guessPageType(p: CrawledPage): string {
  const url = p.url.toLowerCase();
  if (/\/(blog|article|news|post|guide|insight)/.test(url)) return "BlogPosting";
  if (/\/(product|shop|item|p)\//.test(url)) return "Product";
  if (/\/(service|services)/.test(url)) return "Service";
  if (/\/(about|team|company)/.test(url)) return "AboutPage";
  if (/\/(contact)/.test(url)) return "ContactPage";
  if (p.depth === 0) return "WebSite";
  return "WebPage";
}

function socialProfiles(ctx: FixContext): string[] {
  const found = new Set<string>();
  for (const p of ctx.report.pages) {
    for (const link of p.signals?.links ?? []) {
      if (/(facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok|pinterest|yelp|trustpilot|g\.page|maps\.google)/i.test(link.href)) {
        found.add(link.href.split("?")[0]);
      }
    }
  }
  return [...found].slice(0, 10);
}

function guessPhone(ctx: FixContext): string | null {
  for (const p of ctx.report.pages) {
    const match = /(\+?\d[\d ().-]{8,}\d)/.exec(p.signals?.text ?? "");
    if (match) return match[1].trim();
  }
  return null;
}

/* --------------------------------------------------------------- files */

function sitemapFix(ctx: FixContext): Fix {
  const urls = ctx.report.pages
    .filter((p) => p.status >= 200 && p.status < 300 && !/\bnoindex\b/i.test(p.signals?.robotsMeta ?? ""))
    .map((p) => p.finalUrl);
  const entries = [...new Set(urls)].sort();
  const today = new Date().toISOString().slice(0, 10);
  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries.map((u) => `  <url>\n    <loc>${escapeHtml(u)}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`),
    `</urlset>`,
  ].join("\n");

  return {
    kind: "file",
    label: "sitemap.xml",
    target: `${ctx.report.baseUrl.replace(/\/$/, "")}/sitemap.xml`,
    before: null,
    after: body,
    applyVia: "Upload to the site root, then add a Sitemap line to robots.txt",
    risk: "low",
    reversible: true,
    instructions: `Built from the ${entries.length} indexable URLs this crawl reached. If the site is larger than the crawl, generate it from the CMS instead and use this as the shape to check against.`,
  };
}

function cleanSitemapFix(finding: Finding, ctx: FixContext): Fix {
  const bad = finding.affectedUrls;
  return {
    kind: "file",
    label: "URLs to remove from the sitemap",
    target: ctx.report.files.sitemapUrls[0] ?? "sitemap.xml",
    before: bad.slice(0, 50).join("\n"),
    after: bad.slice(0, 200).map((u) => `# remove: ${u}`).join("\n"),
    applyVia: "The sitemap generator's settings, or the file itself",
    risk: "low",
    reversible: true,
    instructions: "A sitemap should list only URLs that return 200 and are indexable. Most CMS sitemap plugins have a setting for this; fix it there rather than by hand.",
  };
}

const AI_ALLOW_BLOCK = `# Answer engines. Allowing these is how the site appears in AI answers.
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /`;

function robotsFix(ctx: FixContext, aiOnly: boolean): Fix {
  const existing = ctx.report.files.robotsTxt;
  const sitemapLine = `Sitemap: ${ctx.report.baseUrl.replace(/\/$/, "")}/sitemap.xml`;
  const body = existing
    ? `${existing.trimEnd()}\n\n${AI_ALLOW_BLOCK}\n\n${existing.includes("Sitemap:") ? "" : sitemapLine}`.trimEnd()
    : `User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /checkout\nDisallow: /search\nDisallow: /*?*sort=\n\n${AI_ALLOW_BLOCK}\n\n${sitemapLine}\n`;

  return {
    kind: "file",
    label: "robots.txt",
    target: `${ctx.report.baseUrl.replace(/\/$/, "")}/robots.txt`,
    before: existing,
    after: body,
    applyVia: "Replace the file at the site root",
    risk: "high",
    reversible: true,
    instructions: aiOnly
      ? "This allows the answer engines currently disallowed. It is a business decision, not only a technical one: allowing them is how you get cited, and the trade is that your content is used to answer questions without a click. Read the change before approving it."
      : "A robots.txt that is wrong can deindex a site, so read every line before it ships. Nothing here disallows a path the crawl found content on.",
  };
}

function llmsFix(ctx: FixContext): Fix {
  const pages = ctx.report.pages
    .filter((p) => p.signals && p.status < 400 && p.signals.wordCount > 150)
    .sort((a, b) => (a.depth - b.depth) || (b.signals!.wordCount - a.signals!.wordCount))
    .slice(0, 40);

  const groups = new Map<string, CrawledPage[]>();
  for (const p of pages) {
    const segment = new URL(p.finalUrl).pathname.split("/").filter(Boolean)[0] ?? "Overview";
    const key = titleCase(segment.replace(/[-_]+/g, " "));
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }

  const home = ctx.report.pages.find((p) => p.depth === 0);
  const lines = [
    `# ${ctx.brand}`,
    "",
    `> ${clamp(home?.signals?.metaDescription ?? home?.signals?.paragraphs[0] ?? `${ctx.brand} on the web.`, 240)}`,
    "",
  ];
  for (const [group, items] of groups) {
    lines.push(`## ${group}`, "");
    for (const item of items.slice(0, 12)) {
      const summary = clamp(item.signals?.metaDescription ?? item.signals?.paragraphs[0] ?? "", 120);
      lines.push(`- [${item.signals?.h1[0] ?? item.signals?.title ?? item.finalUrl}](${item.finalUrl})${summary ? `: ${summary}` : ""}`);
    }
    lines.push("");
  }

  return {
    kind: "file",
    label: "llms.txt",
    target: `${ctx.report.baseUrl.replace(/\/$/, "")}/llms.txt`,
    before: ctx.report.files.llmsTxt,
    after: lines.join("\n"),
    applyVia: "Upload to the site root as /llms.txt",
    risk: "low",
    reversible: true,
    instructions: "A curated map of the site for answer engines. Built from the pages this crawl reached; trim anything you would not want quoted.",
  };
}

/* -------------------------------------------------------------- content */

function altFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const missing = p.signals.images.filter((i) => i.alt == null).slice(0, 25);
  const topic = topicOf(p, ctx);
  const rows = missing.map((image) => {
    const name = decodeURIComponent(new URL(image.src, p.finalUrl).pathname.split("/").pop() ?? "")
      .replace(/\.\w+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\d{3,}\b/g, "")
      .trim();
    const described = name && name.split(" ").length >= 2 ? titleCase(name) : `${topic}`;
    return `${image.src}\n  alt="${clamp(described, 110)}"`;
  });

  return {
    kind: "copy",
    label: `Alt text for ${missing.length} images`,
    target: p.url,
    before: missing.map((i) => `${i.src}\n  alt=(none)`).join("\n\n"),
    after: rows.join("\n\n"),
    applyVia: "The media library, or the image tags in the template",
    risk: "low",
    reversible: true,
    instructions: "These are derived from the filenames and the page topic. Read each one: alt text that does not describe the image is worse than none, and a purely decorative image should have alt=\"\".",
  };
}

function answerFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const question = p.signals.h1[0] ?? p.signals.title ?? topicOf(p, ctx);
  const body = sentences(p.signals.paragraphs.join(" "));
  const facts = body.filter((s) => /\d/.test(s)).slice(0, 2);
  const draft = [
    `${question.replace(/\?$/, "")} ${answerVerb(question)} ${clamp(body[0] ?? "REPLACE: the answer, stated plainly", 160)}`,
    facts[0] ? clamp(facts[0], 180) : "",
    `REPLACE: one sentence naming the specific number, date or condition that makes this answer verifiable.`,
  ].filter(Boolean).join(" ");

  return {
    kind: "copy",
    label: "Direct answer block",
    target: p.url,
    before: clamp(p.signals.paragraphs[0] ?? "", 300),
    after: draft,
    applyVia: "Insert directly under the H1, before the rest of the copy",
    risk: "medium",
    reversible: true,
    instructions: "Answer engines lift the passage that states the answer plainly and early. Two to three sentences, the specific number in the first one, then the detail as it is now.",
  };
}

function answerVerb(question: string): string {
  if (/^how much|^what does .* cost/i.test(question)) return "typically costs";
  if (/^how long/i.test(question)) return "usually takes";
  if (/^what is|^what are/i.test(question)) return "is";
  if (/^how (do|to)/i.test(question)) return "is done by";
  return "means";
}

function headingFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const before: string[] = [];
  const after: string[] = [];
  let previous = 0;
  let seenH1 = false;
  for (const heading of p.signals.headings) {
    before.push(`${"  ".repeat(heading.level - 1)}H${heading.level} ${heading.text}`);
    let level = heading.level;
    if (level === 1) {
      if (seenH1) level = 2;
      seenH1 = true;
    } else if (previous && level > previous + 1) {
      level = previous + 1;
    }
    after.push(`${"  ".repeat(level - 1)}H${level} ${heading.text}`);
    previous = level;
  }
  return {
    kind: "html",
    label: "Heading outline",
    target: p.url,
    before: before.join("\n"),
    after: after.join("\n"),
    applyVia: "Change the heading tags in the content; the visible styling can stay as it is",
    risk: "low",
    reversible: true,
    instructions: "Only the tag levels change. If a heading looks wrong at its new level, style it rather than changing the tag back.",
  };
}

function headingRewriteFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const generic = p.signals.headings.filter((h) => h.level > 1 && /^(overview|introduction|more|details|about|info|section|content|welcome)$/i.test(h.text));
  const topic = topicOf(p, ctx);
  const rows = generic.map((h) => `H${h.level} ${h.text}\n  -> H${h.level} ${suggestHeading(h.text, topic)}`);
  return {
    kind: "copy",
    label: "Headings that say what the section covers",
    target: p.url,
    before: generic.map((h) => `H${h.level} ${h.text}`).join("\n"),
    after: rows.join("\n\n"),
    applyVia: "Edit the headings in the page content",
    risk: "low",
    reversible: true,
    instructions: "A heading is the label an answer engine uses to decide what a passage is about. Name the thing.",
  };
}

function suggestHeading(current: string, topic: string): string {
  const map: Record<string, string> = {
    overview: `What ${topic} covers`,
    introduction: `What ${topic} is`,
    details: `How ${topic} works`,
    about: `About ${topic}`,
    more: `More on ${topic}`,
    info: `${titleCase(topic)} in detail`,
    section: `${titleCase(topic)}`,
    content: `${titleCase(topic)}`,
    welcome: `${titleCase(topic)}`,
  };
  return map[current.toLowerCase()] ?? `${titleCase(topic)}: ${current}`;
}

/* ---------------------------------------------------------------- links */

function linkPlanFix(finding: Finding, ctx: FixContext): Fix | null {
  const targets = finding.url ? [finding.url] : finding.affectedUrls.slice(0, 20);
  if (!targets.length) return null;

  const candidates = ctx.report.pages.filter(
    (p) => p.signals && p.status < 300 && p.depth <= 2 && p.signals.wordCount > 200,
  );

  const rows: string[] = [];
  for (const target of targets) {
    const targetPage = ctx.pages.get(target);
    if (!targetPage?.signals) continue;
    const topic = topicOf(targetPage, ctx);
    const scored = candidates
      .filter((c) => c.url !== target && !c.signals!.links.some((l) => l.href === target))
      .map((c) => ({
        page: c,
        score: relevance(c.signals!.text, `${topic} ${targetPage.signals!.text.slice(0, 1500)}`),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    rows.push(
      `TO: ${target}\n` +
        scored
          .map((s) => `  FROM: ${s.page.url}\n    anchor: "${clamp(topic, 60)}"\n    place it in the paragraph that already mentions ${clamp(sharedTerm(s.page.signals!.text, topic) ?? topic, 40)}`)
          .join("\n"),
    );
  }

  return {
    kind: "link_plan",
    label: `Internal links for ${targets.length} page${targets.length === 1 ? "" : "s"}`,
    target: targets[0],
    before: null,
    after: rows.join("\n\n"),
    applyVia: "Edit the source pages and add the link in the body copy",
    risk: "low",
    reversible: true,
    instructions: "Links in body copy carry more weight than links in a navigation block. Use the anchor text given, or something equally descriptive, and never repeat the same anchor site-wide.",
  };
}

function relevance(source: string, target: string): number {
  const targetTokens = new Set(tokenise(target).slice(0, 120));
  const sourceTokens = tokenise(source).slice(0, 600);
  let shared = 0;
  for (const token of sourceTokens) if (targetTokens.has(token)) shared++;
  return shared / Math.max(sourceTokens.length, 1);
}

function sharedTerm(source: string, topic: string): string | null {
  const topicTokens = new Set(tokenise(topic));
  const found = topTerms(source, 30).find((t) => topicTokens.has(t.term));
  return found?.term ?? null;
}

function repointFix(finding: Finding, ctx: FixContext): Fix | null {
  const broken = finding.url;
  if (!broken) return null;
  const sources = (finding.evidence.linked_from as string[]) ?? [];
  const alive = ctx.report.pages.filter((p) => p.status >= 200 && p.status < 300 && p.signals);
  const brokenSlug = new URL(broken).pathname.split("/").filter(Boolean).pop() ?? "";
  const best = alive
    .map((p) => ({ page: p, score: similarity(new URL(p.finalUrl).pathname, brokenSlug) }))
    .sort((a, b) => b.score - a.score)[0];

  return {
    kind: "redirect",
    label: "Broken link, repointed",
    target: broken,
    before: sources.map((s) => `${s} -> ${broken}`).join("\n") || broken,
    after: best && best.score > 0.3
      ? `${sources.map((s) => `${s} -> ${best.page.finalUrl}`).join("\n")}\n\n# or, if the old URL should keep working:\n301 ${new URL(broken).pathname} ${new URL(best.page.finalUrl).pathname}`
      : `Remove the link, or restore the page at ${broken}`,
    applyVia: "Edit the linking pages, or add a redirect at the server or CMS",
    risk: "low",
    reversible: true,
    instructions: best && best.score > 0.3
      ? `The closest live page is ${best.page.finalUrl}. Confirm it actually replaces the missing one before repointing anything.`
      : "No live page looks like a replacement. Either restore the page or remove the links.",
  };
}

function similarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (!tokensA.size || !tokensB.size) return 0;
  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared++;
  return shared / Math.max(tokensA.size, tokensB.size);
}

function redirectFix(finding: Finding): Fix | null {
  const chain = (finding.evidence.chain as string[]) ?? [];
  if (chain.length < 2) return null;
  const first = chain[0];
  const last = chain[chain.length - 1];
  return {
    kind: "redirect",
    label: "Redirect chain, flattened",
    target: first,
    before: chain.join("\n  -> "),
    after: `${first}\n  -> ${last}`,
    applyVia: "The redirect rules at the server, CDN or CMS",
    risk: "medium",
    reversible: true,
    instructions: "Point the first URL straight at the last. Leave the intermediate rules in place: something else may still link to them.",
  };
}

/* -------------------------------------------------------------- images */

function imageDimensionFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const images = p.signals.images.filter((i) => !i.width || !i.height).slice(0, 20);
  return {
    kind: "html",
    label: "Image dimensions",
    target: p.url,
    before: images.map((i) => `<img src="${i.src}">`).join("\n"),
    after: images.map((i) => `<img src="${i.src}" width="REPLACE" height="REPLACE" alt="${escapeHtml(i.alt ?? "")}">`).join("\n"),
    applyVia: "The template that renders these images",
    risk: "low",
    reversible: true,
    instructions: "Use the image's intrinsic pixel dimensions, not the CSS size. Most CMSes know them already; render them from the media record rather than typing them.",
  };
}

function imageLoadingFix(finding: Finding, ctx: FixContext): Fix | null {
  const p = page(finding, ctx);
  if (!p?.signals) return null;
  const images = p.signals.images.slice(3).filter((i) => i.loading !== "lazy").slice(0, 20);
  return {
    kind: "html",
    label: "Lazy loading below the fold",
    target: p.url,
    before: images.map((i) => `<img src="${i.src}">`).join("\n"),
    after: images.map((i) => `<img src="${i.src}" loading="lazy" decoding="async">`).join("\n"),
    applyVia: "The image template",
    risk: "low",
    reversible: true,
    instructions: "Never put loading=lazy on the hero image: it delays the Largest Contentful Paint it was meant to protect.",
  };
}

/* ---------------------------------------------------------- compliance */

function disclosureFix(finding: Finding): Fix {
  return {
    kind: "copy",
    label: "Affiliate disclosure",
    target: finding.url,
    before: null,
    after: "Some links on this page are affiliate links. If you buy through one, we may earn a commission at no extra cost to you. It does not change what we recommend.",
    applyVia: "Insert above the first affiliate link, visible without scrolling",
    risk: "low",
    reversible: true,
    instructions: "Placement matters more than wording: it has to be visible before the reader reaches the first link.",
  };
}

function napFix(ctx: FixContext): Fix {
  const phone = guessPhone(ctx);
  return {
    kind: "html",
    label: "Contact block for the footer",
    target: ctx.report.baseUrl,
    before: null,
    after: `<address itemscope itemtype="https://schema.org/LocalBusiness">
  <span itemprop="name">${escapeHtml(ctx.brand)}</span><br>
  <span itemprop="streetAddress">REPLACE: street</span><br>
  <span itemprop="addressLocality">${escapeHtml(ctx.options.locations?.[0] ?? "REPLACE: city")}</span>
  <span itemprop="postalCode">REPLACE: postcode</span><br>
  <a href="tel:${escapeHtml((phone ?? "").replace(/[^\d+]/g, ""))}" itemprop="telephone">${escapeHtml(phone ?? "REPLACE: phone")}</a>
</address>`,
    applyVia: "The site footer, on every page",
    risk: "low",
    reversible: true,
    instructions: "The exact same string has to appear on the Business Profile and every directory listing. Pick one format now and keep it.",
  };
}

function locationPageFix(finding: Finding, ctx: FixContext): Fix {
  const location = (finding.evidence.location as string) ?? ctx.options.locations?.[0] ?? "the city";
  const service = ctx.options.industry ?? ctx.brand;
  const slug = slugify(`${service} ${location}`);
  return {
    kind: "copy",
    label: `Location page brief: ${location}`,
    target: `${ctx.report.baseUrl.replace(/\/$/, "")}/${slug}`,
    before: null,
    after: [
      `# ${titleCase(service)} in ${location}`,
      "",
      `Direct answer (2 to 3 sentences): what you do in ${location}, where you are, and how quickly someone can be seen.`,
      "",
      `## What we do in ${location}`,
      "Specific to this location. Not the national copy with the place name swapped in: that is the mistake that keeps location pages out of the map pack.",
      "",
      `## Getting here`,
      `Address, parking, nearest transport, an embedded map.`,
      "",
      `## Who we have helped in ${location}`,
      "Two or three named local examples, with results.",
      "",
      `## ${titleCase(service)} in ${location}: questions we get asked`,
      "Four to six questions, each answered in under 60 words.",
      "",
      "Schema: LocalBusiness with this location's address, geo and hours. Link the Business Profile to this URL, not the homepage.",
    ].join("\n"),
    applyVia: "Publish as a new page and link it from the locations hub",
    risk: "medium",
    reversible: true,
    instructions: "This is the brief, not the copy. The content engine can draft against it once you approve the brief.",
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}
