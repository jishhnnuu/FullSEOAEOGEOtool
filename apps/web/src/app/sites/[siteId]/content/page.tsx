"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { api, fetcher, type ContentDetail, type ReviewItem } from "@/lib/api";
import {
  Badge, Card, Empty, ErrorNote, Loading, Markdown, PageHeader, timeAgo,
} from "@/components/ui";

export default function ContentPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const { data, error, isLoading, mutate } = useSWR<{ count: number; items: ReviewItem[] }>(
    `/content/review-queue?site_id=${siteId}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const [open, setOpen] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (isLoading || !data) return <Loading label="Loading your review queue" />;

  return (
    <>
      <PageHeader
        title="Content review"
        description="Drafts that passed every automated check. Your job is judging whether it is the right piece making the right argument, not catching errors."
      />

      {data.count === 0 ? (
        <Card>
          <Empty title="Nothing waiting">
            <span className="small">
              Drafts appear here once they have passed the brand voice, fact and
              quality gates.
            </span>
          </Empty>
        </Card>
      ) : (
        <div className="stack">
          {data.items.map((item) => (
            <Card key={item.id}>
              <div className="between">
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: "0.5rem" }}>
                    <h2>{item.title}</h2>
                    <Badge kind="neutral">{item.type.replace(/_/g, " ")}</Badge>
                    {item.all_gates_passed
                      ? <Badge kind="ok">all checks passed</Badge>
                      : <Badge kind="high">checks failing</Badge>}
                  </div>
                  <div className="faint small">
                    {item.primary_keyword && <>targets <strong>{item.primary_keyword}</strong> · </>}
                    {item.word_count} words · waiting {timeAgo(item.waiting_since)}
                  </div>
                </div>
                <button onClick={() => setOpen(open === item.id ? null : item.id)}>
                  {open === item.id ? "Close" : "Read it"}
                </button>
              </div>

              <div className="row" style={{ marginTop: "0.75rem", gap: "1.25rem" }}>
                {Object.entries(item.scores).map(([k, v]) => v != null && (
                  <div key={k}>
                    <div className="faint small" style={{ textTransform: "capitalize" }}>
                      {k.replace(/_/g, " ")}
                    </div>
                    <strong className={v >= 80 ? "score-good" : v >= 65 ? "score-warn" : "score-bad"}>
                      {Math.round(v)}
                    </strong>
                  </div>
                ))}
              </div>

              {item.unverified_claims.length > 0 && (
                <div className="notice notice-warn small" style={{ marginTop: "0.7rem" }}>
                  <strong>{item.unverified_claims.length} claim(s) could not be verified.</strong>
                  <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
                    {item.unverified_claims.slice(0, 3).map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}

              {open === item.id && (
                <ContentReview id={item.id} onDone={() => { setOpen(null); mutate(); }} />
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function ContentReview({ id, onDone }: { id: string; onDone: () => void }) {
  const { data, error } = useSWR<ContentDetail>(`/content/${id}`, fetcher);
  const [note, setNote] = useState("");
  const [body, setBody] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading label="Loading the draft" />;

  async function act(decision: "approve" | "reject" | "request_changes") {
    setBusy(true);
    try {
      if (editing && body != null && body !== data!.body_markdown) {
        await api.patch(`/content/${id}`, { body_markdown: body });
      }
      await api.post(`/content/${id}/review`, { decision, note: note || null });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
      <div className="grid grid-2" style={{ marginBottom: "1rem" }}>
        <div>
          <div className="faint small">Search snippet preview</div>
          <div style={{
            border: "1px solid var(--border)", borderRadius: 6,
            padding: "0.7rem", marginTop: "0.3rem",
          }}>
            <div style={{ color: "var(--accent)", fontSize: "1.02rem" }}>
              {data.meta_title ?? data.title}
            </div>
            <div className="faint small">{data.slug}</div>
            <div className="small muted">{data.meta_description ?? "No description set."}</div>
          </div>
        </div>
        {data.brief?.differentiation && (
          <div>
            <div className="faint small">Why this beats what ranks now</div>
            <p className="small" style={{ marginTop: "0.3rem" }}>{data.brief.differentiation}</p>
          </div>
        )}
      </div>

      <div className="between" style={{ marginBottom: "0.5rem" }}>
        <h3>The draft</h3>
        <button className="small" onClick={() => { setEditing(!editing); setBody(data.body_markdown ?? ""); }}>
          {editing ? "Preview" : "Edit directly"}
        </button>
      </div>

      {editing ? (
        <textarea value={body ?? data.body_markdown ?? ""} onChange={(e) => setBody(e.target.value)}
                  style={{ minHeight: 320 }} />
      ) : (
        <div style={{ maxHeight: 460, overflowY: "auto", paddingRight: "0.5rem" }}>
          <Markdown source={data.body_markdown ?? "_No body yet._"} />
        </div>
      )}

      {data.external_sources?.length > 0 && (
        <details style={{ marginTop: "0.8rem" }}>
          <summary className="small muted">
            {data.external_sources.length} source(s) cited
          </summary>
          <ul className="small" style={{ marginTop: "0.4rem" }}>
            {data.external_sources.map((s: any, i: number) => (
              <li key={i}>
                {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a> : JSON.stringify(s)}
                {s.claim && <span className="faint"> — {s.claim}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="field" style={{ marginTop: "1rem" }}>
        <label htmlFor={`note-${id}`}>Anything to pass back?</label>
        <input id={`note-${id}`} value={note} onChange={(e) => setNote(e.target.value)}
               placeholder="Optional. Specific beats general." />
      </div>

      <div className="button-row">
        <button className="primary" disabled={busy} onClick={() => act("approve")}>
          Approve and publish
        </button>
        <button disabled={busy} onClick={() => act("request_changes")}>
          Request changes
        </button>
        <button className="danger" disabled={busy} onClick={() => act("reject")}>
          Reject
        </button>
      </div>
    </div>
  );
}
