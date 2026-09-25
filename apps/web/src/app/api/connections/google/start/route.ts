/**
 * Connect Google: one button, one trip to Google.
 *
 * Signed in: Google's account chooser still appears, because the Gmail that
 * owns Search Console is often not the one used to sign in here. Whichever is
 * picked, the connection is stored under that account's address.
 *
 * Signed out: the same single trip also signs them in. Google shows its own
 * account chooser, the person picks the Gmail that owns their Search Console,
 * approves, and comes back signed in and connected. Nobody is asked to create
 * an account first, and nobody ever sees a key.
 *
 * `product=google` asks for Search Console and Analytics together.
 */

import { baseUrl, env, NotConfigured } from "@/server/env";
import { ensureSchema } from "@/server/schema";
import { handleError, redirect } from "@/server/http";
import { IDENTITY_SCOPES, scopesFor, startAuth } from "@/server/google";
import { identify, readCookie, CLAIM_COOKIE } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const product = params.get("product") ?? "google";
  const siteId = params.get("site") ?? undefined;
  const asked = params.get("next") ?? (siteId ? `/app/sites/${siteId}/integrations` : "/app/settings");
  const next = asked.startsWith("/") ? asked : "/app";

  try {
    const e = await env();
    await ensureSchema(e);
    const scopes = scopesFor(product);
    if (!scopes) return redirect(`${next}?error=${encodeURIComponent(`${product} is not a Google product this connects to.`)}`);
    // Without the master key the grant cannot be sealed, and sending someone
    // through Google's screens only to drop what they approved is worse than
    // saying so here.
    if (!e.SEOOS_MASTER_KEY) {
      return redirect(
        `${next}?error=${encodeURIComponent("This deployment cannot store a Google connection yet: SEOOS_MASTER_KEY is not set.")}&fix=${encodeURIComponent("The owner adds it once on /app/setup, which generates one.")}`,
      );
    }

    const who = await identify(e, request);
    if (!who) {
      const url = await startAuth(e, {
        kind: "signin",
        scopes: [...IDENTITY_SCOPES, ...scopes],
        redirectUri: `${baseUrl(e, request)}/api/auth/google/callback`,
        siteId,
        product,
        next,
        claimRunId: readCookie(request, CLAIM_COOKIE) ?? undefined,
      });
      return redirect(url);
    }

    const url = await startAuth(e, {
      kind: "connect",
      scopes: [...scopes, "openid", "email"],
      redirectUri: `${baseUrl(e, request)}/api/connections/google/callback`,
      incremental: true,
      userId: who.userId,
      orgId: who.orgId,
      siteId,
      product,
      next,
    });
    return redirect(url);
  } catch (error) {
    if (error instanceof NotConfigured) {
      return redirect(`${next}?error=${encodeURIComponent(error.gap.reason)}&fix=${encodeURIComponent(error.gap.fix)}`);
    }
    return handleError(error);
  }
}
