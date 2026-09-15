/**
 * WordPress sends the credential back on the query string.
 *
 * That is its design, not ours, and it is the reason this route redirects
 * immediately after storing: the URL holding the password must not sit in
 * history as the page the user is looking at. It is sealed on arrival and
 * never read again except by the publishing route.
 */

import { env } from "@/server/env";
import { database } from "@/server/env";
import { handleError, redirect } from "@/server/http";
import { isExpired, record, updateScoped, nowIso } from "@/server/db";
import { saveConnection, getConnection } from "@/server/connections";
import { capabilities } from "@/server/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const siteUrl = params.get("site_url");
  const user = params.get("user_login");
  const password = params.get("password");

  try {
    const e = await env();
    if (!state) return redirect("/app/settings?error=" + encodeURIComponent("That reply was missing its state."));

    const pending = await database(e)
      .prepare("SELECT * FROM oauth_states WHERE id = ?1 LIMIT 1")
      .bind(state)
      .first<{ org_id: string; user_id: string; site_id: string | null; product: string; next: string; expires_at: string }>();
    if (pending) await database(e).prepare("DELETE FROM oauth_states WHERE id = ?1").bind(state).run();

    const next = pending?.next ?? "/app/settings";
    if (!pending || isExpired(pending.expires_at)) {
      return redirect(`${next}?error=${encodeURIComponent("That approval took too long. Start again.")}`);
    }
    if (!siteUrl || !user || !password) {
      return redirect(`${next}?error=${encodeURIComponent("You declined in WordPress, or it returned nothing. Nothing was stored.")}`);
    }
    // The site is the one we sent them to, not one the reply names.
    const origin = pending.product;

    const id = await saveConnection(e, {
      orgId: pending.org_id,
      siteId: pending.site_id,
      provider: "wordpress",
      label: `${user} at ${new URL(origin).hostname}`,
      selection: { siteUrl: origin, user },
      secret: { kind: "basic", username: user, password },
    });

    // Ask the install what it will actually let us change, and store the
    // answer so the approvals screen can be honest before anyone clicks.
    try {
      const row = await getConnection(e, id, pending.org_id);
      if (row) {
        const caps = await capabilities(e, row, origin);
        await updateScoped(e, "connections", id, pending.org_id, {
          selection: JSON.stringify({ siteUrl: origin, ...caps, user: caps.user ?? user }),
          status: caps.restReachable && caps.canEditPosts ? "connected" : "needs_setup",
          last_error: caps.error,
          updated_at: nowIso(),
        });
      }
    } catch {
      // A stored credential we could not probe is still stored.
    }

    await record(e, { orgId: pending.org_id, userId: pending.user_id, action: "connection.added", target: `wordpress:${origin}` });
    return redirect(`${next}?connected=1`);
  } catch (error) {
    const response = handleError(error);
    if (response.status === 503) return response;
    return redirect("/app/settings?error=" + encodeURIComponent(error instanceof Error ? error.message : "That connection failed."));
  }
}
