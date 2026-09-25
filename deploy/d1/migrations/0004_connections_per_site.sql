-- Generated from apps/web/src/server/schema.ts by `npm run d1:sql`.
-- Do not edit by hand. The Worker applies these itself on first use;
-- this file exists for `wrangler d1 migrations apply` and for reading.

CREATE TABLE IF NOT EXISTS connections_next (
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
);

INSERT OR IGNORE INTO connections_next (id, org_id, site_id, provider, label, status, scopes, selection, sealed, expires_at, last_error, last_used_at, created_at, updated_at)
SELECT id, org_id, site_id, provider, label, status, scopes, selection, sealed, expires_at, last_error, last_used_at, created_at, updated_at FROM connections;

DROP TABLE connections;

ALTER TABLE connections_next RENAME TO connections;

CREATE INDEX IF NOT EXISTS connections_org ON connections(org_id);
