/** One run, to the account that owns it or the browser that started it. */

import { env } from "@/server/env";
import { ensureSchema } from "@/server/schema";
import { handleError, json, notFound } from "@/server/http";
import { identify, readCookie, CLAIM_COOKIE } from "@/server/session";
import { readRun } from "@/server/runs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  try {
    const e = await env();
    await ensureSchema(e);
    const who = await identify(e, request).catch(() => null);
    const row = await readRun(e, id, { orgId: who?.orgId, claimToken: readCookie(request, CLAIM_COOKIE) });
    if (!row) return notFound();
    return json({
      id: row.id,
      url: row.url,
      siteId: row.site_id,
      status: row.status,
      scores: row.scores ? JSON.parse(row.scores) : null,
      summary: row.summary ? JSON.parse(row.summary) : null,
      payload: row.payload ? JSON.parse(row.payload) : null,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      /** True while this run still belongs to a browser rather than a person. */
      unclaimed: row.org_id === null,
    });
  } catch (error) {
    return handleError(error);
  }
}
