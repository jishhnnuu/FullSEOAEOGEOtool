/** Analytics data for the signed-in account, on the chosen property. */

import { fail, json, withAuth } from "@/server/http";
import { connectionFor, markBroken } from "@/server/connections";
import { report } from "@/server/ga4";
import { nowIso, updateScoped } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return withAuth(request, async ({ e, who }) => {
    const row = await connectionFor(e, who.orgId, "ga4", params.get("site"));
    if (!row) {
      return fail(
        "not_connected",
        "Analytics is not connected, so reporting can show ranking movement but cannot say what it earned.",
        409,
        "Connect it from the integrations screen, on the same Google account.",
      );
    }
    const selection = row.selection ? (JSON.parse(row.selection) as { propertyId?: string }) : {};
    if (!selection.propertyId) {
      return fail("no_property", "This Google account is connected but no property has been chosen yet.", 409);
    }

    try {
      const result = await report(e, row, {
        propertyId: selection.propertyId,
        dimensions: (params.get("dimensions") ?? "landingPagePlusQueryString").split(",").filter(Boolean),
        metrics: (params.get("metrics") ?? "sessions,conversions,totalRevenue").split(",").filter(Boolean),
        days: Number(params.get("days") ?? 28),
        limit: Number(params.get("limit") ?? 100),
      });
      await updateScoped(e, "connections", row.id, who.orgId, { last_used_at: nowIso() });
      return json({ propertyId: selection.propertyId, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markBroken(e, row, message);
      return fail("provider_error", message, 502);
    }
  });
}
