/**
 * Crawl orchestration, driven from the browser.
 *
 * The Worker fetches and parses in small batches; this decides what to queue
 * next, tracks depth and internal links, and reports progress as it goes.
 * Splitting it this way keeps any single request small, which is what makes a
 * hundred-page crawl survivable on an edge runtime, and it means the person
 * who started the run can watch it happen instead of staring at a spinner.
 */

import { parseRobots, robotsAllows, type RobotsRules } from "./robots";
import type { CrawlOptions, CrawledPage, CrawlReport, SiteFiles } from "./types";

const BATCH = 3;
const PARALLEL = 2;
const DEFAULT_MAX_PAGES = 40;
const DEFAULT_MAX_DEPTH = 3;

export type Progress = {
  phase: "discovering" | "crawling" | "analysing" | "done" | "failed";
  fetched: number;
  queued: number;
  target: number;
  current: string | null;
  message: string;
};

export type DiscoverResponse = {
  ok: boolean;
  reason?: string;
  baseUrl: string;
  host: string;
  files: SiteFiles;
  home: CrawledPage;
  seeds: string[];
};

const SKIP_EXTENSION = /\.(jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|pdf|zip|gz|mp4|mp3|wav|woff2?|ttf|eot|dmg|exe|rss|atom)(\?|$)/i;
const SKIP_PATH = /\/(wp-admin|wp-json|wp-login|xmlrpc|cart|checkout|my-account|account|basket|login|signin|signup|logout|feed|amp)(\/|$|\?)/i;

/** Should the crawler spend one of its page budget slots on this URL? */
export function crawlable(url: string, host: string, includeSubdomains: boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const target = parsed.host.toLowerCase().replace(/^www\./, "");
  if (includeSubdomains ? !target.endsWith(host) : target !== host) return false;
  if (SKIP_EXTENSION.test(parsed.pathname)) return false;
  if (SKIP_PATH.test(parsed.pathname)) return false;
  // Session and tracking parameters produce endless near-duplicates.
  if (/[?&](utm_|fbclid|gclid|msclkid|sessionid|phpsessid|replytocom)/i.test(parsed.search)) return false;
  return true;
}

export function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // A trailing slash on a directory path and its bare form are the same page
    // for crawl purposes; keeping both doubles the crawl and invents duplicates.
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    const params = [...parsed.searchParams.entries()].filter(([k]) => !/^utm_|^fbclid$|^gclid$/i.test(k));
    parsed.search = params.length ? `?${new URLSearchParams(params).toString()}` : "";
    return parsed.toString();
  } catch {
    return url;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The engine routes answer with `reason`, the quota and validation routes
    // with `message`. Reading only one threw away every precise diagnostic the
    // server had written: a loopback address came back as "Request failed with
    // 400" under a paragraph guessing that the target site blocks bots, which
    // is the opposite of what happened and sends the user to fix their server.
    const body = data as { reason?: string; message?: string };
    throw new Error(body.reason ?? body.message ?? `Request failed with ${response.status}`);
  }
  return data as T;
}

/**
 * Run a crawl. `onProgress` is called often enough to drive a live view.
 */
