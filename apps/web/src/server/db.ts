/**
 * Database access, and the one rule that governs it.
 *
 * Every scoped read goes through `fetchScoped`, which puts the tenant in the
 * WHERE clause rather than checking ownership afterwards. A row belonging to
 * another org comes back as null, and the route turns that into a 404, never a
 * 403: a 403 confirms the row exists, which is itself a leak. This is the same
 * invariant `fetch_scoped()` enforces in `core/db.py`, and it is the reason no
 * route in this app writes its own `org_id = ?` filter.
 */

import { newId } from "./crypto";
import { database, type Env } from "./env";

export type Row = Record<string, unknown>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function isExpired(value: string | null | undefined): boolean {
  return !value || Date.parse(value) <= Date.now();
}

/* -------------------------------------------------------------- scoping */

/** Tables whose rows belong to exactly one org. */
const SCOPED = new Set([
  "sites",
  "runs",
  "connections",
  "approvals",
  "publishes",
  "workspaces",
  "memberships",
  "sessions",
  "schedules",
  "measurements",
  "milestones",
]);

function assertScoped(table: string): void {
  if (!SCOPED.has(table)) {
    throw new Error(`${table} is not a tenant-scoped table; add it to SCOPED or query it directly.`);
  }
}

/**
 * One row of a scoped table, or null.
 *
 * Null covers both "no such row" and "not yours", deliberately, because the
 * caller must not be able to tell them apart.
 */
export async function fetchScoped<T = Row>(
  e: Env,
  table: string,
  id: string,
  orgId: string,
  idColumn = "id",
): Promise<T | null> {
  assertScoped(table);
  const row = await database(e)
    .prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?1 AND org_id = ?2 LIMIT 1`)
    .bind(id, orgId)
    .first<T>();
  return row ?? null;
}

/** Every row of a scoped table for one org, newest first where there is a date. */
export async function listScoped<T = Row>(
  e: Env,
  table: string,
  orgId: string,
  options: { orderBy?: string; limit?: number; where?: string; bind?: unknown[] } = {},
): Promise<T[]> {
  assertScoped(table);
  const order = options.orderBy ?? "created_at DESC";
  const extra = options.where ? ` AND ${options.where}` : "";
  const limit = options.limit ? ` LIMIT ${Math.max(1, Math.floor(options.limit))}` : "";
  const result = await database(e)
    .prepare(`SELECT * FROM ${table} WHERE org_id = ?1${extra} ORDER BY ${order}${limit}`)
    .bind(orgId, ...(options.bind ?? []))
    .all<T>();
  return result.results ?? [];
}

/** Delete one row of a scoped table. Returns whether anything was deleted. */
export async function deleteScoped(e: Env, table: string, id: string, orgId: string): Promise<boolean> {
  assertScoped(table);
  const result = await database(e)
    .prepare(`DELETE FROM ${table} WHERE id = ?1 AND org_id = ?2`)
    .bind(id, orgId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/* --------------------------------------------------------------- writes */

/** INSERT, with the column list built from the object rather than by hand. */
export async function insert(e: Env, table: string, values: Row): Promise<void> {
  const keys = Object.keys(values);
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(", ");
  await database(e)
    .prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`)
    .bind(...keys.map((k) => values[k] ?? null))
    .run();
}

/** INSERT ... ON CONFLICT DO UPDATE, for the upserts identity needs. */
export async function upsert(e: Env, table: string, conflict: string[], values: Row): Promise<void> {
  const keys = Object.keys(values);
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(", ");
  const updates = keys
    .filter((k) => !conflict.includes(k) && k !== "created_at")
    .map((k) => `${k} = excluded.${k}`)
    .join(", ");
  const clause = updates ? `DO UPDATE SET ${updates}` : "DO NOTHING";
  await database(e)
    .prepare(
      `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders}) ` +
        `ON CONFLICT (${conflict.join(", ")}) ${clause}`,
    )
    .bind(...keys.map((k) => values[k] ?? null))
    .run();
}

/** UPDATE one row of a scoped table. */
export async function updateScoped(
  e: Env,
  table: string,
  id: string,
  orgId: string,
  values: Row,
): Promise<boolean> {
  assertScoped(table);
  const keys = Object.keys(values);
  if (keys.length === 0) return false;
  const assignments = keys.map((k, i) => `${k} = ?${i + 1}`).join(", ");
  const result = await database(e)
    .prepare(`UPDATE ${table} SET ${assignments} WHERE id = ?${keys.length + 1} AND org_id = ?${keys.length + 2}`)
    .bind(...keys.map((k) => values[k] ?? null), id, orgId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/* ------------------------------------------------------------ audit log */

/**
 * Write to the audit log.
 *
 * Never awaited by a route that has already done its work: a failed log line
 * must not turn a successful publish into an error the user sees.
 */
export async function record(
  e: Env,
  entry: { orgId?: string | null; userId?: string | null; action: string; target?: string | null; detail?: unknown },
): Promise<void> {
  try {
    await insert(e, "audit_log", {
      id: newId("log"),
      org_id: entry.orgId ?? null,
      user_id: entry.userId ?? null,
      action: entry.action,
      target: entry.target ?? null,
      detail: entry.detail === undefined ? null : JSON.stringify(entry.detail),
      created_at: nowIso(),
    });
  } catch {
    // Deliberately swallowed. See the note above.
  }
}

/* ----------------------------------------------------------- housekeeping */

/**
 * Drop what has aged out: expired sessions, spent login tokens, dead OAuth
 * states and unclaimed anonymous runs. Cheap enough to run opportunistically
 * on sign-in rather than needing a scheduled job.
 */
export async function sweep(e: Env): Promise<void> {
  const now = nowIso();
  try {
    await database(e).batch([
      database(e).prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(now),
      database(e).prepare("DELETE FROM oauth_states WHERE expires_at < ?1").bind(now),
      database(e).prepare("DELETE FROM login_tokens WHERE expires_at < ?1").bind(now),
      database(e)
        .prepare("DELETE FROM runs WHERE org_id IS NULL AND expires_at IS NOT NULL AND expires_at < ?1")
        .bind(now),
    ]);
  } catch {
    // Housekeeping never fails a request.
  }
}

/** Whether the schema has been applied. Distinguishes "no database" from "empty". */
export async function schemaReady(e: Env): Promise<boolean> {
  try {
    await database(e).prepare("SELECT 1 FROM users LIMIT 1").all();
    return true;
  } catch {
    return false;
  }
}
