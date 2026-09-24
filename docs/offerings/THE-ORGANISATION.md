# How the organisation runs

Eighty agents across three desks, one client-facing lead, and a set of rules
about who may hand work to whom. This file covers the hierarchy, what
happens when somebody subscribes, and how information moves between agents
without anybody having to hold it all in their head.

The offerings themselves are in `docs/offerings/SEO.md`,
`docs/offerings/CONTENT-MARKETING.md` and `docs/offerings/SOCIAL.md`.

The count is not maintained by hand anywhere it is shown. `headcount()` in
`apps/web/src/lib/org.ts` reads `roster.generated.ts`, and `placed()` counts
distinct keys rather than summing lengths, because a sum cannot see an agent
listed in two places. A hand-written exclusion list naming two desk leads once
missed the third, so the firm page reported eighty-one of eighty.

---

## One agent talks to the client

`account-director` is the only agent with `reports_to: client`. Everything
the client sees comes through it and every instruction they give enters
through it. Nothing else in the roster can address them directly.

That is enforced structurally, not by convention: the runtime validates the
delegation graph at boot, and an agent cannot invent a path that bypasses a
review gate.

```
                            client
                              │
                       account-director
                              │
   ┌───────────┬──────────────┼──────────────┬────────────────┐
strategist  content-director  reporter   crisis-manager   operations
 (SEO)       (content)                                    publisher
    │             │                                       qa-tester
 7 departments  5 groups                                  risk-officer
 39 agents      14 agents                                 compliance-officer
                                                          knowledge-manager
                                                          onboarding-specialist
                                                          resolver
```

Three offering leads sit under it. `strategist` owns search,
`content-director` owns content marketing, and `social-director` owns social.
When paid media is built it joins at the same level, and the client still talks
to one agent.

Social is downstream of content rather than beside it: it works from the point
of view the content desk already had approved instead of inventing a second
brand voice, and `docs/offerings/SOCIAL.md` has the full division.

### What account-director actually does

- **Decides what is worth the client's attention.** Its guardrails are
  explicit about this: never ask a question it could answer from data it
  already has, batch approvals, and if the numbers went down say so first,
  plainly, before any explanation.
- **Assigns work to the offering leads** and holds the budget across both.
- **Refuses to report activity as results.** Publishing twelve pieces is not
  an outcome.

---

## What happens when somebody subscribes

### Day 0 — connect

The client gives a URL. Everything below happens without them.

| Step | Who | Output |
| --- | --- | --- |
| Crawl the site | `onboard_site` mission | Pages, structure, technical state |
| Connect Search Console, Analytics, CMS | `onboarding-specialist` | Capability map: what the platform can and cannot do for this client |
| Baseline the numbers | `analyst` | The starting point every later claim is measured against |

Where a connector is missing, the capability map records it and every
downstream report names the degradation with its reason. A capability that
needs a credential says so; it never pretends to have succeeded.

### Days 1–3 — find out what is true

Both offerings research in parallel. They do not wait for each other.

```
strategist                          content-director
   │                                     │
 tech-auditor    crawl and checks     content-researcher   read the business
 keyword-researcher  demand           audience-analyst     read the buyer
 serp-analyst    the ranking sets     rival-reader         read the field
 competitor-intel  the field          voice-analyst        measure both voices
 gap-analyst     what is missing
```

`rival-reader` and `serp-analyst` both read competitor pages, so they share
results through the run context rather than fetching twice. Crawl output is
written once and read by both offerings.

### Day 3 — the client's first decision

`account-director` assembles one message containing:

- The technical findings worth acting on, ranked by what they would move
- The point of view from `narrative-architect`, with its ladder
- The tone recommendation, if `voice-analyst` produced a measurable one
- What could not be measured, and what would fix that

**This is one approval, not five.** The client agrees with the argument and
the priorities, or says where they are wrong.

### Week 1 onward — the loop

```
  weekly_growth_cycle ──┐
  content_engine ───────┼──→ review queue ──→ client approves ──→ publish
  content_amplify ──────┤
  fix_and_publish ──────┘
```

The client's standing job is the review queue and nothing else. Approvals are
batched. Five separate notifications about five alt tags is a failure of the
system, not a busy week.

### Week 8 onward — the verdict

`content-analyst` and `reporter` measure against what each piece was
commissioned to do. Under eight weeks a page has not had its chance, and the
honest output is "too early" rather than a number.

`compareRuns()` drops any score whose `measured` flag is false. A quarter
where nothing moved is reported as a quarter where nothing moved.

---

## Where search and content overlap, and who wins

Both desks have a content team. That is not a duplicate, and the difference
decides a real argument every week, so it is written down.

