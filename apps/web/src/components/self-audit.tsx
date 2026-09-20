"use client";

/**
 * This site, audited by its own engine, in public.
 *
 * It runs on load against our own origin, using the same fetch route, the same
 * parser and the same catalogue that a visitor's audit uses. Nothing is
 * pre-computed and nothing is filtered: if the engine finds something wrong
 * with this site, it appears here.
 *
 * The reason this exists is narrow and worth stating. Every tool in this
 * category asserts that it is good at SEO. None of them shows its own score.
 * When this page was built, our own site scored 51.5 on AI answer readiness
 * against a competitor's 62.6, with no sitemap, no llms.txt, no structured
 * data and a robots.txt containing no directives at all. That was true, it was
 * embarrassing, and the fix was to publish the number rather than to stop
 * measuring.
 */

import { useEffect, useState } from "react";

import type { InspectResult } from "@/app/api/tools/inspect/route";
import { SITE_URL } from "@/lib/brand";
import { CATALOG } from "@/engine/catalog";
import { materialise, runChecks } from "@/engine/checks";
import type { CrawlReport, Finding } from "@/engine/types";

type State =
  | { phase: "running" }
  | { phase: "error"; reason: string }
  | { phase: "done"; result: InspectResult; findings: Finding[] };

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

export function SelfAudit() {
  const [state, setState] = useState<State>({ phase: "running" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/tools/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          /*
           * The canonical origin, not `window.location.origin`.
           *
           * Two reasons. A local dev server is loopback, which the SSRF guard
           * refuses, so reading the browser's origin makes this page fail on
           * the one machine where it would be most useful. And the claim this
           * page makes is about the deployment people actually visit, so the
           * audit should be pointed there whoever is looking at it.
           */
          body: JSON.stringify({ url: SITE_URL, scope: "site" }),
        });
        const payload = (await response.json()) as { ok?: boolean; reason?: string };
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setState({ phase: "error", reason: payload?.reason ?? "The audit could not run." });
          return;
        }
        const result = payload as InspectResult;
        const report: CrawlReport = {
          baseUrl: result.url,
          host: new URL(result.url).host,
          startedAt: result.fetchedAt,
          finishedAt: result.fetchedAt,
          pages: [result.page],
          files: result.files!,
          discovered: 1,
          fetched: 1,
          capped: false,
          notes: [],
        };
        const drafts = runChecks(report, { url: result.url, maxPages: 1 }).filter((d) => !NEEDS_FULL_CRAWL.has(d.code));
        setState({ phase: "done", result, findings: materialise(drafts, result.fetchedAt) });
      } catch (error) {
        if (!cancelled) {
          setState({ phase: "error", reason: error instanceof Error ? error.message : "The audit could not run." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "running") {
    return <p className="tool-note">Running the audit against this site now.</p>;
  }
  if (state.phase === "error") {
    return (
      <p className="tool-verdict bad">
        The audit could not run: {state.reason}. That failure is itself reported rather than hidden.
      </p>
    );
  }

  const { result, findings } = state;
  const files = result.files;
  const signals = result.page.signals;
  const bySeverity = (severity: string) => findings.filter((f) => f.severity === severity).length;

  return (
    <>
      <div className="tool-stats">
        <Stat label="Findings on the homepage" value={String(findings.length)} />
        <Stat label="Critical" value={String(bySeverity("critical"))} tone={bySeverity("critical") ? "bad" : "good"} />
        <Stat label="High" value={String(bySeverity("high"))} tone={bySeverity("high") ? "warn" : "good"} />
        <Stat
          label="AI crawlers allowed"
          value={`${result.crawlers?.filter((c) => c.allowed).length ?? 0} of ${result.crawlers?.length ?? 0}`}
          tone={result.crawlers?.every((c) => c.allowed) ? "good" : "bad"}
        />
        <Stat label="llms.txt" value={files?.llmsTxt ? "Published" : "Missing"} tone={files?.llmsTxt ? "good" : "bad"} />
        <Stat
          label="Sitemap URLs"
          value={String(files?.sitemapEntries.length ?? 0)}
          tone={files?.sitemapEntries.length ? "good" : "bad"}
        />
        <Stat
          label="Structured data blocks"
          value={String(signals?.jsonLd.length ?? 0)}
          tone={signals?.jsonLd.length ? "good" : "bad"}
        />
        <Stat label="Words in served HTML" value={String(signals?.wordCount ?? 0)} />
      </div>

      <p className="tool-note">
        Read {new Date(result.fetchedAt).toUTCString()}. This is the homepage only, not a full crawl, so anything
        needing more than one page is excluded rather than guessed at. Authority is not shown at all, because nothing
        here measures a backlink profile and a score whose main input is missing does not get to render as a number.
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
