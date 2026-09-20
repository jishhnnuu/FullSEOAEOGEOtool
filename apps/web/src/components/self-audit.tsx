"use client";

/**
 * This site, audited by its own engine, in public.
 *
 * Every tool in this category asserts that it is good at SEO. None of them
 * shows its own score. When this page was built, our own site scored 51.5 on
 * AI answer readiness against a competitor's 62.6, with no sitemap, no
 * llms.txt, no structured data and a robots.txt containing no directives at
 * all. That was true, it was embarrassing, and the fix was to publish the
 * number rather than to stop measuring.
 *
 * **Why this fetches directly rather than going through the Worker.**
 *
 * The first version called `/api/tools/inspect`, the same route the free tools
 * use, and it failed on the live deployment with a 404 on every page. A
 * Cloudflare Worker's subrequest to its own hostname does not loop back into
 * the Worker, so the fetch left the isolate, found no origin server behind the
 * route, and came back empty. It worked in development against other people's
 * sites and could not work in production against ours.
 *
 * The proxy exists for one reason: a browser cannot read a third-party origin.
 * That reason does not apply here, because this page and the site it is
 * auditing are the same origin. So the browser fetches the files itself, and
 * the parser and the check catalogue, which already run client side for every
 * other audit, run over the result. Fewer moving parts, no subrequest, and it
 * works on a static host with no Worker at all.
 */

import { useEffect, useState } from "react";

import { CATALOG } from "@/engine/catalog";
import { materialise, runChecks } from "@/engine/checks";
import { parseHtml } from "@/engine/parse";
import { AI_CRAWLER_LIST, parseRobots, robotsAllows } from "@/engine/robots";
import type { CrawlReport, CrawledPage, Finding, SiteFiles } from "@/engine/types";

type Reading = {
  report: CrawlReport;
  findings: Finding[];
  crawlers: { agent: string; matters: string; allowed: boolean }[];
  readAt: string;
};

type State = { phase: "running" } | { phase: "error"; reason: string } | { phase: "done"; reading: Reading };

/** Codes that need a full crawl to mean anything. One page cannot answer them. */
const NEEDS_FULL_CRAWL = new Set([
  "orphan_page",
  "deep_page",
  "duplicate_content",
  "duplicate_title",
  "duplicate_meta_description",
  "keyword_cannibalisation",
  "sitemap_missing_pages",
  "page_404_linked",
  "backlinks_not_connected",
  "gsc_not_connected",
  "ga4_not_connected",
  "lost_backlinks",
  "toxic_backlinks",
  "unlinked_mention",
  "authority_gap",
  "no_linkable_asset",
]);

/** Fetch a same-origin text file, returning null rather than throwing. */
async function text(path: string): Promise<{ body: string; status: number } | null> {
  try {
    const response = await fetch(path, { headers: { accept: "text/plain,*/*" } });
    const body = await response.text();
    return { body, status: response.status };
  } catch {
    return null;
  }
}

