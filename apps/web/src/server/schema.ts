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
  // The schedule, the readings it takes, and the milestones worth telling
  // someone about. Kept apart from `runs` because these are what happens
  // between runs, which is most of the time.
  {
    id: "0002_schedule",
    statements: [
      `CREATE TABLE IF NOT EXISTS schedules (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  job         TEXT NOT NULL,
  cadence     TEXT NOT NULL,
  hour        INTEGER NOT NULL,
  weekday     INTEGER NOT NULL,
  monthday    INTEGER NOT NULL,
  timezone    TEXT NOT NULL,
  enabled     INTEGER NOT NULL,
  next_run_at TEXT,
  last_run_at TEXT,
  last_status TEXT,
  last_detail TEXT,
  updated_at  TEXT NOT NULL,
  UNIQUE (site_id, job)
)`,
      `CREATE INDEX IF NOT EXISTS schedules_due ON schedules(enabled, next_run_at)`,
      // One dated reading of the numbers that matter, so a report can show a
      // trend rather than a snapshot. Written by the scheduled sampler.
      `CREATE TABLE IF NOT EXISTS measurements (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  taken_at    TEXT NOT NULL,
  source      TEXT NOT NULL,
  clicks      REAL,
  impressions REAL,
  position    REAL,
  ctr         REAL,
  sessions    REAL,
  conversions REAL,
  detail      TEXT
)`,
      `CREATE INDEX IF NOT EXISTS measurements_site ON measurements(site_id, taken_at)`,
      // Things worth an email. Deliberately rare: a stage finishing, a
      // regression, the first real measurement.
      `CREATE TABLE IF NOT EXISTS milestones (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  at          TEXT NOT NULL,
  kind        TEXT NOT NULL,
  what        TEXT NOT NULL,
  notified_at TEXT,
  seen_at     TEXT
)`,
      `CREATE INDEX IF NOT EXISTS milestones_site ON milestones(site_id, at)`,
    ],
  },
  {
    id: "0003_billing",
    statements: [
      // One row per paying workspace. The plan also lives on `orgs.plan` so a
      // quota check is a single read on the hot path; this table is the audit
      // trail and the thing the provider's webhook writes.
      //
      // No card details, no provider secret, nothing that could be replayed.
      // A subscription id and a customer id are opaque references that are
      // useless without the API key, which never leaves the Worker.
      `CREATE TABLE IF NOT EXISTS subscriptions (
  org_id            TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  plan              TEXT NOT NULL,
  status            TEXT NOT NULL,
  provider          TEXT NOT NULL,
  subscription_id   TEXT,
  customer_id       TEXT,
  current_period_end TEXT,
  updated_at        TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS subscriptions_customer ON subscriptions(customer_id)`,
      // Every plan change, kept forever. A customer asking why they were
      // downgraded deserves an answer that is not "the webhook said so", and
      // a billing dispute is exactly the moment an audit trail earns its keep.
      `CREATE TABLE IF NOT EXISTS billing_events (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  type       TEXT NOT NULL,
  plan       TEXT,
  status     TEXT,
  received_at TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS billing_events_org ON billing_events(org_id, received_at)`,
    ],
  },
  // One connection per Google account, product and site, so two sites that
  // share a Gmail each keep their own chosen property. SQLite cannot drop a
  // constraint, so the table is rebuilt; the migration runs as one batch,
  // which D1 applies as a single transaction, and every step is safe to
  // repeat if it ever has to be.
  {
    id: "0004_connections_per_site",
    statements: [
      `CREATE TABLE IF NOT EXISTS connections_next (
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
  UNIQUE (org_id, provider, label, site_id)
)`,
      `INSERT OR IGNORE INTO connections_next (id, org_id, site_id, provider, label, status, scopes, selection, sealed, expires_at, last_error, last_used_at, created_at, updated_at)
SELECT id, org_id, site_id, provider, label, status, scopes, selection, sealed, expires_at, last_error, last_used_at, created_at, updated_at FROM connections`,
      `DROP TABLE connections`,
      `ALTER TABLE connections_next RENAME TO connections`,
      `CREATE INDEX IF NOT EXISTS connections_org ON connections(org_id)`,
    ],
  },
  // Enquiries from the book-a-call form. Not scoped to an org: they arrive
  // before anyone has an account, and only the people named in OWNER_EMAILS
  // can read them. The network address is kept only as a hash, for rate
  // limiting, never as the address itself.
  {
    id: "0005_enquiries",
    statements: [
      `CREATE TABLE IF NOT EXISTS enquiries (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  business   TEXT,
  website    TEXT,
  stage      TEXT,
  services   TEXT,
  message    TEXT,
  source     TEXT,
  ip_hash    TEXT,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS enquiries_created ON enquiries(created_at)`,
      `CREATE INDEX IF NOT EXISTS enquiries_ip ON enquiries(ip_hash, created_at)`,
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
    // One batch per migration: D1 runs a batch as a transaction, so a
    // migration is either wholly applied and recorded, or not at all.
    await db.batch([
      ...migration.statements.map((statement) => db.prepare(statement)),
      db
        .prepare("INSERT OR REPLACE INTO schema_migrations (id, applied_at) VALUES (?1, ?2)")
        .bind(migration.id, new Date().toISOString()),
    ]);
  }
}

/** Reset the isolate's memory of the check. Used by tests, never by a route. */
export function forgetSchemaCheck(): void {
  pending = null;
}
