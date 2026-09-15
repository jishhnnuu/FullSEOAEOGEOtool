/**
 * Who is signed in, and what this deployment can do.
 *
 * Called by every screen on mount, so it must answer even when nothing is
 * configured: the sign-in screen needs to know that there is no database in
 * order to say so.
 */

import { authMethods, env } from "@/server/env";
import { json, sameOrigin, fail } from "@/server/http";
import { identify, destroySession, isSecure, clearCookie, SESSION_COOKIE, CLAIM_COOKIE } from "@/server/session";
import { schemaReady } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const e = await env();
  const methods = await authMethods();
  const who = await identify(e, request).catch(() => null);
  const ready = methods.ready ? await schemaReady(e) : false;

  return json({
    user: who
      ? {
          id: who.userId,
          email: who.email,
          name: who.name,
          picture: who.picture,
          org: { id: who.orgId, name: who.orgName, plan: who.plan },
          role: who.role,
        }
      : null,
    methods: {
      google: methods.google && ready,
      email: methods.email && ready,
    },
    // When the database is bound but the migration has not run, say that
    // rather than reporting the same gap as having no database at all.
    server: methods.ready ? (ready ? "ready" : "schema_missing") : "absent",
    gaps: methods.gaps,
  });
}

export async function DELETE(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return fail("bad_origin", "That request did not come from this site.", 403);
  const e = await env();
  await destroySession(e, request).catch(() => undefined);
  const secure = isSecure(request);
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  headers.append("set-cookie", clearCookie(SESSION_COOKIE, secure));
  headers.append("set-cookie", clearCookie(CLAIM_COOKIE, secure));
  return new Response(JSON.stringify({ ok: true }), { headers });
}
