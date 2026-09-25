/**
 * Hand Google's answer to the browser without reading it.
 *
 * A full Search Console pull is tens of thousands of rows, and parsing that
 * inside the Worker would spend the per-request CPU budget that caused the
 * Error 1102s before. So the Worker only does what needs a secret: find the
 * connection, unseal a live token, put the property the account chose into
 * the address, and pipe Google's body straight back. The browser parses it,
 * pages through it and stores it, which is the same split as the audit: the
 * Worker fetches, the browser analyses.
 *
 * The property always comes from the stored selection, never from the
 * request, so a request cannot read a property this account never chose.
 */

import { accessToken, markBroken, type ConnectionRow, type Provider } from "./connections";
import type { Env } from "./env";
import { fail } from "./http";
import { listScoped, nowIso, updateScoped } from "./db";

/** The largest request body forwarded. A report query is a few hundred bytes. */
const MAX_BODY = 16_000;

export type Chosen = { row: ConnectionRow; selection: Record<string, string> };

/**
 * The connection for this site: its own, or one made with no site named.
 * Never another site's, because that would put one site's property behind
 * another site's screen.
 */
async function forSite(e: Env, orgId: string, provider: Provider, siteId: string | null): Promise<ConnectionRow | null> {
  const rows = await listScoped<ConnectionRow>(e, "connections", orgId, {
    where: "provider = ?2 AND status = 'connected'",
    bind: [provider],
    orderBy: "created_at ASC",
  });
  return (siteId ? rows.find((row) => row.site_id === siteId) : null) ?? rows.find((row) => !row.site_id) ?? null;
}

export async function chosen(e: Env, orgId: string, provider: Provider, siteId: string | null): Promise<Chosen | Response> {
  const row = await forSite(e, orgId, provider, siteId);
  const name = provider === "gsc" ? "Search Console" : "Analytics";
  if (!row) return fail("not_connected", `${name} is not connected.`, 409, "Press Connect Google on the Connections screen.");
  const selection = row.selection ? (JSON.parse(row.selection) as Record<string, string>) : {};
  if (provider === "gsc" && !selection.property) return fail("no_property", "Google is connected, but no Search Console property is chosen yet.", 409);
  if (provider === "ga4" && !selection.propertyId) return fail("no_property", "Google is connected, but no Analytics property is chosen yet.", 409);
  return { row, selection };
}

export async function readBody(request: Request): Promise<string | Response> {
  const text = await request.text();
  if (text.length > MAX_BODY) return fail("too_large", "That report request is larger than any real one.", 413);
  return text;
}

/** Call Google with the connection's token and pass the answer through untouched. */
export async function relay(e: Env, picked: Chosen, url: string, init: { method: string; body?: string }): Promise<Response> {
  const token = await accessToken(e, picked.row);
  const upstream = await fetch(url, {
    method: init.method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: init.body,
  });
  if (upstream.status === 401) {
    await markBroken(e, picked.row, "Google no longer accepts this connection. Connect Google again.");
  } else if (upstream.ok) {
    await updateScoped(e, "connections", picked.row.id, picked.row.org_id, { last_used_at: nowIso() });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
