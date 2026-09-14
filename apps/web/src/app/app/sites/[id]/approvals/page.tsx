"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { applyApproval } from "@/lib/runner";
import { logActivity, type ApprovalRecord } from "@/lib/store";
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
  severityKind,
  timeAgo,
} from "@/components/ui";

type View = "pending" | "decided";

export default function ApprovalsPage() {
  const { site, workspace, mutate } = useSite();
  const [view, setView] = useState<View>("pending");
  const [note, setNote] = useState<Record<string, string>>({});

  const all = useMemo(
    () => workspace.approvals.filter((a) => a.siteId === site?.id),
    [workspace.approvals, site?.id],
  );
  const pending = all.filter((a) => a.status === "pending");
  const decided = all.filter((a) => a.status !== "pending");

  const batches = useMemo(() => groupByRisk(pending), [pending]);

  if (!site) return null;

  function decide(approval: ApprovalRecord, status: ApprovalRecord["status"]) {
    mutate((w) => {
      const record = w.approvals.find((a) => a.id === approval.id);
      if (!record) return;
      record.status = status;
      record.decidedAt = new Date().toISOString();
      record.note = note[approval.id]?.trim() || null;
      logActivity(w, {
        siteId: approval.siteId,
        actor: "you",
        action: status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Changes requested",
        detail: approval.title,
      });
    });
    if (status === "approved") applyApproval(approval.id);
  }

  function approveBatch(items: ApprovalRecord[]) {
    for (const item of items) decide(item, "approved");
  }

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Every change the platform wants to make, batched by risk, each with what it changes and whether it can be undone."
        action={<Link href={`/app/sites/${site.id}/settings`} className="button small">Autonomy: {site.autonomy}</Link>}
      />

      <Tabs
        tabs={[
          { key: "pending" as View, label: "Waiting on you", count: pending.length },
          { key: "decided" as View, label: "Decided", count: decided.length },
        ]}
        active={view}
        onChange={setView}
      />

      {view === "pending" ? (
        pending.length === 0 ? (
          <Empty title="Nothing waiting">
            <p className="small">
              Run the audit again to look for new work, or{" "}
              <Link href={`/app/sites/${site.id}/findings`}>queue a finding</Link> yourself.
            </p>
          </Empty>
        ) : (
          <div className="stack">
            {batches.map((batch) => (
              <Card
                key={batch.risk}
                title={`${batch.label} · ${batch.items.length} item${batch.items.length === 1 ? "" : "s"}`}
                action={
                  batch.canBulk ? (
                    <button className="small primary" onClick={() => approveBatch(batch.items)}>
                      Approve all {batch.items.length}
                    </button>
                  ) : (
                    <span className="tiny faint">Read individually</span>
                  )
                }
              >
                {!batch.canBulk && (
                  <Notice kind="warn">
                    {batch.risk === "critical"
                      ? "Critical changes cannot be bulk approved at any autonomy level. A robots.txt or a site-wide rule that is wrong takes a site out of the index, and that is not a risk worth automating away."
                      : "High-risk changes are approved one at a time on purpose."}
                  </Notice>
                )}

                <div className="stack-sm" style={{ marginTop: "0.7rem" }}>
                  {batch.items.map((approval) => (
                    <details className="reveal" key={approval.id}>
                      <summary>
                        <span className="row" style={{ gap: "0.5rem", display: "inline-flex" }}>
                          <Badge kind={severityKind(approval.risk)}>{approval.risk}</Badge>
                          <strong>{approval.title}</strong>
                          {!approval.reversible && <Badge kind="high">not reversible</Badge>}
                        </span>
                        <div className="tiny faint" style={{ marginTop: "0.2rem" }}>
                          proposed by {approval.requestedBy} · {timeAgo(approval.createdAt)}
                          {approval.autoApproveAt && ` · auto-approves ${timeAgo(approval.autoApproveAt)}`}
                        </div>
                      </summary>

                      <div className="stack-sm">
                        <p className="small" style={{ margin: 0 }}>{approval.summary}</p>
                        <p className="small muted" style={{ margin: 0 }}><strong>Why.</strong> {approval.rationale}</p>
                        <p className="small muted" style={{ margin: 0 }}><strong>Expected effect.</strong> {approval.expectedImpact}</p>

                        {approval.fix && (
                          <>
                            <BeforeAfter before={approval.fix.before} after={approval.fix.after} />
                            <p className="tiny muted" style={{ margin: 0 }}>
                              <strong>Where it goes.</strong> {approval.fix.applyVia}. {approval.fix.instructions}
                            </p>
                          </>
                        )}

                        <input
                          placeholder="A note, if you want one on the record"
                          value={note[approval.id] ?? ""}
                          onChange={(e) => setNote({ ...note, [approval.id]: e.target.value })}
                        />

                        <div className="button-row">
                          <button className="primary small" onClick={() => decide(approval, "approved")}>Approve</button>
                          <button className="small" onClick={() => decide(approval, "changes_requested")}>Request changes</button>
                          <button className="small danger" onClick={() => decide(approval, "rejected")}>Reject</button>
                          {approval.fix && <CopyButton text={approval.fix.after} label="Copy the change" />}
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : decided.length === 0 ? (
        <Empty title="Nothing decided yet" />
      ) : (
        <Card>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Change</th><th>Decision</th><th>Risk</th><th>When</th><th>Note</th></tr>
              </thead>
              <tbody>
                {decided.map((approval) => (
                  <tr key={approval.id}>
                    <td>{approval.title}</td>
                    <td>
                      <Badge kind={approval.status === "rejected" ? "high" : approval.status === "applied" ? "ok" : "neutral"}>
                        {approval.status}
                      </Badge>
                    </td>
                    <td><Badge kind={severityKind(approval.risk)}>{approval.risk}</Badge></td>
                    <td className="muted small">{timeAgo(approval.decidedAt)}</td>
                    <td className="small muted">{approval.note ?? "-"}</td>
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

const RISK_LABEL: Record<string, string> = {
  low: "Low risk, reversible",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical: site-wide or hard to undo",
};

function groupByRisk(items: ApprovalRecord[]) {
  const order = ["low", "medium", "high", "critical"] as const;
  return order
    .map((risk) => ({
      risk,
      label: RISK_LABEL[risk],
      canBulk: risk === "low" || risk === "medium",
      items: items.filter((item) => item.risk === risk),
    }))
    .filter((batch) => batch.items.length > 0);
}
