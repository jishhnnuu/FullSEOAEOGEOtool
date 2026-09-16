/**
 * The work that happens while nobody is looking.
 *
 * Two jobs run here, and only two: the measurement sample and the report.
 * Both are a handful of API calls, which is what a cron invocation on a free
 * Cloudflare plan can afford. The audit itself runs in the browser, so a
 * scheduled crawl waits for the next time the app is opened and then starts on
 * its own. That is stated on the schedule screen rather than hidden, because a
 * schedule that quietly does nothing is worse than no schedule.
 *
 * Every job is wrapped: a failure records itself against the schedule and the
 * clock still moves forward, so one broken connection cannot stop every other
 * tenant's schedule behind it.
 */

import { connectionFor } from "./connections";
import { database, type Env } from "./env";
import * as ga4 from "./ga4";
import * as gsc from "./gsc";
import { send } from "./mail";
import { ensureSchema } from "./schema";
import {
  addMilestone,
  completeRun,
  dueNow,
  ownerEmail,
  recordMeasurement,
  series,
  type DueJob,
  type MeasurementRow,
} from "./schedules";

export type TickResult = { ran: number; ok: number; failed: number; skipped: number; notes: string[] };

/** One cron firing. */
export async function tick(e: Env, now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = { ran: 0, ok: 0, failed: 0, skipped: 0, notes: [] };
  if (!e.DB) {
    result.notes.push("No database is bound, so there is no schedule to run.");
    return result;
  }
  await ensureSchema(e);

  // Only the jobs that can genuinely run without a browser.
  const due = await dueNow(e, now, 25, ["measure", "report"]);
  for (const job of due) {
    result.ran += 1;
    try {
      const outcome = job.job === "measure" ? await sample(e, job) : await deliver(e, job, now);
      if (outcome.status === "ok") result.ok += 1;
      else result.skipped += 1;
      result.notes.push(`${job.job} ${job.siteId}: ${outcome.detail}`);
      await completeRun(e, job, outcome, now);
    } catch (error) {
      result.failed += 1;
      const detail = error instanceof Error ? error.message : String(error);
      result.notes.push(`${job.job} ${job.siteId}: ${detail}`);
      await completeRun(e, job, { status: "failed", detail }, now).catch(() => undefined);
    }
  }
  return result;
}

type Outcome = { status: "ok" | "skipped" | "failed"; detail: string };

/* ------------------------------------------------------- the daily reading */

/**
 * One dated reading of the numbers.
 *
 * A rolling seven-day window ending three days back, because Search Console's
 * data is incomplete for the last two or three days and a series built from
 * the raw edge reports a cliff that is really just the window.
 */
async function sample(e: Env, job: DueJob): Promise<Outcome> {
  const notes: string[] = [];

  const search = await connectionFor(e, job.orgId, "gsc", job.siteId);
  if (search) {
    const property = propertyOf(search.selection, "siteUrl");
    if (!property) {
      notes.push("Search Console is connected but no property is chosen for this site.");
    } else {
      const performance = await gsc.performance(e, search, { property, dimensions: [], days: 7, lagDays: 3 });
      await recordMeasurement(e, {
        orgId: job.orgId,
        siteId: job.siteId,
        source: "gsc",
        clicks: performance.totals.clicks,
        impressions: performance.totals.impressions,
        ctr: performance.totals.ctr,
        position: performance.totals.position,
        detail: { property, window: "7d ending 3d ago" },
      });
      notes.push(`Search Console: ${Math.round(performance.totals.clicks)} clicks over seven days.`);
    }
  }

  const analytics = await connectionFor(e, job.orgId, "ga4", job.siteId);
  if (analytics) {
    const propertyId = propertyOf(analytics.selection, "propertyId");
    if (!propertyId) {
      notes.push("Analytics is connected but no property is chosen for this site.");
    } else {
      const report = await ga4.report(e, analytics, {
        propertyId,
        dimensions: [],
        metrics: ["sessions", "conversions"],
        days: 7,
        limit: 1,
      });
      const row = report.rows[0];
      await recordMeasurement(e, {
        orgId: job.orgId,
        siteId: job.siteId,
        source: "ga4",
        sessions: row?.metrics[0] ?? 0,
        conversions: row?.metrics[1] ?? 0,
        detail: { propertyId, window: "7d" },
      });
      notes.push(`Analytics: ${Math.round(row?.metrics[0] ?? 0)} sessions over seven days.`);
    }
  }

  if (notes.length === 0) {
    return {
      status: "skipped",
      detail: "Nothing is connected to measure. Connect Search Console and this starts recording a trend.",
    };
  }

  // A sudden fall is the one thing worth interrupting someone for.
  const drop = await checkForDrop(e, job);
  if (drop) {
    await addMilestone(e, { orgId: job.orgId, siteId: job.siteId, kind: "regression", what: drop });
    notes.push(drop);
  }

  return { status: "ok", detail: notes.join(" ") };
}

