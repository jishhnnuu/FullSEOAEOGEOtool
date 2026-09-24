# Switching the paid desk on

Everything in the paid desk is built and tested. What stands between it and a
live campaign is a set of applications to the advertising platforms, none of
which is technical and all of which take calendar time.

This file is the runbook. It is separate from `docs/offerings/PAID.md`, which
is what the desk does; this is what a person has to go and do.

**Nothing here is ever asked of an advertiser.** They press Connect and log in
on the platform's own site. Every item below belongs to whoever operates this
deployment.

---

## What all of them need first

Three things, once, and then every platform application reuses them:

1. **A registered company** with documents that match the name on the
   applications. Meta verifies against incorporation records and a mismatch is
   the commonest cause of a rejection.
2. **A privacy policy and terms at public URLs.** Both exist: `/privacy` and
   `/terms`. They are linked from the footer, which reviewers check.
3. **A data deletion endpoint.** Exists at `/api/data-deletion`. It verifies
   the platform's signature before parsing the body, and returns a URL and a
   confirmation code, which is what Meta's review expects to see working.

A working deployment on the real domain, rather than a `workers.dev`
subdomain, makes every application easier. Set `NEXT_PUBLIC_SITE_URL` and
`NEXT_PUBLIC_BRAND_NAME` first.

---

## Google Ads

| Step | Where | Time |
| --- | --- | --- |
| Open a Google Ads manager account | ads.google.com, free | An hour |
| Apply for a developer token | The manager account's API centre | Days |
| Create an OAuth client | Google Cloud console | An hour |
| Submit the consent screen for verification | Google Cloud console | Two to six weeks |

The `adwords` scope is classified **sensitive**, not restricted. That means
Google reviews the app and the consent screen, and does **not** require the
third-party security assessment that restricted scopes need. Budget for the
review; do not budget for a CASA audit.

Basic developer token access allows 15,000 operations a day, which is far past
what this product needs. Do not apply for Standard until Basic is limiting.

**Testing before approval:** test accounts under the manager account work
immediately with a test-level token. The entire build runs against them.

Set: `GOOGLE_ADS_DEVELOPER_TOKEN`, and reuse the existing
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Google Merchant Center, for shopping, uses the Content API and needs **no**
developer token. Same OAuth client, one extra scope.

---

## Microsoft Advertising

The least gated of the majors, and worth doing first for exactly that reason.

| Step | Where | Time |
| --- | --- | --- |
| Open a Microsoft Advertising account | ads.microsoft.com | An hour |
| Request a developer token | Inside that account's settings | No review queue |
| Register an app | Microsoft Entra | An hour |

A sandbox token is immediate and the sandbox is complete. Microsoft also
imports an entire Google Ads account natively, so a client already on Google
is running on Microsoft the same afternoon, usually at a lower cost per lead.

Set: `MICROSOFT_ADS_DEVELOPER_TOKEN`, `MICROSOFT_CLIENT_ID`,
`MICROSOFT_CLIENT_SECRET`.

---

## Meta

The longest queue and the most exacting review. Start it early and in
parallel with everything else.

| Step | Where | Notes |
| --- | --- | --- |
| Create an app | developers.facebook.com | Business type |
| Business Verification | Meta Business Manager | Incorporation documents |
| App Review for Advanced Access to `ads_management` | The app dashboard | A screencast **per permission** |
| Data Protection Assessment | Prompted after review | An annual questionnaire |
| Data deletion callback | Point it at `/api/data-deletion` | Meta calls it and checks the response |

The screencast is where submissions fail. Record the actual product doing the
actual thing each permission is for, narrated, with the permission named. A
generic product tour is rejected. A rejection usually means a clearer video
rather than a redesign, so resubmit rather than re-architect.

**Testing before approval:** sandbox ad accounts run the whole Marketing API,
including creating campaigns, without Advanced Access and without spending.

Set: `META_APP_ID`, `META_APP_SECRET`. The secret also verifies the signature
on deletion callbacks.

---

## The rest

| Platform | Gate | Realistic |
| --- | --- | --- |
| TikTok | Marketing API app approval | One to three weeks, less painful than Meta |
| Pinterest | Trial access self-serve, standard access reviewed | Days to two weeks |
| Reddit | Ads API application | Two to four weeks |
| Snapchat | Marketing API app review | Two to four weeks |
| LinkedIn | Marketing Developer Platform application | Four to twelve weeks, rejection common |
| Amazon | Ads API application, per region | Two to six weeks |

LinkedIn is the one to start last and expect least from. It is also the only
network that targets job title and company size accurately, so for business to
business at a high contract value it is worth the wait.

---

## The order worth doing it in

1. **Microsoft.** No review queue. Proves the whole pipeline end to end with a
   real advertiser on a real account.
2. **Google.** Longest useful reach. Start the OAuth verification the same day
   the developer token application goes in; they run in parallel.
3. **Meta.** Start the business verification immediately, because everything
   else at Meta waits on it.
4. **TikTok, then Pinterest**, if the clients are there.
5. **LinkedIn**, only for a business-to-business book.

While every one of those is in a queue, the desk still does real work: the
measurement verification, the account audit, the demand read, the budget
arithmetic, the offer, the creative at every size and the policy check all run
without a single platform connection. `paid_readiness` is the mission that
runs first and it needs nothing but the site.

---

## What is true the whole time

`/paid` publishes the status of every platform, read from
`connectors/ads.py`, so the public page cannot claim availability the
deployment does not have. Change `status` there when an approval lands, run
`make docs`, and the site updates itself.
