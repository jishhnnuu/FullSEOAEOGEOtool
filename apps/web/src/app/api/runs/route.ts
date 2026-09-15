/**
 * Save a finished run.
 *
 * Signed in, it lands in the account. Signed out, it lands under a claim
 * token in a cookie and expires in seven days, so the visitor can be shown
 * the result, sent a link to it, and offered an account without being made to
 * crawl their site twice.
 */

import { env } from "@/server/env";
import { fail, json, handleError, sameOrigin } from "@/server/http";
import { identify, isSecure, setCookie, CLAIM_COOKIE } from "@/server/session";
import { ensureSite, listRuns, saveRun, CLAIM_DAYS } from "@/server/runs";
import { record } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const e = await env();
    const who = await identify(e, request).catch(() => null);
    if (!who) return json({ runs: [] });
    const site = new URL(request.url).searchParams.get("site") ?? undefined;
    const rows = await listRuns(e, who.orgId, site);
    return json({
      runs: rows.map((row) => ({
        id: row.id,
        url: row.url,
        siteId: row.site_id,
        status: row.status,
        scores: row.scores ? JSON.parse(row.scores) : null,
        summary: row.summary ? JSON.parse(row.summary) : null,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return fail("bad_origin", "That request did not come from this site.", 403);
  try {
    const e = await env();
    const who = await identify(e, request).catch(() => null);
    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      status?: string;
      scores?: unknown;
      summary?: unknown;
      payload?: unknown;
      startedAt?: string;
    };
    if (!body.url) return fail("no_url", "A run has to say which site it audited.");

    const siteId = who ? await ensureSite(e, who.orgId, body.url) : null;
    const saved = await saveRun(e, {
      url: body.url,
      status: body.status ?? "complete",
      scores: body.scores,
      summary: body.summary,
      payload: body.payload,
      startedAt: body.startedAt,
      orgId: who?.orgId ?? null,
      siteId,
    });

    const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
    if (saved.claimToken) {
      headers.append("set-cookie", setCookie(CLAIM_COOKIE, saved.claimToken, CLAIM_DAYS * 86_400, isSecure(request)));
    }
    if (who) await record(e, { orgId: who.orgId, userId: who.userId, action: "run.saved", target: body.url });

    return new Response(JSON.stringify({ id: saved.id, siteId, claimed: Boolean(who) }), { headers });
  } catch (error) {
    return handleError(error);
  }
}
