"use client";

import Link from "next/link";
import { use, useState } from "react";
import useSWR from "swr";
import { api, fetcher, type Dashboard } from "@/lib/api";
import {
  Badge, Card, Empty, ErrorNote, Loading, PageHeader, Score,
  formatNumber, severityKind, timeAgo,
} from "@/components/ui";

const CAPABILITY_LABELS: Record<string, string> = {
  real_keywords: "Know what you actually rank for",
  conversion_attribution: "Report in revenue, not just traffic",
  auto_publish: "Publish approved content by itself",
  keyword_research: "Research keywords at scale",
  backlink_analysis: "See and act on your link profile",
  gbp_management: "Run your Business Profile",
  push_indexing: "Get changes recrawled in minutes",
  outreach_sending: "Send outreach from your own domain",
};

export default function DashboardPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const { data, error, isLoading, mutate } = useSWR<Dashboard>(
    `/sites/${siteId}/dashboard`,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const [running, setRunning] = useState(false);

  if (error) return <ErrorNote error={error} />;
  if (isLoading || !data) return <Loading label="Reading your site" />;

  const { site, scores, findings, content_pipeline, kpis, ai_visibility } = data;
  const severities = ["critical", "high", "medium", "low"];
  const needsAttention = (findings.by_severity.critical ?? 0) + (findings.by_severity.high ?? 0);

  async function runAudit() {
    setRunning(true);
    try {
      await api.post(`/sites/${siteId}/run`, { mission_key: "weekly_growth_cycle" });
      setTimeout(() => mutate(), 1500);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title={site.name}
        description={`${site.domain} · ${site.business_type.replace("_", " ")} · autonomy: ${site.autonomy}`}
        action={
          <button className="primary" onClick={runAudit} disabled={running}>
            {running ? "Starting…" : "Run a cycle now"}
          </button>
        }
      />

      {data.pending_approvals > 0 && (
        <div className="notice notice-warn" style={{ marginBottom: "0.9rem" }}>
          <strong>{data.pending_approvals}</strong> item{data.pending_approvals === 1 ? "" : "s"} waiting
          for you. <Link href={`/sites/${siteId}/approvals`}>Review them</Link>.
        </div>
      )}

      {site.last_crawl_at == null && (
        <div className="notice" style={{ marginBottom: "0.9rem" }}>
          No crawl yet. The first audit takes a few minutes and needs nothing connected.
        </div>
      )}

      <div className="grid grid-3" style={{ marginBottom: "0.9rem" }}>
        <Score label="Site health" value={scores.health}
               hint={`${findings.total_open} open issues${needsAttention ? `, ${needsAttention} serious` : ""}`} />
        <Score label="AI answer readiness" value={scores.aeo}
               hint={ai_visibility?.measured
                 ? `cited in ${ai_visibility.citation_rate_pct}% of prompts`
                 : "citability of your pages"} />
        <Score label="Authority" value={scores.authority}
               hint={data.capabilities.includes("backlink_analysis")
                 ? "relative to competitors"
                 : "connect a link data source"} />
      </div>

      <div className="grid grid-2">
        <Card title="What needs fixing"
              action={<Link href={`/sites/${siteId}/findings`} className="small">See all</Link>}>
          {findings.total_open === 0 ? (
            <Empty title="Nothing open">
              <span className="small">Either the site is clean or it has not been crawled yet.</span>
            </Empty>
          ) : (
            <>
              <table>
                <thead>
                  <tr><th>Severity</th><th className="num">Count</th><th className="num">Share</th></tr>
                </thead>
                <tbody>
                  {severities.filter((s) => findings.by_severity[s]).map((s) => (
                    <tr key={s}>
                      <td><Badge kind={severityKind(s)}>{s}</Badge></td>
                      <td className="num">{findings.by_severity[s]}</td>
                      <td className="num faint">
                        {Math.round((findings.by_severity[s] / findings.total_open) * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: "0.85rem" }}>
                <div className="faint small">Where the issues are</div>
                <div className="row" style={{ gap: "0.35rem", marginTop: "0.3rem" }}>
                  {Object.entries(findings.by_category)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([category, count]) => (
                      <Badge key={category} kind="neutral">{category} {count}</Badge>
                    ))}
                </div>
              </div>
            </>
          )}
        </Card>

        <Card title="Content pipeline"
              action={<Link href={`/sites/${siteId}/content`} className="small">Review queue</Link>}>
          {Object.keys(content_pipeline).length === 0 ? (
            <Empty title="Nothing in the pipeline">
              <span className="small">Content starts once a plan exists.</span>
            </Empty>
          ) : (
            <table>
              <tbody>
                {Object.entries(content_pipeline)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, count]) => (
                    <tr key={stage}>
                      <td style={{ textTransform: "capitalize" }}>
                        {stage.replace(/_/g, " ")}
                        {stage === "review" && <Badge kind="high">needs you</Badge>}
                      </td>
                      <td className="num">{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {Object.keys(kpis).length > 0 && (
        <Card title="Trend" className="">
          <div className="grid grid-3">
            {Object.entries(kpis).map(([metric, k]) => (
              <div key={metric}>
                <div className="label small faint" style={{ textTransform: "uppercase" }}>
                  {metric.replace(/_/g, " ")}
                </div>
                <div className="row" style={{ gap: "0.5rem", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "1.3rem" }}>{formatNumber(k.latest)}</strong>
                  {k.change_pct != null && (
                    <span className={k.change_pct >= 0 ? "score-good small" : "score-bad small"}>
                      {k.change_pct >= 0 ? "+" : ""}{k.change_pct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="faint small">{k.points} measurements</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-2">
        <Card title="Recent activity"
              action={<Link href={`/sites/${siteId}/runs`} className="small">Full history</Link>}>
          {data.recent_runs.length === 0 ? (
            <Empty title="No runs yet" />
          ) : (
            <table>
              <tbody>
                {data.recent_runs.slice(0, 6).map((run) => (
                  <tr key={run.id}>
                    <td>
                      <div>{run.title ?? run.mission_key}</div>
                      <div className="faint small">{timeAgo(run.started_at)}</div>
                    </td>
                    <td>
                      <Badge kind={
                        run.status === "succeeded" ? "ok"
                        : run.status === "running" ? "info"
                        : run.status === "partial" ? "medium" : "high"
                      }>{run.status}</Badge>
                    </td>
                    <td className="num faint small">${run.cost_usd.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.next_scheduled && (
            <p className="faint small" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
              Next scheduled run {timeAgo(data.next_scheduled)}.
            </p>
          )}
        </Card>

        <Card title="What we could do with more access"
              action={<Link href={`/sites/${siteId}/integrations`} className="small">Connect</Link>}>
          {Object.keys(data.missing_capabilities).length === 0 ? (
            <Empty title="Everything is connected">
              <span className="small">No capability is currently blocked.</span>
            </Empty>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {Object.entries(data.missing_capabilities).slice(0, 6).map(([cap, providers]) => (
                <li key={cap} style={{ marginBottom: "0.45rem" }}>
                  <div>{CAPABILITY_LABELS[cap] ?? cap.replace(/_/g, " ")}</div>
                  <div className="faint small">
                    needs {providers.slice(0, 3).map((p) => p.replace(/_/g, " ")).join(" or ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
