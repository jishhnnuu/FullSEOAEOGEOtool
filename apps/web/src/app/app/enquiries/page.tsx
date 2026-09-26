"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge, Card, Notice, PageHeader, timeAgo } from "@/components/ui";
import { SERVICE_CHOICES, STAGES } from "@/engine/enquiry";
import { signInHref, useSession } from "@/lib/session";

/**
 * The enquiries inbox, for the people who run the agency.
 *
 * Readable only by a signed-in person whose address is in OWNER_EMAILS. The
 * server answers everyone else with a 404, so this screen cannot tell a
 * stranger whether any enquiries exist.
 */

type Enquiry = {
  id: string;
  name: string;
  email: string;
  business: string | null;
  website: string | null;
  stage: string | null;
  services: string[];
  message: string | null;
  source: string | null;
  status: string;
  createdAt: string;
};

const STATUSES = ["new", "contacted", "booked", "client", "not a fit"];

export default function EnquiriesPage() {
  const { session, loading } = useSession();
  const [items, setItems] = useState<Enquiry[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/enquiries?inbox=1", { credentials: "same-origin" });
    if (response.status === 404) {
      setDenied(true);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { enquiries?: Enquiry[]; message?: string };
    if (!response.ok) {
      setError(body.message ?? "The inbox could not be read.");
      return;
    }
    setItems(body.enquiries ?? []);
  }, []);

  useEffect(() => {
    if (session.user) void load();
  }, [session.user, load]);

  async function change(id: string, status: string) {
    setItems((current) => current?.map((e) => (e.id === id ? { ...e, status } : e)) ?? null);
    await fetch(`/api/enquiries/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this enquiry for good? Do this when someone asks to be forgotten.")) return;
    await fetch(`/api/enquiries/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
    setItems((current) => current?.filter((e) => e.id !== id) ?? null);
  }

  const label = (key: string) => SERVICE_CHOICES.find((s) => s.key === key)?.label ?? key;
  const stageLabel = (key: string | null) => STAGES.find((s) => s.key === key)?.label ?? null;

  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "2.5rem 1.25rem 4rem" }}>
      <Link href="/app" className="small muted">Back to your sites</Link>
      <PageHeader title="Enquiries" description="Everyone who asked for a call, newest first." />

      {loading ? <span className="spinner" /> : null}
      {!loading && !session.user ? (
        <Notice kind="warn" title="Sign in first">
          <Link href={signInHref("/app/enquiries")}>Sign in</Link> with an address listed in OWNER_EMAILS.
        </Notice>
      ) : null}
      {denied ? (
        <Notice kind="warn" title="This inbox is for the team">
          Your address is not listed in OWNER_EMAILS on this deployment. The owner adds it on{" "}
          <Link href="/app/setup">the setup page</Link>.
        </Notice>
      ) : null}
      {error ? <Notice kind="error">{error}</Notice> : null}

      {items && items.length === 0 ? <Notice title="No enquiries yet">They appear here the moment someone uses the form.</Notice> : null}

      <div className="stack">
        {items?.map((e) => (
          <Card key={e.id}>
            <div className="between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div className="row" style={{ gap: "0.5rem" }}>
                  <strong>{e.name}</strong>
                  {e.business ? <span className="muted">{e.business}</span> : null}
                  <Badge kind={e.status === "new" ? "high" : e.status === "client" ? "ok" : "muted"}>{e.status}</Badge>
                </div>
                <div className="small">
                  <a href={`mailto:${e.email}`}>{e.email}</a>
                  {e.website ? (
                    <>
                      {" · "}
                      <a href={e.website} target="_blank" rel="noopener noreferrer">{e.website.replace(/^https?:\/\//, "")}</a>
                    </>
                  ) : null}
                  {" · "}
                  <span className="muted">{timeAgo(e.createdAt)}</span>
                </div>
              </div>
              <div className="row" style={{ gap: "0.4rem" }}>
                <select value={e.status} onChange={(event) => void change(e.id, event.target.value)} aria-label="Status">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="small" onClick={() => void remove(e.id)}>Delete</button>
              </div>
            </div>
            <div className="small" style={{ marginTop: "0.6rem" }}>
              {stageLabel(e.stage) ? <div><span className="muted">Where they are:</span> {stageLabel(e.stage)}</div> : null}
              {e.services.length ? <div><span className="muted">Wants:</span> {e.services.map(label).join(", ")}</div> : null}
              {e.source ? <div><span className="muted">Came from:</span> {e.source}</div> : null}
            </div>
            {e.message ? <p style={{ marginTop: "0.6rem", whiteSpace: "pre-wrap" }}>{e.message}</p> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
