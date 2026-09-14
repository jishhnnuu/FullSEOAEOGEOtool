"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { fetcher, type MissionRun } from "@/lib/api";
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader, timeAgo } from "@/components/ui";

type Trace = {
  run: MissionRun;
  steps: { step: string; status: string; error: string | null; duration_ms: number; cost_usd: number }[];
  agents: { agent: string; status: string; iterations: number; tool_calls: number; cost_usd: number; duration_ms: number; error: string | null; output: string }[];
  tool_calls: { tool: string; ok: boolean; duration_ms: number; is_mutation: boolean; summary: string | null; error: string | null }[];
};

export default function RunsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const { data, error, isLoading } = useSWR<MissionRun[]>(
    `/sites/${siteId}/runs?limit=40`,
    fetcher,
    { refreshInterval: 20_000 },
  );
  const [open, setOpen] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every cycle the team ran, what each step did, and what it cost. Open one to see the full trace."
      />
      <Card>
        {isLoading ? <Loading /> : !data?.length ? (
          <Empty title="No runs yet" />
        ) : (
          <div className="stack" style={{ gap: "0.5rem" }}>
            {data.map((run) => (
              <div key={run.id} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "0.7rem 0.8rem" }}>
                <div className="between">
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: "0.5rem" }}>
                      <strong>{run.title ?? run.mission_key}</strong>
                      <Badge kind={
                        run.status === "succeeded" ? "ok"
                        : run.status === "running" ? "info"
                        : run.status === "partial" ? "medium" : "high"
                      }>{run.status}</Badge>
                      {run.escalations?.length > 0 && (
                        <Badge kind="medium">{run.escalations.length} need you</Badge>
                      )}
                    </div>
                    <div className="faint small">
                      {run.trigger} · started {timeAgo(run.started_at)}
                      {run.duration_ms != null && ` · ${(run.duration_ms / 1000).toFixed(0)}s`}
                      {` · $${run.cost_usd.toFixed(4)}`}
                      {run.status === "running" && ` · step ${run.steps_done}/${run.steps_total}`}
                    </div>
                    {run.summary && <p className="small muted" style={{ margin: "0.3rem 0 0" }}>{run.summary}</p>}
                  </div>
                  <button className="small" onClick={() => setOpen(open === run.id ? null : run.id)}>
                    {open === run.id ? "Hide" : "Trace"}
                  </button>
                </div>
                {open === run.id && <RunTrace runId={run.id} />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function RunTrace({ runId }: { runId: string }) {
  const { data, error } = useSWR<Trace>(`/runs/${runId}`, fetcher);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading label="Loading trace" />;

  return (
    <div style={{ marginTop: "0.8rem", borderTop: "1px solid var(--border)", paddingTop: "0.8rem" }}>
      <h3 className="small" style={{ marginBottom: "0.4rem" }}>Steps</h3>
      <table>
        <tbody>
          {data.steps.map((s) => (
            <tr key={s.step}>
              <td style={{ width: "30%" }}>{s.step}</td>
              <td>
                <Badge kind={
                  s.status === "succeeded" ? "ok"
                  : s.status === "skipped" ? "neutral"
                  : s.status === "failed" ? "high" : "medium"
                }>{s.status}</Badge>
              </td>
              <td className="num faint small">{(s.duration_ms / 1000).toFixed(1)}s</td>
              <td className="small muted">{s.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.agents.length > 0 && (
        <>
          <h3 className="small" style={{ margin: "1rem 0 0.4rem" }}>Specialists involved</h3>
          <table>
            <tbody>
              {data.agents.map((a, i) => (
                <tr key={i}>
                  <td style={{ width: "30%" }}>{a.agent}</td>
                  <td className="faint small">{a.iterations} turns, {a.tool_calls} tool calls</td>
                  <td className="num faint small">${a.cost_usd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {data.tool_calls.length > 0 && (
        <details style={{ marginTop: "0.8rem" }}>
          <summary className="small muted">{data.tool_calls.length} tool calls</summary>
          <table style={{ marginTop: "0.4rem" }}>
            <tbody>
              {data.tool_calls.map((t, i) => (
                <tr key={i}>
                  <td className="mono">{t.tool}{t.is_mutation && <Badge kind="medium">write</Badge>}</td>
                  <td className="small muted truncate" style={{ maxWidth: 320 }}>
                    {t.summary ?? t.error ?? ""}
                  </td>
                  <td className="num faint small">{t.duration_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
