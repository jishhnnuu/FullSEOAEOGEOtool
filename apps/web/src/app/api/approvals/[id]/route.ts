/**
 * Decide one approval.
 *
 * Approving does not publish. Publishing is a second call, so that a mistaken
 * click is one step from being undone and so the record separates the decision
 * from what the decision caused.
 */

import { fail, json, notFound, withAuth } from "@/server/http";
import { fetchScoped, nowIso, record, updateScoped } from "@/server/db";

export const dynamic = "force-dynamic";

const DECISIONS = new Set(["approved", "skipped", "pending"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return withAuth(request, async ({ e, who }) => {
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    const status = body.status ?? "";
    if (!DECISIONS.has(status)) return fail("bad_status", "An approval is approved, skipped, or put back to pending.");

    const row = await fetchScoped<{ status: string }>(e, "approvals", id, who.orgId);
    if (!row) return notFound();
    if (row.status === "published") {
      return fail("already_published", "That change has already been published. Reverse it rather than re-deciding it.", 409);
    }

    await updateScoped(e, "approvals", id, who.orgId, {
      status,
      decided_by: status === "pending" ? null : who.userId,
      decided_at: status === "pending" ? null : nowIso(),
    });
    await record(e, { orgId: who.orgId, userId: who.userId, action: `approval.${status}`, target: id });
    return json({ ok: true, status });
  });
}
