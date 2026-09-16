/**
 * The schedule, pinned to the parts that would quietly lie.
 *
 * Two things matter. The next fire time has to be right, because a schedule
 * that silently fires on the wrong day is worse than none. And the screen has
 * to say which jobs actually run with nobody present, because claiming a
 * scheduled audit that never happens is the exact failure this product exists
 * to not commit.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  JOBS,
  defaultEntry,
  describe as describeSchedule,
  headlessNote,
  isDue,
  nextRunAt,
  suggestCadence,
  type ScheduleEntry,
} from "../src/engine/schedule";

function entry(over: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return { ...defaultEntry("audit"), enabled: true, timezone: "UTC", hour: 7, weekday: 1, ...over };
}

test("a disabled schedule has no next run at all", () => {
  assert.equal(nextRunAt(entry({ enabled: false })), null);
  assert.equal(nextRunAt(entry({ cadence: "off" })), null);
});

test("weekly lands on the chosen weekday, in the future", () => {
  // A Wednesday.
  const from = new Date("2026-06-10T09:00:00Z");
  const next = nextRunAt(entry({ cadence: "weekly", weekday: 1, hour: 7 }), from);
  assert.ok(next);
  const when = new Date(next);
  assert.equal(when.getUTCDay(), 1, "Monday");
  assert.equal(when.getUTCHours(), 7);
  assert.ok(when.getTime() > from.getTime(), "never in the past");
});

test("daily moves to tomorrow once today's hour has passed", () => {
  const before = nextRunAt(entry({ cadence: "daily", hour: 7 }), new Date("2026-06-10T05:00:00Z"));
  const after = nextRunAt(entry({ cadence: "daily", hour: 7 }), new Date("2026-06-10T09:00:00Z"));
  assert.equal(before, "2026-06-10T07:00:00.000Z");
  assert.equal(after, "2026-06-11T07:00:00.000Z");
});

test("monthly clamps to the 28th, so February never swallows a run", () => {
  const next = nextRunAt(entry({ cadence: "monthly", monthday: 31, hour: 6 }), new Date("2026-01-15T00:00:00Z"));
  assert.ok(next);
  assert.equal(new Date(next).getUTCDate(), 28);
});

test("a job that has never run is due", () => {
  assert.equal(isDue(entry({ cadence: "daily" }), null, new Date("2026-06-10T09:00:00Z")), true);
  const justRan = "2026-06-10T07:00:00.000Z";
  assert.equal(isDue(entry({ cadence: "daily", hour: 7 }), justRan, new Date("2026-06-10T09:00:00Z")), false);
  assert.equal(isDue(entry({ cadence: "daily", hour: 7 }), justRan, new Date("2026-06-11T09:00:00Z")), true);
});

test("the cadence suggested depends on the site, not on a default nobody chose", () => {
  const broken = suggestCadence({ pages: 20, severeOpen: 4, hasSearchData: true });
  assert.equal(broken.find((s) => s.job === "audit")?.cadence, "weekly");

  const small = suggestCadence({ pages: 18, severeOpen: 0, hasSearchData: true, changedSinceLastRun: 0, publishesPerMonth: 0 });
  assert.equal(small.find((s) => s.job === "audit")?.cadence, "monthly");

  const big = suggestCadence({ pages: 2000, severeOpen: 0, hasSearchData: true });
  assert.equal(big.find((s) => s.job === "audit")?.cadence, "weekly");

  // Nothing connected means nothing to sample, and it says so rather than
  // scheduling a job that could only fail.
  const blind = suggestCadence({ pages: 50, severeOpen: 0, hasSearchData: false });
  assert.equal(blind.find((s) => s.job === "measure")?.cadence, "off");
  for (const suggestion of blind) assert.ok(suggestion.why.length > 30, "every suggestion carries a reason");
});

test("the screen says which jobs need a browser open, by name", () => {
  const off = headlessNote([entry({ enabled: false })]);
  assert.match(off, /Nothing is scheduled/);

  const headlessOnly = headlessNote([entry({ job: "measure", cadence: "daily" }), entry({ job: "report", cadence: "monthly" })]);
  assert.match(headlessOnly, /runs on its own/);

  const needsTab = headlessNote([entry({ job: "audit", cadence: "weekly" }), entry({ job: "measure", cadence: "daily" })]);
  assert.match(needsTab, /full audit/i);
  assert.match(needsTab, /browser/);
});

test("every job declares whether it can run headless, and only two can", () => {
  const headless = Object.values(JOBS).filter((job) => job.runsHeadless).map((job) => job.key);
  assert.deepEqual(headless.sort(), ["measure", "report"]);
  for (const job of Object.values(JOBS)) assert.ok(job.does.length > 20, `${job.key} has to say what it does`);
});

test("a schedule describes itself in words a person would use", () => {
  assert.equal(describeSchedule(entry({ cadence: "weekly", weekday: 2, hour: 9 })), "Every Tuesday at 09:00 UTC");
  assert.equal(describeSchedule(entry({ cadence: "monthly", monthday: 3, hour: 6 })), "On the 3rd of each month at 06:00 UTC");
  assert.equal(describeSchedule(entry({ enabled: false })), "Off");
});