`content-strategist` and its team sit under **search**. `content-director` and
its team are **content marketing**. They share the production line on purpose.

```
                         account-director
                          /            \
                 strategist          content-director
                     |                      |
             content-strategist       narrative-architect
             (what to publish so      (what this company
              a page can rank)         should be arguing)
                     \                      /
                      \                    /
                       the same production line
              brief-writer, writer, fact-checker,
              humanizer, editor, brand-keeper
```

### The division

| | Search's content team | The content desk |
| --- | --- | --- |
| **Commissions from** | A measured gap, a decayed page, a query with demand | An approved point of view and an angle nobody took |
| **Owns** | Briefs from gaps, refreshes, internal links, authorship and trust signals, localisation, multimedia | The argument, the ladder, original research, hooks, distribution, the week-eight verdict |
| **Succeeds when** | The page ranks and gets cited | A person finishes reading it and remembers the argument |
| **Mission** | `content_production` | `content_engine` |
| **Gate** | The keyword model and the gap analysis | `content_discovery`, approved once by the client |

### Who wins when both want the same page

- **What it says**: the content desk. The point of view is approved once and
  everything ladders to it, including anything search commissions.
- **Where it sits, how it is marked up, what it links to**: search. That is a
  technical decision and the content desk has no measurement for it.
- **Whether it ships**: neither. It goes in the one review queue like
  everything else, and the client approves it.
- **Who writes it**: the same writer, either way. That is the whole reason the
  production line is shared. A client should not be able to tell which desk
  commissioned a piece by reading it.

The failure this prevents is the ordinary agency one: an SEO team and a
content team each briefing the same freelancer, neither knowing, and the
client receiving two articles about the same thing in different voices in the
same month.

### The client sees one thing

Both desks report through `account-director`, and there is one review queue,
one point of view and one brand profile. The division above is how the work is
organised, not how it is presented. A client who wanted to know which desk
wrote something would have to ask.

---

## How information moves

Three mechanisms, and no agent has to hold the whole picture.

**Run context.** Mission steps declare `needs` and `context`. The runtime
assembles exactly the prior outputs a step asked for and injects them. A step
that did not ask for something does not see it, which keeps prompts small and
stops an agent reasoning from stale data.

**The fact ledger.** `brand.add_facts` and `brand.facts`. Everything
`content-researcher` and `data-journalist` establish about a business is
written here with the page it came from. Writers read it instead of
inventing. Anything not in the ledger needs a source before it is written.

**The brand profile.** `brand.save_profile` and `brand.check_voice`. When a
client accepts a tone recommendation, the targets are written here and every
future draft is gated against them. A tone decision that is not enforced at
the gate is a document nobody reads twice.

---

## Who may hand work to whom

Delegation is declared in each agent's `delegates_to` and validated at boot.
The validator runs a three-colour depth-first search, so a diamond — two
paths reaching the same agent — is legal, and only a genuine cycle is
rejected. Without that, a mission could loop forever.

An agent's tools are declared too, and the registry refuses a spec that
references a tool that does not exist. An agent can only do a job it has the
tools for.

---

## Where a human is required

`agents/policy.py` maps risk to the minimum autonomy level.

| Risk | What it covers | Who approves |
| --- | --- | --- |
| `none`, `internal` | Reading, analysing, writing platform records | Nobody |
| `low` | Drafts, queue entries, briefs | Nobody, at higher autonomy |
| `medium` | Meta changes, internal links | Client, batched |
| `high` | Publishing, outreach drafts, listings | Client, always |
| `critical` | Anything that could damage a site | Client, always. No autonomy level auto-approves it. |

`NEVER_ALLOWED` is never overridable. `ALWAYS_HUMAN` always needs a person.

---

## What the client is asked to do, in total

1. Connect their accounts, once.
2. Approve the strategy and the point of view, once.
3. Approve finished work in the review queue.

Anything that adds a fourth item is a regression. The whole product claim is
that they approve rather than execute, and a feature that ends in "and then
you paste this into your CMS" is unfinished unless no API exists, in which
case the platform says so plainly.

---

## Adding the next offering

Social and paid ads come next. The pattern is fixed, which is the point of
having done it twice:

1. **A lead** with `reports_to: account-director`, added to that agent's
   `delegates_to`.
2. **Agents** in departments, each with declared tools and an honest `never`
   list.
3. **Tools** that measure rather than assert, with a risk level so the policy
   engine can reason about them.
4. **Missions**: one discovery that runs once and gates the rest, one
   production loop, one measurement pass.
5. **A file in `docs/offerings/`** that is the single place to read about it.
6. `make check && make lint && make test && make docs`.

The client still talks to one agent. That does not change when the roster
does.
