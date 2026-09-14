/**
 * Server-side fetching. Runs inside the Worker, never in the browser.
 *
 * The browser cannot read a third-party site: cross-origin reads are blocked,
 * and that is the right behaviour. So fetching and parsing happen here, in
 * small batches, and the analysis happens in the browser where there is no
 * CPU budget to run out of.
 *
 * Every outbound request is checked first. A crawler that will fetch any URL
 * a user types is a server-side request forgery primitive, so the host is
 * validated against loopback, private ranges, link-local and metadata
 * addresses, and the check is repeated after every redirect.
 */

import { parseHtml, textFingerprint } from "./parse";
import { AI_CRAWLER_LIST, parseRobots, robotsAllows, type RobotsRules } from "./robots";
import type { CrawledPage, SiteFiles } from "./types";

export const USER_AGENT =
  "SEOOSBot/1.0 (+https://github.com/jishhnnuu/fullseoaeogeotool; site audit on the owner's request)";

const MAX_HTML_BYTES = 900_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

/* ------------------------------------------------------------ url safety */

const BLOCKED_HOSTS = new Set([
  "localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback",
  "metadata.google.internal", "metadata.goog", "instance-data",
]);

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa", ".onion"];

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const n = parts.map((p) => Number(p));
  if (n.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return false;
  const [a, b] = n;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||             // link-local, and AWS/GCP metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 100 && b >= 64 && b <= 127) ||   // carrier grade NAT
    a >= 224                                 // multicast and reserved
  );
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  return (
    h === "::1" || h === "::" ||
    h.startsWith("fc") || h.startsWith("fd") ||   // unique local
    h.startsWith("fe80") ||                        // link local
    h.startsWith("::ffff:")                        // IPv4-mapped
  );
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function validateUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That is not a URL we can fetch." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Only http and https are fetched, not ${url.protocol}` };
  }
  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "The URL has no host." };
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: "That host is not reachable from here." };
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "Internal hostnames are not fetched." };
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    return { ok: false, reason: "Private and loopback addresses are not fetched." };
  }
  if (url.port && !["80", "443", "8080", "8443", ""].includes(url.port)) {
    return { ok: false, reason: `Port ${url.port} is not fetched.` };
  }
  return { ok: true, url };
}

/* ---------------------------------------------------------------- fetch */

type RawFetch = {
  finalUrl: string;
  status: number;
  headers: Headers;
  body: string;
  bytes: number;
  elapsedMs: number;
  redirectChain: string[];
  error: string | null;
};

async function rawFetch(target: string, accept: string): Promise<RawFetch> {
  const started = Date.now();
  const chain: string[] = [];
  let current = target;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = validateUrl(current);
    if (!check.ok) {
      return blank(current, chain, started, check.reason);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(check.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept,
          "accept-language": "en",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const message = err instanceof Error && err.name === "AbortError"
        ? `No response within ${FETCH_TIMEOUT_MS / 1000}s`
        : err instanceof Error ? err.message : "Request failed";
      return blank(current, chain, started, message);
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return blank(current, chain, started, `HTTP ${response.status} with no Location header`);
      }
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return blank(current, chain, started, "Redirect to an unparseable URL");
      }
      if (chain.includes(next) || next === current) {
        return blank(current, chain, started, "too many redirects: the chain loops");
      }
      chain.push(current);
      current = next;
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    let body = "";
    let bytes = 0;
    if (/text\/|json|xml/i.test(contentType) || contentType === "") {
      const buffer = await response.arrayBuffer();
      bytes = buffer.byteLength;
      const slice = buffer.byteLength > MAX_HTML_BYTES ? buffer.slice(0, MAX_HTML_BYTES) : buffer;
      body = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    } else {
      bytes = Number(response.headers.get("content-length") ?? 0);
    }

    return {
      finalUrl: current,
      status: response.status,
      headers: response.headers,
      body,
      bytes,
      elapsedMs: Date.now() - started,
      redirectChain: chain,
      error: null,
    };
  }

  return blank(current, chain, started, "too many redirects");
}

