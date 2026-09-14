/**
 * What changed between two runs.
 *
 * Reporting that only shows the current state cannot answer the question a
 * client actually asks, which is "what did you do and did it work". Every run
 * is diffed against the one before it: what was fixed, what regressed, what is
 * new, and which way the scores moved.
 */

import type { AuditResult, Finding, Severity } from "./types";

export type FindingDelta = {
  fixed: Finding[];
  appeared: Finding[];
  worsened: { finding: Finding; from: Severity; to: Severity }[];
  unchanged: number;
};

export type ScoreDelta = {
  key: string;
  label: string;
  from: number;
  to: number;
  change: number;
};

export type PageDelta = {
  added: string[];
  removed: string[];
  changed: { url: string; what: string[] }[];
};

export type RunDiff = {
  previousRunId: string | null;
  previousAt: string | null;
  currentRunId: string;
  currentAt: string;
  scores: ScoreDelta[];
  findings: FindingDelta;
  pages: PageDelta;
  headline: string;
  narrative: string[];
};

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function diffRuns(current: AuditResult, previous: AuditResult | null): RunDiff {
  const scoreKeys = ["health", "aeo", "authority", "experience"] as const;
  const labels: Record<string, string> = {
    health: "Search health",
    aeo: "AI answer readiness",
    authority: "Authority",
    experience: "Experience",
  };

  const scores: ScoreDelta[] = scoreKeys.map((key) => {
    const to = current.scores[key].score;
    const from = previous ? previous.scores[key].score : to;
    return { key, label: labels[key], from, to, change: Math.round((to - from) * 10) / 10 };
  });

  if (!previous) {
    return {
      previousRunId: null,
      previousAt: null,
      currentRunId: current.runId,
      currentAt: current.finishedAt,
      scores,
      findings: { fixed: [], appeared: current.findings, worsened: [], unchanged: 0 },
      pages: { added: current.crawl.pages.map((p) => p.url), removed: [], changed: [] },
      headline: `First run: ${current.findings.length} findings across ${current.crawl.fetched} pages.`,
      narrative: [
        `This is the baseline. ${current.crawl.fetched} pages were crawled and ${current.findings.length} issues found, ` +
          `${current.findings.filter((f) => f.severity === "critical" || f.severity === "high").length} of them serious enough to act on now.`,
        `${current.findings.filter((f) => f.fix).length} of those arrive with the fix already written.`,
        `Everything from here is measured against this run.`,
      ],
    };
  }

  const previousById = new Map(previous.findings.map((f) => [f.id, f]));
  const currentById = new Map(current.findings.map((f) => [f.id, f]));

  const fixed = previous.findings.filter((f) => !currentById.has(f.id));
  const appeared = current.findings.filter((f) => !previousById.has(f.id));
  const worsened: FindingDelta["worsened"] = [];
  let unchanged = 0;
  for (const finding of current.findings) {
    const before = previousById.get(finding.id);
    if (!before) continue;
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[before.severity]) {
      worsened.push({ finding, from: before.severity, to: finding.severity });
    } else {
      unchanged++;
    }
  }

  const previousUrls = new Set(previous.crawl.pages.map((p) => p.url));
  const currentUrls = new Set(current.crawl.pages.map((p) => p.url));
  const added = [...currentUrls].filter((u) => !previousUrls.has(u));
  const removed = [...previousUrls].filter((u) => !currentUrls.has(u));

  const previousPages = new Map(previous.crawl.pages.map((p) => [p.url, p]));
  const changed: PageDelta["changed"] = [];
  for (const page of current.crawl.pages) {
    const before = previousPages.get(page.url);
    if (!before) continue;
    const what: string[] = [];
    if (before.status !== page.status) what.push(`status ${before.status} to ${page.status}`);
    if (before.signals?.title !== page.signals?.title) what.push("title changed");
    if (before.signals?.metaDescription !== page.signals?.metaDescription) what.push("meta description changed");
    if (before.textHash !== page.textHash) what.push("body copy changed");
    const wordsBefore = before.signals?.wordCount ?? 0;
    const wordsNow = page.signals?.wordCount ?? 0;
    if (Math.abs(wordsNow - wordsBefore) > Math.max(80, wordsBefore * 0.2)) {
      what.push(`${wordsNow > wordsBefore ? "+" : ""}${wordsNow - wordsBefore} words`);
    }
    if (what.length) changed.push({ url: page.url, what });
  }

  const health = scores.find((s) => s.key === "health")!;
  const headline = fixed.length || appeared.length
    ? `${fixed.length} resolved, ${appeared.length} new, search health ${health.change >= 0 ? "up" : "down"} ${Math.abs(health.change).toFixed(1)} points.`
    : `No change in findings since the last run.`;

  const narrative: string[] = [];
  if (fixed.length) {
    const serious = fixed.filter((f) => f.severity === "critical" || f.severity === "high");
    narrative.push(
      `${fixed.length} findings cleared since ${new Date(previous.finishedAt).toLocaleDateString()}` +
      (serious.length ? `, including ${serious.length} serious ${serious.length === 1 ? "one" : "ones"}: ${serious.slice(0, 3).map((f) => f.title.toLowerCase()).join(", ")}.` : "."),
    );
  }
  if (appeared.length) {
    const serious = appeared.filter((f) => f.severity === "critical" || f.severity === "high");
    narrative.push(
      `${appeared.length} new findings appeared` +
      (serious.length ? `, ${serious.length} of them serious. Worth looking at first: ${serious[0].title.toLowerCase()}${serious[0].url ? ` on ${serious[0].url}` : ""}.` : ", none of them serious."),
    );
  }
  if (worsened.length) {
    narrative.push(`${worsened.length} findings got worse: ${worsened.slice(0, 3).map((w) => `${w.finding.title.toLowerCase()} (${w.from} to ${w.to})`).join(", ")}.`);
  }
  if (added.length || removed.length) {
    narrative.push(`${added.length} pages appeared and ${removed.length} disappeared since the last crawl.`);
  }
  if (changed.length) {
    narrative.push(`${changed.length} existing pages changed: ${changed.slice(0, 3).map((c) => `${c.url.replace(/^https?:\/\/[^/]+/, "")} (${c.what.join(", ")})`).join("; ")}.`);
  }
  const moved = scores.filter((s) => Math.abs(s.change) >= 0.5);
  if (moved.length) {
    narrative.push(`Scores: ${moved.map((s) => `${s.label} ${s.from.toFixed(1)} to ${s.to.toFixed(1)}`).join(", ")}.`);
  } else {
    narrative.push("Scores are flat, which on a site with open findings means the work has not shipped yet.");
  }

  return {
    previousRunId: previous.runId,
    previousAt: previous.finishedAt,
    currentRunId: current.runId,
    currentAt: current.finishedAt,
    scores,
    findings: { fixed, appeared, worsened, unchanged },
    pages: { added, removed, changed },
    headline,
    narrative,
  };
}
