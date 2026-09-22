# The content marketing offering

Everything about this offering in one place: what it does, which agents do it,
how they hand work to each other, what the client sees, and where the
boundaries are. If you are changing how the platform practises content
marketing, this is the file to read first.

The SEO offering has its own file at `docs/offerings/SEO.md`. How the two
run alongside each other, and what happens when somebody subscribes, is in
`docs/offerings/THE-ORGANISATION.md`.

---

## What this offering actually sells

An agency's content team, without the agency. A company connects its site,
approves a point of view once, and then approves finished drafts. Everything
between those two approvals happens without them.

What separates it from the fifty tools that generate articles:

1. **It reads the business before it writes about it.** No brief is written
   until something has read the company's pricing page, its customer stories
   and its support documentation.
2. **It reads the field.** Not the SERP listing, the actual pages. Length,
   depth, format, who signs them, what they all leave out.
3. **Its tone advice is measured.** A recommendation to change how a company
   writes arrives with the client's number and the rivals' median beside it,
   or it does not arrive at all.
4. **It has a point of view.** One argument per client, written down, with
   everything laddering to it.

The failure this is built to prevent: production quality applied to the wrong
idea, decided in the first hour by somebody who had not read anything.

---

## The org chart

```
                         client
                           │
                    account-director          ← the only agent the client talks to
                           │
          ┌────────────────┴────────────────┐
     strategist                      content-director
    (SEO offering)                 (this offering)
                                          │
        ┌──────────────┬──────────────┬───┴──────────┬─────────────────┐
        │              │              │              │                 │
   RESEARCH        CREATIVE      PRODUCTION    DISTRIBUTION       MEASUREMENT
        │              │              │              │                 │
 content-researcher  narrative-   content-      distribution-    content-analyst
 audience-analyst    architect    strategist      planner
 rival-reader          │          brief-writer      │
 voice-analyst    concept-lab     writer         repurposer
                  angle-finder    fact-checker
                  hook-writer     humanizer
                  data-journalist editor
                  story-editor    brand-keeper
```

Fourteen agents are new in this offering. The production line
(`brief-writer`, `writer`, `fact-checker`, `humanizer`, `editor`,
`brand-keeper`, `content-strategist`) is shared with the SEO offering
deliberately: the same writer should not write differently depending on which
product line commissioned the piece.

---

## The agents

### Research — find out what is true before deciding anything

| Agent | What it owns | The rule it enforces |
| --- | --- | --- |
| `content-researcher` | What the company sells, to whom, what it can prove | Every claim recorded with the page it came from |
| `audience-analyst` | Who the buyer is and what triggers the search | A persona the search data could contradict |
| `rival-reader` | The pages you compete with, actually fetched and measured | Median and range, never one example |
| `voice-analyst` | How the client writes against how the field writes | No verdict on fewer than three measurable rivals |

### Creative — decide what is worth saying

| Agent | What it owns | The rule it enforces |
| --- | --- | --- |
| `narrative-architect` | The point of view, and the ladder everything hangs from | Arguable, or it says nothing |
| `concept-lab` | Divergent idea generation, twenty at a time | Quantity before filtering, never the reverse |
| `angle-finder` | The entry into a topic nobody took | Read the ranking set before claiming an angle is open |
| `hook-writer` | Title and the first three sentences | Ten titles before choosing one |
| `data-journalist` | Original research the company owns | Method and sample size beside every number |
| `story-editor` | Whether a person would finish it | Ordinary is a failure state |

### Distribution and measurement — the half most operations skip

| Agent | What it owns | The rule it enforces |
| --- | --- | --- |
| `distribution-planner` | Where a piece goes, decided before it is written | Named destinations, never "social" |
| `repurposer` | The four assets already inside a finished piece | Rewrite per format, never resize |
| `content-analyst` | What the work actually did | Flat reported as flat; losers named |

### The lead

`content-director` owns the offering. It enforces the order (research, then
audience, then field, then voice, then decide) and it is the agent that
refuses to commission anything before the point of view is approved.

---

## The three missions

### `content_discovery` — runs once, at the start

