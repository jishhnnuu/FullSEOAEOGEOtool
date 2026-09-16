/**
 * The report an agency sends, generated from what actually happened.
 *
 * The thing a retainer really buys is not the work, it is knowing the work
 * happened and whether it did anything. An agency that does excellent work and
 * reports it badly gets fired; one that does adequate work and reports it well
 * does not. That is not a comment on clients, it is a comment on the fact that
 * search results are invisible from the inside.
 *
 * So this exists to answer three questions, in order, and to refuse to answer
 * the third when it cannot:
 *
 *   1. What did the platform do since the last report?
 *   2. What changed on the site because of it?
 *   3. What did that earn?
 *
 * The third needs Search Console or Analytics, and without them the report
 * says so rather than substituting crawl movement for business results. That
 * distinction is the difference between a report and a flattering picture.
 */

import type { AuditResult, Finding } from "./types";

export type Period = "week" | "month" | "quarter" | "custom";

export type PeriodRange = { from: string; to: string; label: string };

/** The range this report covers, and the one before it for comparison. */
export function rangeFor(period: Period, now = new Date(), custom?: { from: string; to: string }): { current: PeriodRange; previous: PeriodRange } {
  if (period === "custom" && custom) {
    const span = Date.parse(custom.to) - Date.parse(custom.from);
    return {
      current: { ...custom, label: `${custom.from.slice(0, 10)} to ${custom.to.slice(0, 10)}` },
      previous: {
        from: new Date(Date.parse(custom.from) - span).toISOString(),
        to: custom.from,
        label: "the equivalent period before",
      },
    };
  }
  const days = period === "week" ? 7 : period === "month" ? 30 : 90;
  const to = now.toISOString();
  const from = new Date(now.getTime() - days * 86_400_000).toISOString();
  const previousFrom = new Date(now.getTime() - days * 2 * 86_400_000).toISOString();
  const label = period === "week" ? "the last 7 days" : period === "month" ? "the last 30 days" : "the last 90 days";
  return {
    current: { from, to, label },
    previous: { from: previousFrom, to: from, label: `the ${days} days before that` },
  };
}

/* ------------------------------------------------------------ what we did */

export type WorkItem = {
  at: string;
  kind: "fix_published" | "fix_approved" | "content_drafted" | "run_completed" | "link_verified" | "mention_found" | "schema_added";
  what: string;
  /** The URL it happened to, when there is one. */
  url: string | null;
};

export type WorkSummary = {
  total: number;
  byKind: { kind: WorkItem["kind"]; count: number; label: string }[];
  /** The sentence a person reads first. */
  headline: string;
  items: WorkItem[];
};

const WORK_LABELS: Record<WorkItem["kind"], { one: string; many: string }> = {
  fix_published: { one: "change published to the live site", many: "changes published to the live site" },
  fix_approved: { one: "change approved", many: "changes approved" },
  content_drafted: { one: "piece drafted", many: "pieces drafted" },
  run_completed: { one: "full audit run", many: "full audit runs" },
  link_verified: { one: "link verified", many: "links verified" },
  mention_found: { one: "new mention found", many: "new mentions found" },
  schema_added: { one: "structured data block added", many: "structured data blocks added" },
};

export function summariseWork(items: WorkItem[], range: PeriodRange): WorkSummary {
  const inRange = items.filter((i) => i.at >= range.from && i.at <= range.to);
  const counts = new Map<WorkItem["kind"], number>();
  for (const item of inRange) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);

  const byKind = [...counts.entries()]
    .map(([kind, count]) => ({
      kind,
      count,
      label: count === 1 ? WORK_LABELS[kind].one : WORK_LABELS[kind].many,
    }))
    .sort((a, b) => b.count - a.count);

  const published = counts.get("fix_published") ?? 0;
  const headline =
    inRange.length === 0
      ? `Nothing ran in ${range.label}. A site with no runs has no report worth reading, so the first thing to fix is the schedule.`
      : published > 0
        ? `${published} change${published === 1 ? "" : "s"} went live in ${range.label}, alongside ${inRange.length - published} other action${inRange.length - published === 1 ? "" : "s"}.`
        : `${inRange.length} action${inRange.length === 1 ? "" : "s"} in ${range.label}, though nothing was published to the live site. Approving the queue is what turns this into movement.`;

  return { total: inRange.length, byKind, headline, items: inRange.slice(0, 200) };
}

/* -------------------------------------------------------- what changed */

export type MetricMove = {
  key: string;
  label: string;
  /** What it was, before. Null when there is no prior reading. */
  before: number | null;
  after: number;
  change: number | null;
  /** Percentage change, or null when before is zero or absent. */
  percent: number | null;
  /** Whether up is good. Position is the one where it is not. */
  higherIsBetter: boolean;
  /** Whether this came from a measurement or from the crawl. */
  measured: boolean;
  /** What it means, in a sentence, including when it means nothing yet. */
  reading: string;
};

