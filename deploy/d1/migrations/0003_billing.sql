-- Generated from apps/web/src/server/schema.ts by `npm run d1:sql`.
-- Do not edit by hand. The Worker applies these itself on first use;
-- this file exists for `wrangler d1 migrations apply` and for reading.

orgs.plan` so a
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
);

CREATE INDEX IF NOT EXISTS subscriptions_customer ON subscriptions(customer_id);

CREATE TABLE IF NOT EXISTS billing_events (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  type       TEXT NOT NULL,
  plan       TEXT,
  status     TEXT,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_events_org ON billing_events(org_id, received_at);
