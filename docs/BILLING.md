# Taking money

Billing is additive, like every other server capability here. With nothing
configured the pricing page renders, the audit runs, accounts work, and every
paid surface reports the gap as a sentence rather than throwing. Turning it on
is four values in the Cloudflare dashboard.

## What exists before you configure anything

| Piece | Where | State with no configuration |
| --- | --- | --- |
| Plan definitions | `apps/web/src/lib/plans.ts` | Always present. The pricing page derives from it |
| Quota enforcement | `apps/web/src/server/quota.ts` | Active. Everyone gets the free tier's 40 pages |
| Checkout | `POST /api/billing/checkout` | Answers 503 with the reason and the fix |
| Webhook | `POST /api/billing/webhook` | Answers 503. Nothing can be forged into it |
| Plan lookup | `GET /api/billing/plan` | Returns the free plan and `billingAvailable: false` |
| Tables | `subscriptions`, `billing_events` | Created by migration `0003_billing` on first request |

## The one definition

`lib/plans.ts` is the only place a plan is described. The pricing page reads
it, the quota check enforces it, and the exclusions shown on each card are
derived from the limits rather than written by hand.

That arrangement is deliberate and it is the thing to preserve. A pricing grid
that ticks a capability the product gates somewhere else is the most common
dishonesty in this category, and the only defence against doing it ourselves
is having exactly one definition. If you add a capability, add it to the `limits` type
and every surface updates together.

## Choosing a provider

Stripe is implemented because it is the most common. **For a solo operator
selling into the UK and EU, a merchant of record is the better choice**:
Paddle or Lemon Squeezy become the seller of record and handle VAT
registration, rates and filing. Stripe leaves all of that with you, and
cross-border digital VAT is a real ongoing obligation rather than a formality.

Moving providers is two functions. `createCheckout()` builds a hosted checkout
session, `parseEvent()` reduces a webhook to the fields a workspace cares
about, and `verifyWebhook()` checks the signature. Nothing else in the codebase
knows which provider is in use.

## Turning it on

Four Worker secrets, set in the Cloudflare dashboard under Workers, Settings,
Variables and Secrets. Set the first two as **Secrets**; the price ids can be
plain variables, since they are not confidential.

| Name | Kind | What it is |
| --- | --- | --- |
| `BILLING_SECRET_KEY` | Secret | The provider's server API key. Never reaches a browser |
| `BILLING_WEBHOOK_SECRET` | Secret | The signing secret for the webhook endpoint |
| `BILLING_PRICE_STARTER` | Variable | The price id for Starter |
| `BILLING_PRICE_GROWTH` | Variable | The price id for Growth |

Then, in the provider's dashboard:

1. **Create two recurring prices**, monthly, matching `lib/plans.ts`: Starter
   at £79 and Growth at £249. If you change a price, change it in both places
   in the same sitting. The code does not read the provider's price, because a
   pricing page that fetches its numbers at runtime fails badly when the
   provider is slow.
2. **Add a webhook endpoint** pointing at `https://<your-domain>/api/billing/webhook`,
   subscribed to `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated` and
   `customer.subscription.deleted`.
3. **Copy the signing secret** into `BILLING_WEBHOOK_SECRET`.

Nothing needs a redeploy. The route reads the environment per request.

## What the webhook is allowed to do

It sets a workspace's plan, and nothing else. Three rules hold:

- **The signature is verified before the body is parsed.** A webhook that skips
  that is a public endpoint handing out paid features to anyone who can POST to
  it. The comparison is constant time, and anything older than five minutes is
  refused so a captured request cannot be replayed later.
- **The workspace comes from the subscription's own metadata**, set when the
  checkout session was created. Nothing the request body claims about which
  workspace to change is trusted on its own.
- **A failure drops to free, never to locked.** A cancellation, an unpaid
  subscription or an expired card leaves the workspace on the free tier with
  the audit working. Taking the audit away over a billing problem would break
  the property the whole product rests on, for the person least able to do
  anything about it at that moment. `past_due` keeps the plan, because a card
  that expired is not a cancellation.

## What is deliberately absent

- **Card details never touch this Worker.** Checkout is hosted, so PCI scope
  stays out of the codebase.
- **No provider secret is ever returned to a browser**, in any shape, including
  masked. The rule that a stored secret never leaves the server applies here
  exactly as it does to connections.
- **No credit model.** Credits make cost unforecastable for the buyer least
  able to absorb a surprise, and they need several paragraphs to explain, which
  is itself the tell. Pages per run is comprehensible on sight and maps to the
  one resource a crawl actually consumes.
- **No usage-based invoicing.** The audit costs nothing per run because it uses
  no model and no data vendor. Metering something with no marginal cost would
  be inventing a meter.

## Testing it without taking a payment

The provider's test mode gives you test keys, test price ids and a test signing
secret. Set those, run a checkout with a test card, and watch the webhook land.
`billing_events` records every event, matched or not, so an event that cannot
be tied to a workspace leaves a trace rather than vanishing.

The signature verification, the replay window, the event parsing and the plan
transitions are covered by `apps/web/tests/billing.test.ts`, which runs in
`npm run test:engine` and needs no provider at all.

## Quotas, and stating coverage

The page ceiling is enforced in the Worker, at `/api/engine/fetch`, because the
browser drives the crawl and a ceiling the browser alone respected would not be
a ceiling.

When a cap bites, the run does not stop silently. The reason travels back, the
crawl records it as a note, and the screen states the coverage above the score:
a score over 40 of 500 pages is a score of those 40, and the reader is told
that before the number rather than underneath it.
