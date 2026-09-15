/**
 * Send a WordPress admin to their own site to approve this app.
 *
 * No plugin, no OAuth client, no secret typed into our form. WordPress has
 * shipped this screen since 5.6 and almost nothing uses it.
 */

import { newId } from "@/server/crypto";
import { baseUrl, env } from "@/server/env";
import { handleError, redirect } from "@/server/http";
import { insert, inMinutes, nowIso } from "@/server/db";
import { identify } from "@/server/session";
import { authorizeUrl, checkSiteUrl } from "@/server/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const siteId = params.get("site") ?? undefined;
  const next = params.get("next") ?? (siteId ? `/app/sites/${siteId}/integrations` : "/app/settings");
  const raw = params.get("url") ?? "";

  try {
    const e = await env();
    const who = await identify(e, request);
    if (!who) {
      const to = new URL("/app/signin", request.url);
      to.searchParams.set("next", next);
      return redirect(to.toString());
    }

    let origin: string;
    try {
      origin = await checkSiteUrl(raw);
    } catch (error) {
      return redirect(`${next}?error=${encodeURIComponent(error instanceof Error ? error.message : "That is not a site we can reach.")}`);
    }

    // The state row doubles as the record of which site was asked for, so the
    // callback cannot be pointed at a different one.
    const state = newId("wps");
    await insert(e, "oauth_states", {
      id: state,
      kind: "connect",
      provider: "wordpress",
      user_id: who.userId,
      org_id: who.orgId,
      site_id: siteId ?? null,
      product: origin,
      code_verifier: "n/a",
      next,
      created_at: nowIso(),
      expires_at: inMinutes(20),
    });

    const success = `${baseUrl(e, request)}/api/connections/wordpress/callback?state=${encodeURIComponent(state)}`;
    return redirect(authorizeUrl(origin, success, state));
  } catch (error) {
    return handleError(error);
  }
}
