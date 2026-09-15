/**
 * The approval queue, server side.
 *
 * A change the browser proposes is queued here so that approving it is a
 * decision with a record: who said yes, when, and what was published as a
 * result. The browser keeps its own copy for the screens to read; this is the
 * copy that a publish is checked against.
 */

import { newId } from "@/server/crypto";
import { fail, json, withAuth } from "@/server/http";
import { fetchScoped, insert, listScoped, nowIso, record } from "@/server/db";

export const dynamic = "force-dynamic";

const RISKS = new Set(["low", "medium", "high", "critical"]);

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return withAuth(request, async ({ e, who }) => {
    const filters: string[] = [];
    const bind: unknown[] = [];
    if (params.get("site")) {
      filters.push(`site_id = ?${bind.length + 2}`);
      bind.push(params.get("site"));
    }
    if (params.get("status")) {
      filters.push(`status = ?${bind.length + 2}`);
      bind.push(params.get("status"));
    }
    const rows = await listScoped<Record<string, string>>(e, "approvals", who.orgId, {
      where: filters.length ? filters.join(" AND ") : undefined,
      bind,
      orderBy: "created_at DESC",
      limit: 300,
    });
    return json({
      approvals: rows.map((row) => ({ ...row, payload: row.payload ? JSON.parse(row.payload) : null })),
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(request, async ({ e, who }) => {
    const body = (await request.json().catch(() => ({}))) as {
      siteId?: string;
      runId?: string;
      findingId?: string;
      kind?: string;
      risk?: string;
      title?: string;
      detail?: string;
      payload?: unknown;
    };
    if (!body.siteId || !body.kind || !body.title) {
      return fail("incomplete", "An approval needs a site, a kind and a title.");
    }
    if (body.risk && !RISKS.has(body.risk)) return fail("bad_risk", `${body.risk} is not a risk level.`);

    const site = await fetchScoped(e, "sites", body.siteId, who.orgId);
    if (!site) return fail("not_found", "No such site.", 404);

    const id = newId("apr");
    await insert(e, "approvals", {
      id,
      org_id: who.orgId,
      site_id: body.siteId,
      run_id: body.runId ?? null,
      finding_id: body.findingId ?? null,
      kind: body.kind,
      risk: body.risk ?? "low",
      title: body.title,
      detail: body.detail ?? null,
      payload: body.payload === undefined ? null : JSON.stringify(body.payload),
      status: "pending",
      created_at: nowIso(),
    });
    await record(e, { orgId: who.orgId, userId: who.userId, action: "approval.queued", target: id });
    return json({ id }, { status: 201 });
  });
}
