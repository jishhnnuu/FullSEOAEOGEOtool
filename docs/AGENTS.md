# The agency

53 agents across 11 departments. Each is a markdown file in
`packages/seoos/agents/roster/` with YAML front matter declaring what it may
use and a body that is its operating manual.

## Why files rather than code

The people who know how an SEO engagement should run are not necessarily the
people who write Python. Changing how the platform practises SEO should be a
pull request against a markdown file, not a refactor.

The front matter is the contract the runtime enforces: which tools, which
model tier, what it may delegate to, what it must never do, and its cost
ceiling. An agent cannot invent a delegation path that bypasses a review
gate, or call a tool it was not given.

## House rules

Every prompt is prefixed with the same operating standards, injected once
rather than restated fifty times and left to drift:

- **Evidence.** Every claim about the client's site or market comes from a
  tool result in the conversation. "Not measured" beats an estimate with a
  number attached.
- **No invented facts.** Statistics, credentials, prices and dates come from
  the brand fact ledger or a cited source.
- **Finish the job.** Read the actual error, try another route, escalate only
  what no automated path can produce.
- **Refuse quietly.** Link schemes, cloaking, fake reviews, mass posting:
  decline in one sentence, say what you will do instead, move on.
- **Write like a person.** No dash punctuation, no "delve", "leverage",
  "unlock", "seamless", "robust", no closing paragraph that restates the piece.

## The roster

### Leadership
| Agent | Job |
|---|---|
| **Account Director** | Decides what is worth the client's attention. Batches approvals, leads with results, delivers bad news first |
| **Resolver** | Climbs the seven-rung ladder so nothing stops. Holds binding decision authority. May never weaken a gate |

### Strategy
| Agent | Job |
|---|---|
| **Head of Strategy** | Sequences work by value over effort. Quick wins before new content, always |
| **Data Analyst** | Establishes what is actually true from first-party data. Separates cause from correlation |
| **Demand Forecaster** | Projects traffic and revenue with ranges and stated assumptions, then checks them |
| **Cost Controller** | Decides whether work is worth its spend. Stops runaway loops |

### Research
Topic Architect, Keyword Researcher, SERP Analyst, Content Gap Analyst,
Competitive Intelligence.

### Technical
Technical SEO Lead, Performance Engineer, Structured Data Engineer,
Indexation Manager, Migration and Regression Guard, International SEO
Engineer, Crawl Budget Analyst.

### Content (the largest department, because content is what the client approves)
Brand Voice Keeper, Content Strategist, Content Brief Writer, Writer, Editor,
Fact Checker, Line Editor, Content Refresher, Internal Link Architect,
Multimedia Producer, Localisation Specialist, Trust and Authorship Lead.

### AEO
Answer Engine Strategist, AI Visibility Analyst, Citation Engineer,
Entity Architect.

### Off-page
Digital PR Lead, Link Prospector, Outreach Specialist, Link Quality Auditor,
Partnership and Listings Manager.

### Local
Local SEO Manager, Review Manager, Citation Manager, Map Pack Analyst.

### Commerce, Conversion
E-commerce SEO Specialist, Conversion Specialist.

### Operations
Publisher, QA Lead, Compliance Officer, Risk Officer, Reporter,
Onboarding Specialist, Crisis Manager, Knowledge Manager.

## The agents that exist because of a gap, not a discipline

Most rosters stop at the disciplines. These five exist because the workflow
breaks without them:

- **Resolver.** Without it, every missing integration stops a cycle.
- **Cost Controller.** Autonomous systems usually fail commercially before
  they fail technically.
- **Crisis Manager.** A traffic collapse needs a different order of
  operations from routine work, and the instinct to change things fast is
  what turns a recoverable situation into a permanent one.
- **Knowledge Manager.** Without it the team makes the same discovery every
  month and never gets better at this specific client.
- **Risk Officer.** Someone has to be able to say no to the thing that would
  work this quarter and lose the site next year.

## The seven-rung ladder

No agent may fail, skip a task, or ask the client for anything without going
through the resolver first. It works down these rungs and logs each one:

1. **Read the actual error.** Most escalations are a misread status code.
2. **Retry differently.** Other parameters, rendered instead of raw, smaller batch.
3. **Another route.** No CrUX? Lighthouse. No keyword API? Search Console.
   No CMS write access? A pull request.
4. **Decompose.** Forty of fifty pages fixed beats zero.
5. **Lower fidelity.** A weaker answer, labelled as weaker.
6. **Defer with a changed approach.** Never the same attempt on a loop.
7. **The smallest human atom.** One physical action, everything else prepared.

Two things it may never do, whatever the pressure: weaken a safety gate, or
resolve toward a tactic that risks a penalty.

## Delegation

The org chart is enforced. `strategist` may delegate to fifteen specialists;
`editor` may delegate to the fact checker and the line editor; `writer`
delegates to nobody. Depth is capped, cycles are detected at load time, and
the roster fails validation if an agent references an agent or tool that does
not exist.
