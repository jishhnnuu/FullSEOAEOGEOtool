/**
 * Spend a sign-in link.
 *
 * Clicking the link is what proves the address, so this is also where an
 * account is created. Single use: the row is marked the moment it is read, so
 * a link forwarded to someone else is already dead.
 */

import { sha256Hex } from "@/server/crypto";
import { env } from "@/server/env";
import { database } from "@/server/env";
import { handleError, redirect } from "@/server/http";
import { isExpired, nowIso, record, sweep } from "@/server/db";
import { claimRuns } from "@/server/runs";
import { clearCookie, createSession, isSecure, upsertUser, CLAIM_COOKIE } from "@/server/session";

export const dynamic = "force-dynamic";

function back(request: Request, message: string): Response {
  const to = new URL("/app/signin", request.url);
  to.searchParams.set("error", message);
  return redirect(to.toString());
}

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return back(request, "That link is missing its token.");

  try {
    const e = await env();
    const id = await sha256Hex(token);
    const row = await database(e)
      .prepare("SELECT * FROM login_tokens WHERE id = ?1 LIMIT 1")
      .bind(id)
      .first<{ email: string; expires_at: string; used_at: string | null; next: string | null; claim_run_id: string | null }>();

    if (!row) return back(request, "That link is not one we issued.");
    await database(e).prepare("DELETE FROM login_tokens WHERE id = ?1").bind(id).run();
    if (row.used_at) return back(request, "That link has already been used. Ask for another.");
    if (isExpired(row.expires_at)) return back(request, "That link has expired. Ask for another.");

    const { userId, orgId, created } = await upsertUser(e, { email: row.email, verified: true });
    const session = await createSession(e, userId, orgId, request.headers.get("user-agent"));
    const secure = isSecure(request);
    const cookies = [session.cookie(secure)];

    let landing = row.next && row.next.startsWith("/") ? row.next : "/app";
    if (row.claim_run_id) {
      const claimed = await claimRuns(e, row.claim_run_id, orgId).catch(() => ({ runs: 0, siteId: null }));
      if (claimed.siteId) landing = `/app/sites/${claimed.siteId}`;
      cookies.push(clearCookie(CLAIM_COOKIE, secure));
    }

    await record(e, { orgId, userId, action: created ? "account.created" : "account.signin", target: "email" });
    await sweep(e);
    return redirect(landing, cookies);
  } catch (error) {
    const response = handleError(error);
    if (response.status === 503) return response;
    return back(request, error instanceof Error ? error.message : "That link could not be used.");
  }
}
