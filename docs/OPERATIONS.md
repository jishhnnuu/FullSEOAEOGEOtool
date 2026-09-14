# Running it

## Processes

Three, and only the first two are required:

| Process | Command | What happens without it |
|---|---|---|
| API | `seoos serve` | Nothing works |
| Worker | `seoos worker` | Missions only run when someone presses a button, which is the difference between a platform and a tool |
| Web | `npm start` in `apps/web` | The API still serves; there is no dashboard |

The worker is stateless and safe to run several of. Schedules are claimed
with a database lease, so two workers never run the same one twice, and a
worker that dies mid-run releases its lease by expiry.

## Database

SQLite is the default and is genuinely fine for development and a
single-tenant demo. It has one writer at a time, so anything with real
concurrency wants Postgres:

```
SEOOS_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/seoos
```

`seoos migrate` creates the schema. In production run Alembic; the bootstrap
path exists so a first boot works without ceremony.

## Keys

```bash
seoos keygen
```

Produces `SEOOS_MASTER_KEY` and `SEOOS_JWT_SECRET`. The master key encrypts
every tenant credential. **Losing it makes them unrecoverable.** Back it up
somewhere that is not the same machine.

Rotation is supported without rewriting ciphertext: each record carries its
own data key, wrapped by the master. `seoos.core.crypto.rewrap` re-wraps one
envelope under a new master.

Outside development the platform refuses to start without both keys.

## Cost

Three ceilings, each enforced before a call rather than discovered after:

- **Per run** — `SEOOS_MAX_USD_PER_RUN`, plus each mission's own budget and
  each agent's own ceiling
- **Per organisation per day** — `SEOOS_MAX_USD_PER_ORG_PER_DAY`
- **Per organisation per month** — stored on the org row and checked live

Every dollar lands in `cost_ledger` attributed to a site and a run, so
"what does this client cost" is a query, not an estimate.

Typical marginal cost for a small site on a weekly cycle:

| Item | Cost |
|---|---|
| Crawl and full deterministic audit | $0.00 |
| Search Console pulls | $0.00 |
| A weekly cycle's model usage | roughly $0.30 to $2.00 |
| A full content piece end to end | roughly $1.00 to $4.00 |
| SERP checks via DataForSEO | about $0.002 each |
| Geo-grid, 25 points | about $0.05 |

Set `SEOOS_DRY_RUN=true` to make every mutating tool a no-op that logs what
it would have done. Useful for a first cycle on a nervous client.

## Monitoring

- `GET /health` — liveness
- `GET /ready` — database, roster, missions and which model providers are
  reachable
- `GET /api/v1/capabilities` — what this deployment can actually do, and
  whether it is running degraded

Logs are structured JSON when `SEOOS_LOG_FORMAT=json`, with the org, site,
mission run and agent bound to every line inside a run.

## Onboarding a client

1. They sign up and add a site. The audit starts immediately and needs
   nothing connected.
2. They see real findings about their own site before being asked for a
   single credential.
3. Ask for Search Console first, on its own, with what it unlocks. Do not
   present twelve integrations at once.
4. Upload brand material. The voice profile improves; the fact ledger fills.
5. Set the autonomy level and any never-touch paths.
6. The schedule is bootstrapped on activation and runs from then on.

## When something is wrong

**A mission keeps failing.** Look at the run trace in the dashboard, which
shows every step, every agent and every tool call with its arguments. After
three consecutive failures a schedule backs off exponentially; after eight it
disables itself rather than burning money hourly.

**Output looks generic.** The brand profile is thin. Upload real material and
check the fact ledger has something in it.

**Content never reaches the client.** Check `gate_results` on the content
item. A draft cannot enter review with a failing gate, which is deliberate.

**Nothing runs on schedule.** The worker is not running.

**An integration silently stopped.** Three consecutive errors mark it
degraded and the planner routes around it. `POST /integrations/{id}/verify`
re-checks it.

## Scaling

- The API is stateless; run as many as you like behind a load balancer.
- Workers are stateless; the lease makes them safe to scale horizontally.
- The crawler is bounded per host, respects robots.txt by default, and
  identifies itself honestly.
- Long missions checkpoint every wave, so a deploy mid-run resumes rather
  than restarts.