Budget $22, about an hour. Nothing else in the offering runs until this has
finished and the client has approved its output.

```
report.site_state
  └─ research.company_profile
       └─ content-researcher   read the business
            └─ audience-analyst      establish the buyer
                 └─ rival-reader          read the field
                      └─ voice-analyst        measure both voices
                           │
              concept-lab ──┴─→ narrative-architect   decide the point of view
                                     └─ content-director → ONE client approval
```

Output: a written point of view with the consensus, the flaw, this company's
alternative and a named enemy. Plus the ladder, and a tone recommendation if
the comparison produced one.

The gate at the end is real. `content_engine` does not run without it.

### `content_engine` — runs per piece

Budget $24, about seventy minutes.

```
angle-finder → brief-writer → hook-writer → writer
    → fact-checker → humanizer → story-editor → editor
    → distribution-planner → client review queue
```

Three quality gates rather than one, checking different things:
`fact-checker` asks whether it is true, `editor` asks whether it is correct
and findable, `story-editor` asks whether anyone would finish it. The third
is the one most operations do not have, and it is why so much published
content is accurate, optimised and inert.

### `content_amplify` — runs after publication

Budget $12. Pulls the derived assets out, works the unlinked mentions, and
eight weeks later reports honestly on whether any of it mattered.

---

## The measurement that makes the tone advice real

`packages/seoos/analysis/voice.py` computes a fingerprint from text. No model
judgement anywhere in it.

| Measure | What it catches |
| --- | --- |
| `rhythm` | Coefficient of variation of sentence length. Human prose sits between about 0.45 and 0.8. Below that reads flat, and it is the most reliable machine-writing tell after the dash. |
| `we_per_1k` vs `you_per_1k` | A brochure against a useful page |
| `filler_per_1k` | The vocabulary that signals a page written to fill a slot |
| `concrete_per_1k` | Whether the text carries facts or describes itself |
| `hedges_per_1k` | Copy that survived a legal review and helps nobody |
| `reading_grade`, `passive_ratio`, `lexical_density` | The usual, measured rather than asserted |

Two refusals are built in, and both matter more than any number the module
produces:

- **Under 120 words**, ratios are arithmetic rather than evidence. The
  fingerprint reports `measured: false` and says why.
- **Fewer than three readable rival pages**, `compare()` returns no verdict.
  Two pages is one writer's habit. Calling it a norm and asking a client to
  rewrite their site against it would be the most expensive kind of wrong.

Differences below a materiality threshold are not reported at all. A tool
that lists every tiny gap sounds certain about nothing.

---

## The five new tools

All in `packages/seoos/tools/research_tools.py`, category `research`. None of
them mutate state, so none needs an approval gate.

| Tool | What it reads |
| --- | --- |
| `research.company_profile` | Home, about, pricing, product, customer pages. Reports what it could not find. |
| `research.voice_fingerprint` | One page or one body of text |
| `research.rival_content` | Up to ten competitor pages, measured |
| `research.voice_gap` | Client against rivals, differences past threshold only |
| `research.story_seeds` | What this business can write about that nobody else can |

---

## What the client is asked to do

Twice, in a normal month.

1. **Approve the point of view.** Once, at the start. They agree with the
   argument or say where it is wrong.
2. **Approve finished drafts** in the review queue.

That is the whole contract. Anything that adds a third thing to their list is
a regression in this offering, not a feature.

---

## Where this stops

Stated plainly so nobody has to discover it in front of a client.

- **It does not invent facts.** If the fact ledger is empty, the drafts will
  be thin, and `content-researcher` reports that as the headline finding
  rather than letting a writer paper over it.
- **It cannot read Google's results pages.** Search engines block automated
  queries and their terms forbid it. Ranking difficulty comes from the
  measured signals available, and anything presented as a prediction says so.
- **A tone verdict needs a readable field.** Sites whose competitors are all
  JavaScript-rendered or bot-protected will get no verdict, and the honest
  output is to say so.
- **Distribution drafts, it does not send.** Outreach opens the client's own
  mail client with the fields filled, as it does in the SEO offering. The
  sender's domain is theirs, not ours.
