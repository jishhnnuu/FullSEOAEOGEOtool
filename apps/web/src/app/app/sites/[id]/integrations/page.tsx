"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { CATEGORY_LABEL, CATEGORY_ORDER, CONNECTORS, type ConnectorSpec } from "@/lib/connectors";
import { id, logActivity } from "@/lib/store";
import { useSite } from "@/lib/site-hooks";
import { disconnect, signInHref, useConnections, useSession, type Connection } from "@/lib/session";
import { Badge, Card, Notice, PageHeader, timeAgo } from "@/components/ui";

/**
 * Connections.
 *
 * Three kinds sit on this screen and the difference between them is stated
 * rather than hidden. Google and WordPress have a real handshake: one button,
 * an approval on the provider's own screen, and a token that renews itself so
 * scheduled work can happen with nobody watching. Bing and the data providers
 * have no OAuth at all, so a key gets pasted, and the card says so. The rest
 * are held in this browser until there is an account to hold them properly.
 *
 * Pasting a secret should never look like the default.
 */
export default function IntegrationsPage() {
  return (
    <Suspense fallback={null}>
      <Integrations />
    </Suspense>
  );
}

/** Providers whose connection lives on the server, behind a real handshake. */
const SERVER_SIDE: Record<string, { product?: string; kind: "google" | "wordpress" }> = {
  gsc: { product: "gsc", kind: "google" },
  ga4: { product: "ga4", kind: "google" },
  gbp: { product: "gbp", kind: "google" },
  wordpress: { kind: "wordpress" },
};