function move(input: {
  key: string;
  label: string;
  before: number | null;
  after: number;
  higherIsBetter?: boolean;
  measured?: boolean;
  unit?: string;
}): MetricMove {
  const higherIsBetter = input.higherIsBetter ?? true;
  const change = input.before === null ? null : input.after - input.before;
  const percent = input.before === null || input.before === 0 ? null : (change! / input.before) * 100;
  const good = change === null ? null : higherIsBetter ? change > 0 : change < 0;

  let reading: string;
  if (input.before === null) {
    reading = "First reading. The next report compares against this.";
  } else if (change === 0) {
    reading = "No change.";
  } else if (percent !== null && Math.abs(percent) < 3) {
    reading = "Inside the noise. Not a change worth reading anything into.";
  } else {
    const direction = good ? "up" : "down";
    reading = `${direction} ${Math.abs(percent ?? 0).toFixed(0)}%${input.unit ? ` (${input.unit})` : ""}.`;
  }

  return {
    key: input.key,
    label: input.label,
    before: input.before,
    after: input.after,
    change,
    percent,
    higherIsBetter,
    measured: input.measured ?? false,
    reading,
  };
}

export type SiteChange = {
  /** Findings cleared since the previous run. */
  cleared: Finding[];
  /** Findings that appeared. */
  appeared: Finding[];
  scores: MetricMove[];
  /** Real numbers, when Search Console or Analytics are connected. */
  measured: MetricMove[];
  /** True when nothing measured is available, so the report says so. */
  measurementMissing: boolean;
};

export function compareRuns(
  current: AuditResult,
  previous: AuditResult | null,
  measurements?: {
    clicks?: { before: number | null; after: number };
    impressions?: { before: number | null; after: number };
    position?: { before: number | null; after: number };
    sessions?: { before: number | null; after: number };
    conversions?: { before: number | null; after: number };
  },
): SiteChange {
  const previousCodes = new Set((previous?.findings ?? []).map((f) => `${f.code}|${f.url ?? ""}`));
  const currentCodes = new Set(current.findings.map((f) => `${f.code}|${f.url ?? ""}`));

  const cleared = (previous?.findings ?? []).filter((f) => !currentCodes.has(`${f.code}|${f.url ?? ""}`));
  const appeared = current.findings.filter((f) => !previousCodes.has(`${f.code}|${f.url ?? ""}`));

  const scores: MetricMove[] = [
    move({ key: "health", label: "Search health", before: previous?.scores.health.score ?? null, after: current.scores.health.score }),
    move({ key: "aeo", label: "AI answer readiness", before: previous?.scores.aeo.score ?? null, after: current.scores.aeo.score }),
  ];
  // Only report a score that was actually measured. Authority and Experience
  // carry the not-measured flag until something measures them.
  if (current.scores.authority.measured) {
    scores.push(move({ key: "authority", label: "Authority", before: previous?.scores.authority.score ?? null, after: current.scores.authority.score, measured: true }));
  }
  if (current.scores.experience.measured) {
    scores.push(move({ key: "experience", label: "Experience", before: previous?.scores.experience.score ?? null, after: current.scores.experience.score, measured: true }));
  }

  const measured: MetricMove[] = [];
  if (measurements?.clicks) measured.push(move({ key: "clicks", label: "Clicks from search", ...measurements.clicks, measured: true }));
  if (measurements?.impressions) measured.push(move({ key: "impressions", label: "Impressions", ...measurements.impressions, measured: true }));
  if (measurements?.position) {
    measured.push(move({ key: "position", label: "Average position", ...measurements.position, higherIsBetter: false, measured: true, unit: "lower is better" }));
  }
  if (measurements?.sessions) measured.push(move({ key: "sessions", label: "Sessions", ...measurements.sessions, measured: true }));
  if (measurements?.conversions) measured.push(move({ key: "conversions", label: "Conversions", ...measurements.conversions, measured: true }));

  return { cleared, appeared, scores, measured, measurementMissing: measured.length === 0 };
}

/* ------------------------------------------------------------ the report */

export type Report = {
  range: PeriodRange;
  previousRange: PeriodRange;
  generatedAt: string;
  site: { name: string; url: string };
  work: WorkSummary;
  change: SiteChange;
  /** Three or four sentences a person could forward without editing. */
  narrative: string[];
  /** What to do next, ordered. */
  next: { what: string; why: string }[];
};

/**
 * The narrative.
 *
 * Written the way a good account manager writes: what we did, what moved,
 * what it means, what is next. It does not claim a ranking change caused by a
 * meta description, and it does not go quiet when nothing moved, because
 * "nothing moved and here is why that is expected at week three" is the
 * sentence that keeps a client.
 */
