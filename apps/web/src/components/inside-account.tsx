"use client";

/**
 * A real account, open to anyone, with nothing asked for.
 *
 * Every agency says "see our work" and shows a case study a copywriter wrote.
 * The one thing this product can do that an agency cannot is show the machine
 * running, so this page is the workspace, on a real crawl, with the findings
 * we have not fixed still in it.
 *
 * The site it audits is our own. That is a deliberate choice rather than a
 * limitation: we own it, so nobody's permission is needed, and publishing our
 * own failures is the same argument `/proof` makes. When there is a paying
 * customer willing to be the demo, this points at them instead.
 *
 * **Why it fetches directly rather than through the Worker.** Same reason
 * `self-audit.tsx` does: a Cloudflare Worker's subrequest to its own hostname
 * does not loop back into the Worker, and the proxy only exists because a
 * browser cannot read a third-party origin. This page and the site it reads
 * are the same origin, so the browser reads it and the parser and catalogue,
 * which already run client side for every other audit, run over the result.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { runChecks, materialise } from "@/engine/checks";
import { buildContext, fixIsComplete, generateFix } from "@/engine/fixes";
import { parseHtml } from "@/engine/parse";
import { AI_CRAWLER_LIST, parseRobots, robotsAllows } from "@/engine/robots";
import type { CrawlReport, CrawledPage, Finding, SiteFiles } from "@/engine/types";
import { DESKS, managerFor } from "@/lib/desks";
import { DIRECTOR } from "@/lib/org";
import { ROUTES } from "@/lib/routes";

/** Codes a partial crawl cannot honestly answer. Left out rather than guessed. */
const NEEDS_FULL_CRAWL = new Set([
  "backlinks_not_connected", "gsc_not_connected", "ga4_not_connected",
  "lost_backlinks", "toxic_backlinks", "unlinked_mention", "authority_gap",
  "no_linkable_asset",
]);

/** How many of our own pages to read. Enough to be a crawl, few enough to be quick. */
const PAGE_LIMIT = 14;

type Account = {
  report: CrawlReport;
  findings: Finding[];
  withFix: number;
  blockedCrawlers: string[];
  readAt: string;
  ms: number;
};

type State =
  | { phase: "running"; done: number; total: number }
  | { phase: "error"; reason: string }
  | { phase: "ready"; account: Account };

async function grab(path: string): Promise<{ body: string; status: number } | null> {
  try {
    const response = await fetch(path, { headers: { accept: "text/html,text/plain,*/*" } });
    return { body: await response.text(), status: response.status };
  } catch {
    return null;
  }
}

async function readOwnSite(
  origin: string,
  onProgress: (done: number, total: number) => void,
): Promise<Account> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const paths = ROUTES.map((r) => r.path).filter((p) => !p.includes("[")).slice(0, PAGE_LIMIT);
  const total = paths.length + 3;
  let done = 0;
  const tick = () => { done += 1; onProgress(done, total); };

  const [robotsRes, llmsRes, sitemapRes] = await Promise.all([
    grab("/robots.txt").then((r) => { tick(); return r; }),
    grab("/llms.txt").then((r) => { tick(); return r; }),
    grab("/sitemap.xml").then((r) => { tick(); return r; }),
  ]);

  const fetched = await Promise.all(
    paths.map(async (path) => {
      const res = await grab(path);
      tick();
      return { path, res };
    }),
  );

  const pages: CrawledPage[] = [];
  for (const { path, res } of fetched) {
    const url = origin + (path === "/" ? "" : path);
    if (!res) continue;
    pages.push({
      url,
      finalUrl: url,
      status: res.status,
      depth: path === "/" ? 0 : 1,
      contentType: "text/html",
      bytes: res.body.length,
      elapsedMs: 0,
      redirectChain: [url],
      error: null,
      signals: res.status === 200 ? parseHtml(res.body, url) : null,
      inlinks: [],
      textHash: null,
    });
  }
  if (pages.length === 0) throw new Error("Not one page answered.");

  const robotsTxt = robotsRes && robotsRes.status === 200 ? robotsRes.body : null;
  const rules = parseRobots(robotsTxt ?? "");
  const crawlers = AI_CRAWLER_LIST.map(({ agent }) => ({ agent, allowed: robotsAllows(rules, agent, "/") }));
  const sitemapEntries =
    sitemapRes && sitemapRes.status === 200
      ? [...sitemapRes.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
      : [];

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

  const finishedAt = new Date().toISOString();
  const report: CrawlReport = {
    baseUrl: origin,
    host: new URL(origin).host,
    startedAt,
    finishedAt,
    pages,
    files,
    discovered: sitemapEntries.length || pages.length,
    fetched: pages.length,
    capped: false,
    notes: [],
  };

  const options = { url: origin, maxPages: PAGE_LIMIT };
  const drafts = runChecks(report, options).filter((d) => !NEEDS_FULL_CRAWL.has(d.code));
  const findings = materialise(drafts, finishedAt);

  // Fixes are generated here rather than described, which is the entire claim.
  const ctx = buildContext(report, options);
  let withFix = 0;
  for (const finding of findings) {
    const fix = generateFix(finding, ctx);
    if (fixIsComplete(fix)) {
      finding.fix = fix;
      withFix += 1;
    }
  }

  return {
    report,
    findings,
    withFix,
    blockedCrawlers: files.blockedAiCrawlers,
    readAt: finishedAt,
    ms: Date.now() - t0,
  };
}

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

