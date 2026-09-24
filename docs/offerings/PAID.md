# The paid media desk

Twenty-six specialists who will not spend a client's money until they can
measure what it bought, and will not take a budget too small for the
platforms' own bidding to work.

Read `docs/offerings/BASELINE.md` first. Every rule there applies here. This
file covers what is specific to paid, and paid is specific in one way that
changes everything: it is the only desk whose mistakes arrive as an invoice.

---

## The access model, and the thing that is usually got wrong

**The advertiser never handles a credential.**

They press Connect. The platform's own login page opens on the platform's own
domain. They sign in with the password they already use, read a consent screen
listing what this software may do in their account, and approve it. We are
handed a token scoped to exactly that, which they can revoke from their own
account settings at any moment without telling us. No password reaches us and
nothing is pasted into this product.

The thing that gets confused with a user credential is a **developer token**.
It is not one. It identifies the software to the platform, the way a number
plate identifies a car, and on its own it opens nothing: without an
advertiser's OAuth grant alongside it, a developer token grants access to
nobody's data. There is one per platform, it belongs to us, and obtaining it
is our job rather than the client's.

`packages/seoos/connectors/ads.py` records both halves for all nine platforms,
separately and on purpose:

| | |
| --- | --- |
| `user_action`, `oauth_scopes`, `scope_reasons` | What the advertiser does. One button, every time. |
| `app_requirements`, `review_time`, `sandbox` | What we must clear first. Paperwork, on our side, once. |

The second half is the real cost of this desk and it is written down rather
than discovered mid-engagement. Every platform gates ad-writing behind a
review of the software doing the writing, because that software spends other
people's money. None of it is technically hard and none of it is skippable.

`/paid` publishes that table, including our own position in each queue. A
client told the truth about a six-week Meta review does not later discover it.

### What is genuinely required, per platform

Google needs a manager account, a developer token, and OAuth verification of
the `adwords` scope, which is classified sensitive rather than restricted, so
it needs Google's app review but not the third-party security assessment.
Microsoft issues a developer token from its own interface without a review
queue and is by a wide margin the least gated. Meta needs App Review with a
screencast per permission, Business Verification against incorporation
documents, a completed Data Protection Assessment, and a working data deletion
callback. LinkedIn is the strictest and rejection on a first attempt is normal.

Every one of them has a sandbox, so the entire build is exercised against the
real API before any approval lands. Approval flips a switch rather than
starting the work.

---

## The gate

**Nothing launches until the measurement is verified**, and this is the only
refusal in the whole product with no fallback.

It is not caution. A platform optimising toward a conversion it cannot see
performs *worse* than one given no target at all, because it optimises
confidently toward the wrong thing. So an account with broken tracking does
not get a reduced service. It gets a blocked one, and the client is told:
we will not spend your money until we can measure what it bought.

`measurement_readiness` in `analysis/ads.py` blocks on two things and degrades
on four. It blocks when no tag is present, and when a tag is present but a
test conversion did not come back, because a tag that fires into nothing is
worse than no tag: it looks like measurement.

The four it degrades on, each named as its own sentence rather than averaged
into a score:

- **Browser-side only.** Since Apple's tracking changes a large share of
  conversions never reach the platform, so results understate reality and
  bidding trains on the subset that survived.
- **No deduplication.** Server and browser events without a shared id count
  everything twice and the bidding overpays accordingly.
- **No value.** A ten pound order and a ten thousand pound order are the same
  event, so bidding chases whichever is easier.
- **No Consent Mode**, where any traffic is from the UK or the EEA. Google
  will not use data from visitors who declined and cannot model them without
  the cookieless signal, so a real share of conversions simply disappears.

And for lead generation, the biggest lever available to any account:
**capture the click id**. Store it on form submit, and when that lead becomes
a customer weeks later, send the real value back. The platform then optimises
for customers rather than enquiries, which is a different campaign on the same
budget. Almost no self-serve tool does this.

---

## The budget refusal

Automated bidding is a model and a model needs data to fit. Meta publishes
fifty conversions per ad set per week as the learning phase exit. Google's
smart bidding wants roughly thirty a month per campaign before it beats a
sensible manual bid. `SMART_BIDDING_MONTHLY = 30` is the floor, and it is
**per platform**, not across the account.

So six hundred a month against a seventy-five pound target across three
platforms is 2.7 conversions each, and no platform's bidding fits on 2.7.
`budget_viable` returns `False` with the arithmetic and four remedies, in the
order worth trying: concentrate on fewer platforms, raise the budget, raise the
target, or use bidding that does not need the volume.

An agency takes that budget, because its fee is a percentage of it. That one
difference is most of the argument for this desk existing, and saying it in the
first conversation is worth more than the retainer it costs.

`platform_count_for` derives how many platforms a budget actually feeds, and
the plan is built from that number rather than from the client's wish list.

---

## The reporting rule

**Platform-claimed conversions are never summed.**

Meta counts a sale it touched inside its own attribution window. Google counts
the same sale inside its. Both are honest by their own definitions and both
are counting one customer. Adding them produces more customers than the
business had, which is what every dashboard in this category prints.

`reconcile` keeps three numbers apart:

