/**
 * Search Console, for the full sync.
 *
 *   POST ?op=query     a Search Analytics query, body passed to Google as is
 *   GET  ?op=sitemaps  every sitemap Google knows for the property
 *   POST ?op=inspect   { "url": "..." }, URL Inspection for one page
 *
 * Read only: the scope is webmasters.readonly and nothing here submits,
 * deletes or verifies anything.
 */

import { fail, withAuth } from "@/server/http";
import { chosen, readBody, relay } from "@/server/google-proxy";

export const dynamic = "force-dynamic";

const API = "https://searchconsole.googleapis.com";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return withAuth(request, async ({ e, who }) => {
    const picked = await chosen(e, who.orgId, "gsc", params.get("site"));
    if (picked instanceof Response) return picked;
    const property = encodeURIComponent(picked.selection.property);
    if (params.get("op") === "sitemaps") return relay(e, picked, `${API}/webmasters/v3/sites/${property}/sitemaps`, { method: "GET" });
    return fail("unknown_op", "Ask for op=sitemaps.");
  });
}

export async function POST(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return withAuth(request, async ({ e, who }) => {
    const picked = await chosen(e, who.orgId, "gsc", params.get("site"));
    if (picked instanceof Response) return picked;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const property = picked.selection.property;

    if (params.get("op") === "query") {
      return relay(e, picked, `${API}/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, { method: "POST", body });
    }
    if (params.get("op") === "inspect") {
      let url = "";
      try {
        url = String((JSON.parse(body) as { url?: string }).url ?? "");
      } catch {
        return fail("bad_body", "Send { \"url\": \"...\" }.");
      }
      if (!/^https?:\/\//.test(url)) return fail("bad_url", "Inspect a full address, starting with https://.");
      return relay(e, picked, `${API}/v1/urlInspection/index:inspect`, {
        method: "POST",
        body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
      });
    }
    return fail("unknown_op", "Ask for op=query or op=inspect.");
  });
}
