"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { CATEGORY_LABEL, CATEGORY_ORDER, CONNECTORS, type ConnectorSpec } from "@/lib/connectors";
import { id, logActivity } from "@/lib/store";
import { useSite } from "@/lib/site-hooks";
import { disconnect, signInHref, useConnections, useSession, type Connection } from "@/lib/session";
import { forgetSite } from "@/lib/google-store";
import { needsProperty, useAutoMatch } from "@/lib/google-match";
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
  gbp: { product: "gbp", kind: "google" },
  wordpress: { kind: "wordpress" },
};

function Integrations() {
  const { site, mutate } = useSite();
  const params = useSearchParams();
  const { session } = useSession();
  const signedIn = Boolean(session.user);
  const { connections, refresh } = useConnections(signedIn);
  const { matching, ambiguous } = useAutoMatch(site?.id, site?.baseUrl, connections, refresh);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [wpUrl, setWpUrl] = useState("");

  if (!site) return null;

  const local = new Map(site.integrations.map((i) => [i.provider, i]));
  // This site's own connection first, then one made with no site named.
  // Another site's connection is never shown here.
  const server = new Map<string, Connection>();
  const rank = (c: Connection) => (c.siteId === site.id ? 2 : c.siteId ? 0 : 1) * 2 + (c.status === "connected" ? 1 : 0);
  for (const connection of connections) {
    if (connection.siteId && connection.siteId !== site.id) continue;
    const existing = server.get(connection.provider);
    if (!existing || rank(connection) > rank(existing)) server.set(connection.provider, connection);
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

  async function disconnectGoogle(ids: string[]) {
    for (const connectionId of ids) await disconnect(connectionId);
    await forgetSite(site!.id);
    refresh();
  }

  const banner = params.get("error") ?? null;
  const fix = params.get("fix") ?? null;
  const justConnected = params.has("connected");
  const declined = (params.get("declined") ?? "").split(",").filter(Boolean);
  const googleHref = `/api/connections/google/start?product=google&site=${site.id}&next=${encodeURIComponent(`/app/sites/${site.id}/google`)}`;
  const gsc = server.get("gsc") ?? null;
  const ga4 = server.get("ga4") ?? null;

  return (
    <div className="stack">
      <PageHeader
        title="Connections"
        description="Every capability degrades with a reason rather than failing. Each gap below is a sentence, not an error."
      />

      {banner ? (
        <Notice kind="error" title="That connection did not complete">
          {banner}
          {fix ? <span className="small" style={{ display: "block", marginTop: "0.3rem" }}>{fix}</span> : null}
        </Notice>
      ) : null}
      {justConnected && !banner ? <Notice kind="ok" title="Connected">The grant is stored and renews itself. Scheduled runs can use it.</Notice> : null}
      {declined.length ? (
        <Notice kind="warn" title="Part of Google's screen was left unticked">
          {declined.map((p) => (p === "gsc" ? "Search Console" : p === "ga4" ? "Analytics" : p)).join(" and ")} was not
          ticked, so it is not connected. <a href={googleHref}>Connect Google again</a> and leave every box ticked.
        </Notice>
      ) : null}

      <GoogleCard
        siteId={site.id}
        domain={site.domain}
        available={session.methods.google}
        signedIn={signedIn}
        href={googleHref}
        gsc={gsc}
        ga4={ga4}
        matching={matching}
        ambiguous={ambiguous}
        onDisconnect={(ids) => void disconnectGoogle(ids)}
      />

      {CATEGORY_ORDER.map((category) => {
        const specs = CONNECTORS.filter((c) => c.category === category && c.provider !== "gsc" && c.provider !== "ga4");
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
          <strong>Search Console and Analytics</strong> are both read only here, and neither is one of Google&apos;s
          restricted scopes, so no security assessment is involved. Until Google has verified this app, only the
          Google accounts listed as test users can connect, and they see an &ldquo;unverified app&rdquo; screen
          with a Continue link first. Verification is a review of the app&apos;s name, domain and privacy policy.
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

/**
 * Search Console and Analytics, as one connection.
 *
 * They are one trip to Google and one approval, so they are one card with one
 * button. It works signed out too: the same trip signs the person in, with
 * the Google account they pick on Google's own chooser.
 */
function GoogleCard({
  siteId,
  domain,
  available,
  signedIn,
  href,
  gsc,
  ga4,
  matching,
  ambiguous,
  onDisconnect,
}: {
  siteId: string;
  domain: string;
  available: boolean;
  signedIn: boolean;
  href: string;
  gsc: Connection | null;
  ga4: Connection | null;
  matching: boolean;
  ambiguous: string[];
  onDisconnect: (ids: string[]) => void;
}) {
  const any = gsc || ga4;
  const rows: { name: string; connection: Connection | null }[] = [
    { name: "Search Console", connection: gsc },
    { name: "Analytics", connection: ga4 },
  ];

  return (
    <Card title="Google Search Console and Analytics">
      {rows.map(({ name, connection }) => {
        const unchosen = connection ? needsProperty(connection) : false;
        const chosen = connection?.selection
          ? typeof connection.selection.property === "string"
            ? connection.selection.property
            : typeof connection.selection.name === "string"
              ? `${connection.selection.name} (${String(connection.selection.propertyId ?? "")})`
              : null
          : null;
        return (
          <div key={name} className="connection-row">
            <div className="meta">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <strong>{name}</strong>
                {!connection ? (
                  <Badge kind="muted">not connected</Badge>
                ) : connection.status === "error" ? (
                  <Badge kind="high">needs reconnecting</Badge>
                ) : unchosen ? (
                  <Badge kind="warn">{matching ? "matching" : "choose a property"}</Badge>
                ) : (
                  <Badge kind="ok">connected</Badge>
                )}
              </div>
              {connection ? (
                <span className="muted small">
                  {connection.label}
                  {chosen ? ` · ${chosen}` : ""}
                  {" · added "}
                  {timeAgo(connection.connectedAt)}
                </span>
              ) : (
                <span className="muted small">
                  {name === "Search Console"
                    ? "The searches people made before they reached you, 16 months of them."
                    : "Sessions, key events and revenue, so a ranking change can be tied to money."}
                </span>
              )}
              {connection?.lastError ? <span className="small" style={{ color: "var(--danger)" }}>{connection.lastError}</span> : null}
            </div>
            <div className="button-row">
              {connection && connection.status === "connected" && (unchosen ? ambiguous.includes(connection.id) : true) ? (
                <Link
                  href={`/app/sites/${siteId}/integrations/choose?connection=${connection.id}`}
                  className={unchosen ? "button small primary" : "button small"}
                >
                  {unchosen ? `Choose ${domain}` : "Change property"}
                </Link>
              ) : null}
            </div>
          </div>
        );
      })}

      <div className="button-row" style={{ marginTop: "0.9rem" }}>
        {!available ? (
          <Notice kind="warn" title="Google sign-in is not switched on for this deployment yet">
            The owner adds three values once, and then this is one button for everyone.{" "}
            <Link href="/app/setup">See what is missing</Link>.
          </Notice>
        ) : (
          <>
            <a className={any ? "button small" : "button primary"} href={href}>
              {!any ? "Connect Google" : gsc?.status === "error" || ga4?.status === "error" || !gsc || !ga4 ? "Connect Google again" : "Use a different Google account"}
            </a>
            {any ? <Link href={`/app/sites/${siteId}/google`} className="button small primary">Open your Google data</Link> : null}
            {any ? (
              <button className="small" onClick={() => onDisconnect([gsc?.id, ga4?.id].filter((x): x is string => Boolean(x)))}>
                Disconnect Google
              </button>
            ) : null}
          </>
        )}
      </div>
      {available && !any ? (
        <p className="small muted" style={{ marginTop: "0.6rem" }}>
          {signedIn ? "" : "No account needed first: the same trip to Google signs you in. "}
          Google asks which account to use, you tick Search Console and Analytics, and the property for {domain} is
          picked for you. Read only: nothing is changed in either.
        </p>
      ) : null}
    </Card>
  );
}
