/**
 * The schedule, as it is stored.
 *
 * One row per site per job, with the next fire time computed on write rather
 * than on read, so the cron's query is an index scan over `next_run_at` and
 * not a pass over every schedule in the database doing date arithmetic.
 *
 * `dueNow()` is the one function here that reads across tenants. It has to:
 * the cron has no session and no org. It is not reachable from a route, it
 * never returns anything a route could echo back, and everything it hands to
 * the runner carries its own `org_id` so every subsequent read is scoped the
 * normal way.
 */

import { newId } from "./crypto";
import { database, type Env } from "./env";
import { fetchScoped, insert, listScoped, nowIso, upsert } from "./db";
import { JOBS, defaultEntry, nextRunAt, type Cadence, type JobKey, type ScheduleEntry } from "@/engine/schedule";

export type ScheduleRow = {
  id: string;
  org_id: string;
  site_id: string;
  job: string;
  cadence: string;
  hour: number;
  weekday: number;
  monthday: number;
  timezone: string;
  enabled: number;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_detail: string | null;
  updated_at: string;
};

export type ScheduleView = ScheduleEntry & {
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastDetail: string | null;
};

const JOB_KEYS = Object.keys(JOBS) as JobKey[];
const CADENCES: Cadence[] = ["daily", "weekly", "fortnightly", "monthly", "off"];

function toView(row: ScheduleRow): ScheduleView {
  return {
    job: (JOB_KEYS.includes(row.job as JobKey) ? row.job : "audit") as JobKey,
    cadence: (CADENCES.includes(row.cadence as Cadence) ? row.cadence : "off") as Cadence,
    hour: Number(row.hour) || 0,
    weekday: Number(row.weekday) || 0,
    monthday: Number(row.monthday) || 1,
    timezone: row.timezone || "UTC",
    enabled: row.enabled === 1,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
    lastDetail: row.last_detail,
  };
}

/** Every job for a site, with the ones never configured filled in as off. */
export async function listSchedules(e: Env, orgId: string, siteId: string): Promise<ScheduleView[]> {
  const rows = await listScoped<ScheduleRow>(e, "schedules", orgId, {
    orderBy: "job ASC",
    where: "site_id = ?2",
    bind: [siteId],
  });
  const bySite = new Map(rows.map((row) => [row.job, row]));
  return JOB_KEYS.map((job) => {
    const row = bySite.get(job);
    if (row) return toView(row);
    return { ...defaultEntry(job), nextRunAt: null, lastRunAt: null, lastStatus: null, lastDetail: null };
  });
}

export async function saveSchedule(
  e: Env,
  orgId: string,
  siteId: string,
  entry: ScheduleEntry,
): Promise<ScheduleView> {
  // The site has to belong to this org. A 404 from the caller is the answer
  // when it does not, which is the same answer as "no such site".
  const site = await fetchScoped(e, "sites", siteId, orgId);
  if (!site) throw new Error("no such site");

  const next = nextRunAt(entry);
  await upsert(e, "schedules", ["site_id", "job"], {
    id: newId("sch"),
    org_id: orgId,
    site_id: siteId,
    job: entry.job,
    cadence: entry.cadence,
    hour: entry.hour,
    weekday: entry.weekday,
    monthday: entry.monthday,
    timezone: entry.timezone,
    enabled: entry.enabled ? 1 : 0,
    next_run_at: next,
    updated_at: nowIso(),
  });

  return { ...entry, nextRunAt: next, lastRunAt: null, lastStatus: null, lastDetail: null };
}

/* ------------------------------------------------------------ the cron */

export type DueJob = ScheduleView & { id: string; orgId: string; siteId: string };

/**
 * Everything whose time has come, across every tenant.
 *
 * Capped, because a cron invocation on the free plan has a budget measured in
 * milliseconds of CPU. Anything not picked up this hour is picked up the next,
 * and `next_run_at` ordering means the longest-overdue goes first.
 */
export async function dueNow(
  e: Env,
  now: Date = new Date(),
  limit = 25,
  jobs?: JobKey[],
): Promise<DueJob[]> {
  // The job list is an allow-list of literals from JOBS, never user input, so
  // interpolating it is safe and keeps D1 from needing a variadic bind.
  const allowed = (jobs ?? JOB_KEYS).filter((job) => JOB_KEYS.includes(job));
  if (allowed.length === 0) return [];
  const filter = allowed.map((job) => `'${job}'`).join(", ");

  const result = await database(e)
    .prepare(
      `SELECT * FROM schedules WHERE enabled = 1 AND job IN (${filter}) ` +
        "AND next_run_at IS NOT NULL AND next_run_at <= ?1 " +
        "ORDER BY next_run_at ASC LIMIT ?2",
    )
    .bind(now.toISOString(), Math.max(1, Math.floor(limit)))
    .all<ScheduleRow>();

  return (result.results ?? []).map((row) => ({
    ...toView(row),
    id: row.id,
    orgId: row.org_id,
    siteId: row.site_id,
  }));
}

