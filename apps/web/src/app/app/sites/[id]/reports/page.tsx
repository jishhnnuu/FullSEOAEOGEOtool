"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useSite } from "@/lib/site-hooks";
import {
  Badge,
  Card,
  CopyButton,
  Empty,
  PageHeader,
  formatNumber,
  scopeLabel,
  severityKind,
  shortUrl,
  timeAgo,
} from "@/components/ui";

export default function ReportsPage() {
  const { site, runs, result } = useSite();
  const withDiff = useMemo(() => runs.filter((r) => r.diff), [runs]);
  const [selected, setSelected] = useState<string | null>(null);
  const run = withDiff.find((r) => r.id === selected) ?? withDiff[0];

  if (!site) return null;
  if (!run?.diff || !result) {
    return (
      <>
        <PageHeader title="What changed" />
        <Empty title="Nothing to compare yet">
          <p className="small">
            The first run is the baseline. <Link href={`/app/sites/${site.id}`}>Run it again</Link> and this page
            reports the difference rather than the state.
          </p>
        </Empty>
      </>
    );
  }

  const diff = run.diff;

  return (
    <>
      <PageHeader
        title="What changed"
        description="The comparison a retainer is supposed to produce: what cleared, what appeared, what got worse, and which way the numbers moved."
        action={
          withDiff.length > 1 ? (
            <select value={run.id} onChange={(e) => setSelected(e.target.value)} style={{ width: "auto" }}>
              {withDiff.map((option) => (
                <option key={option.id} value={option.id}>
                  Run of {new Date(option.startedAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

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
