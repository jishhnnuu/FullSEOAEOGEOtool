"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { api, fetcher, type Integration, type ProviderSpec } from "@/lib/api";
import { Badge, Card, ErrorNote, Loading, PageHeader, timeAgo } from "@/components/ui";

const CATEGORY_ORDER = ["search", "analytics", "cms", "local", "data", "outreach", "social", "performance"];
const CATEGORY_LABELS: Record<string, string> = {
  search: "Search engines",
  analytics: "Analytics",
  cms: "Where your site lives",
  local: "Local listings",
  data: "Market data",
  outreach: "Outreach",
  social: "Distribution",
  performance: "Performance",
};

export default function IntegrationsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const { data: cat, error } = useSWR<{ by_category: Record<string, ProviderSpec[]> }>(
    "/integrations/catalogue", fetcher);
  const { data: connected, mutate } = useSWR<Integration[]>(
    `/integrations?site_id=${siteId}`, fetcher);
  const [open, setOpen] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (!cat) return <Loading />;

  const byProvider = new Map((connected ?? []).map((i) => [i.provider, i]));
  const categories = Object.keys(cat.by_category)
    .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Each connection unlocks specific work. Nothing here is required: the platform runs on your public site alone, at reduced fidelity, and says so."
      />

      <div className="stack">
        {categories.map((category) => (
          <Card key={category} title={CATEGORY_LABELS[category] ?? category}>
            <div className="stack" style={{ gap: "0.5rem" }}>
              {cat.by_category[category].map((spec) => {
                const live = byProvider.get(spec.provider);
                return (
                  <div key={spec.provider}
                       style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "0.7rem 0.8rem" }}>
                    <div className="between">
                      <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: "0.5rem" }}>
                          <strong>{spec.display_name}</strong>
                          {!spec.optional && <Badge kind="medium">recommended</Badge>}
                          {live && (
                            <Badge kind={
                              live.status === "connected" ? "ok"
                              : live.status === "degraded" ? "medium" : "high"
                            }>{live.status}</Badge>
                          )}
                        </div>
                        <div className="muted small">{spec.summary}</div>
                        <div className="faint small" style={{ marginTop: "0.2rem" }}>
                          <strong>Unlocks:</strong> {spec.unlocks}
                        </div>
                        {live?.last_error && (
                          <div className="small score-bad" style={{ marginTop: "0.25rem" }}>
                            {live.last_error}
                          </div>
                        )}
                        {live?.last_verified_at && (
                          <div className="faint small">verified {timeAgo(live.last_verified_at)}</div>
                        )}
                      </div>
                      <div className="button-row">
                        {live && (
                          <button className="small"
                                  onClick={async () => { await api.post(`/integrations/${live.id}/verify`); mutate(); }}>
                            Re-check
                          </button>
                        )}
                        <button className="small"
                                onClick={() => setOpen(open === spec.provider ? null : spec.provider)}>
                          {live ? "Reconnect" : "Connect"}
                        </button>
                      </div>
                    </div>
                    {open === spec.provider && (
                      <ConnectForm spec={spec} siteId={siteId}
                                   onDone={() => { setOpen(null); mutate(); }} />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function ConnectForm({
  spec, siteId, onDone,
}: { spec: ProviderSpec; siteId: string; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const isOauth = spec.auth_kind === "oauth2";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const credentials: Record<string, string> = {};
      const config: Record<string, string> = {};
      for (const f of spec.credential_fields) if (values[f.key]) credentials[f.key] = values[f.key];
      for (const f of spec.config_fields) if (values[f.key]) config[f.key] = values[f.key];
      const res = await api.post<any>("/integrations/connect", {
        provider: spec.provider, credentials, config, site_id: siteId,
      });
      setResult(res.verification);
      if (res.verification?.ok) setTimeout(onDone, 1200);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: "0.8rem", borderTop: "1px solid var(--border)", paddingTop: "0.8rem" }}>
      {spec.setup_notes && <div className="notice small" style={{ marginBottom: "0.8rem" }}>{spec.setup_notes}</div>}

      {isOauth && spec.credential_fields.length === 0 && (
        <div className="notice notice-warn small" style={{ marginBottom: "0.8rem" }}>
          This provider uses OAuth. The deployment needs its {spec.display_name} client
          credentials configured before the sign-in flow is available. Until then you can
          paste a refresh token below.
          <div className="field" style={{ marginTop: "0.6rem" }}>
            <label>Refresh token</label>
            <input type="password" onChange={(e) => setValues({ ...values, refresh_token: e.target.value })} />
          </div>
        </div>
      )}

      {[...spec.credential_fields, ...spec.config_fields].map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={`${spec.provider}-${f.key}`}>
            {f.label}{!f.required && <span className="faint"> (optional)</span>}
          </label>
          <input
            id={`${spec.provider}-${f.key}`}
            type={f.secret || f.kind === "password" ? "password" : f.kind === "number" ? "number" : "text"}
            placeholder={f.placeholder}
            required={f.required && !f.secret ? false : false}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
          />
          {f.help && <div className="help">{f.help}</div>}
        </div>
      ))}

      {result && (
        <div className={`notice ${result.ok ? "notice-ok" : "notice-bad"} small`} style={{ marginBottom: "0.8rem" }}>
          {result.ok ? "Connected and verified." : result.error}
          {result.note && <div style={{ marginTop: "0.3rem" }}>{result.note}</div>}
          {result.ok && result.data && (
            <pre className="mono" style={{ margin: "0.4rem 0 0", overflowX: "auto" }}>
              {JSON.stringify(result.data, null, 2).slice(0, 500)}
            </pre>
          )}
        </div>
      )}

      <div className="button-row">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Verifying…" : "Connect and verify"}
        </button>
        {spec.docs_url && (
          <a href={spec.docs_url} target="_blank" rel="noopener noreferrer" className="small">
            Where to find these
          </a>
        )}
      </div>
    </form>
  );
}