function narrativeFor(work: WorkSummary, change: SiteChange, site: { name: string }, weeksRunning: number): string[] {
  const lines: string[] = [work.headline];

  if (change.cleared.length > 0) {
    const critical = change.cleared.filter((f) => f.severity === "critical" || f.severity === "high").length;
    lines.push(
      critical > 0
        ? `${change.cleared.length} findings cleared, ${critical} of them severe. Those are the ones that were holding pages out of the index or out of answers.`
        : `${change.cleared.length} findings cleared.`,
    );
  }
  if (change.appeared.length > 0) {
    lines.push(
      `${change.appeared.length} new finding${change.appeared.length === 1 ? "" : "s"} appeared, which is normal on a site that is being edited. They are in the queue.`,
    );
  }

  if (change.measurementMissing) {
    lines.push(
      "Nothing here measures traffic or rankings yet, so this report covers what changed on the site rather than what it earned. Connecting Search Console turns the next one into a business report.",
    );
  } else {
    const clicks = change.measured.find((m) => m.key === "clicks");
    const position = change.measured.find((m) => m.key === "position");
    if (clicks && clicks.before !== null) {
      if (Math.abs(clicks.percent ?? 0) < 5) {
        lines.push(
          `Clicks are flat at ${clicks.after}. At ${weeksRunning} week${weeksRunning === 1 ? "" : "s"} in, that is what to expect: Google recrawls over weeks and re-ranks over longer.`,
        );
      } else {
        lines.push(`Clicks ${(clicks.change ?? 0) > 0 ? "rose" : "fell"} from ${clicks.before} to ${clicks.after}.`);
      }
    }
    if (position && position.before !== null && Math.abs(position.change ?? 0) > 0.3) {
      lines.push(
        `Average position moved from ${position.before.toFixed(1)} to ${position.after.toFixed(1)}. Position moves before clicks do, so this is the earlier signal.`,
      );
    }
  }

  // The honest timing note, because the gap between "scores moved" and
  // "traffic moved" is where trust is lost.
  if (weeksRunning <= 6 && !change.measurementMissing) {
    lines.push(
      "Six weeks is early. Technical fixes show up in crawl data quickly and in rankings slowly, and content and links take a quarter before they read on a chart.",
    );
  }

  return lines;
}

export function buildReport(input: {
  period: Period;
  custom?: { from: string; to: string };
  site: { name: string; url: string };
  work: WorkItem[];
  current: AuditResult;
  previous: AuditResult | null;
  measurements?: Parameters<typeof compareRuns>[2];
  firstRunAt?: string | null;
  now?: Date;
}): Report {
  const now = input.now ?? new Date();
  const { current: range, previous: previousRange } = rangeFor(input.period, now, input.custom);
  const work = summariseWork(input.work, range);
  const change = compareRuns(input.current, input.previous, input.measurements);

  const weeksRunning = input.firstRunAt
    ? Math.max(1, Math.round((now.getTime() - Date.parse(input.firstRunAt)) / (7 * 86_400_000)))
    : 1;

  const next: { what: string; why: string }[] = [];
  const openSevere = input.current.findings.filter((f) => (f.severity === "critical" || f.severity === "high") && f.status === "open");
  if (openSevere.length > 0) {
    next.push({
      what: `Approve the ${openSevere.length} severe finding${openSevere.length === 1 ? "" : "s"} still open`,
      why: "Severe findings are the ones stopping pages being indexed or quoted. Everything else is an improvement on top of a page that already works.",
    });
  }
  if (change.measurementMissing) {
    next.push({
      what: "Connect Search Console",
      why: "It is free, it takes one approval, and it is the difference between a report about your site and a report about your business.",
    });
  }
  if (work.byKind.every((k) => k.kind !== "fix_published")) {
    next.push({
      what: "Publish something",
      why: "Approved changes that never ship do nothing. The queue is only worth having if it empties.",
    });
  }

  return {
    range,
    previousRange,
    generatedAt: now.toISOString(),
    site: input.site,
    work,
    change,
    narrative: narrativeFor(work, change, input.site, weeksRunning),
    next,
  };
}

/** The report as text, for an email or a paste into a deck. */
export function reportAsText(report: Report): string {
  const lines: string[] = [
    `${report.site.name}: what happened in ${report.range.label}`,
    "",
    ...report.narrative,
    "",
  ];

  if (report.work.byKind.length > 0) {
    lines.push("What was done");
    for (const kind of report.work.byKind) lines.push(`  ${kind.count} ${kind.label}`);
    lines.push("");
  }

  const moves = [...report.change.measured, ...report.change.scores];
  if (moves.length > 0) {
    lines.push("What moved");
    for (const m of moves) {
      const before = m.before === null ? "first reading" : String(Math.round(m.before * 10) / 10);
      lines.push(`  ${m.label}: ${before} to ${Math.round(m.after * 10) / 10}. ${m.reading}`);
    }
    lines.push("");
  }

  if (report.next.length > 0) {
    lines.push("Next");
    for (const item of report.next) lines.push(`  ${item.what}. ${item.why}`);
  }

  return lines.join("\n");
}
