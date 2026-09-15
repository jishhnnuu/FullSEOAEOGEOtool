/**
 * Connect a Google product, on the account that is already signed in.
 *
 * `include_granted_scopes` extends the grant made at sign-in rather than
 * replacing it, and `login_hint` skips the account chooser. From the user's
 * side this is one Approve, not a second login. That is the whole reason
 * Google sign-in is the default identity here.
 */

import { baseUrl, env, NotConfigured } from "@/server/env";
import { ensureSchema } from "@/server/schema";
import { handleError, redirect } from "@/server/http";
import { PRODUCT_SCOPES, startAuth } from "@/server/google";
import { identify } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const product = params.get("product") ?? "gsc";
  const siteId = params.get("site") ?? undefined;
  const next = params.get("next") ?? (siteId ? `/app/sites/${siteId}/integrations` : "/app/settings");

  try {
    const e = await env();
    await ensureSchema(e);
    const who = await identify(e, request);
    if (!who) {
      const to = new URL("/app/signin", request.url);
      to.searchParams.set("next", next);
      return redirect(to.toString());
    }
    const spec = PRODUCT_SCOPES[product];
    if (!spec) return redirect(`${next}?error=${encodeURIComponent(`${product} is not a Google product this connects to.`)}`);

    const url = await startAuth(e, {
      kind: "connect",
      scopes: [...spec.scopes, "openid", "email"],
      redirectUri: `${baseUrl(e, request)}/api/connections/google/callback`,
      incremental: true,
      loginHint: who.email,
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
