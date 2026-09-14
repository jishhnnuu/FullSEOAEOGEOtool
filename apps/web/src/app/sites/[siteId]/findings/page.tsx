"use client";

import { use, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher, type Finding } from "@/lib/api";
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader, severityKind } from "@/components/ui";

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;

type Group = {
  code: string;
  title: string;
  category: string;
  severity: string;
  recommendation: string | null;
  autoFixable: boolean;
  priority: number;
  urls: Finding[];
};

export default function FindingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const query = new URLSearchParams({ limit: "500" });
  if (severity) query.set("severity", severity);
  if (category) query.set("category", category);

  const { data, error, isLoading } = useSWR<Finding[]>(
    `/sites/${siteId}/findings?${query}`,
    fetcher,
  );

  /**
   * Group by issue type rather than listing every affected URL.
   *
   * Three hundred pages missing a meta description is one problem with a
   * template-level fix, not three hundred problems. Presenting it as three
   * hundred rows is how audit tools become unreadable and get ignored.
   */
  const groups = useMemo<Group[]>(() => {
    const byCode = new Map<string, Group>();
    for (const finding of data ?? []) {
      const existing = byCode.get(finding.code);
      if (existing) {
        existing.urls.push(finding);
        existing.priority = Math.max(existing.priority, finding.priority_score ?? 0);
      } else {
        byCode.set(finding.code, {
          code: finding.code,
          title: finding.title,
          category: finding.category,
          severity: finding.severity,
          recommendation: finding.recommendation,
          autoFixable: finding.auto_fixable,
          priority: finding.priority_score ?? 0,
          urls: [finding],
        });
      }
    }
    return [...byCode.values()].sort((a, b) => {
      const bySeverity =
        (SEVERITY_RANK[a.severity as keyof typeof SEVERITY_RANK] ?? 9) -
        (SEVERITY_RANK[b.severity as keyof typeof SEVERITY_RANK] ?? 9);
      return bySeverity !== 0 ? bySeverity : b.priority - a.priority;
    });
  }, [data]);

  if (error) return <ErrorNote error={error} />;

  const categories = Array.from(new Set((data ?? []).map((f) => f.category))).sort();
  const affected = (data ?? []).reduce((sum, f) => sum + (f.affected_count || 1), 0);
  const autoFixable = groups.filter((g) => g.autoFixable);

  return (
    <>
      <PageHeader
        title="Findings"
        description="Grouped by issue, ranked by impact over effort. Anything marked as handled is fixed without you."
      />

      <Card>
        <div className="row" style={{ marginBottom: "0.9rem" }}>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}
                  style={{ width: "auto" }} aria-label="Filter by severity">
            <option value="">All severities</option>
            {["critical", "high", "medium", "low"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
                  style={{ width: "auto" }} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {data && (
            <span className="faint small">
              {groups.length} distinct issue{groups.length === 1 ? "" : "s"} across {affected} page
              {affected === 1 ? "" : "s"}
              {autoFixable.length > 0 && ` · ${autoFixable.length} we handle ourselves`}
            </span>
          )}
        </div>

        {isLoading ? <Loading /> : !groups.length ? (
          <Empty title="No open findings">
            <span className="small">Either nothing is wrong or the site has not been crawled yet.</span>
          </Empty>
        ) : (
          <div className="stack" style={{ gap: "0.4rem" }}>
            {groups.map((group) => (
              <div key={group.code}
                   style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "0.65rem 0.8rem" }}>
                <div className="between">
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: "0.5rem" }}>
                      <Badge kind={severityKind(group.severity)}>{group.severity}</Badge>
                      <strong>{group.title}</strong>
                      {group.autoFixable && <Badge kind="ok">we fix this</Badge>}
                    </div>
                    <div className="faint small">
                      {group.category} · affects {group.urls.length} page
                      {group.urls.length === 1 ? "" : "s"} · priority {group.priority.toFixed(0)}
                    </div>
                    {group.recommendation && (
                      <p className="small muted" style={{ margin: "0.35rem 0 0", maxWidth: "72ch" }}>
                        {group.recommendation}
                      </p>
                    )}
                  </div>
                  <button className="small"
                          onClick={() => setOpen(open === group.code ? null : group.code)}>
                    {open === group.code ? "Hide pages" : "Show pages"}
                  </button>
                </div>

                {open === group.code && (
                  <div style={{ marginTop: "0.7rem", borderTop: "1px solid var(--border)", paddingTop: "0.6rem" }}>
                    <div className="table-scroll" style={{ maxHeight: 340, overflowY: "auto" }}>
                      <table>
                        <tbody>
                          {group.urls.slice(0, 200).map((f) => (
                            <tr key={f.id}>
                              <td className="small truncate" style={{ maxWidth: 420 }}>
                                {f.url ? (
                                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                                    {f.url.replace(/^https?:\/\//, "")}
                                  </a>
                                ) : <span className="muted">site-wide</span>}
                              </td>
                              <td className="small muted truncate" style={{ maxWidth: 300 }}>
                                {f.detail}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {group.urls.length > 200 && (
                      <p className="faint small" style={{ margin: "0.4rem 0 0" }}>
                        and {group.urls.length - 200} more
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