/** The chosen property, out of the connection's stored selection JSON. */
function propertyOf(selection: string | null, key: string): string | null {
  if (!selection) return null;
  try {
    const value = (JSON.parse(selection) as Record<string, unknown>)[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * A fall worth an email.
 *
 * Deliberately blunt: a third of the clicks gone, against a baseline of at
 * least twenty, comparing this reading to the median of the previous fortnight
 * rather than to yesterday. A median resists the single bad day that every
 * site has, and the floor of twenty stops a site with four clicks generating a
 * crisis every time it has three.
 */
async function checkForDrop(e: Env, job: DueJob): Promise<string | null> {
  const readings = (await series(e, job.orgId, job.siteId, { limit: 40 })).filter(
    (row) => row.source === "gsc" && row.clicks !== null,
  );
  if (readings.length < 5) return null;

  const latest = readings[readings.length - 1];
  const history = readings.slice(0, -1).slice(-14).map((row) => row.clicks ?? 0);
  const baseline = median(history);
  if (baseline < 20) return null;

  const current = latest.clicks ?? 0;
  if (current >= baseline * 0.67) return null;

  const fall = Math.round((1 - current / baseline) * 100);
  return (
    `Clicks from search fell ${fall}%, from a typical ${Math.round(baseline)} over seven days to ${Math.round(current)}. ` +
    "That is beyond the normal week-to-week swing, so something changed: a ranking, a page, or Search Console's own reporting. The next audit will say which."
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/* ------------------------------------------------------------ the report */

async function deliver(e: Env, job: DueJob, now: Date): Promise<Outcome> {
  const to = await ownerEmail(e, job.orgId);
  if (!to) return { status: "skipped", detail: "No account owner to send to." };

  const site = await database(e)
    .prepare("SELECT url, name FROM sites WHERE id = ?1 AND org_id = ?2")
    .bind(job.siteId, job.orgId)
    .first<{ url: string; name: string }>();
  if (!site) return { status: "skipped", detail: "The site this schedule belongs to is gone." };

  const days = job.cadence === "weekly" ? 7 : job.cadence === "fortnightly" ? 14 : 30;
  const since = new Date(now.getTime() - days * 2 * 86_400_000).toISOString();
  const readings = await series(e, job.orgId, job.siteId, { since });

  const text = digest({ site, days, readings, now });
  const sent = await send(e, {
    to,
    subject: `${site.name}: the last ${days} days`,
    text,
  });

  if (!sent.ok) return { status: "skipped", detail: sent.reason };
  return { status: "ok", detail: `Sent to ${to}.` };
}

/**
 * The email itself.
 *
 * Short on purpose, and it refuses to fill the space when there is nothing to
 * say. "Nothing moved, here is why that is expected" is a sentence worth
 * sending. An invented paragraph about momentum is not.
 */
function digest(input: {
  site: { url: string; name: string };
  days: number;
  readings: MeasurementRow[];
  now: Date;
}): string {
  const half = input.now.getTime() - input.days * 86_400_000;
  const recent = input.readings.filter((row) => Date.parse(row.taken_at) >= half);
  const earlier = input.readings.filter((row) => Date.parse(row.taken_at) < half);

  const lines: string[] = [
    `${input.site.name}: the last ${input.days} days`,
    "",
  ];

  const clicksNow = average(recent, "clicks");
  const clicksBefore = average(earlier, "clicks");
  const positionNow = average(recent, "position");
  const positionBefore = average(earlier, "position");

  if (clicksNow === null) {
    lines.push(
      "Nothing was measured in this period, which means Search Console is not connected or the schedule has not sampled yet.",
      "Until it is, this report can say what changed on the site but not what it earned. Connecting it takes one approval and costs nothing.",
    );
  } else {
    lines.push(`Clicks from search, seven-day average: ${round(clicksNow)}${trend(clicksNow, clicksBefore)}.`);
    if (positionNow !== null) {
      lines.push(`Average position: ${round(positionNow)}${trend(positionNow, positionBefore, false)}.`);
    }
    const sessions = average(recent, "sessions");
    if (sessions !== null) lines.push(`Sessions: ${round(sessions)}${trend(sessions, average(earlier, "sessions"))}.`);
    lines.push("");
    lines.push(
      "These are measurements, not estimates. Anything this report does not have a number for, it does not claim.",
    );
  }

  lines.push(
    "",
    "The full picture, including what was fixed and what is still open, is in the app:",
    input.site.url,
    "",
    "Open the app to run the audit for this period. The crawl runs in your browser rather than on our servers, which is why it waits for you.",
  );

  return lines.join("\n");
}

function average(rows: MeasurementRow[], key: keyof MeasurementRow): number | null {
  const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function trend(after: number, before: number | null, higherIsBetter = true): string {
  if (before === null || before === 0) return ", first reading";
  const percent = ((after - before) / before) * 100;
  if (Math.abs(percent) < 3) return ", flat against the period before";
  const direction = percent > 0 ? "up" : "down";
  const good = higherIsBetter ? percent > 0 : percent < 0;
  return `, ${direction} ${Math.abs(Math.round(percent))}% against the period before${good ? "" : " (the wrong way)"}`;
}
