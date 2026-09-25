/**
 * Connections: what an org has attached, and the only path to a live token.
 *
 * A connection row is safe to read and safe to show. Everything sensitive sits
 * in `sealed`, and the only function that opens it is `accessToken`, which
 * refreshes when the access token has aged out and reseals the result. No
 * route returns a secret in any shape, including a masked one, because a mask
 * still confirms the value.
 */

import { newId, open, openJson, seal } from "./crypto";
import { masterKey, type Env } from "./env";
import { database } from "./env";
import { fetchScoped, insert, isExpired, listScoped, nowIso, updateScoped, upsert } from "./db";
import { GoogleError, refresh, revoke, type TokenSet } from "./google";

export type Provider = "gsc" | "ga4" | "gbp" | "wordpress" | "bing" | "shopify" | "webflow";

export type ConnectionRow = {
  id: string;
  org_id: string;
  site_id: string | null;
  provider: string;
  label: string;
  status: string;
  scopes: string | null;
  selection: string | null;
  sealed: string | null;
  expires_at: string | null;
  last_error: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What a connection looks like to the client. No secret, not even a masked one. */
export type PublicConnection = {
  id: string;
  provider: string;
  label: string;
  status: string;
  scopes: string[];
  selection: Record<string, unknown> | null;
  siteId: string | null;
  lastError: string | null;
  connectedAt: string;
  expiresAt: string | null;
};

export function publicView(row: ConnectionRow): PublicConnection {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    status: row.status,
    scopes: row.scopes ? row.scopes.split(" ").filter(Boolean) : [],
    selection: row.selection ? (JSON.parse(row.selection) as Record<string, unknown>) : null,
    siteId: row.site_id,
    lastError: row.last_error,
    connectedAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function listConnections(e: Env, orgId: string): Promise<PublicConnection[]> {
  const rows = await listScoped<ConnectionRow>(e, "connections", orgId, { orderBy: "created_at ASC" });
  return rows.map(publicView);
}

export async function getConnection(e: Env, id: string, orgId: string): Promise<ConnectionRow | null> {
  return fetchScoped<ConnectionRow>(e, "connections", id, orgId);
}

/** The first working connection for a provider, which is what most screens want. */
export async function connectionFor(e: Env, orgId: string, provider: Provider, siteId?: string | null): Promise<ConnectionRow | null> {
  const rows = await listScoped<ConnectionRow>(e, "connections", orgId, {
    where: "provider = ?2 AND status = 'connected'",
    bind: [provider],
    orderBy: "created_at ASC",
  });
  if (siteId) {
    const scoped = rows.find((row) => row.site_id === siteId);
    if (scoped) return scoped;
  }
  return rows[0] ?? null;
}

/* ------------------------------------------------------------- storing */

export type GoogleSecret = {
  kind: "google";
  refresh_token: string;
  access_token: string;
  /** Epoch milliseconds. */
  access_expires: number;
};

export type BasicSecret = {
  kind: "basic";
  username: string;
  password: string;
};

export type ApiKeySecret = { kind: "api_key"; key: string };

export type Secret = GoogleSecret | BasicSecret | ApiKeySecret;

export async function saveConnection(
  e: Env,
  input: {
    orgId: string;
    siteId?: string | null;
    provider: Provider;
    label: string;
    scopes?: string;
    selection?: Record<string, unknown> | null;
    secret: Secret;
    expiresAt?: string | null;
  },
): Promise<string> {
  const sealed = await seal(input.secret as unknown as Record<string, unknown>, masterKey(e));
  // One row per account, product and site: two sites connected through the
  // same Google account each keep their own chosen property. A row with no
  // site is reused by a connect that names none.
  const existing = await database(e)
    .prepare("SELECT id FROM connections WHERE org_id = ?1 AND provider = ?2 AND label = ?3 AND site_id IS ?4 LIMIT 1")
    .bind(input.orgId, input.provider, input.label, input.siteId ?? null)
    .first<{ id: string }>();

  const id = existing?.id ?? newId("con");
  const values = {
    id,
    org_id: input.orgId,
    site_id: input.siteId ?? null,
    provider: input.provider,
    label: input.label,
    status: "connected",
    scopes: input.scopes ?? null,
    selection: input.selection ? JSON.stringify(input.selection) : null,
    sealed,
    expires_at: input.expiresAt ?? null,
    last_error: null,
    created_at: existing ? undefined : nowIso(),
    updated_at: nowIso(),
  };
  if (existing) {
    const { id: _id, org_id: _org, created_at: _created, ...rest } = values;
    // Reconnecting renews the grant. It must not forget which property was
    // chosen or which site it belongs to, or every reconnect would send the
    // person back through the chooser.
    const kept: Record<string, unknown> = { ...rest };
    if (input.selection === undefined) delete kept.selection;
    await updateScoped(e, "connections", id, input.orgId, kept);
  } else {
    await insert(e, "connections", values as Record<string, unknown>);
  }
  return id;
}

/** Record what a provider said when it refused, so the screen can show it. */
export async function markBroken(e: Env, row: ConnectionRow, message: string): Promise<void> {
  await updateScoped(e, "connections", row.id, row.org_id, {
    status: "error",
    last_error: message.slice(0, 400),
    updated_at: nowIso(),
  });
}

export async function forgetConnection(e: Env, id: string, orgId: string): Promise<boolean> {
  const row = await getConnection(e, id, orgId);
  if (!row) return false;
  // Hand the grant back to Google rather than just dropping our copy of it,
  // unless another connection was made on the same approval: Search Console
  // and Analytics share one grant, and revoking it for one would silently
  // break the other.
  const google = ["gsc", "ga4", "gbp"];
  const sibling = google.includes(row.provider)
    ? await database(e)
        .prepare("SELECT id FROM connections WHERE org_id = ?1 AND label = ?2 AND id != ?3 AND provider IN ('gsc','ga4','gbp') LIMIT 1")
        .bind(orgId, row.label, id)
        .first<{ id: string }>()
    : null;
  if (row.sealed && google.includes(row.provider) && !sibling) {
    try {
      const secret = await openJson<GoogleSecret>(row.sealed, masterKey(e));
      if (secret.refresh_token) await revoke(secret.refresh_token);
    } catch {
      // A token we cannot unseal is a token we cannot revoke. Still forget it.
    }
  }
  await database(e).prepare("DELETE FROM connections WHERE id = ?1 AND org_id = ?2").bind(id, orgId).run();
  return true;
}

/* -------------------------------------------------------------- reading */

/**
 * A live Google access token for this connection.
 *
 * Refreshes and reseals when the stored one has expired, with sixty seconds of
 * slack so a token cannot die between this check and the call that uses it.
 * A refresh Google rejects marks the connection broken and throws, because the
 * user has revoked it and silently retrying would just repeat the failure.
 */
export async function accessToken(e: Env, row: ConnectionRow): Promise<string> {
  if (!row.sealed) throw new GoogleError("connection_empty", "That connection holds no credential.");
  const secret = await openJson<GoogleSecret>(row.sealed, masterKey(e));
  if (secret.kind !== "google") throw new GoogleError("wrong_kind", "That connection is not a Google grant.");

  if (secret.access_token && secret.access_expires > Date.now() + 60_000) return secret.access_token;

  let tokens: TokenSet;
  try {
    tokens = await refresh(e, secret.refresh_token);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markBroken(e, row, message);
    throw new GoogleError(
      "reconnect_needed",
      `${row.label} needs reconnecting: Google would not renew the grant. ${message}`,
    );
  }

  const updated: GoogleSecret = {
    kind: "google",
    // Google only returns a refresh token on the first consent, so keep ours.
    refresh_token: tokens.refresh_token ?? secret.refresh_token,
    access_token: tokens.access_token,
    access_expires: Date.now() + Math.max(0, tokens.expires_in - 30) * 1000,
  };
  await updateScoped(e, "connections", row.id, row.org_id, {
    sealed: await seal(updated as unknown as Record<string, unknown>, masterKey(e)),
    status: "connected",
    last_error: null,
    last_used_at: nowIso(),
    updated_at: nowIso(),
  });
  return tokens.access_token;
}

/** The username and application password behind a CMS connection. */
export async function basicAuth(e: Env, row: ConnectionRow): Promise<string> {
  if (!row.sealed) throw new Error("That connection holds no credential.");
  const secret = await openJson<BasicSecret>(row.sealed, masterKey(e));
  if (secret.kind !== "basic") throw new Error("That connection is not a username and password.");
  return `Basic ${btoa(`${secret.username}:${secret.password}`)}`;
}

/** A stored API key, for the providers that offer nothing better. */
export async function apiKey(e: Env, row: ConnectionRow): Promise<string> {
  if (!row.sealed) throw new Error("That connection holds no credential.");
  const parsed = JSON.parse(await open(row.sealed, masterKey(e))) as ApiKeySecret;
  if (parsed.kind !== "api_key") throw new Error("That connection is not an API key.");
  return parsed.key;
}

/** True when the row's own expiry has passed, for providers that set one. */
export function connectionExpired(row: ConnectionRow): boolean {
  return Boolean(row.expires_at) && isExpired(row.expires_at);
}

export { upsert };