function Integrations() {
  const { site, mutate } = useSite();
  const params = useSearchParams();
  const { session } = useSession();
  const signedIn = Boolean(session.user);
  const { connections, refresh } = useConnections(signedIn);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [wpUrl, setWpUrl] = useState("");

  if (!site) return null;

  const local = new Map(site.integrations.map((i) => [i.provider, i]));
  const server = new Map<string, Connection>();
  for (const connection of connections) {
    const existing = server.get(connection.provider);
    if (!existing || connection.status === "connected") server.set(connection.provider, connection);
  }

  function connectLocally(spec: ConnectorSpec) {
    const missing = spec.fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length) return;
    const reference = values[spec.fields[0].key] ?? spec.name;
    mutate((w) => {
      const record = w.sites.find((s) => s.id === site!.id);
      if (!record) return;
      record.integrations = record.integrations.filter((i) => i.provider !== spec.provider);
      record.integrations.push({
        id: id("int"),
        provider: spec.provider,
        label: spec.name,
        status: "connected",
        accountRef: reference.slice(0, 80),
        detail: spec.unlocks[0],
        capabilities: spec.unlocks,
        connectedAt: new Date().toISOString(),
        lastError: null,
      });
      logActivity(w, { siteId: site!.id, actor: "you", action: "Connection added", detail: spec.name });
    });
    setEditing(null);
    setValues({});
  }

  function forgetLocally(provider: string) {
    mutate((w) => {
      const record = w.sites.find((s) => s.id === site!.id);
      if (!record) return;
      record.integrations = record.integrations.filter((i) => i.provider !== provider);
    });
  }

  async function forgetOnServer(connectionId: string) {
    await disconnect(connectionId);
    refresh();
  }

  const banner = params.get("error") ?? null;
  const justConnected = params.get("connected") === "1";

  return (
    <div className="stack">
      <PageHeader
        title="Connections"
        description="Every capability degrades with a reason rather than failing. Each gap below is a sentence, not an error."
      />

      {banner ? <Notice kind="error" title="That connection did not complete">{banner}</Notice> : null}
      {justConnected ? <Notice kind="ok" title="Connected">The grant is stored and renews itself. Scheduled runs can use it.</Notice> : null}

      {!signedIn ? (
        <Notice kind="warn" title="Connections that survive need an account">
          A refresh token is what lets a run happen on Monday morning with nobody&apos;s browser open, and it has
          to live somewhere other than this tab. Anything you connect while signed out is held in this browser
          and goes when the browser does.{" "}
          <Link href={signInHref()}>Sign in</Link> and connecting Search Console becomes one Approve on the same
          Google account.
        </Notice>
      ) : null}

      {CATEGORY_ORDER.map((category) => {
        const specs = CONNECTORS.filter((c) => c.category === category);
        if (specs.length === 0) return null;
        return (
          <Card key={category} title={CATEGORY_LABEL[category]}>
            {specs.map((spec) => {
              const handshake = SERVER_SIDE[spec.provider];
              const remote = server.get(spec.provider);
              const held = local.get(spec.provider);
              const isOpen = editing === spec.provider;

              return (
                <div key={spec.provider} className="connection-row">
                  <div className="meta">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <strong>{spec.name}</strong>
                      {remote ? (
                        <Badge kind={remote.status === "connected" ? "ok" : remote.status === "error" ? "high" : "warn"}>
                          {remote.status === "connected" ? "connected" : remote.status === "error" ? "needs reconnecting" : "needs a property"}
                        </Badge>
                      ) : held ? (
                        <Badge kind="warn">in this browser</Badge>
                      ) : handshake ? (
                        <Badge kind="info">one approval</Badge>
                      ) : (
                        <Badge kind="muted">key needed</Badge>
                      )}
                    </div>
                    <span className="muted small">{spec.summary}</span>
                    {remote ? (
                      <span className="muted small">
                        {remote.label}
                        {remote.selection && typeof remote.selection.property === "string" ? ` · ${remote.selection.property}` : ""}
                        {remote.selection && typeof remote.selection.name === "string" ? ` · ${remote.selection.name}` : ""}
                        {" · added "}
                        {timeAgo(remote.connectedAt)}
                      </span>
                    ) : (
                      <span className="muted small">Without it: {spec.withoutIt}</span>
                    )}
                    {remote?.lastError ? <span className="small" style={{ color: "var(--danger)" }}>{remote.lastError}</span> : null}
                  </div>

                  <div className="button-row">
                    {remote ? (
                      <>
                        {remote.status !== "connected" && spec.provider !== "wordpress" ? (
                          <Link href={`/app/sites/${site.id}/integrations/choose?connection=${remote.id}`} className="button small">Choose a property</Link>
                        ) : null}
                        <button className="small" onClick={() => void forgetOnServer(remote.id)}>Disconnect</button>
                      </>
                    ) : handshake?.kind === "google" ? (
                      signedIn ? (
                        <a
                          className="button small primary"
                          href={`/api/connections/google/start?product=${handshake.product}&site=${site.id}&next=${encodeURIComponent(`/app/sites/${site.id}/integrations`)}`}
                        >
                          Connect
                        </a>
                      ) : (
                        <Link href={signInHref()} className="button small">Sign in to connect</Link>
                      )
                    ) : handshake?.kind === "wordpress" ? (
                      signedIn ? (
                        isOpen ? (
                          <form
                            style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}
                            onSubmit={(event) => {
                              event.preventDefault();
                              const target = wpUrl.trim() || site.baseUrl;
                              window.location.href =
                                `/api/connections/wordpress/start?url=${encodeURIComponent(target)}&site=${site.id}` +
                                `&next=${encodeURIComponent(`/app/sites/${site.id}/integrations`)}`;
                            }}
                          >
                            <input
                              value={wpUrl}
                              onChange={(event) => setWpUrl(event.target.value)}
                              placeholder={site.baseUrl}
                              style={{ minWidth: "220px" }}
                            />
                            <button type="submit" className="small primary">Approve in WordPress</button>
                          </form>
                        ) : (
                          <button className="small primary" onClick={() => { setEditing(spec.provider); setWpUrl(site.baseUrl); }}>Connect</button>
                        )
                      ) : (
                        <Link href={signInHref()} className="button small">Sign in to connect</Link>
                      )
                    ) : held ? (
                      <button className="small" onClick={() => forgetLocally(spec.provider)}>Remove</button>
                    ) : (
                      <button className="small" onClick={() => setEditing(isOpen ? null : spec.provider)}>
                        {isOpen ? "Cancel" : "Paste a key"}
                      </button>
                    )}
                  </div>

                  {isOpen && !handshake ? (
                    <div style={{ width: "100%", marginTop: "0.7rem" }}>
                      <Notice kind="info" title="This provider has no one-click option">
                        {spec.setupNotes}
                      </Notice>
                      {spec.fields.map((field) => (
                        <div className="field" key={field.key}>
                          <label htmlFor={`${spec.provider}-${field.key}`}>{field.label}</label>
                          {field.kind === "textarea" ? (
                            <textarea
                              id={`${spec.provider}-${field.key}`}
                              rows={4}
                              value={values[field.key] ?? ""}
                              onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                            />
                          ) : (
                            <input
                              id={`${spec.provider}-${field.key}`}
                              type={field.kind === "password" ? "password" : "text"}
                              value={values[field.key] ?? ""}
                              placeholder={field.placeholder}
                              onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                            />
                          )}
                          <span className="muted small">{field.help}</span>
                        </div>
                      ))}
                      <div className="button-row" style={{ marginTop: "0.6rem" }}>
                        <button className="small primary" onClick={() => connectLocally(spec)}>Save in this browser</button>
                      </div>
                    </div>
                  ) : null}

                  {isOpen && handshake?.kind === "wordpress" ? (
                    <div style={{ width: "100%", marginTop: "0.7rem" }}>
                      <Notice kind="info" title="What happens next">
                        You land on your own WordPress admin, on a screen WordPress itself provides, and press
                        Approve. It hands back an application password scoped to this app alone, which you can
                        revoke from Users, Profile at any time. No plugin, and nothing is typed into a form here.
                      </Notice>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Card>
        );
      })}

      <Card title="What Google will and will not allow">
        <p className="small">
          <strong>Search Console</strong> needs no review. Google reclassified the read-only scope as
          non-sensitive in 2024, so it works the moment the client exists, for anyone.
        </p>
        <p className="small">
          <strong>Analytics</strong> is a sensitive scope. It works today for accounts listed as testers on the
          consent screen, and needs Google&apos;s review before it works for the public. That review is measured
          in weeks, which is why it is worth starting before you need it.
        </p>
        <p className="small">
          <strong>Business Profile</strong> is gated behind an access request against the API itself, not just a
          scope, and wants a verified profile that has been active for two months. It is one form, once, for the
          whole account:{" "}
          <a
            href="https://developers.google.com/my-business/content/prereqs#request-access"
            target="_blank"
            rel="noopener noreferrer"
          >
            the access request
          </a>
          . After it clears, individual posts are <em>not</em> reviewed by Google. Posting, review replies and
          profile edits all run on the permission you granted when you connected, so nothing asks you again. Until
          it clears, posts and review replies are drafted here and pasted there.
        </p>
      </Card>
    </div>
  );
}
