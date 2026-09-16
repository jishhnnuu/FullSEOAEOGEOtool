-- Generated from apps/web/src/server/schema.ts by `npm run d1:sql`.
-- Do not edit by hand. The Worker applies these itself on first use;
-- this file exists for `wrangler d1 migrations apply` and for reading.

CREATE TABLE IF NOT EXISTS schedules (
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
);

CREATE INDEX IF NOT EXISTS schedules_due ON schedules(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS measurements (
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
);

CREATE INDEX IF NOT EXISTS measurements_site ON measurements(site_id, taken_at);

CREATE TABLE IF NOT EXISTS milestones (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  at          TEXT NOT NULL,
  kind        TEXT NOT NULL,
  what        TEXT NOT NULL,
  notified_at TEXT,
  seen_at     TEXT
);

CREATE INDEX IF NOT EXISTS milestones_site ON milestones(site_id, at);
