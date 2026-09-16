"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useSite } from "@/lib/site-hooks";
import { useSchedule } from "@/lib/schedule";
import { workFor } from "@/lib/work";
import { buildReport, reportAsText, type Period } from "@/engine/report";
import { useAnalytics, useSearchQueries } from "@/lib/measured";
import { useSession } from "@/lib/session";
import {
  Badge,
  Card,
  Chart,
  CopyButton,
  Empty,
  Notice,
  PageHeader,
  formatNumber,
  scopeLabel,
  severityKind,
  shortUrl,
  timeAgo,
} from "@/components/ui";

export default function ReportsPage() {
  const { site, runs, result, workspace } = useSite();
  const { session } = useSession();

  // The two measurements that turn a crawl report into a business report.
  // Both are silent when the account has not connected them.
  const search = useSearchQueries(Boolean(session.user), { siteId: site?.id, days: 28, dimensions: "page", limit: 50 });
  const analytics = useAnalytics(Boolean(session.user), {
    siteId: site?.id,
    days: 28,
    dimensions: "sessionDefaultChannelGroup",
    metrics: "sessions,conversions,totalRevenue",
    limit: 20,
  });
  const withDiff = useMemo(() => runs.filter((r) => r.diff), [runs]);
  const [selected, setSelected] = useState<string | null>(null);
  const run = withDiff.find((r) => r.id === selected) ?? withDiff[0];

  // The period report, which is the thing a client reads. It sits above the
  // run-to-run comparison because "what happened this month" is the question,
  // and "what changed between two crawls" is how we answer part of it.
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({
    from: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  }));
  const schedule = useSchedule(site?.id, Boolean(session.user));

  const report = useMemo(() => {
    if (!site || !result) return null;
    const completed = runs.filter((r) => r.status === "complete" && r.result);
    const previous = completed[1]?.result ?? null;
    const readings = schedule.data?.measurements ?? [];
    const half = Date.now() - (period === "week" ? 7 : period === "quarter" ? 90 : 30) * 86_400_000;
    const recent = readings.filter((m) => Date.parse(m.taken_at) >= half);
    const earlier = readings.filter((m) => Date.parse(m.taken_at) < half);
    const pick = (rows: typeof readings, key: "clicks" | "impressions" | "position" | "sessions" | "conversions") => {
      const values = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
      return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
    };
    const pair = (key: "clicks" | "impressions" | "position" | "sessions" | "conversions") => {
      const after = pick(recent, key);
      if (after === null) return undefined;
      return { before: pick(earlier, key), after };
    };

    return buildReport({
      period,
      custom: period === "custom" ? { from: new Date(custom.from).toISOString(), to: new Date(custom.to).toISOString() } : undefined,
      site: { name: site.name, url: site.baseUrl },
      work: workFor(workspace, site.id),
      current: result,
      previous,
      measurements: {
        clicks: pair("clicks"),
        impressions: pair("impressions"),
        position: pair("position"),
        sessions: pair("sessions"),
        conversions: pair("conversions"),
      },
      firstRunAt: completed.length > 0 ? completed[completed.length - 1].startedAt : null,
    });
  }, [site, result, runs, workspace, period, custom, schedule.data]);

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="Reports" />
        <Empty title="Nothing to report yet">
          <p className="small">
            The first run is the baseline. <Link href={`/app/sites/${site.id}`}>Run it</Link> and this page reports the
            period rather than the state.
          </p>
        </Empty>
      </>
    );
  }

  const diff = run?.diff ?? null;
  const readings = schedule.data?.measurements ?? [];

  return (
    <>
      <PageHeader
        title="Reports"
        description="What was done, what moved, and what it earned. In that order, and the third one is left blank rather than guessed at."
        action={
          <div className="row" style={{ gap: "0.4rem" }}>
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} style={{ width: "auto" }}>
              <option value="week">Week on week</option>
              <option value="month">Month on month</option>
              <option value="quarter">Quarter on quarter</option>
              <option value="custom">Custom range</option>
            </select>
            {withDiff.length > 1 ? (
              <select value={run?.id ?? ""} onChange={(e) => setSelected(e.target.value)} style={{ width: "auto" }}>
                {withDiff.map((option) => (
                  <option key={option.id} value={option.id}>
                    Run of {new Date(option.startedAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        }
      />

      {period === "custom" ? (
        <div className="row" style={{ marginBottom: "1rem" }}>
          <label className="field">
            <span className="rule-label">From</span>
            <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          </label>
          <label className="field">
            <span className="rule-label">To</span>
            <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </label>
        </div>
      ) : null}

      {report ? (
        <>
          <Card
            title={`What happened in ${report.range.label}`}
            action={<CopyButton text={reportAsText(report)} label="Copy the report" />}
          >
            <ul className="small" style={{ paddingLeft: "1.1rem" }}>
              {report.narrative.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>

            {report.work.byKind.length > 0 ? (
              <div className="stat-row" style={{ marginTop: "0.8rem" }}>
                {report.work.byKind.map((kind) => (
                  <div className="stat" key={kind.kind}>
                    <span className="stat-label">{kind.label}</span>
                    <span className="stat-value">{kind.count}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {report.next.length > 0 ? (
              <div style={{ marginTop: "1rem" }}>
                <div className="rule-label">Next</div>
                <ul className="small" style={{ paddingLeft: "1.1rem", marginBottom: 0 }}>
                  {report.next.map((item) => (
                    <li key={item.what}>
                      <strong>{item.what}.</strong> <span className="muted">{item.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {[...report.change.measured, ...report.change.scores].length > 0 ? (
            <div className="grid grid-4">
              {[...report.change.measured, ...report.change.scores].map((move) => (
                <div className="card score" key={move.key}>
                  <div className="label">{move.label}</div>
                  <div className="row" style={{ gap: "0.5rem", alignItems: "baseline" }}>
                    <div className="value">{formatNumber(move.after, move.after < 10 ? 1 : 0)}</div>
                    {move.percent !== null ? (
                      <span
                        className={`delta delta-${
                          Math.abs(move.percent) < 3 ? "flat" : (move.percent > 0) === move.higherIsBetter ? "up" : "down"
                        }`}
                      >
                        {move.percent > 0 ? "+" : ""}
                        {Math.round(move.percent)}%
                      </span>
                    ) : null}
                  </div>
                  <div className="hint">{move.before === null ? "first reading" : `was ${formatNumber(move.before, 1)}`}</div>
                </div>
              ))}
            </div>
          ) : null}

          {readings.length > 1 ? (
            <Card title="The trend behind those numbers">
              <p className="small muted">
                Plotted from the readings the schedule took, on the dates it took them. Nothing is interpolated across a
                gap.
              </p>
              <Chart
                label="Clicks from search"
                points={readings.filter((m) => m.source === "gsc").map((m) => ({ at: m.taken_at, value: m.clicks }))}
              />
              <Chart
                label="Average position"
                higherIsBetter={false}
                points={readings.filter((m) => m.source === "gsc").map((m) => ({ at: m.taken_at, value: m.position }))}
              />
            </Card>
          ) : session.user ? (
            <Notice kind="warn" title="No trend yet">
              A chart needs readings taken over time, and nothing has been sampling them.{" "}
              <Link href={`/app/sites/${site.id}/schedule`}>Turn the measurement sample on</Link> and this fills in a
              reading a day, without you.
            </Notice>
          ) : null}
        </>
      ) : null}

      {search.data || analytics.data ? (
        <Card title="What it earned">
          <p className="small muted">
            Twenty-eight days, measured rather than modelled. The crawl below says what changed on the site;
            this says whether it showed up in the numbers.
          </p>
          <div className="stat-row">
            {search.data ? (
              <>
                <div className="stat">
                  <span className="stat-label">Clicks from search</span>
                  <span className="stat-value">{formatNumber(search.data.totals.clicks)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Impressions</span>
                  <span className="stat-value">{formatNumber(search.data.totals.impressions)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Average position</span>
                  <span className="stat-value">{search.data.totals.position.toFixed(1)}</span>
                </div>
              </>
            ) : null}
            {analytics.data ? (
              <>
                <div className="stat">
                  <span className="stat-label">Sessions</span>
                  <span className="stat-value">
                    {formatNumber(analytics.data.rows.reduce((sum, row) => sum + (row.metrics[0] ?? 0), 0))}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Conversions</span>
                  <span className="stat-value">
                    {formatNumber(analytics.data.rows.reduce((sum, row) => sum + (row.metrics[1] ?? 0), 0))}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          {analytics.data && analytics.data.rows.length > 0 ? (
            <div className="table-scroll" style={{ marginTop: "1rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th className="num">Sessions</th>
                    <th className="num">Conversions</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.data.rows.map((row) => (
                    <tr key={row.dimensions[0]}>
                      <td>{row.dimensions[0]}</td>
                      <td className="num">{formatNumber(row.metrics[0])}</td>
                      <td className="num">{formatNumber(row.metrics[1])}</td>
                      <td className="num">{formatNumber(row.metrics[2], 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {search.data && search.data.rows.length > 0 ? (
            <div className="table-scroll" style={{ marginTop: "1rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Page</th>
                    <th className="num">Clicks</th>
                    <th className="num">Impressions</th>
                    <th className="num">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {search.data.rows.slice(0, 25).map((row) => (
                    <tr key={row.keys[0]}>
                      <td className="truncate">{shortUrl(row.keys[0], 60)}</td>
                      <td className="num">{formatNumber(row.clicks)}</td>
                      <td className="num">{formatNumber(row.impressions)}</td>
                      <td className="num">{row.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : session.user ? (
        <Notice kind="warn" title="This report shows crawl movement, not money">
          {search.reason ?? "Search Console is not connected."}{" "}
          <Link href={`/app/sites/${site.id}/integrations`}>Connect Search Console and Analytics</Link> and the
          same report says what the work earned rather than only what it changed.
        </Notice>
      ) : null}

      {diff ? (
        <>
      <Card>
        <p style={{ marginBottom: "0.7rem" }}><strong>{diff.headline}</strong></p>
        <div className="tiny faint" style={{ marginBottom: "0.9rem" }}>
          {diff.previousAt
            ? `Comparing the run of ${new Date(diff.currentAt).toLocaleString()} against ${new Date(diff.previousAt).toLocaleString()}.`
            : "Baseline run."}
        </div>
        <ul className="small" style={{ paddingLeft: "1.1rem", marginBottom: 0 }}>
          {diff.narrative.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
        <div className="button-row" style={{ marginTop: "1rem" }}>
          <CopyButton text={asMarkdown(site.name, site.domain, diff)} label="Copy as markdown" />
        </div>
      </Card>

      <div className="grid grid-4">
        {diff.scores.map((score) => (
          <div className="card score" key={score.key}>
            <div className="label">{score.label}</div>
            <div className="row" style={{ gap: "0.5rem", alignItems: "baseline" }}>
              <div className="value">{Math.round(score.to)}</div>
              <span className={`delta delta-${score.change > 0 ? "up" : score.change < 0 ? "down" : "flat"}`}>
                {score.change > 0 ? "+" : ""}{score.change.toFixed(1)}
              </span>
            </div>
            <div className="hint">was {score.from.toFixed(1)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <Card title={`Cleared · ${diff.findings.fixed.length}`}>
          {diff.findings.fixed.length === 0 ? (
            <p className="small muted" style={{ marginBottom: 0 }}>Nothing cleared. Either the work has not shipped, or it shipped and did not take.</p>
          ) : (
            <div className="stack-sm">
              {diff.findings.fixed.slice(0, 20).map((finding) => (
                <div key={finding.id} className="row small" style={{ gap: "0.5rem", alignItems: "flex-start" }}>
                  <Badge kind="ok">fixed</Badge>
                  <div style={{ minWidth: 0 }}>
                    <div>{finding.title}</div>
                    <div className="tiny faint truncate">{scopeLabel(finding, 50)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={`New · ${diff.findings.appeared.length}`}>
          {diff.findings.appeared.length === 0 ? (
            <p className="small muted" style={{ marginBottom: 0 }}>Nothing new.</p>
          ) : (
            <div className="stack-sm">
              {diff.findings.appeared.slice(0, 20).map((finding) => (
                <div key={finding.id} className="row small" style={{ gap: "0.5rem", alignItems: "flex-start" }}>
                  <Badge kind={severityKind(finding.severity)}>{finding.severity}</Badge>
                  <div style={{ minWidth: 0 }}>
                    <div>{finding.title}</div>
                    <div className="tiny faint truncate">{scopeLabel(finding, 50)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {diff.findings.worsened.length > 0 && (
        <Card title={`Got worse · ${diff.findings.worsened.length}`}>
          <div className="stack-sm">
            {diff.findings.worsened.map((item) => (
              <div key={item.finding.id} className="row small" style={{ gap: "0.5rem" }}>
                <Badge kind={severityKind(item.to)}>{item.from} to {item.to}</Badge>
                <span>{item.finding.title}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Pages">
        <div className="grid grid-3">
          <div>
            <div className="label tiny faint">APPEARED</div>
            <div className="score value" style={{ fontSize: "1.6rem" }}>{diff.pages.added.length}</div>
          </div>
          <div>
            <div className="label tiny faint">DISAPPEARED</div>
            <div className="score value" style={{ fontSize: "1.6rem" }}>{diff.pages.removed.length}</div>
          </div>
          <div>
            <div className="label tiny faint">CHANGED</div>
            <div className="score value" style={{ fontSize: "1.6rem" }}>{diff.pages.changed.length}</div>
          </div>
        </div>

        {diff.pages.changed.length > 0 && (
          <details className="reveal" style={{ marginTop: "1rem" }}>
            <summary className="small">What changed on each page</summary>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Page</th><th>What changed</th></tr></thead>
                <tbody>
                  {diff.pages.changed.slice(0, 60).map((item) => (
                    <tr key={item.url}>
                      <td style={{ maxWidth: "320px" }}>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="truncate small" style={{ display: "block" }}>
                          {shortUrl(item.url, 56)}
                        </a>
                      </td>
                      <td className="small muted">{item.what.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </Card>

        </>
      ) : (
        <Notice kind="warn" title="Only one run so far">
          A run-to-run comparison needs two. <Link href={`/app/sites/${site.id}`}>Run it again</Link> and this page adds
          what cleared, what appeared and what got worse.
        </Notice>
      )}

      <Card title="The run behind this report">
        <dl className="kv">
          <dt>Pages crawled</dt><dd>{formatNumber(result.crawl.fetched)}</dd>
          <dt>Findings open</dt><dd>{result.findings.length}</dd>
          <dt>Fixes generated</dt><dd>{result.findings.filter((f) => f.fix).length}</dd>
          <dt>Briefs written</dt><dd>{result.briefs.length}</dd>
          <dt>Agency hours equivalent</dt><dd>{result.estimatedAgencyHours}</dd>
          <dt>Finished</dt><dd>{timeAgo(result.finishedAt)}</dd>
        </dl>
        <p className="tiny faint" style={{ marginTop: "0.8rem", marginBottom: 0 }}>
          <Link href={`/app/sites/${site.id}/runs`}>Open the trace</Link> to see every step, what it did and what
          blocked it.
        </p>
      </Card>
    </>
  );
}

function asMarkdown(name: string, domain: string, diff: NonNullable<ReturnType<typeof useSite>["runs"][number]["diff"]>): string {
  return [
    `# ${name}: what changed`,
    ``,
    `${domain} · ${new Date(diff.currentAt).toLocaleDateString()}`,
    ``,
    `**${diff.headline}**`,
    ``,
    ...diff.narrative.map((line) => `- ${line}`),
    ``,
    `## Scores`,
    ``,
    `| Measure | Before | After | Change |`,
    `| --- | --- | --- | --- |`,
    ...diff.scores.map((s) => `| ${s.label} | ${s.from.toFixed(1)} | ${s.to.toFixed(1)} | ${s.change > 0 ? "+" : ""}${s.change.toFixed(1)} |`),
    ``,
    `## Cleared`,
    ``,
    ...(diff.findings.fixed.length ? diff.findings.fixed.map((f) => `- ${f.title}${f.url ? ` (${f.url})` : ""}`) : ["- Nothing cleared this period."]),
    ``,
    `## New`,
    ``,
    ...(diff.findings.appeared.length ? diff.findings.appeared.slice(0, 30).map((f) => `- [${f.severity}] ${f.title}${f.url ? ` (${f.url})` : ""}`) : ["- Nothing new."]),
  ].join("\n");
}
