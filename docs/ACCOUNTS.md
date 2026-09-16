# Accounts, sign-in and connections

Everything in this document is switched off until someone with the Cloudflare
and Google accounts turns it on. Until then the product runs exactly as it did:
the audit works, the workspace lives in the browser, and every screen that
would need an account says so in a sentence rather than failing.

## What it costs

Nothing, at the volume of one person testing.

| Thing | Free tier | What would break it |
| --- | --- | --- |
| Workers | 100,000 requests a day | A crawl is a few dozen requests, so a few hundred audits a day |
| D1 | 5 GB, 5M row reads and 100k row writes a day | Thousands of accounts, not tens |
| Google OAuth | Free, no quota that matters here | Nothing |
| Resend, optional | 3,000 emails a month | Nothing at this scale |

The magic link is the only part that needs a third party, and it is optional:
without `RESEND_API_KEY` the sign-in screen offers Google alone and does not
pretend otherwise.

## Setup, from a browser, on any device

Nothing here needs a terminal, a laptop, or a particular machine. Four things,
and the running deployment tells you which are done: open `/app/setup` on the
live site and it re-checks itself every fifteen seconds.

**1. Create the database.** Cloudflare dashboard, Storage and Databases, D1,
Create. Call it `seoos`. Copy the database ID it shows you.

**2. Bind it to the Worker.** The binding has to be in `wrangler.jsonc`,
because Cloudflare rebuilds the Worker from that file on every push. Add it
above the `observability` block:

```jsonc
  "d1_databases": [
    { "binding": "DB", "database_name": "seoos", "database_id": "the id you copied" }
  ],
```

You can do that from github.com in a browser: edit the file, commit, and
Cloudflare redeploys. **The tables build themselves** on the first request
after that. There is no migration command to run.

**3. Add the secrets.** Cloudflare dashboard, Workers, this Worker, Settings,
Variables and Secrets. Add each as a Secret, not a Variable. These survive
every deploy, so they are set once.

**4. Create the Google OAuth client.** The only step that is not Cloudflare,
below. `/app/setup` prints the exact two URLs to paste, with a copy button.

There is also `npm run cf:setup`, which does steps 1 to 3 in one command for
anyone who prefers a terminal. It is a convenience, not the path.

### The Google OAuth client

At <https://console.cloud.google.com/apis/credentials>, create a **Web
application** client. Add both redirect URIs, exactly:

```
https://<your-worker>.workers.dev/api/auth/google/callback
https://<your-worker>.workers.dev/api/connections/google/callback
```

Two rather than one on purpose: signing in and connecting a product are
separate round trips, and keeping them apart means a callback cannot be
replayed against the other flow.

On the consent screen, add the scopes:

| Scope | Review | Why |
| --- | --- | --- |
| `openid`, `email`, `profile` | None | Identity |
| `.../auth/webmasters.readonly` | **None**. Google reclassified it as non-sensitive in 2024 | Search Console |
| `.../auth/analytics.readonly` | Sensitive. Works for test users now, needs review to go public | GA4 |
| `.../auth/business.manage` | Sensitive, **and** the API needs its own access request | Business Profile |

While the app is unverified, add your own Gmail address under **Test users**.
That is enough for everything, including Analytics. Refresh tokens issued to an
app in Testing expire after seven days, so during testing expect to reconnect
about weekly; publishing the app (which needs the review above only for the
sensitive scopes) removes that.

Also enable the APIs themselves under **APIs & Services, Library**: Search
Console API, Google Analytics Data API, Google Analytics Admin API.

### If Google will not accept the workers.dev URL

`workers.dev` is on the public suffix list, and Google occasionally refuses a
redirect URI on a domain it cannot tie to a verified owner. If that happens,
put any domain you own in front of the Worker (Cloudflare, Workers, Settings,
Domains and Routes), set `PUBLIC_BASE_URL` to it, and register the two callback
URLs on that domain instead. Nothing in the code changes: the redirect URI is
derived from the request unless `PUBLIC_BASE_URL` overrides it.

## The secrets

Set in the Cloudflare dashboard, under Workers, this Worker, Settings,
Variables and Secrets. Adding them there rather than in a file is deliberate:
a secret in `wrangler.jsonc` would be in git, and a secret set from one laptop
would be a secret only that laptop could rotate.

