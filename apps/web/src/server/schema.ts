/**
 * The schema, and the fact that it applies itself.
 *
 * This is the source of truth for the D1 tables. `deploy/d1/migrations` is
 * generated from it by `npm run d1:sql`, for anyone who would rather run
 * `wrangler d1 migrations apply`, but nobody has to: `ensureSchema()` below
 * checks the applied list on the first request an isolate serves and runs
 * whatever is missing.
 *
 * That is a deliberate choice about who can operate this thing. Requiring a
 * command-line step means requiring a laptop with credentials on it, and a
 * product that can only be provisioned from one machine is a product with a
 * single point of failure wearing the owner's face. Everything here can be
 * done from a browser on any device: create the database in the Cloudflare
 * dashboard, paste the id, and the tables appear by themselves.
 *
 * Each migration is a list of statements with an id. Ids are never reused and
 * never reordered. A statement that has already run is skipped, so applying
 * twice is a no-op and a half-applied migration finishes on the next request.
 */

import type { Env } from "./env";

export type Migration = { id: string; statements: string[] };

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_init",
    statements: [
      `CREATE TABLE IF NOT EXISTS orgs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'trial',
  autonomy    TEXT NOT NULL DEFAULT 'propose',
  created_at  TEXT NOT NULL
)`,
      `CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  picture        TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  last_seen_at   TEXT
)`,
      `CREATE TABLE IF NOT EXISTS memberships (
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
)`,
      `CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id)`,
      `CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_used_at TEXT,
  user_agent   TEXT
)`,
      `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)`,
      `CREATE TABLE IF NOT EXISTS login_tokens (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  claim_run_id TEXT,
  next         TEXT,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  used_at      TEXT
)`,
      `CREATE INDEX IF NOT EXISTS login_tokens_expiry ON login_tokens(expires_at)`,
      `CREATE TABLE IF NOT EXISTS oauth_states (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  user_id       TEXT,
  org_id        TEXT,
  site_id       TEXT,
  product       TEXT,
  code_verifier TEXT NOT NULL,
  next          TEXT,
  claim_run_id  TEXT,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS oauth_states_expiry ON oauth_states(expires_at)`,
      `CREATE TABLE IF NOT EXISTS sites (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  name       TEXT NOT NULL,
  cms        TEXT,
  autonomy   TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, url)
)`,
      `CREATE INDEX IF NOT EXISTS sites_org ON sites(org_id)`,
      `CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,
  org_id      TEXT,
  site_id     TEXT,
  url         TEXT NOT NULL,
  status      TEXT NOT NULL,
  claim_hash  TEXT,
  scores      TEXT,
  summary     TEXT,
  payload     TEXT,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  expires_at  TEXT,
  created_at  TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS runs_org ON runs(org_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS runs_claim ON runs(claim_hash)`,
      `CREATE INDEX IF NOT EXISTS runs_expiry ON runs(expires_at)`,
      `CREATE TABLE IF NOT EXISTS connections (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id      TEXT,
  provider     TEXT NOT NULL,
  label        TEXT NOT NULL,
  status       TEXT NOT NULL,
  scopes       TEXT,
  selection    TEXT,
  sealed       TEXT,
  expires_at   TEXT,
  last_error   TEXT,
  last_used_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (org_id, provider, label)
)`,
      `CREATE INDEX IF NOT EXISTS connections_org ON connections(org_id)`,
      `CREATE TABLE IF NOT EXISTS approvals (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id    TEXT NOT NULL,
  run_id     TEXT,
  finding_id TEXT,
  kind       TEXT NOT NULL,
  risk       TEXT NOT NULL,
  title      TEXT NOT NULL,
  detail     TEXT,
  payload    TEXT,
  status     TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS approvals_site ON approvals(site_id, status)`,
      `CREATE INDEX IF NOT EXISTS approvals_org ON approvals(org_id, status)`,
      `CREATE TABLE IF NOT EXISTS publishes (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id       TEXT NOT NULL,
  approval_id   TEXT,
  connection_id TEXT,
  target        TEXT NOT NULL,
  action        TEXT NOT NULL,
  before_value  TEXT,
  after_value   TEXT,
  status        TEXT NOT NULL,
  error         TEXT,
  reverted_at   TEXT,
  created_at    TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS publishes_site ON publishes(site_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS workspaces (
  org_id     TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  revision   INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  payload    TEXT NOT NULL
)`,
      `CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  user_id    TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS audit_log_org ON audit_log(org_id, created_at)`,
    ],
  },
];

/** The bookkeeping table. Created before anything consults it. */
const LEDGER = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id         TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`;

/**
 * One check per isolate, not one per request.
 *
 * The promise is cached rather than a boolean, so two requests arriving
 * together on a cold isolate wait on the same work instead of both running it.
 */
let pending: Promise<void> | null = null;

export async function ensureSchema(e: Env): Promise<void> {
  const db = e.DB;
  if (!db) return;
  if (!pending) {
    pending = apply(db).catch((error) => {
      // A failure must not be cached, or one bad moment disables the database
      // for the life of the isolate.
      pending = null;
      throw error;
    });
  }
  return pending;
}

async function apply(db: D1Database): Promise<void> {
  await db.prepare(LEDGER).run();
  const done = await db.prepare("SELECT id FROM schema_migrations").all<{ id: string }>();
  const applied = new Set((done.results ?? []).map((row) => row.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    for (const statement of migration.statements) {
      await db.prepare(statement).run();
    }
    await db
      .prepare("INSERT OR REPLACE INTO schema_migrations (id, applied_at) VALUES (?1, ?2)")
      .bind(migration.id, new Date().toISOString())
      .run();
  }
}

/** Reset the isolate's memory of the check. Used by tests, never by a route. */
export function forgetSchemaCheck(): void {
  pending = null;
}
