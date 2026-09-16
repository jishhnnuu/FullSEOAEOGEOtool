/**
 * When the work runs, and what can run with nobody watching.
 *
 * An agency's value is partly that it turns up on Tuesday whether or not you
 * remembered to ask. A tool that only works when you open it is a tool, not a
 * retainer. So the programme has a schedule, the user picks the cadence, and
 * the platform suggests the cadence that fits their site rather than making
 * them guess.
 *
 * The honest part is the second half of this file. On the public deployment
 * the audit itself runs in the browser, which means a scheduled crawl needs a
 * tab open. Two jobs do run with nobody present, because they are a handful of
 * API calls rather than a hundred page fetches: sampling Search Console and
 * Analytics, and sending the report. Every job here carries `runsHeadless` and
 * the UI prints it, because a schedule that quietly does nothing is worse than
 * no schedule at all.
 */

export type Cadence = "daily" | "weekly" | "fortnightly" | "monthly" | "off";

export type JobKey = "audit" | "measure" | "report" | "visibility" | "mentions";

export type Job = {
  key: JobKey;
  name: string;
  /** What it does, in one sentence. */
  does: string;
  /** Whether it can run while nobody has the app open. */
  runsHeadless: boolean;
  /** What it needs before it can run at all. */
  needs: string[];
  /** Roughly what one run costs in time, so a cadence choice is informed. */
  weight: "light" | "medium" | "heavy";
};

export const JOBS: Record<JobKey, Job> = {
  audit: {
    key: "audit",
    name: "Full audit",
    does: "Crawls the site, runs every check, writes the fixes and diffs the result against the last run.",
    runsHeadless: false,
    needs: [],
    weight: "heavy",
  },
  measure: {
    key: "measure",
    name: "Measurement sample",
    does: "Reads clicks, impressions, position and sessions and stores a dated reading, so the report has a trend rather than a snapshot.",
    runsHeadless: true,
    needs: ["An account", "Search Console or Analytics connected"],
    weight: "light",
  },
  report: {
    key: "report",
    name: "Report",
    does: "Builds the period report from what was stored and emails it.",
    runsHeadless: true,
    needs: ["An account", "An email sender configured on the deployment"],
    weight: "light",
  },
  visibility: {
    key: "visibility",
    name: "AI answer check",
    does: "Asks the answer engines the prompts a buyer would ask and records whether the site was named.",
    runsHeadless: false,
    needs: ["Your own model key, which is held in your browser and never stored here"],
    weight: "medium",
  },
  mentions: {
    key: "mentions",
    name: "Mention sweep",
    does: "Looks for new mentions of the brand and checks whether links claimed earlier are still live.",
    runsHeadless: false,
    needs: [],
    weight: "medium",
  },
};

export type ScheduleEntry = {
  job: JobKey;
  cadence: Cadence;
  /** Hour of the day, 0 to 23, in the user's timezone. */
  hour: number;
  /** 0 is Sunday. Used by weekly and fortnightly. */
  weekday: number;
  /** Day of the month, 1 to 28. Used by monthly. */
  monthday: number;
  /** IANA timezone, so "Monday morning" means their Monday morning. */
  timezone: string;
  enabled: boolean;
};

export const DEFAULT_TIMEZONE = "UTC";

export function defaultEntry(job: JobKey): ScheduleEntry {
  return {
    job,
    cadence: job === "report" ? "monthly" : job === "measure" ? "daily" : "weekly",
    hour: 7,
    weekday: 1,
    monthday: 1,
    timezone: DEFAULT_TIMEZONE,
    enabled: false,
  };
}

/* ------------------------------------------------------------ suggestion */

export type Suggestion = { job: JobKey; cadence: Cadence; why: string };

