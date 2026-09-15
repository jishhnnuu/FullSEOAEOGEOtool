/**
 * Push an approved change to the live site.
 *
 * Three things have to be true before anything is written: the change is
 * approved, the connection belongs to the same account, and the site the
 * connection points at is the site the change is for. The previous value is
 * read first and stored, so every publish has an undo that goes through the
 * same code path rather than through a support conversation.
 *
 * `critical` never publishes from here. The policy engine's rule is that a
 * critical action has no autonomy level that auto-approves it, and a route
 * that quietly made an exception would be the hole in it.
 */

import { newId } from "@/server/crypto";
import { fail, json, notFound, withAuth } from "@/server/http";
import { fetchScoped, listScoped, insert, nowIso, record, updateScoped } from "@/server/db";
import { connectionFor, type ConnectionRow } from "@/server/connections";
import { publish as wpPublish, type PublishAction } from "@/server/wordpress";

export const dynamic = "force-dynamic";

type ApprovalRow = {
  id: string;
  org_id: string;
  site_id: string;
  kind: string;
  risk: string;
  title: string;
  payload: string | null;
  status: string;
};

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, async ({ e, who }) => {
    const siteId = new URL(request.url).searchParams.get("site");
    const rows = await listScoped<Record<string, string>>(e, "publishes", who.orgId, {
      where: siteId ? "site_id = ?2" : undefined,
      bind: siteId ? [siteId] : undefined,
      orderBy: "created_at DESC",
      limit: 100,
    });
    return json({ publishes: rows });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(request, async ({ e, who }) => {
    const body = (await request.json().catch(() => ({}))) as { approvalId?: string; action?: PublishAction };
    if (!body.approvalId) return fail("no_approval", "A publish has to name the approval it is carrying out.");

    const approval = await fetchScoped<ApprovalRow>(e, "approvals", body.approvalId, who.orgId);
    if (!approval) return notFound();
    if (approval.status !== "approved") {
      return fail("not_approved", `That change is ${approval.status}, not approved. Nothing was sent.`, 409);
    }
    if (approval.risk === "critical") {
      return fail(
        "needs_a_person",
        "Critical changes are applied one at a time by a person, at every autonomy level. That rule is not configurable.",
        409,
      );
    }

    const site = await fetchScoped<{ id: string; url: string }>(e, "sites", approval.site_id, who.orgId);
    if (!site) return notFound();

    const action = body.action ?? (approval.payload ? (JSON.parse(approval.payload) as { action?: PublishAction }).action : undefined);
    if (!action) return fail("no_action", "That approval carries nothing that can be published.");

    const connection: ConnectionRow | null = await connectionFor(e, who.orgId, "wordpress", approval.site_id);
    if (!connection) {
      return fail(
        "not_connected",
        "Nothing is connected that can write to this site, so the change cannot be published from here.",
        409,
        "Connect WordPress from the integrations screen, or copy the change out and apply it by hand.",
      );
    }
    const selection = connection.selection ? (JSON.parse(connection.selection) as { siteUrl?: string; seoPlugin?: "yoast" | "rankmath" | null }) : {};
    if (!selection.siteUrl) return fail("no_target", "That connection does not say which site it points at.");

    // The connection's own site has to be the site the approval is for.
    if (new URL(selection.siteUrl).host !== new URL(site.url).host) {
      return fail("wrong_site", "That connection points at a different site from the one this change is for.", 409);
    }

    const publishId = newId("pub");
    try {
      const result = await wpPublish(e, connection, selection.siteUrl, action, selection.seoPlugin ?? null);
      await insert(e, "publishes", {
        id: publishId,
        org_id: who.orgId,
        site_id: approval.site_id,
        approval_id: approval.id,
        connection_id: connection.id,
        target: selection.siteUrl,
        action: JSON.stringify(action),
        before_value: result.before,
        after_value: result.after,
        status: result.ok ? "published" : "refused",
        error: result.ok ? null : result.message,
        created_at: nowIso(),
      });
      if (result.ok) {
        await updateScoped(e, "approvals", approval.id, who.orgId, {
          status: "published",
          decided_by: who.userId,
          decided_at: nowIso(),
        });
      }
      await record(e, {
        orgId: who.orgId,
        userId: who.userId,
        action: result.ok ? "publish.applied" : "publish.refused",
        target: `${selection.siteUrl} ${action.kind}`,
      });
      return json({ id: publishId, ...result }, { status: result.ok ? 200 : 409 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await insert(e, "publishes", {
        id: publishId,
        org_id: who.orgId,
        site_id: approval.site_id,
        approval_id: approval.id,
        connection_id: connection.id,
        target: selection.siteUrl,
        action: JSON.stringify(action),
        before_value: null,
        after_value: null,
        status: "failed",
        error: message.slice(0, 400),
        created_at: nowIso(),
      });
      return fail("publish_failed", message, 502);
    }
  });
}
