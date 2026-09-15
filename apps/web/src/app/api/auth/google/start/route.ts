/**
 * Send the browser to Google to sign in.
 *
 * Identity scopes only. Search Console and Analytics are asked for later, on
 * the screen that can say why it wants them, as an extension of this same
 * grant. Twelve OAuth screens before any value is how every other tool in the
 * category loses people.
 */

import { baseUrl, env, NotConfigured } from "@/server/env";
import { ensureSchema } from "@/server/schema";
import { handleError, redirect } from "@/server/http";
import { IDENTITY_SCOPES, startAuth } from "@/server/google";
import { readCookie, CLAIM_COOKIE } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const e = await env();
    await ensureSchema(e);
    const next = new URL(request.url).searchParams.get("next") ?? "/app";
    const url = await startAuth(e, {
      kind: "signin",
      scopes: IDENTITY_SCOPES,
      redirectUri: `${baseUrl(e, request)}/api/auth/google/callback`,
      next: next.startsWith("/") ? next : "/app",
      claimRunId: readCookie(request, CLAIM_COOKIE) ?? undefined,
    });
    return redirect(url);
  } catch (error) {
    if (error instanceof NotConfigured) {
      const to = new URL("/app/signin", request.url);
      to.searchParams.set("error", error.gap.reason);
      to.searchParams.set("fix", error.gap.fix);
      return redirect(to.toString());
    }
    return handleError(error);
  }
}
