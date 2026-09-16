/**
 * The report, pinned to the rule that separates a report from a flattering
 * picture: it refuses to say what the work earned when nothing measured it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReport, compareRuns, rangeFor, reportAsText, summariseWork, type WorkItem } from "../src/engine/report";
import type { AuditResult, Finding, ScoreBreakdown } from "../src/engine/types";

function score(value: number, measured = true): ScoreBreakdown {
  return { score: value, components: {}, counts: {}, topIssues: [], measured, unmeasuredReason: null, unmeasuredFix: null };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    code: "title_missing",
    category: "content",
    severity: "high",
    title: "Title missing",
    why: "A page with no title is not classified.",
    recommendation: "Write one.",
    detail: "",
    url: "https://example.com/a",
    affectedUrls: ["https://example.com/a"],
    affectedCount: 1,
    evidence: {},
    priority: 70,
    impact: 7,
    effort: 2,
    confidence: 0.9,
    autoFixable: true,
    fixStrategy: null,
    fix: null,
    status: "open",
    firstSeen: "2026-05-01T00:00:00Z",
    lastSeen: "2026-06-01T00:00:00Z",
    ...over,
  };
}

function audit(findings: Finding[], scores = { health: 70, aeo: 50 }): AuditResult {
  return {
    version: 1,
    siteId: "s1",
    runId: "r1",
    startedAt: "2026-06-01T00:00:00Z",
    finishedAt: "2026-06-01T00:10:00Z",
    durationMs: 600000,
    crawl: { pages: [], files: {} as never, fetched: 0 } as never,
    findings,
    scores: {
      health: score(scores.health),
      aeo: score(scores.aeo),
      // Deliberately unmeasured, the way a crawl-only run really is.
      authority: score(0, false),
      experience: score(0, false),
    },
    keywords: [],
    gaps: [],
    briefs: [],
    prospects: [],
    aeo: {} as never,
    local: {} as never,
    inventory: [],
    coverage: {} as never,
    steps: [],
    quickWins: [],
    estimatedAgencyHours: 12,
    notes: [],
  };
}

test("a period carries the one before it, for comparison", () => {
  const now = new Date("2026-06-30T00:00:00Z");
  const { current, previous } = rangeFor("month", now);
  assert.equal(current.to, now.toISOString());
  assert.equal(previous.to, current.from, "the two periods have to meet, with no gap and no overlap");
  assert.match(current.label, /30 days/);
});

test("a score nobody measured never reaches the report", () => {
  const change = compareRuns(audit([finding()]), audit([]));
  const keys = change.scores.map((move) => move.key);
  assert.deepEqual(keys, ["health", "aeo"], "authority and experience are unmeasured and must not appear");
});

test("with nothing connected, the report says so instead of substituting crawl movement", () => {
  const change = compareRuns(audit([]), null);
  assert.equal(change.measurementMissing, true);
  assert.equal(change.measured.length, 0);
});

test("cleared and appeared are computed per finding and per URL", () => {
  const before = audit([finding({ code: "title_missing", url: "https://example.com/a" })]);
  const after = audit([finding({ code: "h1_missing", url: "https://example.com/b" })]);
  const change = compareRuns(after, before);
  assert.equal(change.cleared.length, 1);
  assert.equal(change.appeared.length, 1);
  assert.equal(change.cleared[0].code, "title_missing");
});

test("work is counted from what happened, in range, and nothing else", () => {
  const range = rangeFor("month", new Date("2026-06-30T00:00:00Z")).current;
  const items: WorkItem[] = [
    { at: "2026-06-20T00:00:00Z", kind: "fix_published", what: "Meta on /pricing", url: null },
    { at: "2026-06-21T00:00:00Z", kind: "fix_published", what: "Meta on /about", url: null },
    { at: "2026-01-01T00:00:00Z", kind: "fix_published", what: "Ancient", url: null },
  ];
  const summary = summariseWork(items, range);
  assert.equal(summary.total, 2, "the January item is outside the period");
  assert.match(summary.headline, /2 changes went live/);
});

test("nothing published is said plainly rather than dressed up", () => {
  const range = rangeFor("week", new Date("2026-06-30T00:00:00Z")).current;
  const summary = summariseWork(
    [{ at: "2026-06-28T00:00:00Z", kind: "fix_approved", what: "Something", url: null }],
    range,
  );
  assert.match(summary.headline, /nothing was published/);
});

test("the report reads as prose and states the missing measurement first", () => {
  const report = buildReport({
    period: "month",
    site: { name: "Example", url: "https://example.com" },
    work: [],
    current: audit([finding({ severity: "critical" })]),
    previous: null,
    now: new Date("2026-06-30T00:00:00Z"),
  });

  assert.ok(report.narrative.some((line) => /Connecting Search Console/.test(line)));
  assert.ok(report.next.some((item) => /Connect Search Console/.test(item.what)));
  assert.ok(report.next.some((item) => /severe finding/.test(item.what)));

  const text = reportAsText(report);
  assert.ok(text.includes("Example"));
  assert.ok(!text.includes("undefined"));
  assert.ok(!/—|–/.test(text), "no em or en dashes reach a client-facing report");
});

test("a flat month is reported as flat, with the reason", () => {
  const report = buildReport({
    period: "month",
    site: { name: "Example", url: "https://example.com" },
    work: [],
    current: audit([]),
    previous: audit([]),
    measurements: { clicks: { before: 100, after: 101 } },
    firstRunAt: "2026-06-01T00:00:00Z",
    now: new Date("2026-06-30T00:00:00Z"),
  });
  assert.ok(report.narrative.some((line) => /flat at 101/.test(line)), report.narrative.join(" | "));
});
