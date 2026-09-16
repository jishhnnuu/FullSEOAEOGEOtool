"use client";

/**
 * The schedule.
 *
 * Two things have to be true on this screen for it to be worth having. The
 * user picks the cadence rather than accepting a default nobody chose, and the
 * screen is honest about which jobs run while the tab is closed. Both are
 * below, and the second one is printed before the pickers rather than in a
 * footnote.
 */

import Link from "next/link";
import { useMemo } from "react";

import { Card, Chart, Empty, Notice, PageHeader, timeAgo } from "@/components/ui";
import { useSchedule, CADENCE_LABELS } from "@/lib/schedule";
import { useSearchQueries } from "@/lib/measured";
import { useSession } from "@/lib/session";
import { useSite } from "@/lib/site-hooks";
import { JOBS, describe, headlessNote, suggestCadence, type Cadence, type JobKey } from "@/engine/schedule";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SchedulePage() {
  const { site, result, runs } = useSite();
  const { session } = useSession();
  const signedIn = Boolean(session.user);
  const { data, loading, saveEntry, markRead } = useSchedule(site?.id, signedIn);
  const search = useSearchQueries(signedIn, { siteId: site?.id, days: 28, limit: 1 });

  const suggestions = useMemo(() => {
    const findings = result?.findings ?? [];
    return suggestCadence({
      pages: result?.crawl.pages.length ?? 0,
      severeOpen: findings.filter((f) => (f.severity === "critical" || f.severity === "high") && f.status === "open").length,
      hasSearchData: Boolean(search.data),
      businessType: site?.businessType,
    });
  }, [result, search.data, site?.businessType]);

  const entries = data?.schedules ?? [];
  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  if (!site) return null;

  if (!signedIn) {
    return (
      <>
        <PageHeader
          title="Schedule"
          description="When the work runs, and what runs while you are not here."
        />
        <Empty title="A schedule needs an account">
          <p className="small">
            Everything else in this app works without one, because the audit runs in your browser. A schedule is the
            exception: something has to be awake to start it, and that something has to know whose site it is and where
            to send the report. <Link href="/app/signin">Sign in</Link> and this page turns on.
          </p>
        </Empty>
      </>
    );
  }

  const unseen = (data?.milestones ?? []).filter((m) => !m.seen_at);

  return (
    <>
      <PageHeader
        title="Schedule"
        description="Pick the cadence. The suggestion beside each one is what this site's size and state actually calls for, not a default."
      />

      <Notice kind={entries.some((e) => e.enabled) ? "ok" : "warn"}>{headlessNote(entries)}</Notice>

      {unseen.length > 0 ? (
        <Card
          title={`${unseen.length} thing${unseen.length === 1 ? "" : "s"} happened`}
          action={
            <button type="button" className="small ghost" onClick={() => void markRead()}>
              Mark read
            </button>
          }
        >
          <ul className="stack-sm">
            {unseen.map((milestone) => (
              <li key={milestone.id} className="small">
                <span className="tiny faint">{timeAgo(milestone.at)}</span> {milestone.what}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {loading ? <p className="small muted">Reading the schedule.</p> : null}

      <div className="stack">
        {entries.map((entry) => {
          const job = JOBS[entry.job as JobKey];
          const suggestion = suggestions.find((s) => s.job === entry.job);
          const matches = suggestion?.cadence === entry.cadence;
          return (
            <Card key={entry.job} title={job.name}>
              <p className="small muted">{job.does}</p>

              <p className="small">
                {job.runsHeadless ? (
                  <span className="badge badge-ok">Runs without you</span>
                ) : (
                  <span className="badge badge-info">Runs in your browser</span>
                )}{" "}
                {job.needs.length > 0 ? <span className="tiny faint">Needs: {job.needs.join(", ")}.</span> : null}
              </p>

              {suggestion ? (
                <p className="small draft-proof">
                  <strong>Suggested: {label(suggestion.cadence)}.</strong> {suggestion.why}
                  {!matches && entry.cadence !== suggestion.cadence ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="small"
                        onClick={() =>
                          void saveEntry({
                            ...entry,
                            cadence: suggestion.cadence,
                            timezone,
                            enabled: suggestion.cadence !== "off",
                          })
                        }
                      >
                        Use it
                      </button>
                    </>
                  ) : null}
                </p>
              ) : null}

              <div className="row" style={{ marginTop: "0.6rem" }}>
                <label className="field" style={{ minWidth: 150 }}>
                  <span className="rule-label">Cadence</span>
                  <select
                    value={entry.cadence}
                    onChange={(event) =>
                      void saveEntry({
                        ...entry,
                        cadence: event.target.value as Cadence,
                        timezone,
                        enabled: event.target.value !== "off",
                      })
                    }
                  >
                    {CADENCE_LABELS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {entry.cadence === "weekly" || entry.cadence === "fortnightly" ? (
                  <label className="field" style={{ minWidth: 140 }}>
                    <span className="rule-label">Day</span>
                    <select
                      value={entry.weekday}
                      onChange={(event) => void saveEntry({ ...entry, weekday: Number(event.target.value), timezone })}
                    >
                      {DAYS.map((day, index) => (
                        <option key={day} value={index}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {entry.cadence === "monthly" ? (
                  <label className="field" style={{ minWidth: 120 }}>
                    <span className="rule-label">Day of month</span>
                    <select
                      value={entry.monthday}
                      onChange={(event) => void saveEntry({ ...entry, monthday: Number(event.target.value), timezone })}
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {entry.cadence !== "off" ? (
                  <label className="field" style={{ minWidth: 110 }}>
                    <span className="rule-label">Hour</span>
                    <select
                      value={entry.hour}
                      onChange={(event) => void saveEntry({ ...entry, hour: Number(event.target.value), timezone })}
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                        <option key={hour} value={hour}>
                          {String(hour).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <dl className="kv" style={{ marginTop: "0.7rem" }}>
                <dt>Set to</dt>
                <dd>{describe(entry)}</dd>
                <dt>Next</dt>
                <dd>{entry.nextRunAt ? new Date(entry.nextRunAt).toLocaleString() : "Not scheduled"}</dd>
                <dt>Last run</dt>
                <dd>
                  {entry.lastRunAt ? (
                    <>
                      {timeAgo(entry.lastRunAt)}
                      {entry.lastStatus ? ` (${entry.lastStatus})` : ""}
                      {entry.lastDetail ? <span className="small muted"> {entry.lastDetail}</span> : null}
                    </>
                  ) : (
                    "Never"
                  )}
                </dd>
              </dl>
            </Card>
          );
        })}
      </div>

      <Card title="What has been measured">
        <p className="small muted">
          Every reading the schedule has taken, plotted as it was recorded. Gaps are gaps: where nothing was measured
          the line stops rather than being drawn through.
        </p>
        <Chart
          label="Clicks from search, seven-day total"
          points={(data?.measurements ?? [])
            .filter((m) => m.source === "gsc")
            .map((m) => ({ at: m.taken_at, value: m.clicks }))}
        />
        <Chart
          label="Average position"
          higherIsBetter={false}
          points={(data?.measurements ?? [])
            .filter((m) => m.source === "gsc")
            .map((m) => ({ at: m.taken_at, value: m.position }))}
        />
        <Chart
          label="Sessions, seven-day total"
          points={(data?.measurements ?? [])
            .filter((m) => m.source === "ga4")
            .map((m) => ({ at: m.taken_at, value: m.sessions }))}
        />
      </Card>

      <Card title="Why the audit waits for you">
        <p className="small muted">
          The crawl and every check run in your browser rather than on a server of ours. That is the reason no account
          here holds a copy of your site&apos;s content, and it is the reason a scheduled audit cannot start on its own:
          there is nothing to start it. When a run is due, opening the app begins it. {runs.length > 0 ? `The last one was ${timeAgo(runs[0].startedAt)}.` : "Nothing has run yet."}
        </p>
        <p className="small muted">
          A self-hosted installation, with the Python worker and a database, runs the whole programme unattended. Same
          product, different trade.
        </p>
      </Card>
    </>
  );
}

function label(cadence: Cadence): string {
  return CADENCE_LABELS.find((c) => c.key === cadence)?.label ?? cadence;
}