1. **Platform-claimed**, per platform, each carrying that label.
2. **Measured**, from the business's own data. This is the answer.
3. **Blended cost per acquisition**, total spend over real customers, which no
   attribution window can move.

`claimed_total_if_summed` exists only so the gap can be named. No screen
presents it as the conversion count.

A ratio of about one and a half claimed to measured is normal for two
platforms. Four is a tracking fault. A healthy claimed figure against zero
measured is almost always broken measurement rather than fictional sales.

And the only honest answer to "did the advertising work" is a geographic
holdout. Attribution models are opinions about credit, not measurements of
cause. Propose the test, say plainly when an account is too small to run one,
and never claim lift that was not measured that way.

---

## Everything is built paused

No advertising platform offers a transaction. A campaign, its ad groups, its
keywords and its creatives are four separate calls, and the network can drop
between any two of them.

The worst single outcome this product can produce is a campaign with a live
budget, no negative keywords and nobody watching, created because a build
failed at step three of five.

So: everything is created paused, every id is recorded as it is created, the
tree is read back and compared against the approved plan, and only then does a
**different tool with a different approval** activate it. A failure deletes in
reverse order, and anything that will not delete is paused and named.

`ads.launch` and `ads.set_budget` both carry the `ads_spend` tag, which
`ALWAYS_HUMAN` matches. No autonomy level on any plan authorises either.

---

## The three automatic pauses

Pausing somebody's advertising without asking is a serious act, so the list is
short and each entry costs money every minute it continues:

| | |
| --- | --- |
| `landing_page_down` | The destination stopped answering. Every click is wasted until somebody notices, and nobody notices on a Saturday. |
| `spend_no_conversions` | Past three times the target with nothing back, past the click floor. |
| `overspend` | The ceiling the client agreed was passed. Platform daily budgets are a guide, not a cap: Google can spend twice one in a day. |

Everything else asks first, including every budget rise.

---

## The failure catalogue

`analysis/ad_failures.py` enumerates twenty-nine failures across all six
stages, each with how it is detected, what happens without being asked, what
the person reads, and the route that still ships. It is read by agents at
runtime through `ads.failure_playbook` rather than being documentation.

The client's question was the right one: what happens when a Meta lead form
cannot be created? The entry says it. The form is built *before* the campaign
that references it, precisely so this fails early and cheaply. The failure is
classified: a missing permission asks for one-scope re-consent, a restricted
question type is dropped and the form rebuilt without it, a rejected privacy
URL is checked for being reachable and on the advertiser's own domain. And the
fallback still ships: a form on the advertiser's own site, which produces
better-qualified leads and a first-party record they own, with the campaign
switching objective from lead form to conversions.

That shape repeats through the catalogue. Detect early, name precisely, offer
the exact remedy, keep a route that works.

---

## Creative

`analysis/ad_specs.py` holds twenty placements with their dimensions,
character limits and safe zones.

The safe zone is the part of a frame the platform's own interface covers.
Nearly half a Reels frame is caption, profile and buttons. Every ad manager's
preview shows the full frame without any of that on top, which is why so many
adverts have their price behind a caption. A crop is decided once and seen a
hundred thousand times.

One render serves several placements: a single 1080 by 1920 covers Meta
Stories, TikTok and YouTube Shorts, so `required_renders` returns distinct
sizes and applies the tightest safe zone of the group.

Character limits are checked locally because every platform truncates
silently, and a headline cut at thirty characters mid-word is not a shorter
headline, it is a different and worse one you never see.

---

## Policy

`analysis/ad_policy.py` checks copy before submission. The asymmetry decides
the design: a disapproved advert costs an afternoon, and a pattern of them
restricts the ad account, which for Meta is sometimes permanent and ends a
client's advertising entirely through no fault of theirs.

Every rule carries the platform's own reasoning, because an advertiser told
"this breaks a rule" argues, and an advertiser told that Meta prohibits copy
asserting knowledge of a reader's personal characteristics rewrites the line.

Restricted categories are the one check in this repository that deliberately
errs toward firing. Everywhere else a false positive costs more than a miss.
Here over-declaring loses one campaign's targeting for an afternoon and
under-declaring gets the campaign pulled and the ad account marked, so the
patterns are wider and the file says why.

---

## Both objectives, together

Lead generation and ecommerce are built as one desk rather than sequenced,
because a business that starts as one and adds the other should not find the
desk only knows half its job.

They diverge in two places. Lead generation lives or dies on the click id and
offline conversion import, which turns "forty leads" into "three customers
worth eighteen thousand". Ecommerce lives or dies on the product feed, which
is a spreadsheet acting as creative and which loses products silently: a feed
can drop a fifth of its catalogue overnight to disapprovals while the campaign
reports as healthy. The commonest cause, every time, is a shop running a
promotion while the feed holds yesterday's prices.

---

## What breaks the browser-only rule, and why that is stated

Every other desk keeps working with the server switched off. Paid does not,
and cannot. You cannot spend money from `localStorage`, run an hourly kill
switch in a closed tab, or relay a server-side conversion from a page nobody
has open.

So paid requires an account, a database and scheduled work. The audit, the
fixes, the schema and the briefs are unaffected and still run with everything
disconnected. Paid is the first desk that does not, and the pages say so
rather than implying the free tier covers it.
