"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CATALOG, CATEGORY_LABEL } from "@/engine/catalog";
import type { Finding, Severity } from "@/engine/types";
import { approvalsFromResult, agentFor, id, logActivity } from "@/lib/store";
import { useSite } from "@/lib/site-hooks";
import {
  Badge,
  BeforeAfter,
  Card,
  CopyButton,
  Empty,
  Notice,
  PageHeader,
  Tabs,
  scopeLabel,
  severityKind,
  shortUrl,
} from "@/components/ui";

const SEVERITIES = ["all", "critical", "high", "medium", "low"] as const;
const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export default function FindingsPage() {
  const { site, result, workspace, mutate } = useSite();
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("all");
  const [category, setCategory] = useState("all");
  const [onlyFixable, setOnlyFixable] = useState(false);
  const [grouped, setGrouped] = useState(true);

  const queued = useMemo(
    () => new Set(workspace.approvals.filter((a) => a.findingId).map((a) => a.findingId as string)),
    [workspace.approvals],
  );

  const findings = useMemo(() => {
    if (!result) return [];
    return result.findings.filter((f) => {
      if (severity !== "all" && f.severity !== severity) return false;
      if (category !== "all" && f.category !== category) return false;
      if (onlyFixable && !f.fix) return false;
      return true;
    });
  }, [result, severity, category, onlyFixable]);

  // One row per check rather than per occurrence. Forty missing alt attributes
  // are one job, not forty, and a list that says otherwise is unreadable.
  const groups = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const finding of findings) {
      const list = map.get(finding.code) ?? [];
      list.push(finding);
      map.set(finding.code, list);
    }
    return [...map.entries()]
      .map(([code, items]) => ({
        code,
        items,
        worst: items.reduce<Severity>((worst, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst] ? f.severity : worst), "info"),
        priority: Math.max(...items.map((f) => f.priority)),
        pages: items.reduce((sum, f) => sum + Math.max(f.affectedUrls.length, 1), 0),
        fixable: items.filter((f) => f.fix).length,
      }))
      .sort((a, b) => b.priority - a.priority);
  }, [findings]);

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="Findings" />
        <Empty title="No run yet">
          <p className="small">
            <Link href={`/app/sites/${site.id}`}>Start a run</Link> and the findings appear here.
          </p>
        </Empty>
      </>
    );
  }

  const categories = [...new Set(result.findings.map((f) => f.category))];
  const counts = SEVERITIES.map((key) => ({
    key,
    label: key === "all" ? "All" : key,
    count: key === "all" ? result.findings.length : result.findings.filter((f) => f.severity === key).length,
  }));

  function queue(items: Finding[]) {
    if (!site || !result) return;
    const fresh = items.filter((f) => f.fix && !queued.has(f.id));
    if (!fresh.length) return;
    const built = approvalsFromResult({ ...result, findings: fresh }, site);
    mutate((w) => {
      w.approvals.unshift(...built.map((a) => ({ ...a, id: id("apr") })));
      logActivity(w, {
        siteId: site.id,
        actor: agentFor(fresh[0].category),
        action: `Queued ${fresh.length} change${fresh.length === 1 ? "" : "s"} for approval`,
        detail: fresh[0].title,
      });
    });
  }

  return (
    <>
      <PageHeader
        title="Findings"
        description={`${result.findings.length} open across ${result.crawl.fetched} crawled pages, ordered by what is worth doing rather than by severity alone.`}
        action={<Link href={`/app/sites/${site.id}/approvals`} className="button small">Approval queue</Link>}
      />

      <Tabs tabs={counts} active={severity} onChange={setSeverity} />

      <div className="row" style={{ marginBottom: "1rem" }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "auto" }}>
          <option value="all">Every area</option>
          {categories.map((key) => (
            <option key={key} value={key}>{CATEGORY_LABEL[key] ?? key}</option>
          ))}
        </select>
        <label className="checkline" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={onlyFixable} onChange={(e) => setOnlyFixable(e.target.checked)} />
          Only ones with the fix already written
        </label>
        <label className="checkline" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          Group by check
        </label>
      </div>

      {findings.length === 0 ? (
        <Empty title="Nothing matches that filter" />
      ) : grouped ? (
        <div className="stack-sm">
          {groups.map((group) => {
            const def = CATALOG[group.code];
            const outstanding = group.items.filter((f) => f.fix && !queued.has(f.id));
            return (
              <details className="reveal" key={group.code}>
                <summary>
                  <span className="row" style={{ gap: "0.5rem", display: "inline-flex" }}>
                    <Badge kind={severityKind(group.worst)}>{group.worst}</Badge>
                    <strong>{def?.title ?? group.code}</strong>
                    <span className="faint small">
                      {group.items.length === 1 ? scopeLabel(group.items[0], 40) : `${group.pages} pages`}
                    </span>
                    {group.fixable > 0 && <Badge kind="ok">{group.fixable} fixes ready</Badge>}
                  </span>
                  <div className="tiny faint" style={{ marginTop: "0.2rem" }}>
                    priority {group.priority} · {CATEGORY_LABEL[def?.category ?? ""] ?? def?.category}
                    <span className="mono"> {group.code}</span>
                  </div>
                </summary>

                <div className="stack-sm">
                  {def && (
                    <>
                      <p className="small muted" style={{ margin: 0 }}><strong>Why it matters.</strong> {def.why}</p>
                      <p className="small muted" style={{ margin: 0 }}><strong>What to do.</strong> {def.recommendation}</p>
                      <div className="row tiny faint">
                        <span>impact {def.impact.toFixed(2)}</span>
                        <span>effort {def.effort.toFixed(2)}</span>
                        <span>confidence {def.confidence.toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  {outstanding.length > 1 && (
                    <div className="button-row">
                      <button className="small primary" onClick={() => queue(outstanding)}>
                        Send all {outstanding.length} to approvals
                      </button>
                    </div>
                  )}

                  <div className="stack-sm">
                    {group.items.slice(0, 60).map((finding) => (
                      <Occurrence
                        key={finding.id}
                        finding={finding}
                        queued={queued.has(finding.id)}
                        onQueue={() => queue([finding])}
                      />
                    ))}
                  </div>
                  {group.items.length > 60 && (
                    <p className="tiny faint" style={{ margin: 0 }}>
                      {group.items.length - 60} more occurrences not listed. Approve the batch above to cover all of them.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="stack-sm">
          {findings.map((finding) => (
            <details className="reveal" key={finding.id}>
              <summary>
                <span className="row" style={{ gap: "0.5rem", display: "inline-flex" }}>
                  <Badge kind={severityKind(finding.severity)}>{finding.severity}</Badge>
                  <strong>{finding.title}</strong>
                  {finding.fix && <Badge kind="ok">fix ready</Badge>}
                  {queued.has(finding.id) && <Badge kind="neutral">queued</Badge>}
                </span>
                <div className="tiny faint" style={{ marginTop: "0.2rem" }}>
                  {scopeLabel(finding, 70)} · priority {finding.priority} ·{" "}
                  {CATEGORY_LABEL[finding.category] ?? finding.category}
                </div>
              </summary>
              <div className="stack-sm">
                <p className="small muted" style={{ margin: 0 }}><strong>Why it matters.</strong> {finding.why}</p>
                <p className="small muted" style={{ margin: 0 }}><strong>What to do.</strong> {finding.recommendation}</p>
                <Occurrence finding={finding} queued={queued.has(finding.id)} onQueue={() => queue([finding])} />
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

function Occurrence({
  finding,
  queued,
  onQueue,
}: {
  finding: Finding;
  queued: boolean;
  onQueue: () => void;
}) {
  return (
    <div className="card card-flat" style={{ background: "var(--bg-alt)" }}>
      <div className="between" style={{ alignItems: "flex-start", gap: "0.6rem" }}>
        <div style={{ minWidth: 0 }}>
          <div className="small truncate">
            {finding.url ? (
              <a href={finding.url} target="_blank" rel="noopener noreferrer">{shortUrl(finding.url, 68)}</a>
            ) : (
              <strong>{scopeLabel(finding, 68)}</strong>
            )}
          </div>
          {finding.detail && <div className="tiny muted">{finding.detail}</div>}
        </div>
        {finding.fix && (
          <div className="button-row">
            <CopyButton text={finding.fix.after} />
            <button className="small primary" disabled={queued} onClick={onQueue}>
              {queued ? "In the queue" : "Send to approvals"}
            </button>
          </div>
        )}
      </div>

      {finding.affectedUrls.length > 1 && (
        <details className="reveal card-flat" style={{ marginTop: "0.6rem", background: "var(--surface)" }}>
          <summary className="small">{finding.affectedUrls.length} affected URLs</summary>
          <div className="mono tiny" style={{ maxHeight: "220px", overflowY: "auto" }}>
            {finding.affectedUrls.slice(0, 200).map((url) => (
              <div key={url} className="truncate">
                <a href={url} target="_blank" rel="noopener noreferrer">{shortUrl(url, 90)}</a>
              </div>
            ))}
          </div>
        </details>
      )}

      {Object.keys(finding.evidence).length > 0 && (
        <details className="reveal card-flat" style={{ marginTop: "0.5rem", background: "var(--surface)" }}>
          <summary className="small">Evidence</summary>
          <pre className="codeblock">{JSON.stringify(finding.evidence, null, 2)}</pre>
        </details>
      )}

      {finding.fix ? (
        <div style={{ marginTop: "0.7rem" }}>
          <div className="tiny faint" style={{ marginBottom: "0.35rem" }}>{finding.fix.label.toUpperCase()}</div>
          <BeforeAfter before={finding.fix.before} after={finding.fix.after} />
          <p className="tiny muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
            <strong>Where it goes.</strong> {finding.fix.applyVia}. {finding.fix.instructions}
          </p>
        </div>
      ) : (
        <Notice>
          <span className="small">
            This one needs a decision rather than a patch, so it comes with the recommendation and the evidence
            rather than a generated change.
          </span>
        </Notice>
      )}
    </div>
  );
}
