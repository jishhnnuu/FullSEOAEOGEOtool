/**
 * Store the grant, for someone who was already signed in.
 *
 * The refresh token is the part that matters: it is what lets a run happen on
 * Monday morning with nobody's browser open. Google only returns one on the
 * first consent for a client, which is why `prompt=consent` is set on the way
 * out. Storing, and picking a property when there is only one, is shared with
 * the sign-in callback in `server/google-grant.ts`.
 */

import { baseUrl, env } from "@/server/env";
import { ensureSchema } from "@/server/schema";
import { handleError, redirect } from "@/server/http";
import { exchangeCode, profileFrom, takeState } from "@/server/google";
import { landing, storeGoogleGrant } from "@/server/google-grant";

export const dynamic = "force-dynamic";

function back(next: string, request: Request, message: string): Response {
  const to = new URL(next.startsWith("/") ? next : "/app/settings", request.url);
  to.searchParams.set("error", message);
  return redirect(to.toString());
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  const denied = params.get("error");

  try {
    const e = await env();
    await ensureSchema(e);
    const pending = state ? await takeState(e, state) : null;
    const next = pending?.next ?? "/app/settings";

    if (denied) {
      return back(next, request, denied === "access_denied" ? "You cancelled at Google's screen. Nothing was connected." : `Google returned: ${denied}`);
    }
    if (!pending || pending.kind !== "connect" || !pending.org_id) {
      return back(next, request, "That connection attempt has expired. Press Connect again.");
    }
    if (!code) return back(next, request, "Google's reply was missing the code. Press Connect again.");

    const tokens = await exchangeCode(e, code, pending.code_verifier, `${baseUrl(e, request)}/api/connections/google/callback`);
    const profile = await profileFrom(tokens);
    const result = await storeGoogleGrant(e, {
      orgId: pending.org_id,
      userId: pending.user_id,
      siteId: pending.site_id,
      product: pending.product ?? "google",
      tokens,
      profile,
    });
    if (!result.connected.length) {
      return back(next, request, "Nothing was ticked on Google's screen, so nothing was connected. Press Connect again and leave the boxes ticked.");
    }
    return redirect(new URL(landing(next, result), request.url).toString());
  } catch (error) {
    const response = handleError(error);
    if (response.status === 503) return response;
    return back("/app/settings", request, error instanceof Error ? error.message : "That connection failed.");
  }
}
