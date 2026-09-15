/**
 * The account's sites.
 *
 * The browser has its own site records, created when someone typed a URL. The
 * server has its own, created when a run was claimed. They are matched by
 * origin rather than by id, because neither side can name the other's.
 */

import { json, fail, withAuth } from "@/server/http";
import { listScoped, record } from "@/server/db";
import { ensureSite } from "@/server/runs";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, async ({ e, who }) => {
    const rows = await listScoped<{ id: string; url: string; name: string; cms: string | null; created_at: string }>(
      e,
      "sites",
      who.orgId,
      { orderBy: "created_at ASC" },
    );
    return json({ sites: rows.map((row) => ({ id: row.id, url: row.url, name: row.name, cms: row.cms })) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(request, async ({ e, who }) => {
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    if (!body.url) return fail("no_url", "A site needs a URL.");
    let origin: string;
    try {
      origin = new URL(body.url).origin;
    } catch {
      return fail("bad_url", "That is not a URL.");
    }
    const id = await ensureSite(e, who.orgId, origin);
    await record(e, { orgId: who.orgId, userId: who.userId, action: "site.added", target: origin });
    return json({ id, url: origin });
  });
}
