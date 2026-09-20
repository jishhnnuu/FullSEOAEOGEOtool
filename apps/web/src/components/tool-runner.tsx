"use client";

/**
 * The shared harness behind every free tool.
 *
 * One fetch, then each tool renders its slice of the same result. Results are
 * computed with the same catalogue and the same check functions the paid audit
 * uses, so a free tool and the full audit can never disagree about what is
 * wrong with a page. That is the property that makes these worth building
 * rather than reimplementing a checker per landing page.
 *
 * Nothing is stored and nothing is sent anywhere else. The Worker fetches the
 * page because a browser cannot read a third-party origin, and the response
 * goes straight back to this tab.
 */

import { useCallback, useState } from "react";

import type { InspectResult } from "@/app/api/tools/inspect/route";
import { CATALOG } from "@/engine/catalog";
import { materialise, runChecks } from "@/engine/checks";
import { buildLlmsTxt } from "@/engine/answers";
import type { CrawlReport, CrawledPage, Finding, SiteFiles } from "@/engine/types";
import type { ToolDef } from "@/content/tools";

type State =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "error"; reason: string }
  | { phase: "done"; result: InspectResult; findings: Finding[] };

/**
 * Wrap a single fetched page in the report shape the checks expect.
 *
 * Site-wide checks that need a full crawl are filtered out afterwards rather
 * than suppressed here, because a one-page report genuinely cannot answer
 * them and inventing an answer is the failure this product exists to avoid.
 */
function reportFrom(result: InspectResult): CrawlReport {
  const files: SiteFiles = result.files ?? {
    robotsTxt: null,
    robotsStatus: null,
    sitemapUrls: [],
    sitemapEntries: [],
    llmsTxt: null,
    securityTxt: false,
    faviconOk: true,
    blockedAiCrawlers: [],
    allowedAiCrawlers: [],
  };
  return {
    baseUrl: result.url,
    host: new URL(result.url).host,
    startedAt: result.fetchedAt,
    finishedAt: result.fetchedAt,
    pages: [result.page],
    files,
    discovered: 1,
    fetched: 1,
    capped: false,
    notes: [],
  };
}

/**
 * Codes that need more than one page to mean anything.
 *
 * A single-page tool that reports "orphan page" because it only fetched one
 * page is producing a false positive, and a false positive at high severity is
 * more expensive than the miss.
 */
const NEEDS_FULL_CRAWL = new Set([
  "orphan_page",
  "deep_page",
  "duplicate_content",
  "duplicate_title",
  "duplicate_meta_description",
  "keyword_cannibalisation",
  "sitemap_missing_pages",
  "no_internal_links_out",
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

export function useInspector(tool: ToolDef) {
  const [state, setState] = useState<State>({ phase: "idle" });

  const run = useCallback(
    async (url: string) => {
      setState({ phase: "running" });
      try {
        const response = await fetch("/api/tools/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, scope: tool.scope }),
        });
        const payload = (await response.json()) as { ok?: boolean; reason?: string };
        if (!response.ok || !payload?.ok) {
          setState({ phase: "error", reason: payload?.reason ?? "That address could not be read." });
          return;
        }
        const result = payload as InspectResult;
        const report = reportFrom(result);
        const drafts = runChecks(report, { url: result.url, maxPages: 1 }).filter(
          (d) => !NEEDS_FULL_CRAWL.has(d.code),
        );
        setState({ phase: "done", result, findings: materialise(drafts, result.fetchedAt) });
      } catch (error) {
        setState({
          phase: "error",
          reason: error instanceof Error ? error.message : "Something went wrong reading that address.",
        });
      }
    },
    [tool.scope],
  );

  return { state, run, reset: () => setState({ phase: "idle" }) };
}

export function ToolForm({
  tool,
  onRun,
  running,
}: {
  tool: ToolDef;
  onRun: (url: string) => void;
  running: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="tool-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onRun(value);
      }}
    >
      <label className="sr-only" htmlFor="tool-url">
        {tool.inputLabel}
      </label>
      <input
        id="tool-url"
        name="url"
        type="text"
        inputMode="url"
        autoComplete="url"
        placeholder="example.com"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={running}
      />
      <button type="submit" className="button primary" disabled={running || !value.trim()}>
        {running ? "Reading the page…" : tool.action}
      </button>
    </form>
  );
}

/* ----------------------------------------------------------------- output */

