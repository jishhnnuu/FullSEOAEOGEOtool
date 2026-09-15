-- Generated from apps/web/src/server/schema.ts by `npm run d1:sql`.
-- Do not edit by hand. The Worker applies these itself on first use;
-- this file exists for `wrangler d1 migrations apply` and for reading.

CREATE TABLE IF NOT EXISTS orgs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'trial',
  autonomy    TEXT NOT NULL DEFAULT 'propose',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  picture        TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  last_seen_at   TEXT
);

CREATE TABLE IF NOT EXISTS memberships (
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_used_at TEXT,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_tokens (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  claim_run_id TEXT,
  next         TEXT,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  used_at      TEXT
);

CREATE INDEX IF NOT EXISTS login_tokens_expiry ON login_tokens(expires_at);

CREATE TABLE IF NOT EXISTS oauth_states (
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
);

CREATE INDEX IF NOT EXISTS oauth_states_expiry ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS sites (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  name       TEXT NOT NULL,
  cms        TEXT,
  autonomy   TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, url)
);

CREATE INDEX IF NOT EXISTS sites_org ON sites(org_id);

CREATE TABLE IF NOT EXISTS runs (
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
);

CREATE INDEX IF NOT EXISTS runs_org ON runs(org_id, created_at);

CREATE INDEX IF NOT EXISTS runs_claim ON runs(claim_hash);

CREATE INDEX IF NOT EXISTS runs_expiry ON runs(expires_at);

CREATE TABLE IF NOT EXISTS connections (
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
);

CREATE INDEX IF NOT EXISTS connections_org ON connections(org_id);

CREATE TABLE IF NOT EXISTS approvals (
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
);

CREATE INDEX IF NOT EXISTS approvals_site ON approvals(site_id, status);

CREATE INDEX IF NOT EXISTS approvals_org ON approvals(org_id, status);

CREATE TABLE IF NOT EXISTS publishes (
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
);

CREATE INDEX IF NOT EXISTS publishes_site ON publishes(site_id, created_at);

CREATE TABLE IF NOT EXISTS workspaces (
  org_id     TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  revision   INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  payload    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  user_id    TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_org ON audit_log(org_id, created_at);
