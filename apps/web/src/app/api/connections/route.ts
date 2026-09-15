/** Everything this account has connected. No secret ever leaves here. */

import { json, withAuth } from "@/server/http";
import { listConnections } from "@/server/connections";
import { PRODUCT_SCOPES } from "@/server/google";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, async ({ e, who }) => {
    const connections = await listConnections(e, who.orgId);
    return json({
      connections,
      offers: Object.entries(PRODUCT_SCOPES).map(([key, value]) => ({
        product: key,
        name: value.name,
        note: value.note,
        scopes: value.scopes,
      })),
    });
  });
}