export async function crawlSite(
  options: CrawlOptions,
  onProgress: (progress: Progress) => void,
  signal?: AbortSignal,
): Promise<CrawlReport> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? DEFAULT_MAX_PAGES, 250));
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const startedAt = new Date().toISOString();

  onProgress({ phase: "discovering", fetched: 0, queued: 0, target: maxPages, current: options.url, message: "Reading robots.txt, the sitemap and the homepage" });

  const discovery = await post<DiscoverResponse>("/api/engine/discover", { url: options.url });
  if (!discovery.ok) throw new Error(discovery.reason ?? "Could not reach that site");

  const host = discovery.host;
  const rules: RobotsRules = parseRobots(discovery.files.robotsTxt ?? "");
  const respectRobots = options.respectRobots !== false;

  const pages: CrawledPage[] = [];
  const seen = new Set<string>();
  const depths = new Map<string, number>();
  const inlinks = new Map<string, Set<string>>();
  const notes: string[] = [];

  const record = (page: CrawledPage) => {
    pages.push(page);
    for (const link of page.signals?.links ?? []) {
      if (!link.internal) continue;
      const target = normaliseUrl(link.href);
      (inlinks.get(target) ?? inlinks.set(target, new Set()).get(target)!).add(page.url);
    }
  };

  const home = { ...discovery.home, url: normaliseUrl(discovery.home.url), depth: 0 };
  seen.add(home.url);
  depths.set(home.url, 0);
  record(home);

  /* ---- build the frontier ---- */
  const frontier: string[] = [];
  const enqueue = (raw: string, depth: number) => {
    const url = normaliseUrl(raw);
    if (seen.has(url) || !crawlable(url, host, !!options.includeSubdomains)) return;
    if (depth > maxDepth) return;
    seen.add(url);
    depths.set(url, depth);
    frontier.push(url);
  };

  for (const link of home.signals?.links ?? []) {
    if (link.internal) enqueue(link.href, 1);
  }
  // Sitemap URLs come in at depth 1 so they compete with navigation links
  // rather than being starved by them, which is how orphans get found.
  for (const entry of discovery.files.sitemapEntries.slice(0, maxPages * 3)) {
    enqueue(entry, 1);
  }
  if (discovery.files.sitemapEntries.length === 0 && discovery.files.sitemapUrls.length === 0) {
    notes.push("No sitemap was found, so the crawl followed links only. Orphan pages will not appear.");
  }

  /* ---- crawl ---- */
  let capped = false;
  while (frontier.length && pages.length < maxPages) {
    if (signal?.aborted) throw new Error("Crawl stopped");

    const slice = frontier.splice(0, BATCH * PARALLEL).slice(0, maxPages - pages.length);
    const batches: { url: string; depth: number }[][] = [];
    for (let i = 0; i < slice.length; i += BATCH) {
      batches.push(slice.slice(i, i + BATCH).map((url) => ({ url, depth: depths.get(url) ?? 1 })));
    }

    onProgress({
      phase: "crawling",
      fetched: pages.length,
      queued: frontier.length,
      target: Math.min(maxPages, pages.length + frontier.length + slice.length),
      current: slice[0] ?? null,
      message: `Fetched ${pages.length} pages, ${frontier.length + slice.length} still queued`,
    });

    const blocked: string[] = [];
    const allowedBatches = batches.map((batch) =>
      batch.filter((item) => {
        if (!respectRobots) return true;
        const path = new URL(item.url).pathname;
        const ok = robotsAllows(rules, "SEOOSBot", path);
        if (!ok) blocked.push(item.url);
        return ok;
      }),
    );

    for (const url of blocked) {
      record({
        url,
        finalUrl: url,
        status: 0,
        depth: depths.get(url) ?? 1,
        contentType: "",
        bytes: 0,
        elapsedMs: 0,
        redirectChain: [],
        error: "blocked by robots.txt",
        signals: null,
        inlinks: [],
        textHash: null,
      });
    }

    const results = await Promise.all(
      allowedBatches
        .filter((batch) => batch.length)
        // `fetched` lets the Worker enforce the plan's page ceiling where the
        // fetching actually happens. The browser drives this crawl, so a
        // ceiling the browser alone respected would not be a ceiling.
        .map((batch) =>
          post<{ pages: CrawledPage[]; capped?: boolean; reason?: string }>("/api/engine/fetch", {
            targets: batch,
            fetched: pages.length,
          }).catch((err) => ({
            pages: batch.map((item) => failedPage(item.url, item.depth, err instanceof Error ? err.message : "Fetch failed")),
          })),
        ),
    );

    for (const result of results) {
      // The plan ceiling was reached. Say so in the notes rather than
      // stopping silently: a score over a partial crawl is a score of those
      // pages, and the reader is told that above the number.
      if ("capped" in result && result.capped && "reason" in result && result.reason) {
        capped = true;
        if (!notes.includes(result.reason)) notes.push(result.reason);
        frontier.length = 0;
        break;
      }
      for (const fetched of result.pages) {
        record(fetched);
        if (fetched.depth >= maxDepth) continue;
        for (const link of fetched.signals?.links ?? []) {
          if (link.internal) enqueue(link.href, fetched.depth + 1);
        }
      }
    }
  }

  if (frontier.length) {
    capped = true;
    notes.push(`The crawl stopped at ${maxPages} pages with ${frontier.length} URLs still queued. Raise the page limit in settings for a fuller picture.`);
  }

  for (const p of pages) {
    p.inlinks = [...(inlinks.get(p.url) ?? [])].filter((u) => u !== p.url);
  }

  return {
    baseUrl: discovery.baseUrl,
    host,
    startedAt,
    finishedAt: new Date().toISOString(),
    pages,
    files: discovery.files,
    discovered: seen.size,
    fetched: pages.length,
    capped,
    notes,
  };
}

function failedPage(url: string, depth: number, error: string): CrawledPage {
  return {
    url, finalUrl: url, status: 0, depth, contentType: "", bytes: 0,
    elapsedMs: 0, redirectChain: [], error, signals: null, inlinks: [], textHash: null,
  };
}