/**
 * What cadence this site should actually run at.
 *
 * The inputs are the ones that change the answer: how big the site is, how
 * often it changes, whether anything is measured yet, and how much is still
 * broken. A fortnightly crawl of a 2,000 page ecommerce catalogue misses
 * things; a daily crawl of a twelve page brochure site burns time and finds
 * the same twelve pages. Neither of those is a preference, they are facts
 * about the site, so this is a recommendation rather than a default nobody
 * reads.
 */
export function suggestCadence(input: {
  pages: number;
  /** Pages whose content changed between the last two runs, when known. */
  changedSinceLastRun?: number | null;
  /** Open critical and high findings. */
  severeOpen: number;
  hasSearchData: boolean;
  publishesPerMonth?: number | null;
  businessType?: string;
}): Suggestion[] {
  const out: Suggestion[] = [];

  const churn = input.changedSinceLastRun ?? null;
  const busy = input.pages > 400 || (churn !== null && churn > 15) || (input.publishesPerMonth ?? 0) >= 8;
  const stable = input.pages < 60 && (churn === null || churn <= 2) && (input.publishesPerMonth ?? 0) <= 2;

  if (input.severeOpen > 0) {
    out.push({
      job: "audit",
      cadence: "weekly",
      why: `${input.severeOpen} severe finding${input.severeOpen === 1 ? " is" : "s are"} still open. Weekly until that is zero, so a fix that did not land is caught in days rather than a month.`,
    });
  } else if (busy) {
    out.push({
      job: "audit",
      cadence: "weekly",
      why:
        input.pages > 400
          ? `${input.pages} pages and a site that changes. Weekly catches a template change before it has been wrong for a month.`
          : "The site is edited often, and most regressions arrive with an edit rather than on their own.",
    });
  } else if (stable) {
    out.push({
      job: "audit",
      cadence: "monthly",
      why: "A small site that rarely changes finds the same things weekly. Monthly is honest, and the measurement sample below is what catches a sudden drop in between.",
    });
  } else {
    out.push({
      job: "audit",
      cadence: "fortnightly",
      why: "Big enough to move, not so big that a week between crawls misses anything. Fortnightly is the default an agency would pick.",
    });
  }

  out.push({
    job: "measure",
    cadence: input.hasSearchData ? "daily" : "off",
    why: input.hasSearchData
      ? "A daily reading costs one API call and is what makes a drop visible on the day it starts rather than at the next report."
      : "Nothing is connected to measure yet. Connect Search Console and this turns on.",
  });

  out.push({
    job: "report",
    cadence: "monthly",
    why: "Monthly is the cadence search actually moves at. A weekly report on a month-scale process teaches people to read noise as progress, and the app shows the week-on-week view for anyone who wants it in between.",
  });

  out.push({
    job: "visibility",
    cadence: "weekly",
    why: "Answer engines change what they say without anything changing on your site, so this is a reading of them rather than of you. Weekly is enough to see a trend inside a quarter.",
  });

  out.push({
    job: "mentions",
    cadence: "fortnightly",
    why: "New mentions arrive in ones and twos. Fortnightly keeps the outreach list fresh without re-checking the same domains every few days.",
  });

  return out;
}

/* -------------------------------------------------------------- the clock */

const DAY = 86_400_000;

/**
 * The next time this entry should run, after `from`.
 *
 * Timezone handling is deliberately shallow: the hour is interpreted against a
 * fixed offset derived from the zone at `from`, because a Worker has no zone
 * database and being an hour out twice a year matters less than pretending to
 * a precision we do not have. The stored zone is what the UI prints.
 */
