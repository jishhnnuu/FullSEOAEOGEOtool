"use client";

import Link from "next/link";
import { useState } from "react";

import { useSite } from "@/lib/site-hooks";
import { Badge, Card, Empty, PageHeader, duration, formatNumber, timeAgo } from "@/components/ui";

export default function RunsPage() {
  const { site, runs, workspace } = useSite();
  const [open, setOpen] = useState<string | null>(null);

  if (!site) return null;

  const activity = workspace.activity.filter((a) => a.siteId === site.id);

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every run, every step it took and every decision recorded against it. An agency that cannot show you this gets fired."
      />

      {runs.length === 0 ? (
        <Empty title="Nothing has run yet">
          <p className="small"><Link href={`/app/sites/${site.id}`}>Start the first run</Link>.</p>
        </Empty>
      ) : (
        <div className="stack-sm">
          {runs.map((run) => (
            <Card key={run.id}>
              <div className="between" style={{ alignItems: "flex-start" }}>
                <div>
                  <div className="row" style={{ gap: "0.5rem" }}>
                    <Badge kind={run.status === "complete" ? "ok" : run.status === "running" ? "neutral" : "high"}>
                      {run.status}
                    </Badge>
                    <strong>{run.result ? run.result.crawl.host : site.domain}</strong>
                  </div>
                  <div className="tiny faint" style={{ marginTop: "0.25rem" }}>
                    started {timeAgo(run.startedAt)}
                    {run.finishedAt && ` · took ${duration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())}`}
                    <span className="mono"> {run.id}</span>
                  </div>
                </div>
                {run.result && (
                  <button className="small" onClick={() => setOpen(open === run.id ? null : run.id)}>
                    {open === run.id ? "Hide the trace" : "Open the trace"}
                  </button>
                )}
              </div>

              {run.error && <div className="notice notice-bad small" style={{ marginTop: "0.7rem" }}>{run.error}</div>}

              {run.diff && (
                <p className="small" style={{ marginTop: "0.7rem", marginBottom: 0 }}>
                  <strong>{run.diff.headline}</strong>
                </p>
              )}

              {run.result && (
                <div className="row small faint" style={{ marginTop: "0.6rem", gap: "1.1rem" }}>
                  <span>{formatNumber(run.result.crawl.fetched)} pages</span>
                  <span>{run.result.findings.length} findings</span>
                  <span>{run.result.findings.filter((f) => f.fix).length} fixes generated</span>
                  <span>{run.result.briefs.length} briefs</span>
                  <span>no model spend</span>
                </div>
              )}

              {open === run.id && run.result && (
                <>
                  <hr />
                  <div className="steps">
                    {run.result.steps.map((step) => (
                      <div className={`step step-${step.status}`} key={step.key}>
                        <span className="step-dot" />
                        <div style={{ minWidth: 0 }}>
                          <div className="small">
                            {step.label}
                            <span className="faint mono tiny"> {step.agent}</span>
                          </div>
                          {step.detail && <div className="tiny muted">{step.detail}</div>}
                          {step.blockedBy && <div className="tiny" style={{ color: "var(--warn)" }}>{step.blockedBy}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      {activity.length > 0 && (
        <Card title="Audit log">
          <div className="table-scroll">
            <table>
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead>
              <tbody>
                {activity.slice(0, 60).map((entry) => (
                  <tr key={entry.id}>
                    <td className="small muted">{timeAgo(entry.at)}</td>
                    <td className="small mono">{entry.actor}</td>
                    <td className="small">{entry.action}</td>
                    <td className="small muted">{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
