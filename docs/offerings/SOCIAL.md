# The social offering

Everything about this desk in one place. Its siblings are `docs/offerings/SEO.md`
and `docs/offerings/CONTENT-MARKETING.md`, and how the desks run together is in
`docs/offerings/THE-ORGANISATION.md`. What every desk inherits is in
`docs/offerings/BASELINE.md`.

---

## The one fact this desk is built around

**Impressions and reach are private on every platform.** They are computed by
the platform for the account owner and exposed only through that owner's own
token. There is no API, no partner tier and no scraper that returns them for an
account you do not own.

Every competitor reach figure a client has ever been shown, by any tool or any
agency, was estimated from follower count. Almost none of them said so.

So this desk does not print one. What it prints instead is the comparable a
strategist actually computes by hand: the **performance multiple**, a post's
engagement against that account's own median. It removes follower count from
the comparison entirely, which is what makes a 4,000-follower account's winner
legible next to a 400,000-follower account's.

---

## What each platform actually allows

Four of ten permit a competitor teardown. The map lives in
`packages/seoos/connectors/social.py` and is mirrored for the browser in
`apps/web/src/lib/social-platforms.ts`, and it is on screen at
`/app/sites/[id]/social/platforms` before any work is promised.

| Platform | Own account | Competitor posts | Access | Why not |
| --- | --- | --- | --- | --- |
| YouTube | Yes | Yes: views, likes, comments, duration, tags | Free key | — |
| Instagram | Yes | Yes: likes, comments, type, caption, followers | Free | Business Discovery only returns Business and Creator accounts. No impressions, reach or saves, ever. |
| Reddit | Yes | Yes: score, ratio, comments, subreddit | Free | Vote counts are fuzzed by Reddit on purpose. |
| X | Yes | Yes: likes, reposts, replies, quotes | Paid, about $200/mo | Impression counts are returned only for the authenticated account. |
| TikTok | Yes | **No** | Gated | The Research API is restricted to approved academic researchers and forbids commercial use. Everything else on the market is scraping. |
| Facebook Pages | Yes | **No** | Gated | Page Public Content Access has been case-by-case since 2018 and is granted almost only for research and moderation. |
| LinkedIn | Yes | **No** | Gated | No API returns another company's Page posts. |
| Pinterest | Yes | **No** | Free | No competitor endpoint. |
| Threads | Yes | **No** | Free | Own posts and insights only. |
| Snapchat | **No** | **No** | None | No organic content API exists at all. |

A client reads this before the engagement starts. It costs a slide and buys the
rest of the relationship, because somebody who has been shown an invented
number once recognises the honesty immediately.

---

## The measurement core

`packages/seoos/analysis/social.py`, ported line for line to
`apps/web/src/engine/social.ts` so the two engines cannot disagree. No model
call anywhere in it: counting, ratios and medians.

| Measure | What it answers |
| --- | --- |
| **Performance multiple** | Which posts worked, normalised against that account's own median so follower count drops out |
| **Engagement rate** | The practitioner's cross-account comparable, engagement over followers |
| **Format multiple** | Whether reels, carousels or stills earn their place, per account |
| **Hook archetype** | Which of nine openings the winners use, read from the first line only |
| **Lead intent** | How much call-to-action machinery a post carries, zero to five |
| **Share of voice** | Share of posts against share of engagement, and the gap between them |
| **Comment ratio** | Comments per like, which is where conversations and therefore enquiries start |

### The five refusals, enforced in both engines

- **Under 12 posts**, there is no median and none is reported.
- **Under 3 winners**, a shared trait is a coincidence and no pattern is called.
- **Under 4 posts in a format**, that format gets no verdict.
- **Under 2 readable accounts**, there is no share of voice. A share of one is
  not a share.
- **Without a public follower count**, there is no engagement rate, and the
  platform goes in a not-scored list rather than being ranked on something else.

Two more that are absolute: engagement never includes views, because a view is
a distribution outcome and a like is an audience decision; and lead intent
needs ten comments before the comment ratio counts, because one comment on ten
likes is a 0.1 ratio and also just one comment.

---

## The desk

Thirteen agents under `social-director`, which reports to `account-director`
like every other desk lead. The roster is in
`packages/seoos/agents/roster/social/`.

| Group | Agents |
| --- | --- |
| Research | `social-analyst`, `platform-strategist`, `trend-scout`, `audience-listener` |
| Creative | `hook-architect`, `format-designer`, `visual-director` |
| Production | `short-form-writer`, `social-editor`, `scheduler` |
| Community | `community-manager` |
| Measurement | `social-performance-analyst` |

The most valuable agent is `platform-strategist`, and the most valuable
sentence it produces is usually "stop posting there". A business spreading four
posts a week across six platforms is doing nothing well, and no agency ever
gets paid to recommend less work.

---

## The missions

| Mission | Runs | What it does |
| --- | --- | --- |
| `social_discovery` | Once, gates the rest | States the limits, tears down every readable competitor, decides which platforms to keep and which to leave, and produces one client decision |
| `social_engine` | Per batch | Hooks from measured archetypes, format from measured multiples, asset briefs, captions from the fact ledger, three gates, then the calendar |
| `social_pulse` | Recurring | Drafts every reply, escalates what a person must answer, and at week eight reports against the client's own baseline with the losers named |

---

## Where this overlaps the other desks

Social is **downstream of content**, not beside it. It works from the point of
view the content desk already had approved rather than inventing a second brand
voice at a different desk, which is the single most common failure in agency
social. The four derived assets inside a finished content piece are pulled once
by `repurposer`, not twice.

Where social research turns up demand nobody has satisfied, usually a question
asked repeatedly under a competitor's popular post, it goes to the content desk
as a subject rather than being written twice.

---

## Where this desk stops

- **No competitor impressions, reach or saves.** Not on any platform, not at
  any price. Stated first because it is the thing clients have been misled
  about.
- **No TikTok, Facebook, LinkedIn, Pinterest, Threads or Snapchat competitor
  data.** The platforms do not publish it. Six of ten, named rather than
  quietly skipped.
- **Nothing posted or replied to without a person.** At any autonomy level. The
  account is the client's, the audience is theirs, and a post cannot be
  recalled.
- **No claim about which platform produced a competitor's leads.** Nobody
  outside that business can see it. Call-to-action density measures where they
  are trying, which is not where they are succeeding, and the screens say so.
- **No best-time-to-post heatmap built from other people's timezones.** Posting
  windows from a competitor are reported in UTC and labelled. The real answer
  comes from the client's own account analytics once connected.
- **No asset generation.** `visual-director` writes the brief. A person or a
  tool the client already has makes the asset, and the brief says which.
