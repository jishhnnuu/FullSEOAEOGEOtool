/**
 * Google comes back here.
 *
 * Spend the state, exchange the code, read the profile, find or create the
 * person, claim whatever anonymous run they left behind, and land them on it.
 */

import { baseUrl, env } from "@/server/env";
import { handleError, redirect } from "@/server/http";
import { exchangeCode, profileFrom, takeState } from "@/server/google";
import { createSession, upsertUser, isSecure, readCookie, clearCookie, CLAIM_COOKIE } from "@/server/session";
import { claimRuns } from "@/server/runs";
import { record, sweep } from "@/server/db";

export const dynamic = "force-dynamic";

function back(request: Request, message: string): Response {
  const to = new URL("/app/signin", request.url);
  to.searchParams.set("error", message);
  return redirect(to.toString());
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const denied = params.get("error");
  if (denied) {
    return back(request, denied === "access_denied" ? "You cancelled at Google's screen. Nothing was shared." : `Google returned: ${denied}`);
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back(request, "Google's reply was missing the code or the state.");

  try {
    const e = await env();
    const pending = await takeState(e, state);
    if (!pending || pending.kind !== "signin") {
      return back(request, "That sign-in link has already been used or has expired. Start again.");
    }

    const tokens = await exchangeCode(e, code, pending.code_verifier, `${baseUrl(e, request)}/api/auth/google/callback`);
    const profile = await profileFrom(tokens);
    if (!profile.verified) {
      return back(request, "Google has not verified that address, so it cannot be used to sign in.");
    }

    const { userId, orgId, created } = await upsertUser(e, profile);
    const session = await createSession(e, userId, orgId, request.headers.get("user-agent"));
    const secure = isSecure(request);
    const cookies = [session.cookie(secure)];

    // Whatever they audited before signing in now belongs to them.
    let landing = pending.next && pending.next.startsWith("/") ? pending.next : "/app";
    const claim = pending.claim_run_id ?? readCookie(request, CLAIM_COOKIE);
    if (claim) {
      const claimed = await claimRuns(e, claim, orgId).catch(() => ({ runs: 0, siteId: null }));
      if (claimed.siteId) landing = `/app/sites/${claimed.siteId}`;
      cookies.push(clearCookie(CLAIM_COOKIE, secure));
    }

    await record(e, { orgId, userId, action: created ? "account.created" : "account.signin", target: "google" });
    await sweep(e);
    return redirect(landing, cookies);
  } catch (error) {
    const response = handleError(error);
    if (response.status === 503) return response;
    return back(request, error instanceof Error ? error.message : "Sign-in failed.");
  }
}