export function nextRunAt(entry: ScheduleEntry, from: Date = new Date()): string | null {
  if (!entry.enabled || entry.cadence === "off") return null;

  const offsetMs = offsetOf(entry.timezone, from);
  // Work in the user's local wall clock, then convert back.
  const local = new Date(from.getTime() + offsetMs);
  const candidate = new Date(local.getTime());
  candidate.setUTCHours(entry.hour, 0, 0, 0);

  const advanceTo = (test: (d: Date) => boolean) => {
    let guard = 0;
    while ((candidate.getTime() <= local.getTime() || !test(candidate)) && guard < 400) {
      candidate.setTime(candidate.getTime() + DAY);
      candidate.setUTCHours(entry.hour, 0, 0, 0);
      guard += 1;
    }
  };

  switch (entry.cadence) {
    case "daily":
      if (candidate.getTime() <= local.getTime()) candidate.setTime(candidate.getTime() + DAY);
      break;
    case "weekly":
      advanceTo((d) => d.getUTCDay() === entry.weekday);
      break;
    case "fortnightly": {
      advanceTo((d) => d.getUTCDay() === entry.weekday);
      // Every other week, anchored to the epoch so two sites on the same
      // fortnightly schedule do not both land on the same day by accident.
      const weekIndex = Math.floor(candidate.getTime() / (7 * DAY));
      if (weekIndex % 2 !== 0) candidate.setTime(candidate.getTime() + 7 * DAY);
      break;
    }
    case "monthly":
      advanceTo((d) => d.getUTCDate() === Math.min(28, Math.max(1, entry.monthday)));
      break;
  }

  return new Date(candidate.getTime() - offsetMs).toISOString();
}

export function isDue(entry: ScheduleEntry, lastRunAt: string | null, now: Date = new Date()): boolean {
  if (!entry.enabled || entry.cadence === "off") return false;
  const anchor = lastRunAt ? new Date(Date.parse(lastRunAt)) : new Date(now.getTime() - 400 * DAY);
  const next = nextRunAt(entry, anchor);
  return next !== null && Date.parse(next) <= now.getTime();
}

/** The zone's current offset in milliseconds, or zero when it cannot be read. */
function offsetOf(timezone: string, at: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    );
    return asUtc - at.getTime();
  } catch {
    return 0;
  }
}

/* ---------------------------------------------------------- what it says */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function describe(entry: ScheduleEntry): string {
  if (!entry.enabled || entry.cadence === "off") return "Off";
  const time = `${String(entry.hour).padStart(2, "0")}:00`;
  const zone = entry.timezone === DEFAULT_TIMEZONE ? "UTC" : entry.timezone;
  switch (entry.cadence) {
    case "daily":
      return `Every day at ${time} ${zone}`;
    case "weekly":
      return `Every ${DAY_NAMES[entry.weekday] ?? "Monday"} at ${time} ${zone}`;
    case "fortnightly":
      return `Every other ${DAY_NAMES[entry.weekday] ?? "Monday"} at ${time} ${zone}`;
    case "monthly":
      return `On the ${ordinal(Math.min(28, Math.max(1, entry.monthday)))} of each month at ${time} ${zone}`;
    default:
      return "Off";
  }
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}

/**
 * The one sentence that stops a schedule being a lie.
 *
 * A job that cannot run without a tab open is listed as exactly that, with
 * what happens instead: the app runs it the next time it is opened, and the
 * report says when it last actually ran rather than when it was meant to.
 */
export function headlessNote(entries: ScheduleEntry[]): string {
  const on = entries.filter((entry) => entry.enabled && entry.cadence !== "off");
  const needsTab = on.filter((entry) => !JOBS[entry.job].runsHeadless);
  if (on.length === 0) return "Nothing is scheduled. The programme only moves when you open the app and run it.";
  if (needsTab.length === 0) {
    return "Everything you have scheduled runs on its own. Nothing needs this tab open.";
  }
  const names = needsTab.map((entry) => JOBS[entry.job].name.toLowerCase());
  return (
    `${names.join(" and ")} ${needsTab.length === 1 ? "runs" : "run"} in your browser, so ${needsTab.length === 1 ? "it" : "they"} wait for the next time you open the app and then start automatically. ` +
    "Everything else runs on the deployment without you. This is a property of running the audit in your browser rather than on our servers, which is also why no account of ours holds your site's data."
  );
}
