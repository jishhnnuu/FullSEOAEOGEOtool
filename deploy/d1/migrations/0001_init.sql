-- SEO OS on Cloudflare D1.
--
-- The browser still runs the audit and still holds a working copy of the
-- workspace. This database holds the things a browser cannot: an identity that
-- survives a new machine, the OAuth tokens that let scheduled work happen with
-- nobody watching, and the record of what was published and who approved it.
--
-- Every scoped table carries org_id and is only ever read through
-- fetchScoped() in src/server/db.ts, which returns nothing rather than
-- confirming a row exists in another tenant.

CREATE TABLE orgs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'trial',
  autonomy    TEXT NOT NULL DEFAULT 'propose',
  created_at  TEXT NOT NULL
);

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  picture        TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  last_seen_at   TEXT
);

CREATE TABLE memberships (
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX memberships_user ON memberships(user_id);

-- id is the SHA-256 of the cookie value. The cookie itself is never stored,
-- so a database leak cannot be replayed as a session.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_used_at TEXT,
  user_agent   TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- Magic links. Single use, short lived, hashed for the same reason.
CREATE TABLE login_tokens (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  claim_run_id TEXT,
  next         TEXT,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  used_at      TEXT
);
CREATE INDEX login_tokens_expiry ON login_tokens(expires_at);

-- One row per OAuth round trip, carrying the PKCE verifier. Deleted on use.
CREATE TABLE oauth_states (
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
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);

CREATE TABLE sites (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  name       TEXT NOT NULL,
  cms        TEXT,
  autonomy   TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, url)
);
CREATE INDEX sites_org ON sites(org_id);

-- A run with no org_id is an anonymous audit. It is addressable by a claim
-- token held in a cookie, it expires after seven days, and signing in moves it
-- into the new account rather than making the visitor crawl the site twice.
CREATE TABLE runs (
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
CREATE INDEX runs_org ON runs(org_id, created_at);
CREATE INDEX runs_claim ON runs(claim_hash);
CREATE INDEX runs_expiry ON runs(expires_at);

-- `sealed` is an envelope from src/server/crypto.ts. Nothing else in this
-- table is sensitive, which is what lets the connections screen be useful
-- without ever unsealing anything.
CREATE TABLE connections (
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
CREATE INDEX connections_org ON connections(org_id);

CREATE TABLE approvals (
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
CREATE INDEX approvals_site ON approvals(site_id, status);
CREATE INDEX approvals_org ON approvals(org_id, status);

-- What actually reached the live site, with the previous value kept so every
-- publish can be reversed by the same route that made it.
CREATE TABLE publishes (
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
CREATE INDEX publishes_site ON publishes(site_id, created_at);

-- The browser workspace, synced so it follows the account to another machine.
CREATE TABLE workspaces (
  org_id     TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  revision   INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  payload    TEXT NOT NULL
);

CREATE TABLE audit_log (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  user_id    TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_log_org ON audit_log(org_id, created_at);
