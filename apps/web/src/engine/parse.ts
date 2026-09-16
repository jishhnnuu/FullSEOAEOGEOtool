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

/**
 * The page with its chrome removed.
 *
 * Navigation, headers, footers and dialogs repeat on every page, and counting
 * them is how a keyword model ends up reporting the menu back to you. Worse,
 * plenty of real sites mark their navigation dropdown labels as `<h2>`, so a
 * heading extractor that reads the whole document treats "Who we help" as a
 * section heading and, if it ends in a question mark, as a question the page
 * answers.
 *
 * Two passes. If the page marks its main region, trust it. Otherwise cut the
 * known chrome elements out and keep what is left. Either way the result is
 * only used for text, headings and questions; links and images are still read
 * from the whole document, because an orphan check has to see every link on
 * the page including the ones in the footer.
 */
const CHROME_BLOCKS = /<(nav|header|footer|aside|dialog|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
const ROLE_CHROME = /<(div|section|ul)\b[^>]*\brole\s*=\s*["']?(navigation|banner|contentinfo|menu|menubar|dialog)["']?[^>]*>[\s\S]*?<\/\1>/gi;

export function mainRegion(body: string): { html: string; usedMain: boolean } {
  // `<main>` is unambiguous, and so is the ARIA equivalent. Take the largest
  // when a page has more than one, because a hidden empty one is common.
  const candidates: string[] = [];
  const mainRe = /<main\b[^>]*>([\s\S]*?)<\/main>/gi;
  let m: RegExpExecArray | null;
  while ((m = mainRe.exec(body))) candidates.push(m[1]);
  const roleRe = /<(div|section)\b[^>]*\brole\s*=\s*["']?main["']?[^>]*>([\s\S]*?)<\/\1>/gi;
  while ((m = roleRe.exec(body))) candidates.push(m[2]);

  const best = candidates.sort((a, b) => b.length - a.length)[0];
  // A `<main>` holding almost nothing is a wrapper the framework emitted, not
  // the content, so fall through rather than reporting an empty page.
  if (best && best.length > 500) return { html: best, usedMain: true };

  return { html: body.replace(CHROME_BLOCKS, " ").replace(ROLE_CHROME, " "), usedMain: false };
}

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

  /* ---- content region ---- */
  // Everything that models what the page is *about* reads from here. Links
  // and images still read from the whole document, because an orphan check
  // has to see the footer.
  const { html: contentHtml, usedMain } = mainRegion(body);

  /* ---- headings ---- */
  // Read from the content region so navigation dropdown labels, which plenty
  // of sites mark up as <h2>, are not mistaken for section headings or, worse,
  // for questions the page answers.
  const headings: { level: number; text: string }[] = [];
  const headingRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(contentHtml))) {
    const text = stripTags(hm[2]);
    if (text) headings.push({ level: Number(hm[1]), text });
  }
  // An h1 inside a header element is still the page's h1, so that one is read
  // from the whole document when the content region yields none.
  let h1 = headings.filter((h) => h.level === 1).map((h) => h.text);
  if (h1.length === 0) {
    const wholeH1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
    let w: RegExpExecArray | null;
    while ((w = wholeH1.exec(body))) {
      const text = stripTags(w[1]);
      if (text) h1.push(text);
    }
  }

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
  const textSource = contentHtml.replace(VOID_TEXT_TAGS, " ");
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

  // Schema first, headings second. A page that declares its questions in
  // FAQPage markup has told us the answer outright.
  const faqPairs = faqPairsFrom(jsonLd);
  const fromHeadings = headings
    .filter((h) => h.text.includes("?") || QUESTION_START.test(h.text))
    .map((h) => h.text);
  const asked = new Set(faqPairs.map((p) => p.question.toLowerCase()));
  const questionHeadings = [
    ...faqPairs.map((p) => p.question),
    ...fromHeadings.filter((h) => !asked.has(h.toLowerCase())),
  ];

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
    faqPairs,
    contentRegionFound: usedMain,
    hasFaqBlock: jsonLdHasType(jsonLd, "FAQPage") || jsonLdHasType(jsonLd, "QAPage") || faqPairs.length >= 2 || questionHeadings.length >= 3,
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

/**
 * The questions a page already answers, read from its own markup.
 *
 * An earlier version of this inferred questions from headings alone, which on
 * one real site found a single navigation label and missed twenty-six genuine
 * question-and-answer pairs sitting in live FAQPage schema on the same pages.
 * Recommending FAQ markup to a site that already has it is the fastest way to
 * lose a reader's trust, so the schema is read first and the headings second.
 */
export function faqPairsFrom(blocks: unknown[]): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  const seen = new Set<string>();

  const takeAnswer = (value: unknown): string => {
    if (typeof value === "string") return stripTags(value);
    if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      const text = node.text ?? node.answerText ?? node.name;
      if (typeof text === "string") return stripTags(text);
    }
    return "";
  };

  for (const node of jsonLdNodes(blocks)) {
    const type = String(node["@type"] ?? "").toLowerCase();
    const isQuestion = type === "question";
    const entities = node.mainEntity;
    const list: unknown[] = isQuestion ? [node] : Array.isArray(entities) ? entities : entities ? [entities] : [];

    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const q = entry as Record<string, unknown>;
      if (String(q["@type"] ?? "").toLowerCase() !== "question") continue;
      const question = typeof q.name === "string" ? stripTags(q.name) : "";
      if (!question) continue;
      const key = question.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ question, answer: takeAnswer(q.acceptedAnswer ?? q.suggestedAnswer) });
    }
  }
  return out;
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