| Name | Required | What it does |
| --- | --- | --- |
| `SEOOS_MASTER_KEY` | Yes, for connections | Seals every stored credential. 32 bytes, base64. Any password generator set to 32 bytes works, or `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Yes, for sign-in | The OAuth client |
| `GOOGLE_CLIENT_SECRET` | Yes, for sign-in | |
| `RESEND_API_KEY` | No | Turns on the magic-link fallback, and delivery of the scheduled report. Without it the report is still built and shown in the app; it just is not emailed, and the schedule says so rather than reporting a send that never happened |
| `MAIL_FROM` | No | Defaults to Resend's test sender |
| `PUBLIC_BASE_URL` | No | Pins the OAuth redirect to a custom domain |

Losing `SEOOS_MASTER_KEY` means every connected account has to be reconnected.
Nothing else is lost, because a sealed row is worthless without it, and that is
the point. Keep a copy somewhere that is not this deployment.

## What is tied to a machine, and what is not

Nothing about running this product is. Once the four steps above are done, the
configuration lives in Cloudflare and Google, and the product is a website:
any browser, any device, any country, nothing installed, no account with any
vendor except the one you signed in with.

The audit itself has always been free of all of it. It makes no model call, so
it needs no AI account of anyone's, including the one this was built with.
Drafting is the single feature that calls a model, and it relays the tenant's
own key through one route that never stores it. Disconnect everything and the
crawl, the checks, the scoring, the fixes, the schema, the briefs and the link
plans all still work, because they are deterministic code rather than prompts.

What does need an account is provisioning: someone has to own the Cloudflare
Worker and the Google OAuth client, the same way someone has to own the domain.
That is ownership, not a dependency, and it can be moved by handing over two
logins.

## The shape of it

```
Browser                     Worker                      D1
  audit engine  ────────▶   fetch and parse
  workspace                 sessions, tokens  ────────▶ users, orgs, sessions
  screens       ◀────────   /api/*                      connections (sealed)
                                                        runs, approvals, publishes
```

The browser still runs the audit. The server holds the four things a browser
cannot: an identity that survives a new machine, refresh tokens that let work
happen with nobody watching, the record of who approved what, and the previous
value of everything that was published so it can be reversed.

### What the schedule can and cannot do here

An hourly cron fires on the Worker. There is nothing to configure for it: no
secret, no endpoint, no dashboard setting. It needs the D1 binding, because a
schedule with nowhere to store itself is not a schedule.

Two jobs run on it, and they are the two that are a handful of API calls rather
than a hundred page fetches:

- **The measurement sample.** Reads clicks, impressions, position and sessions
  and stores a dated reading. This is what turns the report from a snapshot
  into a trend, and it is what catches a sudden fall on the day it starts.
- **The report.** Builds the period report from what was stored and emails it,
  if `RESEND_API_KEY` is set.

The audit is not one of them. It runs in the browser, so a scheduled crawl
waits for the next time someone opens the app and then starts by itself,
announces that it did, and tells the schedule so the clock moves on. The
schedule screen prints which jobs need a tab and which do not, by name. A
self-hosted installation with the Python worker runs all of it unattended;
same product, different trade.

## The gate

Not one gate, a sequence, each ask smaller than the value that just landed.

1. **The run finishes.** Offered a way to keep it, not asked for anything.
2. **They open a fix.** The highest-priority fix opens in full. The rest are
   shown blurred with "written and waiting", because the point is that the work
   already exists.
3. **They try to keep something.** Run again, save the site, approve a change.
4. **They hit a wall the data can fix.** Keywords says the model came from
   their own copy, which is the moment to offer Search Console, not onboarding.

Every anonymous run is stored against a random claim token in a cookie and
expires in seven days. Signing in migrates it into the new account: nothing
re-crawls, nothing is retyped. Without that, every gate is a wall, because the
reward for signing up is doing the work twice.

## What each connection can really do

| Connection | Flow | The catch |
| --- | --- | --- |
| Search Console | One Approve | None. Non-sensitive since 2024 |
| Analytics 4 | Same Approve, same account | Sensitive scope: test users now, review to go public |
| Business Profile | OAuth once approved | Google gates the API behind its own request, weeks |
| WordPress | Redirect and approve | None. `authorize-application.php` has shipped since 5.6 |
| Bing Webmaster | API key | No OAuth exists |
| Ahrefs, DataForSEO | API key | No OAuth exists |

Pasting a secret never looks like the default. Where a real flow exists the
button says Connect. Where it does not, the card says so and shows where in
their settings to find the key.

## What publishing can really change

Through WordPress, today: post and page titles, excerpts, image alt text, and
meta descriptions where Yoast or Rank Math is installed. Every one reads the
current value first and stores it, so reversing is the same route run backwards.

What it cannot: core WordPress has no meta description field, so with neither
plugin the change is reported as unsupported rather than ticked off. robots.txt
is generated by WordPress at request time and is not a file the REST API can
replace. Saying so is better than a green tick over a change that never landed.

## When to move off this

D1 is the right answer while there is one person testing and no revenue. Move
when any of these is true:

- More than a few hundred accounts, or writes near 100k a day.
- Scheduled runs need to crawl hundreds of pages per site, where a Worker's CPU
  budget per request stops being the right shape.
- The Python service's missions, policy engine and agent roster are wanted in
  production, rather than the TypeScript engine alone.

The move is not a rewrite. `SEOOS_API_URL` already proxies `/api/v1` to a
self-hosted installation, and the Python side already has the same tables, the
same envelope encryption and the same tenant scoping rule.
