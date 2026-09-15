/**
 * What this connection can see, and which one is chosen.
 *
 * A Google account often owns several properties; picking one is a separate
 * step from granting access, and it is the step that turns a connection into
 * data on a screen.
 */

import { fail, json, notFound, withAuth } from "@/server/http";
import { getConnection, markBroken } from "@/server/connections";
import { properties as gscProperties } from "@/server/gsc";
import { properties as ga4Properties } from "@/server/ga4";
import { updateScoped, nowIso } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return withAuth(request, async ({ e, who }) => {
    const row = await getConnection(e, id, who.orgId);
    if (!row) return notFound();
    try {
      if (row.provider === "gsc") return json({ properties: await gscProperties(e, row) });
      if (row.provider === "ga4") return json({ properties: await ga4Properties(e, row) });
      return fail("no_properties", `${row.provider} has nothing to choose between.`, 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markBroken(e, row, message);
      return fail("provider_error", message, 502);
    }
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return withAuth(request, async ({ e, who }) => {
    const row = await getConnection(e, id, who.orgId);
    if (!row) return notFound();
    const body = (await request.json().catch(() => ({}))) as { selection?: Record<string, unknown>; siteId?: string };
    if (!body.selection) return fail("no_selection", "Say which property to use.");
    await updateScoped(e, "connections", id, who.orgId, {
      selection: JSON.stringify(body.selection),
      site_id: body.siteId ?? row.site_id,
      status: "connected",
      last_error: null,
      updated_at: nowIso(),
    });
    return json({ ok: true });
  });
}
