/**
 * Anonymous runs, and the claim that makes the gate humane.
 *
 * Someone types a URL and gets a real audit without an account. That run is
 * stored against a random claim token in a cookie, not against a person, and
 * it expires in seven days if nobody ever signs in. When they do sign in, the
 * run moves into the new account: nothing re-crawls, nothing is retyped.
 *
 * Without this every gate is a wall, because the reward for signing up is
 * doing the work a second time.
 */

import { newId, randomToken, sha256Hex } from "./crypto";
import { database, type Env } from "./env";
import { fetchScoped, insert, inDays, listScoped, nowIso, upsert } from "./db";

export const CLAIM_DAYS = 7;

export type RunRow = {
  id: string;
  org_id: string | null;
  site_id: string | null;
  url: string;
  status: string;
  claim_hash: string | null;
  scores: string | null;
  summary: string | null;
  payload: string | null;
  started_at: string;
  finished_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type SaveInput = {
  url: string;
  status: string;
  scores?: unknown;
  summary?: unknown;
  payload?: unknown;
  startedAt?: string;
  finishedAt?: string | null;
  orgId?: string | null;
  siteId?: string | null;
};

/** Store a run. Returns the row id and, when anonymous, the claim token. */
export async function saveRun(e: Env, input: SaveInput): Promise<{ id: string; claimToken: string | null }> {
  const id = newId("run");
  const anonymous = !input.orgId;
  const claimToken = anonymous ? randomToken(24) : null;
  await insert(e, "runs", {
    id,
    org_id: input.orgId ?? null,
    site_id: input.siteId ?? null,
    url: input.url,
    status: input.status,
    claim_hash: claimToken ? await sha256Hex(claimToken) : null,
    scores: input.scores === undefined ? null : JSON.stringify(input.scores),
    summary: input.summary === undefined ? null : JSON.stringify(input.summary),
    payload: input.payload === undefined ? null : JSON.stringify(input.payload),
    started_at: input.startedAt ?? nowIso(),
    finished_at: input.finishedAt ?? nowIso(),
    expires_at: anonymous ? inDays(CLAIM_DAYS) : null,
    created_at: nowIso(),
  });
  return { id, claimToken };
}

/**
 * Read a run.
 *
 * Signed in, the org has to match. Anonymous, the claim token has to match.
 * Either way a miss is a miss, with no way to tell which kind it was.
 */
export async function readRun(
  e: Env,
  id: string,
  viewer: { orgId?: string | null; claimToken?: string | null },
): Promise<RunRow | null> {
  if (viewer.orgId) {
    const owned = await fetchScoped<RunRow>(e, "runs", id, viewer.orgId);
    if (owned) return owned;
  }
  if (!viewer.claimToken) return null;
  const row = await database(e).prepare("SELECT * FROM runs WHERE id = ?1 LIMIT 1").bind(id).first<RunRow>();
  if (!row || !row.claim_hash) return null;
  return row.claim_hash === (await sha256Hex(viewer.claimToken)) ? row : null;
}

/**
 * Move every run held under this claim token into an account.
 *
 * Also creates the site, because a run that has landed in an account with
 * nowhere to sit is a run the dashboard cannot show. Returns the site so the
 * caller can redirect straight to it: sign in and land on your own audit.
 */
export async function claimRuns(
  e: Env,
  claimToken: string,
  orgId: string,
): Promise<{ runs: number; siteId: string | null }> {
  const hash = await sha256Hex(claimToken);
  const rows = await database(e)
    .prepare("SELECT * FROM runs WHERE claim_hash = ?1 AND org_id IS NULL ORDER BY created_at")
    .bind(hash)
    .all<RunRow>();
  const runs = rows.results ?? [];
  if (runs.length === 0) return { runs: 0, siteId: null };

  let siteId: string | null = null;
  for (const run of runs) {
    const site = await ensureSite(e, orgId, run.url);
    siteId = site;
    await database(e)
      .prepare("UPDATE runs SET org_id = ?1, site_id = ?2, claim_hash = NULL, expires_at = NULL WHERE id = ?3")
      .bind(orgId, site, run.id)
      .run();
  }
  return { runs: runs.length, siteId };
}

/** Find or create the site a URL belongs to, one per origin per org. */
export async function ensureSite(e: Env, orgId: string, rawUrl: string): Promise<string> {
  let origin = rawUrl;
  let name = rawUrl;
  try {
    const url = new URL(rawUrl);
    origin = url.origin;
    name = url.hostname.replace(/^www\./, "");
  } catch {
    // A stored URL that will not parse is still worth keeping as typed.
  }
  const existing = await database(e)
    .prepare("SELECT id FROM sites WHERE org_id = ?1 AND url = ?2 LIMIT 1")
    .bind(orgId, origin)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const id = newId("site");
  await insert(e, "sites", { id, org_id: orgId, url: origin, name, cms: null, autonomy: null, created_at: nowIso() });
  return id;
}

export async function listRuns(e: Env, orgId: string, siteId?: string): Promise<RunRow[]> {
  return listScoped<RunRow>(e, "runs", orgId, {
    where: siteId ? "site_id = ?2" : undefined,
    bind: siteId ? [siteId] : undefined,
    orderBy: "created_at DESC",
    limit: 50,
  });
}

export { upsert };
