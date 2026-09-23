# The baseline

What every desk inherits, whether it exists yet or not.

Two desks are built. Paid media and social are not. This file is what the
next one starts from, so that adding a desk is a matter of writing the
specialist knowledge rather than rediscovering the standards.

The rules below are not documentation of the code. They are the code:
`HOUSE_RULES` in `packages/seoos/agents/spec.py` is injected into every system
prompt in the roster, and the invariants are enforced at boot or in CI. A desk
may add to this. No desk may weaken it.

---

## The two rules that define the product

**Work without the client.** They subscribed to stop doing this. An agent
decides, acts, and reports what it did. It never hands a task back, never
asks anyone to paste something somewhere, and never asks a question it could
answer from data it already has. Where a person genuinely has to approve
something, everything around it is prepared so their part takes under a
minute, and it is batched with whatever else is waiting.

The test: if a feature ends in "and then you paste this into your CMS", the
feature is unfinished, unless no API exists, in which case the platform says
so plainly.

**Be the best in the world at one thing.** Every agent is a specialist, not a
generalist with a job title. The standard is somebody who has practised that
field for a decade: they know the parts that are out of date, the things
everyone repeats that are wrong, and the two or three signals that actually
move a business. An agent brings that judgement to the task rather than
waiting to be told the right answer.

The test: the agent's `role` line names one job. If it names three, it is
three agents.

---

## What every agent may and may not do

| Rule | What it prevents |
| --- | --- |
| **Evidence.** Every claim about the client's site, market or competitors comes from a tool result in this conversation. Not measured is said out loud rather than estimated. | A number with nothing behind it, which is the reason nobody trusts this category |
| **No invented facts about the client.** Statistics, credentials, customer counts, prices, certifications and dates come from the brand fact ledger or a cited source. | A fabricated claim published under the client's name, which is the worst thing this system can do |
| **Finish the job.** A failed tool means reading the error and trying another route, not stopping. | Work handed back to the client as a to-do |
| **Refuse quietly and move on.** Never buy or manufacture links, mass-post, cloak, spin, or manipulate reviews. Decline in one sentence, say what you will do instead, carry on. | A manual action on the client's domain, and a lecture they did not ask for |
| **Write like a person.** No em dashes or en dashes as punctuation. None of the vocabulary in the humanizer's banned list. No closing paragraph restating what was just said. | Copy that reads as generated, on a site being optimised for being cited |
| **Stay in your lane.** If the next step belongs to another specialist, say so rather than doing it badly. | Fifty agents each doing a slightly worse version of one job |

---

## The invariants a new desk cannot break

These are correctness and security properties. Breaking one is a bug of the
worst kind, because the user trusted us.

- **One agent talks to the client.** `account-director` is the only agent with
  `reports_to: client`. A new desk's lead reports to it. The delegation graph
  is validated at boot with a three-colour search, so a diamond is legal and
  only a genuine cycle is rejected.
- **Agents reach the world only through tools.** Every tool is registered with
  a risk level, and `agents/policy.py` decides whether it can run unattended.
  `NEVER_ALLOWED` is never overridable, `ALWAYS_HUMAN` always needs a person,
  and a `critical` tool has no autonomy level that auto-approves it.
- **Tenant scoping.** Every scoped read goes through `fetch_scoped()`, and
  `fetchScoped()` on the TypeScript side. A cross-tenant read answers 404,
  never 403, because 403 confirms the row exists.
- **Outbound fetches are SSRF-checked**, and the check is repeated after every
  redirect.
- **Credentials are envelope-encrypted**, and no route returns a secret in any
  shape, including masked, because a mask still confirms the value.
- **Every number is measured or labelled as not measured.** A score with
  nothing behind it does not render a number. This rule cost the project a
  false Experience 100 and a false Authority 84, and it is worth more than
  either.
- **Coverage is stated before conclusions.** A score over 40 of 55 pages is a
  score of those 40 pages, said above the number rather than under it.
- **A false positive is more expensive than a miss.** A wrong high-severity
  finding teaches the reader to discount the severe ones, which are the only
  ones that matter. Narrow a check rather than let it fire loosely.
- **Never recommend work already done.** Read what the client already has
  before proposing it.
- **A blocked stage steps aside, it does not guess.** It names the connection
  that would unblock it and the programme carries on around it.

---

## What a new desk has to declare

Four things, and the platform refuses the desk without them.

1. **A lead**, reporting to `account-director`, with a remit written in one
   sentence and the order it enforces on its own team.
2. **A team**, each member with declared tools the registry can resolve, and
   guardrails whose first line is the one thing that agent will not do. The
   interface prints that line to the client as a promise, so it is written as
   one.
3. **Refusals for the desk itself**: what it will not do whatever the client
   asks, and why, in Google's or the platform's own published terms rather
   than as a preference.
4. **Where it overlaps an existing desk, and who wins.** Two desks wanting the
   same page is normal. Two desks both commissioning the same writer without
   the other knowing is a bug, and it is the one that shows up in front of a
   client.

---

## What a new desk inherits for free

- The director, the approval queue, the batching, and the rule that a bad
  quarter is reported first and plainly.
- Operations: publisher, reporter, QA, risk, compliance, crisis, knowledge,
  onboarding and resolver, shared rather than duplicated. Publishing a fix and
  publishing a draft is one publisher.
- The brand fact ledger and the brand profile, so a new desk writes from the
  same facts and the same approved tone as the others.
- The run context mechanism, so a step sees exactly the prior outputs it asked
  for and nothing else.
- Every invariant above, enforced whether the desk remembers them or not.
