/**
 * Google comes back here.
 *
 * Spend the state, exchange the code, read the profile, find or create the
 * person, claim whatever anonymous run they left behind, and land them on it.
 *
 * When the trip started from a Connect button while signed out, the same
 * grant also carries Search Console and Analytics: those are stored too, so
 * one visit to Google both signs the person in and connects their data.
 */

import { baseUrl, env } from "@/server/env";
import { ensureSchema } from "@/server/schema";
import { handleError, redirect } from "@/server/http";
import { exchangeCode, profileFrom, takeState } from "@/server/google";
import { createSession, upsertUser, isSecure, readCookie, clearCookie, CLAIM_COOKIE } from "@/server/session";
import { claimRuns } from "@/server/runs";
import { record, sweep } from "@/server/db";
import { landing as grantLanding, storeGoogleGrant } from "@/server/google-grant";

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
    await ensureSchema(e);
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

    // Signed in and connected on the same trip.
    // If storing the grant fails, the sign-in still stands: the person lands
    // signed in, with the reason written on the screen they asked for.
    if (pending.product) {
      try {
        const result = await storeGoogleGrant(e, {
          orgId,
          userId,
          siteId: pending.site_id,
          product: pending.product,
          tokens,
          profile,
        });
        landing = result.connected.length
          ? grantLanding(pending.next ?? "/app", result)
          : withError(pending.next ?? "/app", "Nothing was ticked on Google's screen, so nothing was connected. Press Connect Google again and leave the boxes ticked.");
      } catch (error) {
        landing = withError(pending.next ?? "/app", error instanceof Error ? error.message : "Signed in, but the connection could not be stored.");
      }
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

function withError(next: string, message: string): string {
  const to = new URL(next.startsWith("/") ? next : "/app", "https://x.invalid");
  to.searchParams.set("error", message);
  return `${to.pathname}${to.search}`;
}
