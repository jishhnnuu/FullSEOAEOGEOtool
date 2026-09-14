/**
 * HTML parsing without a parser library.
 *
 * The Worker runtime has no DOM and a real parser would be a large dependency
 * for a job that is mostly attribute extraction. This reads the document with
 * scoped regular expressions, strips the elements whose text is not content,
 * and produces the signal set the checks consume. It is tolerant of malformed
 * markup on purpose: a broken page still has to be measurable.
 */

import type { ImageRef, LinkRef, PageSignals } from "./types";

const VOID_TEXT_TAGS = /<(script|style|noscript|svg|template|iframe|canvas)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;

/** Read one attribute off a tag string, single or double quoted or bare. */
export function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(tag);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-",
  mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"',
  eacute: "e", egrave: "e", uuml: "u", ouml: "o", auml: "a", copy: "(c)",
  reg: "(r)", trade: "(tm)", pound: "£", euro: "€", deg: "°", times: "x",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function allTags(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  return html.match(re) ?? [];
}

/** Absolute URL, or null when the href is not something a crawler follows. */
export function absolute(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^(mailto:|tel:|javascript:|data:|sms:|#)/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

const ANALYTICS_SIGNATURES: [RegExp, string][] = [
  [/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i, "Google Tag Manager"],
  [/gtag\(|googletagmanager\.com\/gtag\/js|G-[A-Z0-9]{8,}/i, "Google Analytics 4"],
  [/google-analytics\.com\/analytics\.js|UA-\d{4,}-\d+/i, "Universal Analytics"],
  [/plausible\.io\/js/i, "Plausible"],
  [/cdn\.usefathom\.com/i, "Fathom"],
  [/matomo\.js|piwik\.js/i, "Matomo"],
  [/cdn\.segment\.com/i, "Segment"],
  [/static\.hotjar\.com/i, "Hotjar"],
  [/clarity\.ms/i, "Microsoft Clarity"],
  [/js\.hs-scripts\.com/i, "HubSpot"],
  [/connect\.facebook\.net.*fbevents/i, "Meta Pixel"],
  [/posthog/i, "PostHog"],
  [/cloudflareinsights\.com/i, "Cloudflare Web Analytics"],
  [/vercel\.live\/_next-live|\/_vercel\/insights/i, "Vercel Analytics"],
];

const CMS_SIGNATURES: [RegExp, string][] = [
  [/wp-content|wp-includes|wp-json/i, "WordPress"],
  [/cdn\.shopify\.com|Shopify\.theme/i, "Shopify"],
  [/static\.parastorage\.com|wix\.com|X-Wix/i, "Wix"],
  [/squarespace|static1\.squarespace\.com/i, "Squarespace"],
  [/assets\.website-files\.com|webflow\.com|data-wf-page/i, "Webflow"],
  [/ghost\.io|content\/images\/size/i, "Ghost"],
  [/\/sites\/default\/files|drupal-settings-json/i, "Drupal"],
  [/\/media\/jui\/|joomla/i, "Joomla"],
  [/hs-sites\.com|hubspot/i, "HubSpot CMS"],
  [/\/_next\/static\//i, "Next.js"],
  [/\/_nuxt\//i, "Nuxt"],
  [/gatsby-/i, "Gatsby"],
  [/bigcommerce/i, "BigCommerce"],
  [/magento|mage\/|static\/version/i, "Magento"],
  [/framerusercontent\.com/i, "Framer"],
  [/cdn\.durable\.co|carrd\.co/i, "Site builder"],
];

const CTA_WORDS = /\b(book|buy|start|get started|contact|call|request|quote|sign up|subscribe|download|schedule|enquire|inquire|apply|order|shop|try|demo|free trial|add to (cart|basket))\b/i;

const QUESTION_START = /^(what|why|how|when|where|who|which|can|do|does|is|are|should|will|would|has|have)\b/i;

/**
 * Pull every signal a check might want out of one document.
 *
 * `baseUrl` is the URL the bytes were served from, after redirects, so
 * relative links resolve against the right place.
 */
export function parseHtml(html: string, baseUrl: string): PageSignals {
  const withoutComments = html.replace(COMMENTS, " ");

  // The head is small and self-contained; matching inside it avoids picking up
  // a <title> that a JavaScript template happens to contain further down.
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(withoutComments);
  const head = headMatch ? headMatch[1] : withoutComments.slice(0, 40000);
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(withoutComments);
  const body = bodyMatch ? bodyMatch[1] : withoutComments;

  // <base href> changes what every relative URL on the page resolves against.
  const baseTag = allTags(head, "base")[0];
  const declaredBase = baseTag ? attr(baseTag, "href") : null;
  const resolveAgainst = declaredBase ? (absolute(declaredBase, baseUrl) ?? baseUrl) : baseUrl;

  /* ---- head metadata ---- */
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const title = titleMatch ? stripTags(titleMatch[1]) || null : null;

  const metas = allTags(withoutComments, "meta");
  const named = new Map<string, string>();
  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  let charset: string | null = null;

  for (const tag of metas) {
    if (/\bcharset\s*=/i.test(tag) && !/\bname\s*=/i.test(tag)) {
      charset = attr(tag, "charset");
      continue;
    }
    const content = attr(tag, "content");
    if (content == null) continue;
    const key = (attr(tag, "name") ?? attr(tag, "property") ?? attr(tag, "itemprop") ?? "").toLowerCase();
    if (!key) continue;
    if (key.startsWith("og:")) openGraph[key] = content;
    else if (key.startsWith("twitter:")) twitter[key] = content;
    else if (!named.has(key)) named.set(key, content);
  }

  const links = allTags(head, "link");
  let canonical: string | null = null;
  const hreflang: { lang: string; href: string }[] = [];
  const stylesheets: string[] = [];
  for (const tag of links) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href) continue;
    if (rel.includes("canonical") && !canonical) canonical = absolute(href, resolveAgainst) ?? href;
    if (rel.includes("alternate")) {
      const lang = attr(tag, "hreflang");
      if (lang) hreflang.push({ lang, href: absolute(href, resolveAgainst) ?? href });
    }
    if (rel.includes("stylesheet")) stylesheets.push(absolute(href, resolveAgainst) ?? href);
  }

  const htmlTag = /<html\b[^>]*>/i.exec(withoutComments)?.[0] ?? "";
  const lang = htmlTag ? attr(htmlTag, "lang") : null;

  /* ---- scripts ---- */
  const scripts: string[] = [];
  let inlineScriptBytes = 0;
  const jsonLd: unknown[] = [];
  const jsonLdErrors: string[] = [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = scriptRe.exec(withoutComments))) {
    const attrs = sm[1];
    const src = attr(`<script ${attrs}>`, "src");
    const type = (attr(`<script ${attrs}>`, "type") ?? "").toLowerCase();
    if (src) {
      scripts.push(absolute(src, resolveAgainst) ?? src);
      continue;
    }
    if (type === "application/ld+json") {
      const raw = sm[2].trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) jsonLd.push(...parsed);
        else jsonLd.push(parsed);
      } catch (err) {
        jsonLdErrors.push(err instanceof Error ? err.message : "unparseable JSON-LD");
      }
      continue;
    }
    inlineScriptBytes += sm[2].length;
  }

  /* ---- headings ---- */
  const headings: { level: number; text: string }[] = [];
  const headingRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(body))) {
    const text = stripTags(hm[2]);
    if (text) headings.push({ level: Number(hm[1]), text });
  }
  const h1 = headings.filter((h) => h.level === 1).map((h) => h.text);

  /* ---- images ---- */
  const images: ImageRef[] = allTags(body, "img").map((tag) => ({
    src: absolute(attr(tag, "src") ?? attr(tag, "data-src") ?? "", resolveAgainst)
      ?? attr(tag, "src") ?? "",
    alt: attr(tag, "alt"),
    width: attr(tag, "width"),
    height: attr(tag, "height"),
    loading: attr(tag, "loading"),
  })).filter((i) => i.src);

  /* ---- links ---- */
  const outLinks: LinkRef[] = [];
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let am: RegExpExecArray | null;
  const host = safeHost(resolveAgainst);
  while ((am = anchorRe.exec(body))) {
    const tag = `<a ${am[1]}>`;
    const raw = attr(tag, "href");
    if (!raw) continue;
    const href = absolute(raw, resolveAgainst);
    if (!href) continue;
    outLinks.push({
      href,
      text: stripTags(am[2]).slice(0, 200),
      rel: (attr(tag, "rel") ?? "").toLowerCase(),
      internal: safeHost(href) === host,
    });
  }

  /* ---- visible text ---- */
  const textSource = body.replace(VOID_TEXT_TAGS, " ");
  const paragraphs: string[] = [];
  const paraRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(textSource))) {
    const text = stripTags(pm[1]);
    if (text.length > 20) paragraphs.push(text);
  }
  const text = stripTags(textSource);
  const words = text ? text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)) : [];

  /* ---- microdata and schema types ---- */
  const microdataTypes = (withoutComments.match(/itemtype\s*=\s*["']?https?:\/\/schema\.org\/([A-Za-z]+)/gi) ?? [])
    .map((m) => m.split("/").pop() ?? "")
    .filter(Boolean);

  /* ---- fingerprints ---- */
  const analytics = ANALYTICS_SIGNATURES
    .filter(([re]) => re.test(withoutComments))
    .map(([, name]) => name);
  const cms = CMS_SIGNATURES.find(([re]) => re.test(withoutComments))?.[1] ?? null;

  /* ---- dates and author ---- */
  const timeTag = /<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i.exec(body)?.[1] ?? null;
  const publishedAt =
    named.get("article:published_time") ??
    openGraph["og:article:published_time"] ??
    jsonLdString(jsonLd, "datePublished") ??
    timeTag;
  const modifiedAt =
    named.get("article:modified_time") ??
    jsonLdString(jsonLd, "dateModified") ??
    null;
  const author =
    named.get("author") ??
    jsonLdAuthor(jsonLd) ??
    (/\b(by|written by|author)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/.exec(text)?.[2] ?? null);

  const questionHeadings = headings.filter((h) => h.text.includes("?") || QUESTION_START.test(h.text))
    .map((h) => h.text);

  const numbers = (text.match(/\b\d[\d,.]*\s?(%|percent|million|billion|k\b|years?|months?|days?|hours?|minutes?)/gi) ?? []).length;
  const externalCitations = outLinks.filter((l) => !l.internal && !/nofollow|sponsored|ugc/.test(l.rel)).length;
  const ctaCount = outLinks.filter((l) => CTA_WORDS.test(l.text)).length
    + (body.match(/<button\b[^>]*>[\s\S]{0,80}?<\/button>/gi) ?? []).filter((b) => CTA_WORDS.test(stripTags(b))).length;

  return {
    title,
    metaDescription: named.get("description") ?? null,
    canonical,
    robotsMeta: named.get("robots") ?? named.get("googlebot") ?? null,
    viewport: named.has("viewport"),
    lang: lang || null,
    charset,
    h1,
    headings,
    images,
    links: outLinks,
    jsonLd,
    jsonLdErrors,
    microdataTypes: [...new Set(microdataTypes)],
    hreflang,
    openGraph,
    twitter,
    scripts,
    inlineScriptBytes,
    stylesheets,
    text: text.slice(0, 200000),
    wordCount: words.length,
    lede: words.slice(0, 60).join(" "),
    paragraphs: paragraphs.slice(0, 200),
    lists: (body.match(/<(ul|ol)\b/gi) ?? []).length,
    tables: (body.match(/<table\b/gi) ?? []).length,
    forms: (body.match(/<form\b/gi) ?? []).length,
    publishedAt,
    modifiedAt,
    author,
    analytics,
    cms,
    questionHeadings,
    hasFaqBlock: jsonLdHasType(jsonLd, "FAQPage") || questionHeadings.length >= 3,
    numbers,
    externalCitations,
    ctaCount,
  };
}

/* ------------------------------------------------------------- JSON-LD */

export function jsonLdNodes(blocks: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (node: unknown, depth = 0) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    out.push(record);
    if (Array.isArray(record["@graph"])) walk(record["@graph"], depth + 1);
    for (const key of ["mainEntity", "itemListElement", "about", "hasPart"]) {
      if (record[key]) walk(record[key], depth + 1);
    }
  };
  walk(blocks);
  return out;
}

export function jsonLdTypes(blocks: unknown[]): string[] {
  const types = new Set<string>();
  for (const node of jsonLdNodes(blocks)) {
    const raw = node["@type"];
    if (typeof raw === "string") types.add(raw);
    else if (Array.isArray(raw)) for (const t of raw) if (typeof t === "string") types.add(t);
  }
  return [...types];
}

export function jsonLdHasType(blocks: unknown[], type: string): boolean {
  return jsonLdTypes(blocks).some((t) => t.toLowerCase() === type.toLowerCase());
}

function jsonLdString(blocks: unknown[], key: string): string | null {
  for (const node of jsonLdNodes(blocks)) {
    const value = node[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function jsonLdAuthor(blocks: unknown[]): string | null {
  for (const node of jsonLdNodes(blocks)) {
    const value = node["author"];
    if (typeof value === "string" && value) return value;
    if (value && typeof value === "object") {
      const name = (Array.isArray(value) ? value[0] : value) as Record<string, unknown>;
      if (name && typeof name["name"] === "string") return name["name"] as string;
    }
  }
  return null;
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** A stable, cheap hash of visible text, for duplicate detection. */
export function textFingerprint(text: string): string {
  const normalised = text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  // FNV-1a over the first 4000 characters: enough to separate real pages,
  // cheap enough to run on every document in the crawl.
  let hash = 0x811c9dc5;
  const sample = normalised.slice(0, 4000);
  for (let i = 0; i < sample.length; i++) {
    hash ^= sample.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16)}:${sample.length}`;
}
