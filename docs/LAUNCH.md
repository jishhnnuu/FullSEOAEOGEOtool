# Launching, once there is a name and a domain

Everything in the product is name-agnostic and domain-agnostic on purpose. The
engine was the hard part; a name is a text substitution, so nothing downstream
hard-codes either and `npm run brand:check` fails the build if something starts
to.

This is the whole list. It is short because the work was done in advance.

## The five minutes that change everything

1. **Buy the domain** and point it at the Worker. Cloudflare dashboard,
   Workers, this Worker, Settings, Domains and Routes, Add custom domain.

2. **Set two variables.** Cloudflare dashboard, Workers, Settings, Variables
   and Secrets. Plain variables, not secrets.

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_BRAND_NAME` | The product name, e.g. `Northstar` |
   | `NEXT_PUBLIC_SITE_URL` | The origin, e.g. `https://northstar.com`, no trailing slash |

3. **Set `PUBLIC_BASE_URL`** to the same origin, so OAuth callbacks and
   checkout return URLs resolve against the real domain rather than the
   request host.

4. **Redeploy.** Push to `main`, or press Deploy in the dashboard.

That is the launch. What changes in that one deploy:

| Before | After |
| --- | --- |
| Every page titled `… \| SEO OS` | Every page titled with the real name |
| `robots.txt` is `Disallow: /` | 37 rules, every search and AI agent named and allowed |
| `sitemap.xml` is empty | 43 URLs |
| Pages are `noindex, nofollow` | `index, follow`, with `max-snippet:-1` and large image previews |
| Canonicals point at the workers.dev origin | Canonicals point at the real domain |
| `llms.txt` lists workers.dev URLs | Lists real URLs |
| The OG card says `SEO OS` | Says the real name, rendered at the edge |
| JSON-LD entity is the subdomain | The real organisation, defined once at `/#organization` |

**Why the pre-launch deployment is noindex.** A workers.dev subdomain that gets
indexed and later moves leaves a full duplicate of the site in the index,
competing with the real domain for its own terms. Starting closed costs
nothing; starting open costs a canonicalisation cleanup that takes months.

Verify it with the same two commands the docs use everywhere else:

```bash
curl -s https://<your-domain>/robots.txt | head -20
curl -s https://<your-domain>/sitemap.xml | grep -c "<loc>"
curl -s https://<your-domain>/llms.txt | head -5
```

## The same week

5. **Submit to Search Console and Bing Webmaster Tools.** Add the property,
   verify by DNS, submit the sitemap. This is also the connection that turns on
   striking-distance analysis for our own site, which is the point at which the
   product starts being used on itself in earnest.

6. **Turn on analytics.** Cloudflare Web Analytics is free, needs no code and
   sets no cookies: Cloudflare dashboard, Web Analytics, Add a site. It clears
   the `analytics_missing` finding that `/proof` currently reports against us,
   which is the one finding on that page we should not leave standing.

7. **Update the Google OAuth client** with the new redirect URIs. Two of them,
   exactly, both on the real domain:

   ```
   https://<your-domain>/api/auth/google/callback
   https://<your-domain>/api/connections/google/callback
   ```

   `/app/setup` prints both with a copy button, on the running deployment.

8. **Start Google's verification** for the Analytics scope. It is a sensitive
   scope, it takes weeks, and it is on the critical path for the
   revenue-reporting claim. Search Console needs nothing; it was reclassified
   as non-sensitive in 2024.

## When you want to take money

Four values, documented in `docs/BILLING.md`. Until they are set every
workspace stays on the free tier, the checkout route answers with a reason and
a fix rather than an error, and the audit is unaffected.

The short version: create two monthly prices matching `lib/plans.ts` (£79 and
£249), add a webhook endpoint at `/api/billing/webhook`, and set
`BILLING_SECRET_KEY`, `BILLING_WEBHOOK_SECRET`, `BILLING_PRICE_STARTER` and
`BILLING_PRICE_GROWTH`. Consider a merchant of record rather than raw card
processing: a solo operator selling into the UK and EU should not be handling
cross-border VAT by hand.

## What not to do on launch day

- **Do not index the workers.dev subdomain first "to test".** That is the one
  irreversible mistake available here.
- **Do not announce before `/proof` is clean.** The page audits this site live
  and publishes what it finds. Launching with high-severity findings on it
  would be the first dishonest thing on the site, and the page exists precisely
  so that cannot happen quietly.
- **Do not tick a capability that is not shipping.** The competitor teardown in
  `docs/COMPARISON-MAVEK.md` is built on exactly that failure, and the moment we
  do it we lose the only asset a better-funded rival cannot buy.
- **Do not publish a traffic chart.** There is no traffic yet. Say so.

## The checklist as a table

| Step | Where | Blocks what | Time |
| --- | --- | --- | --- |
| Buy the domain | Registrar | Everything | Minutes |
| Custom domain on the Worker | Cloudflare | Everything | Minutes |
| `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_SITE_URL` | Cloudflare | Indexing, canonicals, sitemap | Minutes |
| `PUBLIC_BASE_URL` | Cloudflare | OAuth, checkout returns | Minutes |
| Redeploy | Push to `main` | Everything | Minutes |
| Search Console and Bing | Their consoles | Real keyword data | An hour |
| Cloudflare Web Analytics | Cloudflare | The last finding on `/proof` | Minutes |
| Google OAuth redirect URIs | Google Cloud Console | Sign-in, connections | An hour |
| Analytics scope verification | Google Cloud Console | Revenue reporting | Weeks |
| Billing values | Cloudflare | Taking money | An hour |