/** Record the outcome and move the clock forward. Always called, even on failure. */
export async function completeRun(
  e: Env,
  job: DueJob,
  outcome: { status: "ok" | "skipped" | "failed"; detail: string },
  now: Date = new Date(),
): Promise<void> {
  const next = nextRunAt(job, now);
  await database(e)
    .prepare(
      "UPDATE schedules SET last_run_at = ?1, last_status = ?2, last_detail = ?3, next_run_at = ?4, updated_at = ?1 " +
        "WHERE id = ?5",
    )
    .bind(now.toISOString(), outcome.status, outcome.detail.slice(0, 400), next, job.id)
    .run();
}

/* ------------------------------------------------------- what was measured */

export type MeasurementRow = {
  id: string;
  org_id: string;
  site_id: string;
  taken_at: string;
  source: string;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
  ctr: number | null;
  sessions: number | null;
  conversions: number | null;
  detail: string | null;
};

export async function recordMeasurement(
  e: Env,
  input: {
    orgId: string;
    siteId: string;
    source: "gsc" | "ga4";
    clicks?: number | null;
    impressions?: number | null;
    position?: number | null;
    ctr?: number | null;
    sessions?: number | null;
    conversions?: number | null;
    detail?: unknown;
  },
): Promise<void> {
  await insert(e, "measurements", {
    id: newId("msr"),
    org_id: input.orgId,
    site_id: input.siteId,
    taken_at: nowIso(),
    source: input.source,
    clicks: input.clicks ?? null,
    impressions: input.impressions ?? null,
    position: input.position ?? null,
    ctr: input.ctr ?? null,
    sessions: input.sessions ?? null,
    conversions: input.conversions ?? null,
    detail: input.detail === undefined ? null : JSON.stringify(input.detail).slice(0, 4000),
  });
}

/** The readings for a site, oldest first, so a chart can plot them directly. */
export async function series(
  e: Env,
  orgId: string,
  siteId: string,
  options: { since?: string; limit?: number } = {},
): Promise<MeasurementRow[]> {
  const rows = await listScoped<MeasurementRow>(e, "measurements", orgId, {
    orderBy: "taken_at DESC",
    where: options.since ? "site_id = ?2 AND taken_at >= ?3" : "site_id = ?2",
    bind: options.since ? [siteId, options.since] : [siteId],
    limit: options.limit ?? 400,
  });
  return rows.reverse();
}

/* ------------------------------------------------------------ milestones */

export type MilestoneRow = {
  id: string;
  org_id: string;
  site_id: string;
  at: string;
  kind: string;
  what: string;
  notified_at: string | null;
  seen_at: string | null;
};

export async function addMilestone(
  e: Env,
  input: { orgId: string; siteId: string; kind: string; what: string },
): Promise<void> {
  await insert(e, "milestones", {
    id: newId("mst"),
    org_id: input.orgId,
    site_id: input.siteId,
    at: nowIso(),
    kind: input.kind,
    what: input.what.slice(0, 600),
    notified_at: null,
    seen_at: null,
  });
}

export async function listMilestones(e: Env, orgId: string, siteId: string, limit = 50): Promise<MilestoneRow[]> {
  return listScoped<MilestoneRow>(e, "milestones", orgId, {
    orderBy: "at DESC",
    where: "site_id = ?2",
    bind: [siteId],
    limit,
  });
}

export async function markSeen(e: Env, orgId: string, siteId: string): Promise<void> {
  await database(e)
    .prepare("UPDATE milestones SET seen_at = ?1 WHERE org_id = ?2 AND site_id = ?3 AND seen_at IS NULL")
    .bind(nowIso(), orgId, siteId)
    .run();
}

/* ------------------------------------------------------- who to write to */

/** The owner's address, for a report or a milestone. Null when there is none. */
export async function ownerEmail(e: Env, orgId: string): Promise<string | null> {
  const row = await database(e)
    .prepare(
      "SELECT users.email AS email FROM memberships " +
        "JOIN users ON users.id = memberships.user_id " +
        "WHERE memberships.org_id = ?1 ORDER BY memberships.created_at ASC LIMIT 1",
    )
    .bind(orgId)
    .first<{ email: string }>();
  return row?.email ?? null;
}

/** Milestones that have not been emailed yet, oldest first. */
export async function unnotified(e: Env, orgId: string, siteId: string): Promise<MilestoneRow[]> {
  const rows = await listScoped<MilestoneRow>(e, "milestones", orgId, {
    orderBy: "at ASC",
    where: "site_id = ?2 AND notified_at IS NULL",
    bind: [siteId],
    limit: 20,
  });
  return rows;
}

export async function markNotified(e: Env, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = nowIso();
  const db = database(e);
  await db.batch(ids.map((id) => db.prepare("UPDATE milestones SET notified_at = ?1 WHERE id = ?2").bind(now, id)));
}