type QueueItem = { finding: Finding; pages: number; fixes: number };

/**
 * One row per problem, not one row per page.
 *
 * A check that fires on every page is one thing to decide about, and a queue
 * that lists it twelve times is a queue nobody reads. The count of affected
 * pages carries the scale instead, which is how the workspace shows it.
 */
function groupByCode(findings: Finding[]): QueueItem[] {
  const out = new Map<string, QueueItem>();
  for (const finding of findings) {
    const seen = out.get(finding.code);
    const pages = Math.max(1, finding.affectedCount);
    if (!seen) {
      out.set(finding.code, { finding, pages, fixes: finding.fix ? 1 : 0 });
    } else {
      seen.pages += pages;
      if (finding.fix) {
        seen.fixes += 1;
        // Keep an example that carries a fix, so opening one shows an artefact.
        if (!seen.finding.fix) seen.finding = finding;
      }
    }
  }
  return [...out.values()].sort(
    (a, b) =>
      (SEV_ORDER[a.finding.severity] ?? 9) - (SEV_ORDER[b.finding.severity] ?? 9) ||
      b.pages - a.pages ||
      b.finding.priority - a.finding.priority,
  );
}

export function InsideAccount() {
  const [state, setState] = useState<State>({ phase: "running", done: 0, total: 17 });

  useEffect(() => {
    let cancelled = false;
    readOwnSite(window.location.origin, (done, total) => {
      if (!cancelled) setState({ phase: "running", done, total });
    })
      .then((account) => { if (!cancelled) setState({ phase: "ready", account }); })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            phase: "error",
            reason: error instanceof Error ? error.message : "The account could not be read.",
          });
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (state.phase === "running") {
    const pct = Math.round((state.done / state.total) * 100);
    return (
      <div className="inside-frame">
        <div className="inside-bar">
          <span className="mono">OPENING THE ACCOUNT</span>
          <span className="mono">{state.done} / {state.total}</span>
        </div>
        <div className="inside-body">
          <div className="progress"><span style={{ width: `${Math.max(6, pct)}%` }} /></div>
          <p className="small muted" style={{ marginTop: "0.8rem" }}>
            Reading our own site now, in your browser. Nothing is pre-computed, which is also why this takes a moment.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="inside-frame">
        <div className="inside-bar"><span className="mono">THE ACCOUNT COULD NOT BE READ</span></div>
        <div className="inside-body">
          <p className="small">
            {state.reason} That failure is printed rather than hidden, which is the same thing the product does on
            your site when a page refuses it.
          </p>
        </div>
      </div>
    );
  }

  const { report, findings, withFix, blockedCrawlers, ms } = state.account;
  const queue = groupByCode(findings);
  const ranked = queue.map((q) => q.finding);
  const severe = findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
  const ok = report.pages.filter((p) => p.status === 200).length;
  const refused = report.pages.length - ok;

  return (
    <div className="inside-frame">
      <div className="inside-bar">
        <span className="mono">ACCOUNT &middot; {report.host}</span>
        <span className="mono live"><i />READ {(ms / 1000).toFixed(1)}s AGO, IN YOUR BROWSER</span>
      </div>

      <div className="inside-body">
        {/* The director speaks for the organisation, and leads with the bad news. */}
        <div className="brief">
          <div className="brief-head">
            <div>
              <div className="brief-who"><span className="brief-dot" />{DIRECTOR.name}
                <span className="tiny faint">&middot; the only agent you speak to</span>
              </div>
              <p className="brief-headline">
                {severe > 0
                  ? `${severe} findings on our own site are worth acting on, and ${withFix} of the ${findings.length} total already have the change written.`
                  : `Nothing severe on our own site today. ${withFix} smaller fixes are written and waiting.`}
              </p>
            </div>
          </div>

          <div className="brief-desks">
            {DESKS.map((desk) => {
              const manager = managerFor(desk);
              const open = manager.status === "live";
              return (
                <div key={desk.key} className={open ? "desk desk-working" : "desk desk-planned"}>
                  <div className="desk-top">
                    <strong>{manager.name}</strong>
                    {!open && <span className="tiny faint">{manager.opens}</span>}
                  </div>
                  <div className="tiny faint desk-title">{manager.title}</div>
                  <p className="small">
                    {/*
                      One line per desk, and they differ because the desks do.
                      Content reads whatever this crawl already fetched. Social
                      reads nothing here at all: it needs an account handle,
                      which this panel has no reason to hold, so it says so
                      rather than borrowing the search desk's numbers.
                    */}
                    {!open
                      ? `Not built. Opens ${manager.opens}.`
                      : desk.key === "search"
                        ? `${ok} pages read, ${findings.length} findings, ${withFix} fixes written.`
                        : desk.key === "content"
                          ? "Reads the same crawl. Voice measured from the pages already fetched."
                          : "Reads competitor accounts, not pages. Needs a handle, so it runs in its own tab."}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="brief-blocked">
            <div className="tiny faint" style={{ marginBottom: "0.4rem" }}>WHAT IS BLOCKED, AND WHY</div>
            <div className="between small blocked-row">
              <span>
                <span className="badge badge-medium">blocked</span> <strong>Authority is not scored</strong>
                <span className="muted"> Nothing measures query demand or real ranking movement without Search Console, and scoring it from a proxy wastes the most expensive work in the programme.</span>
              </span>
            </div>
            {blockedCrawlers.length > 0 && (
              <div className="between small blocked-row">
                <span>
                  <span className="badge badge-medium">blocked</span>{" "}
                  <strong>{blockedCrawlers.length} AI crawlers refused by robots.txt</strong>
                  <span className="muted"> {blockedCrawlers.join(", ")}.</span>
                </span>
              </div>
            )}
          </div>

          <div className="brief-foot tiny faint">
            One team, four desks. You approve, you do not execute. <Link href="/the-firm">See the organisation</Link>.
          </div>
        </div>

        {/* Coverage above the score, never under it. */}
        <div className="coverage complete" style={{ marginTop: "1.1rem" }}>
          <strong>{ok} of {report.pages.length} pages read</strong>
          <span className="muted">
            {refused > 0
              ? `${refused} did not answer and are excluded from every number on this page.`
              : "Everything the route table lists answered. Nothing is excluded."}
            {" "}This is a partial crawl of our own marketing site, not the full catalogue a paid run does.
          </span>
        </div>

        {/* The queue. A finding without a fix is an audit tool. */}
        <h3 className="inside-h">The queue, as your account would show it</h3>
        <p className="small muted" style={{ marginTop: "-0.4rem" }}>
          Ranked by what it would move, not by what is easiest. Everything marked <em>fix written</em> can ship as it
          is, because an incomplete fix never reaches the queue.
        </p>
        <div className="queue">
          {queue.slice(0, 14).map(({ finding: f, pages, fixes }) => (
            <div className="qrow" key={f.code}>
              <span className={`badge badge-${f.severity === "critical" || f.severity === "high" ? "high" : f.severity === "medium" ? "medium" : "low"}`}>
                {f.severity}
              </span>
              <span className="qtitle">
                <strong>{f.title}</strong>
                <span className="tiny faint">
                  {pages > 1 ? `${pages} pages` : f.url ? new URL(f.url).pathname : "site wide"}
                  {" \u00b7 "}{f.code}
                </span>
              </span>
              <span className="qfix">
                {fixes > 0
                  ? <span className="written">{fixes > 1 ? `${fixes} fixes written` : "fix written"}</span>
                  : <span className="tiny faint">needs a person</span>}
              </span>
            </div>
          ))}
          {queue.length === 0 && (
            <div className="qrow"><span className="small muted">Nothing open on the pages read. That is a real result, not an empty state.</span></div>
          )}
        </div>
        <p className="tiny faint" style={{ marginTop: "0.6rem" }}>
          {queue.length} distinct problems across {findings.length} findings.{" "}
          {queue.length > 14
            ? `Fourteen shown; your own account shows all ${queue.length}.`
            : "All of them shown."}
        </p>

        {/*
          * Our own site is deliberately noindex until it moves to a real
          * domain, so page_noindex fires on every page read. That is the check
          * being right rather than a result to hide, and explaining it is more
          * use to a visitor than quietly filtering it out.
          */}
        {queue.some((q) => q.finding.code === "page_noindex") && (
          <div className="notice notice-warn small" style={{ marginTop: "0.9rem" }}>
            <strong>Yes, our own pages are blocked from indexing, and it is deliberate.</strong> This deployment is on
            a workers.dev subdomain rather than a real domain. A subdomain that gets indexed and then moves leaves a
            duplicate of the whole site behind, competing with the real domain for its own terms, so the site stays
            noindex until the domain is set. The check does not know that, it fires, and it stays in the queue rather
            than being filtered out of a page about not hiding things.
          </div>
        )}

        {/* One fix, opened, because the claim is that it is a real artefact. */}
        {ranked.find((f) => f.fix) && (
          <>
            <h3 className="inside-h">One of them, opened</h3>
            <p className="small muted" style={{ marginTop: "-0.4rem" }}>
              This is the artefact, not a description of one. In a paying account it is pushed to the CMS and
              re-fetched to confirm it went live.
            </p>
            {(() => {
              const f = ranked.find((x) => x.fix)!;
              return (
                <div className="fix-open">
                  <div className="fix-head">
                    <strong>{f.title}</strong>
                    <span className="mono tiny">{f.code}</span>
                  </div>
                  <p className="small muted">{f.why}</p>
                  <pre className="code-block">{JSON.stringify(f.fix, null, 2).slice(0, 900)}</pre>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