async function read(origin: string): Promise<Reading> {
  const started = new Date().toISOString();

  const [homeRes, robotsRes, llmsRes, sitemapRes] = await Promise.all([
    text("/"),
    text("/robots.txt"),
    text("/llms.txt"),
    text("/sitemap.xml"),
  ]);

  if (!homeRes || homeRes.status !== 200) {
    throw new Error(`The homepage answered ${homeRes?.status ?? "nothing"}.`);
  }

  const robotsTxt = robotsRes && robotsRes.status === 200 ? robotsRes.body : null;
  const rules = parseRobots(robotsTxt ?? "");
  const crawlers = AI_CRAWLER_LIST.map(({ agent, matters }) => ({
    agent,
    matters,
    allowed: robotsAllows(rules, agent, "/"),
  }));

  const sitemapEntries =
    sitemapRes && sitemapRes.status === 200
      ? [...sitemapRes.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
      : [];

  const signals = parseHtml(homeRes.body, origin);
  const page: CrawledPage = {
    url: origin,
    finalUrl: origin,
    status: 200,
    depth: 0,
    contentType: "text/html",
    bytes: homeRes.body.length,
    elapsedMs: 0,
    redirectChain: [origin],
    error: null,
    signals,
    inlinks: [],
    textHash: null,
  };

  const files: SiteFiles = {
    robotsTxt,
    robotsStatus: robotsRes?.status ?? null,
    sitemapUrls: sitemapEntries.length ? [`${origin}/sitemap.xml`] : [],
    sitemapEntries,
    llmsTxt: llmsRes && llmsRes.status === 200 ? llmsRes.body.slice(0, 20000) : null,
    securityTxt: false,
    faviconOk: true,
    blockedAiCrawlers: crawlers.filter((c) => !c.allowed).map((c) => c.agent),
    allowedAiCrawlers: crawlers.filter((c) => c.allowed).map((c) => c.agent),
  };

  const report: CrawlReport = {
    baseUrl: origin,
    host: new URL(origin).host,
    startedAt: started,
    finishedAt: new Date().toISOString(),
    pages: [page],
    files,
    discovered: 1,
    fetched: 1,
    capped: false,
    notes: [],
  };

  const drafts = runChecks(report, { url: origin, maxPages: 1 }).filter((d) => !NEEDS_FULL_CRAWL.has(d.code));
  return { report, findings: materialise(drafts, report.finishedAt), crawlers, readAt: report.finishedAt };
}

export function SelfAudit() {
  const [state, setState] = useState<State>({ phase: "running" });

  useEffect(() => {
    let cancelled = false;
    read(window.location.origin)
      .then((reading) => {
        if (!cancelled) setState({ phase: "done", reading });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ phase: "error", reason: error instanceof Error ? error.message : "The audit could not run." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "running") {
    return <p className="tool-note">Reading this site now, in your browser.</p>;
  }
  if (state.phase === "error") {
    return (
      <p className="tool-verdict bad">
        The audit could not run: {state.reason}. That failure is itself reported rather than hidden.
      </p>
    );
  }

  const { report, findings, crawlers, readAt } = state.reading;
  const files = report.files;
  const signals = report.pages[0].signals;
  const count = (severity: string) => findings.filter((f) => f.severity === severity).length;
  const allowed = crawlers.filter((c) => c.allowed).length;

  return (
    <>
      <div className="tool-stats">
        <Stat label="Findings on the homepage" value={String(findings.length)} />
        <Stat label="Critical" value={String(count("critical"))} tone={count("critical") ? "bad" : "good"} />
        <Stat label="High" value={String(count("high"))} tone={count("high") ? "warn" : "good"} />
        <Stat
          label="AI crawlers allowed"
          value={`${allowed} of ${crawlers.length}`}
          tone={allowed === crawlers.length ? "good" : "bad"}
        />
        <Stat label="llms.txt" value={files.llmsTxt ? "Published" : "Missing"} tone={files.llmsTxt ? "good" : "bad"} />
        <Stat
          label="Sitemap URLs"
          value={String(files.sitemapEntries.length)}
          tone={files.sitemapEntries.length ? "good" : "bad"}
        />
        <Stat
          label="Structured data blocks"
          value={String(signals?.jsonLd.length ?? 0)}
          tone={signals?.jsonLd.length ? "good" : "bad"}
        />
        <Stat label="Words in served HTML" value={String(signals?.wordCount ?? 0)} />
      </div>

      {allowed < crawlers.length ? (
        <p className="tool-note">
          {crawlers.length - allowed} of {crawlers.length} AI crawlers are refused, and that is deliberate for now.
          This deployment is not on its final domain yet, so robots.txt is closed and every page is noindex. A
          subdomain that gets indexed and then moves leaves a duplicate of the whole site competing with the real
          domain for its own terms. Setting the domain opens both in the same deploy.
        </p>
      ) : null}

      <p className="tool-note">
        Read {new Date(readAt).toUTCString()}, in your browser, against this origin. The homepage only, not a full
        crawl, so anything needing more than one page is excluded rather than guessed at. Authority is not shown at
        all, because nothing here measures a backlink profile and a score whose main input is missing does not get to
        render as a number.
      </p>

      {findings.length === 0 ? (
        <p className="tool-verdict good">
          No findings on this page against the single-page checks. That will not stay true forever, and when it stops
          being true this page will say so.
        </p>
      ) : (
        <ul className="tool-findings">
          {findings.map((finding) => {
            const def = CATALOG[finding.code];
            return (
              <li key={finding.id} className={`sev-${finding.severity}`}>
                <div className="tool-finding-head">
                  <span className={`pill ${finding.severity}`}>{finding.severity}</span>
                  <strong>{def?.title ?? finding.code}</strong>
                </div>
                {finding.detail ? <p className="small">{finding.detail}</p> : null}
                {def?.recommendation ? <p className="small tool-fix">{def.recommendation}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={`tool-stat${tone ? ` ${tone}` : ""}`}>
      <div className="tool-stat-value">{value}</div>
      <div className="tool-stat-label">{label}</div>
    </div>
  );
}
