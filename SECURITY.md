# Security

## Reporting

Report vulnerabilities privately rather than opening an issue. Include what
you did, what happened, and what you expected.

## What the platform holds

The sensitive material is tenant credentials: OAuth refresh tokens, CMS
application passwords, data-provider keys and mail-server passwords.

They are stored envelope-encrypted. Each record carries its own data key,
wrapped by the deployment master key, so rotating the master key never
rewrites ciphertext and a leaked database row is useless on its own. No API
endpoint returns a secret in any form; the dashboard sees status, scopes and
a fingerprint.

**Losing `SEOOS_MASTER_KEY` makes every stored credential unrecoverable.**
Back it up somewhere that is not the same machine.

## Deliberate defences

**SSRF.** The platform fetches URLs its users supply. Every outbound request
resolves DNS first and rejects private, loopback, link-local, reserved and
cloud metadata addresses. The same validation runs at the API boundary, so a
hostile `base_url` is refused at signup rather than at crawl time.

**Tenancy.** Cross-tenant reads return 404 rather than 403, so an identifier
cannot be confirmed by probing. Every tenant-owned load goes through one
choke point.

**Passwords.** SHA-256 pre-hashed before bcrypt, so a long passphrase is not
silently truncated at 72 bytes.

**Blast radius.** An agent can only act through a registered tool. Every
mutation is declared, risk-rated, policy-checked and audited. No autonomy
level authorises a critical action such as rewriting robots.txt, submitting a
disavow file or bulk-noindexing.

**Spend.** Per-run, per-organisation-per-day and per-organisation-per-month
ceilings are enforced before a call is made, not discovered afterwards.

## Running it safely

- Set `SEOOS_ALLOW_INSECURE_DEV_KEYS=false` outside development. The platform
  then refuses to start without a master key and a JWT secret.
- Run the containers unprivileged. The provided images already do.
- Use Postgres in production. SQLite has a single writer.
- Consider `SEOOS_DRY_RUN=true` for a new client's first cycle: every
  mutating tool becomes a no-op that logs what it would have done.