function blank(url: string, chain: string[], started: number, error: string): RawFetch {
  return {
    finalUrl: url,
    status: 0,
    headers: new Headers(),
    body: "",
    bytes: 0,
    elapsedMs: Date.now() - started,
    redirectChain: chain,
    error,
  };
}

/** Fetch one page and parse it. The unit the batch endpoint repeats. */
export async function fetchPage(url: string, depth: number): Promise<CrawledPage> {
  const raw = await rawFetch(url, "text/html,application/xhtml+xml");
  const contentType = raw.headers.get("content-type") ?? "";
  const isHtml = /text\/html|application\/xhtml/i.test(contentType) ||
    (contentType === "" && /<html/i.test(raw.body));

  // An X-Robots-Tag header is as binding as the meta tag and is missed by
  // every tool that only reads the HTML.
  const xRobots = raw.headers.get("x-robots-tag");

  let signals = null;
  if (raw.status >= 200 && raw.status < 400 && isHtml && raw.body) {
    signals = parseHtml(raw.body, raw.finalUrl);
    if (xRobots) {
      signals.robotsMeta = signals.robotsMeta
        ? `${signals.robotsMeta}, ${xRobots} (header)`
        : `${xRobots} (header)`;
    }
  }

  return {
    url,
    finalUrl: raw.finalUrl,
    status: raw.status,
    depth,
    contentType,
    bytes: raw.bytes,
    elapsedMs: raw.elapsedMs,
    redirectChain: raw.redirectChain,
    error: raw.error,
    signals,
    inlinks: [],
    textHash: signals ? textFingerprint(signals.text) : null,
  };
}

/* ----------------------------------------------------------- site files */

/** robots.txt, the sitemaps it names, llms.txt and the AI crawler verdict. */
export async function fetchSiteFiles(origin: string): Promise<{ files: SiteFiles; rules: RobotsRules; sitemapEntries: string[] }> {
  const robots = await rawFetch(new URL("/robots.txt", origin).toString(), "text/plain");
  const robotsTxt = robots.status === 200 && robots.body ? robots.body : null;
  const rules = parseRobots(robotsTxt ?? "");

  const blockedAiCrawlers: string[] = [];
  const allowedAiCrawlers: string[] = [];
  for (const { agent } of AI_CRAWLER_LIST) {
    (robotsAllows(rules, agent, "/") ? allowedAiCrawlers : blockedAiCrawlers).push(agent);
  }

  const candidates = new Set<string>(rules.sitemaps);
  if (candidates.size === 0) {
    for (const path of ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/wp-sitemap.xml", "/sitemap/sitemap.xml"]) {
      candidates.add(new URL(path, origin).toString());
    }
  }

  const sitemapUrls: string[] = [];
  const entries = new Set<string>();
  let checked = 0;
  for (const candidate of candidates) {
    if (checked >= 4 || entries.size > 2000) break;
    checked++;
    const res = await rawFetch(candidate, "application/xml,text/xml");
    if (res.status !== 200 || !res.body) continue;
    sitemapUrls.push(candidate);
    const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    const isIndex = /<sitemapindex/i.test(res.body);
    if (isIndex) {
      // One level of nesting is enough to find the URL set without turning a
      // discovery step into a second crawl.
      for (const child of locs.slice(0, 3)) {
        const nested = await rawFetch(child, "application/xml,text/xml");
        if (nested.status !== 200) continue;
        sitemapUrls.push(child);
        for (const loc of nested.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
          if (entries.size < 3000) entries.add(loc[1]);
        }
      }
    } else {
      for (const loc of locs) if (entries.size < 3000) entries.add(loc);
    }
  }

  const llms = await rawFetch(new URL("/llms.txt", origin).toString(), "text/plain");

  return {
    files: {
      robotsTxt,
      robotsStatus: robots.status || null,
      sitemapUrls,
      sitemapEntries: [...entries],
      llmsTxt: llms.status === 200 && llms.body ? llms.body.slice(0, 20000) : null,
      securityTxt: false,
      faviconOk: true,
      blockedAiCrawlers,
      allowedAiCrawlers,
    },
    rules,
    sitemapEntries: [...entries],
  };
}