export function FindingList({ findings, only }: { findings: Finding[]; only?: string[] }) {
  const set = only ? new Set(only) : null;
  const shown = set ? findings.filter((f) => set.has(f.code)) : findings;
  if (shown.length === 0) {
    return (
      <p className="tool-clear">
        Nothing to report against these checks. That is a real result, not an empty state: the page was fetched and
        every check in this tool passed.
      </p>
    );
  }
  return (
    <ul className="tool-findings">
      {shown.map((finding) => {
        const def = CATALOG[finding.code];
        return (
          <li key={finding.id} className={`sev-${finding.severity}`}>
            <div className="tool-finding-head">
              <span className={`pill ${finding.severity}`}>{finding.severity}</span>
              <strong>{def?.title ?? finding.code}</strong>
            </div>
            {def?.why ? <p className="small muted">{def.why}</p> : null}
            {finding.detail ? <p className="small">{finding.detail}</p> : null}
            {def?.recommendation ? <p className="small tool-fix">{def.recommendation}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function CrawlerTable({ crawlers }: { crawlers: NonNullable<InspectResult["crawlers"]> }) {
  const blocked = crawlers.filter((c) => !c.allowed);
  return (
    <>
      <p className={blocked.length ? "tool-verdict bad" : "tool-verdict good"}>
        {blocked.length === 0
          ? `All ${crawlers.length} AI crawlers are allowed to fetch this site.`
          : `${blocked.length} of ${crawlers.length} AI crawlers cannot fetch this site.`}
      </p>
      <table className="tool-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Allowed</th>
            <th>Named in your file</th>
            <th>Why it matters</th>
          </tr>
        </thead>
        <tbody>
          {crawlers.map((crawler) => (
            <tr key={crawler.agent}>
              <td><code>{crawler.agent}</code></td>
              <td>{crawler.allowed ? <span className="yes">Allowed</span> : <span className="no">Blocked</span>}</td>
              <td className="muted small">{crawler.named ? "Yes" : "Falls through to *"}</td>
              <td className="muted small">{crawler.matters}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Copyable output. Used by the generators. */
export function CodeBlock({ value, filename }: { value: string; filename: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="tool-output">
      <div className="tool-output-head">
        <code>{filename}</code>
        <button
          type="button"
          className="button small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{value}</pre>
    </div>
  );
}

/* ------------------------------------------------------------- generators */

export function llmsTxtFor(result: InspectResult): string {
  const report = reportFrom(result);
  // The sitemap gives the page list; the fetched homepage gives the brand and
  // the summary line. Entries the crawl has not fetched carry no description,
  // which is stated rather than invented.
  const entries = result.files?.sitemapEntries ?? [];
  const signals = result.page.signals;
  const brand = signals?.openGraph?.["site_name"] || signals?.title?.split(/[|·-]/)[0]?.trim() || report.host;
  const base = buildLlmsTxt(report, { brand, summary: signals?.metaDescription ?? undefined });
  if (entries.length === 0) return base;

  const lines = base.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    out.push(line);
    if (line === "## Pages") {
      out.push("");
      for (const entry of entries.slice(0, 60)) {
        if (entry === result.url || entry === result.page.finalUrl) continue;
        try {
          const path = new URL(entry).pathname;
          const label = path === "/" ? "Home" : decodeURIComponent(path.replace(/\/$/, "").split("/").pop() ?? path)
            .replace(/[-_]+/g, " ")
            .replace(/^\w/, (c) => c.toUpperCase());
          out.push(`- [${label}](${entry})`);
        } catch {
          /* a malformed sitemap entry is skipped rather than guessed at */
        }
      }
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

const SEARCH_AGENTS = ["Googlebot", "Bingbot", "DuckDuckBot", "Applebot"];
const RETRIEVAL_AGENTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended",
  "Amazonbot", "MistralAI-User", "meta-externalagent",
];
const TRAINING_AGENTS = ["CCBot", "Bytespider", "Diffbot", "cohere-ai", "Omgilibot"];

export function robotsTxtFor(result: InspectResult, allowTraining: boolean): string {
  const sitemap = result.files?.sitemapUrls?.[0] ?? new URL("/sitemap.xml", result.origin).toString();
  const lines: string[] = [
    "# Every agent is named explicitly rather than left to the wildcard rule,",
    "# because several crawlers read only their own group when one exists.",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Search engines",
    ...SEARCH_AGENTS.flatMap((a) => [`User-agent: ${a}`, "Allow: /", ""]),
    "# AI retrieval. These decide whether you appear in an answer today.",
    ...RETRIEVAL_AGENTS.flatMap((a) => [`User-agent: ${a}`, "Allow: /", ""]),
    allowTraining
      ? "# AI training. Allowed."
      : "# AI training. Refused. This does not remove you from answers that\n# retrieval agents produce; those are the block above.",
    ...TRAINING_AGENTS.flatMap((a) => [`User-agent: ${a}`, allowTraining ? "Allow: /" : "Disallow: /", ""]),
    `Sitemap: ${sitemap}`,
    "",
  ];
  return lines.join("\n");
}

export function headingOutline(page: CrawledPage): { level: number; text: string; issue: string | null }[] {
  const headings = page.signals?.headings ?? [];
  const out: { level: number; text: string; issue: string | null }[] = [];
  let previous = 0;
  for (const heading of headings) {
    let issue: string | null = null;
    if (previous > 0 && heading.level > previous + 1) {
      issue = `Skips from H${previous} to H${heading.level}`;
    }
    if (heading.text.trim().length < 3) issue = "Empty heading";
    out.push({ ...heading, issue });
    previous = heading.level;
  }
  return out;
}

/** Pixel-aware title width, because search truncates by width and not by count. */
export function pixelWidth(text: string, size = 20): number {
  // Average advance widths for the font search results use, normalised to the
  // font size. Wide characters cost more, which is the whole reason a
  // character count passes titles that get cut off.
  let width = 0;
  for (const char of text) {
    if (/[ilj|.,:;'!\[\]]/.test(char)) width += 0.28;
    else if (/[frt()]/.test(char)) width += 0.36;
    else if (/[A-Z]/.test(char)) width += 0.68;
    else if (/[mwMW]/.test(char)) width += 0.88;
    else width += 0.54;
  }
  return Math.round(width * size);
}
