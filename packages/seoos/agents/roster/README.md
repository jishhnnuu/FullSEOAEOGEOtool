# The roster

One folder per desk. A desk is a manager agent and everyone who reports to it,
directly or through someone else.

```
shared/    10   The director the client talks to, and operations
search/    43   Everything under the head of search
content/   14   Everything under the head of content marketing
```

The loader walks this tree, so where a file sits changes nothing at runtime.
It changes what happens when somebody adds the fifth desk: a folder, not fifty
more files in one directory that nobody can tell apart.

## Adding a desk

Paid media and social are next. The pattern is fixed, which is the point of
having done it twice already:

1. **A folder here**, named for the desk.
2. **A lead** with `reports_to: account-director`, added to that agent's
   `delegates_to`. The client still talks to one agent. That does not change
   when the roster does.
3. **The team**, each with `reports_to` pointing at the lead or at another
   member of the same desk, declared tools, and guardrails whose first line is
   the one thing this agent will not do. The interface prints that line as a
   promise, so write it as one.
4. **Missions** under `missions/workflows/<desk>/`: one discovery that runs
   once and gates the rest, one production loop, one measurement pass.
5. **A file in `docs/offerings/`** that is the single place to read about it,
   and an entry in `docs/offerings/BASELINE.md` if the desk needs a rule the
   baseline does not already carry.
6. `make check && make lint && make test && make docs`.

## What every agent inherits

`HOUSE_RULES` in `agents/spec.py` is injected into every system prompt in this
tree, whichever desk it sits on. It is written once for exactly one reason: an
agency's standards restated across sixty-seven job descriptions drift, and the
first thing to drift is the part that says what not to do.

Those rules are the baseline, and `docs/offerings/BASELINE.md` explains what
each one is for and what it cost to learn. A desk may add to them. No desk may
weaken them.

## Where the work is split, and where it is shared

`search/` contains its own content team, under `content-strategist`. That is
deliberate and it is not a duplicate of `content/`. Search decides what to
publish so a page can rank and be cited. Content decides what the company
should be arguing in the first place. They share one production line, so the
same writer does not write differently depending on which desk commissioned
the piece. `docs/offerings/THE-ORGANISATION.md` has the full division.
