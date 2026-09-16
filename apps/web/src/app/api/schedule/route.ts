/**
 * The schedule for one site: read it, change it, and see what has run.
 *
 * Everything here needs an account, because a schedule is a promise to do
 * something while the tab is closed and there is nowhere to keep that promise
 * without one. Signed out, this answers with the jobs all off and the reason,
 * which is what the screen renders rather than an error.
 */

import { env } from "@/server/env";
import { ensureSchema } from "@/server/schema";
import { fail, handleError, json, sameOrigin } from "@/server/http";
import { identify } from "@/server/session";
import { record } from "@/server/db";
import {
  listMilestones,
  listSchedules,
  markSeen,
  saveSchedule,
  series,
} from "@/server/schedules";
import { JOBS, defaultEntry, type Cadence, type JobKey, type ScheduleEntry } from "@/engine/schedule";

export const dynamic = "force-dynamic";

const JOB_KEYS = Object.keys(JOBS) as JobKey[];
const CADENCES: Cadence[] = ["daily", "weekly", "fortnightly", "monthly", "off"];

export async function GET(request: Request): Promise<Response> {
  try {
    const e = await env();
    await ensureSchema(e);
    const who = await identify(e, request).catch(() => null);
    const siteId = new URL(request.url).searchParams.get("site") ?? "";

    if (!who) {
      return json({
        signedIn: false,
        reason:
          "A schedule runs while this tab is closed, which needs an account for the platform to know whose site it is and where to send the report.",
        schedules: JOB_KEYS.map((job) => ({ ...defaultEntry(job), nextRunAt: null, lastRunAt: null, lastStatus: null, lastDetail: null })),
        measurements: [],
        milestones: [],
      });
    }
    if (!siteId) return fail("no_site", "Which site's schedule?");

    const [schedules, measurements, milestones] = await Promise.all([
      listSchedules(e, who.orgId, siteId),
      series(e, who.orgId, siteId, { limit: 200 }),
      listMilestones(e, who.orgId, siteId, 30),
    ]);

    return json({ signedIn: true, schedules, measurements, milestones });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return fail("bad_origin", "That request did not come from this site.", 403);
  try {
    const e = await env();
    await ensureSchema(e);
    const who = await identify(e, request).catch(() => null);
    if (!who) return fail("no_account", "Signing in is what makes a schedule possible.", 401);

    const body = (await request.json().catch(() => ({}))) as { site?: string; entry?: Partial<ScheduleEntry> };
    if (!body.site) return fail("no_site", "Which site's schedule?");

    const entry = clean(body.entry ?? {});
    if (!entry) return fail("bad_entry", "That is not a job this platform runs.");

    try {
      const saved = await saveSchedule(e, who.orgId, body.site, entry);
      await record(e, {
        orgId: who.orgId,
        userId: who.userId,
        action: "schedule.saved",
        target: body.site,
        detail: { job: entry.job, cadence: entry.cadence, enabled: entry.enabled },
      });
      return json({ schedule: saved });
    } catch {
      // A site that is not this org's is indistinguishable from one that does
      // not exist. Same rule as every other scoped read.
      return fail("no_site", "No such site.", 404);
    }
  } catch (error) {
    return handleError(error);
  }
}

/** Mark the milestones read, so the badge clears. */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return fail("bad_origin", "That request did not come from this site.", 403);
  try {
    const e = await env();
    await ensureSchema(e);
    const who = await identify(e, request).catch(() => null);
    if (!who) return fail("no_account", "Nothing to mark read without an account.", 401);
    const body = (await request.json().catch(() => ({}))) as { site?: string };
    if (!body.site) return fail("no_site", "Which site?");
    await markSeen(e, who.orgId, body.site);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

function clean(input: Partial<ScheduleEntry>): ScheduleEntry | null {
  if (!input.job || !JOB_KEYS.includes(input.job)) return null;
  const base = defaultEntry(input.job);
  const cadence = input.cadence && CADENCES.includes(input.cadence) ? input.cadence : base.cadence;
  return {
    job: input.job,
    cadence,
    hour: clamp(input.hour ?? base.hour, 0, 23),
    weekday: clamp(input.weekday ?? base.weekday, 0, 6),
    monthday: clamp(input.monthday ?? base.monthday, 1, 28),
    // A timezone is a label here, not a lookup. Anything unprintable is dropped.
    timezone: typeof input.timezone === "string" && /^[A-Za-z0-9_+\-/]{1,64}$/.test(input.timezone) ? input.timezone : base.timezone,
    enabled: Boolean(input.enabled) && cadence !== "off",
  };
}

function clamp(value: number, low: number, high: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return low;
  return Math.min(high, Math.max(low, n));
}
