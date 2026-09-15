/**
 * Store the grant.
 *
 * The refresh token is the part that matters: it is what lets a run happen on
 * Monday morning with nobody's browser open. Google only returns one on the
 * first consent for a client, which is why `prompt=consent` is set on the way
 * out, and why an existing token is kept if a later exchange omits it.
 *
 * If exactly one property is visible it is selected here, because making
 * someone pick from a list of one is a screen that exists for no reason.
 */

import { baseUrl, env } from "@/server/env";
import { handleError, redirect } from "@/server/http";
import { exchangeCode, profileFrom, takeState, PRODUCT_SCOPES } from "@/server/google";
import { saveConnection, getConnection, type Provider } from "@/server/connections";
import { properties as gscProperties } from "@/server/gsc";
import { properties as ga4Properties } from "@/server/ga4";
import { record, updateScoped, nowIso } from "@/server/db";

export const dynamic = "force-dynamic";

function back(next: string, request: Request, message?: string): Response {
  const to = new URL(next.startsWith("/") ? next : "/app/settings", request.url);
  if (message) to.searchParams.set("error", message);
  else to.searchParams.set("connected", "1");
  return redirect(to.toString());
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  const denied = params.get("error");

  try {
    const e = await env();
    const pending = state ? await takeState(e, state) : null;
    const next = pending?.next ?? "/app/settings";

    if (denied) {
      return back(next, request, denied === "access_denied" ? "You declined at Google's screen. Nothing was connected." : `Google returned: ${denied}`);
    }
    if (!pending || pending.kind !== "connect" || !pending.org_id) {
      return back(next, request, "That connection attempt has expired. Try again.");
    }
    if (!code) return back(next, request, "Google's reply was missing the code.");

    const tokens = await exchangeCode(e, code, pending.code_verifier, `${baseUrl(e, request)}/api/connections/google/callback`);
    if (!tokens.refresh_token) {
      return back(
        next,
        request,
        "Google did not return a refresh token, which means scheduled runs could not use this. Remove the app at myaccount.google.com/permissions and connect again.",
      );
    }

    const product = (pending.product ?? "gsc") as Provider;
    const spec = PRODUCT_SCOPES[product];
    const profile = await profileFrom(tokens);

    const id = await saveConnection(e, {
      orgId: pending.org_id,
      siteId: pending.site_id,
      provider: product,
      label: profile.email,
      scopes: tokens.scope,
      secret: {
        kind: "google",
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_expires: Date.now() + Math.max(0, tokens.expires_in - 30) * 1000,
      },
    });

    // One property means no choosing screen.
    try {
      const row = await getConnection(e, id, pending.org_id);
      if (row) {
        if (product === "gsc") {
          const found = await gscProperties(e, row);
          if (found.length === 1) {
            await updateScoped(e, "connections", id, pending.org_id, {
              selection: JSON.stringify({ property: found[0].siteUrl, permission: found[0].permissionLevel }),
              updated_at: nowIso(),
            });
          }
        } else if (product === "ga4") {
          const found = await ga4Properties(e, row);
          if (found.length === 1) {
            await updateScoped(e, "connections", id, pending.org_id, {
              selection: JSON.stringify({ propertyId: found[0].propertyId, name: found[0].displayName }),
              updated_at: nowIso(),
            });
          }
        }
      }
    } catch {
      // A grant that works but whose property list failed is still a grant.
      // The connections screen will ask again.
    }

    await record(e, {
      orgId: pending.org_id,
      userId: pending.user_id,
      action: "connection.added",
      target: `${product}:${profile.email}`,
      detail: { scopes: spec?.scopes },
    });
    return back(next, request);
  } catch (error) {
    const response = handleError(error);
    if (response.status === 503) return response;
    return back("/app/settings", request, error instanceof Error ? error.message : "That connection failed.");
  }
}
