/**
 * Search Console data for the signed-in account.
 *
 * The property comes from the stored selection, not from the query string, so
 * a request cannot ask for a property this account never chose.
 */

import { fail, json, withAuth } from "@/server/http";
import { connectionFor, markBroken } from "@/server/connections";
import { performance, inspect } from "@/server/gsc";
import { nowIso, updateScoped } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return withAuth(request, async ({ e, who }) => {
    const row = await connectionFor(e, who.orgId, "gsc", params.get("site"));
    if (!row) {
      return fail(
        "not_connected",
        "Search Console is not connected, so queries are modelled from the site's own copy rather than measured.",
        409,
        "Connect it from the integrations screen. It takes one Approve.",
      );
    }
    const selection = row.selection ? (JSON.parse(row.selection) as { property?: string }) : {};
    if (!selection.property) {
      return fail("no_property", "This Google account is connected but no property has been chosen yet.", 409);
    }

    try {
      if (params.get("inspect")) {
        return json({ inspection: await inspect(e, row, selection.property, params.get("inspect")!) });
      }
      const report = await performance(e, row, {
        property: selection.property,
        dimensions: (params.get("dimensions") ?? "query").split(",").filter(Boolean),
        days: Number(params.get("days") ?? 28),
        rowLimit: Number(params.get("limit") ?? 250),
        page: params.get("page") ?? undefined,
      });
      await updateScoped(e, "connections", row.id, who.orgId, { last_used_at: nowIso() });
      return json({ property: selection.property, ...report });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markBroken(e, row, message);
      return fail("provider_error", message, 502);
    }
  });
}
