"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { api, fetcher, type Approval, type ApprovalBatch } from "@/lib/api";
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader, timeAgo } from "@/components/ui";

export default function ApprovalsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const { data, error, isLoading, mutate } = useSWR<{ batches: ApprovalBatch[]; total_pending: number }>(
    `/approvals/grouped?site_id=${siteId}`,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function decide(id: string, decision: "approved" | "rejected", note?: string) {
    setBusy(id);
    try {
      await api.post(`/approvals/${id}/decide`, { decision, note });
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  async function decideBatch(batch: ApprovalBatch, decision: "approved" | "rejected") {
    setBusy(batch.key);
    try {
      await api.post("/approvals/bulk", {
        approval_ids: batch.items.map((i) => i.id),
        decision,
      });
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorNote error={error} />;
  if (isLoading || !data) return <Loading label="Loading your queue" />;

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Everything here needs a decision only you can make. Low-risk items are grouped so one decision covers the batch."
      />

      {data.total_pending === 0 ? (
        <Card>
          <Empty title="Nothing needs you">
            <span className="small">
              The team is working. You will see something here when a decision is
              genuinely yours to make.
            </span>
          </Empty>
        </Card>
      ) : (
        <div className="stack">
          {data.batches.map((batch) => (
            <Card key={batch.key}>
              <div className="between" style={{ marginBottom: "0.75rem" }}>
                <div>
                  <div className="row" style={{ gap: "0.5rem" }}>
                    <h2 style={{ textTransform: "capitalize" }}>
                      {batch.type.replace(/_/g, " ")}
                    </h2>
                    <Badge kind={batch.risk}>{batch.risk} risk</Badge>
                    {!batch.reversible && <Badge kind="critical">hard to reverse</Badge>}
                  </div>
                  <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
                    {batch.count} item{batch.count === 1 ? "" : "s"}
                    {batch.can_bulk_approve
                      ? " · can be approved together"
                      : " · must be reviewed individually"}
                  </p>
                </div>
                {batch.can_bulk_approve && (
                  <div className="button-row">
                    <button className="primary" disabled={busy === batch.key}
                            onClick={() => decideBatch(batch, "approved")}>
                      Approve all {batch.count}
                    </button>
                    <button className="danger" disabled={busy === batch.key}
                            onClick={() => decideBatch(batch, "rejected")}>
                      Reject all
                    </button>
                  </div>
                )}
              </div>

              <div className="stack" style={{ gap: "0.5rem" }}>
                {batch.items.map((item) => (
                  <ApprovalRow
                    key={item.id}
                    item={item}
                    busy={busy === item.id}
                    expanded={expanded === item.id}
                    onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                    onDecide={decide}
                  />
                ))}
                {batch.count > batch.items.length && (
                  <p className="faint small" style={{ margin: 0 }}>
                    and {batch.count - batch.items.length} more in this batch
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function ApprovalRow({
  item, busy, expanded, onToggle, onDecide,
}: {
  item: Approval;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDecide: (id: string, decision: "approved" | "rejected") => void;
}) {
  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "0.7rem 0.8rem",
    }}>
      <div className="between">
        <div style={{ minWidth: 0 }}>
          <button onClick={onToggle}
                  style={{ border: "none", background: "none", padding: 0, textAlign: "left", fontWeight: 550 }}>
            {item.title}
          </button>
          <div className="faint small">
            proposed by {item.requested_by_agent ?? "the team"} · {timeAgo(item.created_at)}
            {item.auto_approve_at && ` · auto-approves ${timeAgo(item.auto_approve_at)}`}
          </div>
        </div>
        <div className="button-row">
          <button className="primary small" disabled={busy}
                  onClick={() => onDecide(item.id, "approved")}>Approve</button>
          <button className="danger small" disabled={busy}
                  onClick={() => onDecide(item.id, "rejected")}>Reject</button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: "0.7rem", borderTop: "1px solid var(--border)", paddingTop: "0.7rem" }}>
          {item.summary && <p className="small">{item.summary}</p>}
          {item.rationale && (
            <p className="small"><strong>Why: </strong>{item.rationale}</p>
          )}
          {item.expected_impact && (
            <p className="small"><strong>Effect: </strong>{item.expected_impact}</p>
          )}
          {item.diff && <pre className="diff">{item.diff}</pre>}
          {item.preview && (
            <pre className="mono" style={{
              background: "var(--bg)", padding: "0.6rem", borderRadius: 6,
              overflowX: "auto", margin: 0,
            }}>{JSON.stringify(item.preview, null, 2)}</pre>
          )}
          {!item.reversible && (
            <div className="notice notice-warn small" style={{ marginTop: "0.6rem" }}>
              This change is hard to undo. Read it carefully before approving.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
