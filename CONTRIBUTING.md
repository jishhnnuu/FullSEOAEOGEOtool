# Contributing

## Where things live

Most changes fall into one of four places, and only one of them is Python.

**Changing how the platform practises SEO** means editing a markdown file in
`packages/seoos/agents/roster/`. The front matter is the contract the runtime
enforces; the body is the operating manual the model reads. No Python needed.

**Changing what work happens and in what order** means editing a YAML file in
`packages/seoos/missions/workflows/`.

**Adding a capability an agent can use** means a new tool in
`packages/seoos/tools/`. It must declare `mutates` and `risk` honestly; the
registry refuses to register a mutation that does not.

**Adding an integration** means a connector in `packages/seoos/connectors/`
plus an entry in `PROVIDER_SPECS`. The onboarding UI is generated from that,
so the connector appears in the product without a front-end change.

## Before opening a pull request

```bash
make check    # the roster, missions and tools all resolve
make test     # 141 tests
make lint     # ruff and tsc
```

`make check` is the one that catches the expensive mistakes: an agent
delegating to an agent that does not exist, a mission calling a tool that was
renamed, a delegation cycle.

## House style

**Prose, everywhere.** No em dashes or en dashes as sentence punctuation.
None of: delve, leverage as a verb, unlock, elevate, seamless, robust, "in
today's fast-paced world", "it's important to note". This applies to agent
prompts, docs, commit messages and UI copy. It is not a preference: the
platform's own quality gate enforces it on generated content, and it would be
absurd for the source to read worse than the output.

**Comments explain why, not what.** If a line needs a comment to say what it
does, rewrite the line.

**Safety rules are structural, not advisory.** If you find yourself adding a
flag that lets something bypass a gate, that is the wrong change.

## Things that must stay true

- A tool is the only way an agent touches the world.
- No autonomy level authorises a critical action.
- A tenant's data is reachable only through the tenancy choke point.
- Credentials are never returned by any endpoint, in any shape.
- The platform boots and produces a real audit with no API keys configured.
