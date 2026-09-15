/**
 * The workspace, synced.
 *
 * The browser remains the working copy: the engine runs there, the screens
 * read from there, and pulling the plug on this server leaves the product
 * working. What syncing adds is that the account follows you to another
 * machine. A revision counter settles the ordinary conflict, which is two
 * tabs rather than two people.
 */

import { json, fail, withAuth } from "@/server/http";
import { database } from "@/server/env";
import { nowIso } from "@/server/db";

export const dynamic = "force-dynamic";

// D1 rows are cheap but not free, and a workspace that has grown past this is
// one that should be pruning its own crawl payloads.
const MAX_BYTES = 1_500_000;

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, async ({ e, who }) => {
    const row = await database(e)
      .prepare("SELECT revision, updated_at, payload FROM workspaces WHERE org_id = ?1 LIMIT 1")
      .bind(who.orgId)
      .first<{ revision: number; updated_at: string; payload: string }>();
    if (!row) return json({ revision: 0, updatedAt: null, workspace: null });
    return json({ revision: row.revision, updatedAt: row.updated_at, workspace: JSON.parse(row.payload) });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return withAuth(request, async ({ e, who }) => {
    const body = (await request.json().catch(() => ({}))) as { revision?: number; workspace?: unknown };
    if (body.workspace === undefined) return fail("no_workspace", "Nothing to save.");

    const payload = JSON.stringify(body.workspace);
    if (payload.length > MAX_BYTES) {
      return fail(
        "too_large",
        `That workspace is ${Math.round(payload.length / 1024)} kB, past the ${Math.round(MAX_BYTES / 1024)} kB this syncs. Older crawl payloads are dropped locally before the next save.`,
        413,
      );
    }

    const current = await database(e)
      .prepare("SELECT revision FROM workspaces WHERE org_id = ?1 LIMIT 1")
      .bind(who.orgId)
      .first<{ revision: number }>();
    const held = current?.revision ?? 0;

    // A stale writer is told what the current revision is rather than being
    // allowed to flatten a newer one.
    if (body.revision !== undefined && body.revision < held) {
      return fail("stale", `This browser is on revision ${body.revision}; the account is on ${held}.`, 409);
    }

    const next = held + 1;
    await database(e)
      .prepare(
        "INSERT INTO workspaces (org_id, revision, updated_at, payload) VALUES (?1, ?2, ?3, ?4) " +
          "ON CONFLICT (org_id) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at, payload = excluded.payload",
      )
      .bind(who.orgId, next, nowIso(), payload)
      .run();
    return json({ revision: next });
  });
}
