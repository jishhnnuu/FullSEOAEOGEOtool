/**
 * The programme, pinned to the two things that make it more than a progress
 * bar: a stage is blocked rather than guessed at when the data that would
 * decide it is missing, and a milestone is rare enough to be worth reading.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { assessProgramme, milestonesBetween } from "../src/engine/progress";
import type { AuditResult, Finding, ScoreBreakdown } from "../src/engine/types";

function score(value: number, measured = true): ScoreBreakdown {
  return { score: value, components: {}, counts: {}, topIssues: [], measured, unmeasuredReason: null, unmeasuredFix: null };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: Math.random().toString(36).slice(2),
    code: "page_noindex",
    category: "technical",
    severity: "critical",
    title: "Noindex",
    why: "It cannot rank.",
    recommendation: "Remove it.",
    detail: "",
    url: "https://example.com/a",
    affectedUrls: ["https://example.com/a"],
    affectedCount: 1,
    evidence: {},
    priority: 95,
    impact: 9,
    effort: 1,
    confidence: 1,
    autoFixable: true,
    fixStrategy: null,
    fix: null,
    status: "open",
    firstSeen: "2026-05-01T00:00:00Z",
    lastSeen: "2026-06-01T00:00:00Z",
    ...over,
  };
}

function audit(findings: Finding[]): AuditResult {
  return {
    version: 1, siteId: "s", runId: "r", startedAt: "2026-06-01T00:00:00Z", finishedAt: "2026-06-01T00:01:00Z",
    durationMs: 1000, crawl: { pages: [], files: {} as never, fetched: 0 } as never,
    findings,
    scores: { health: score(70), aeo: score(50), authority: score(0, false), experience: score(0, false) },
    keywords: [], gaps: [], briefs: [], prospects: [], aeo: {} as never, local: {} as never,
    inventory: [], coverage: {} as never, steps: [], quickWins: [], estimatedAgencyHours: 8, notes: [],
  };
}

const base = { mentionsTracked: 0, linksVerified: 0, scheduled: false, cleanRuns: 0 };

test("without Search Console the competitive stage is blocked, not guessed", () => {
  const programme = assessProgramme({ result: audit([]), hasSearchData: false, ...base });
  const competitive = programme.stages.find((stage) => stage.key === "competitive");
  assert.equal(competitive?.status, "blocked");
  assert.ok(competitive?.blockedBy && competitive.blockedBy.length > 40);
  // A blocked stage steps aside rather than stopping the programme.
  assert.notEqual(programme.current, "competitive");
});

test("with Search Console it is workable", () => {
  const programme = assessProgramme({ result: audit([]), hasSearchData: true, ...base });
  assert.notEqual(programme.stages.find((stage) => stage.key === "competitive")?.status, "blocked");
});

test("the current stage is the first unfinished one, in order", () => {
  const programme = assessProgramme({ result: audit([finding({ code: "page_noindex" })]), hasSearchData: true, ...base });
  assert.equal(programme.current, "crawlable");
  assert.ok(programme.headline.length > 20);
  assert.ok(programme.nextUp.length > 20);
});

test("nothing run means nothing claimed", () => {
  const programme = assessProgramme({ result: null, hasSearchData: false, ...base });
  assert.match(programme.headline, /Nothing has run yet/);
  assert.equal(programme.overall < 0.6, true);
});

test("every stage says how you know it is finished", () => {
  const programme = assessProgramme({ result: audit([]), hasSearchData: true, ...base });
  for (const stage of programme.stages) {
    assert.ok(stage.definitionOfDone.length > 30, `${stage.key} needs a checkable definition of done`);
    assert.ok(stage.whyNow.length > 30, `${stage.key} needs to say why it is in this position`);
    assert.ok(stage.progress >= 0 && stage.progress <= 1);
  }
});

test("only a stage completing or regressing earns a notification", () => {
  const before = assessProgramme({ result: audit([finding()]), hasSearchData: true, ...base });
  const after = assessProgramme({ result: audit([]), hasSearchData: true, ...base });

  assert.deepEqual(milestonesBetween(null, after), [], "the first reading is not news");

  const milestones = milestonesBetween(before, after);
  assert.ok(milestones.every((milestone) => milestone.notify), "anything emitted here is worth an interruption");
  assert.ok(milestones.every((milestone) => milestone.what.length > 20));

  const backwards = milestonesBetween(after, before);
  assert.ok(backwards.some((milestone) => milestone.kind === "regression"), "going backwards has to be said out loud");
});
