/**
 * Analytics 4, for the full sync.
 *
 *   POST ?op=report  a Data API runReport body, passed to Google as is
 *
 * Read only: the scope is analytics.readonly and nothing here writes to a
 * property.
 */

import { fail, withAuth } from "@/server/http";
import { chosen, readBody, relay } from "@/server/google-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return withAuth(request, async ({ e, who }) => {
    const picked = await chosen(e, who.orgId, "ga4", params.get("site"));
    if (picked instanceof Response) return picked;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (params.get("op") !== "report") return fail("unknown_op", "Ask for op=report.");
    const id = encodeURIComponent(picked.selection.propertyId);
    return relay(e, picked, `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, { method: "POST", body });
  });
}
