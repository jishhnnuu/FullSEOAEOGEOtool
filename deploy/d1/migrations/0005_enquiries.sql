-- Generated from apps/web/src/server/schema.ts by `npm run d1:sql`.
-- Do not edit by hand. The Worker applies these itself on first use;
-- this file exists for `wrangler d1 migrations apply` and for reading.

CREATE TABLE IF NOT EXISTS enquiries (
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
);

CREATE INDEX IF NOT EXISTS enquiries_created ON enquiries(created_at);

CREATE INDEX IF NOT EXISTS enquiries_ip ON enquiries(ip_hash, created_at);
