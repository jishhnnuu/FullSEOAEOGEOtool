"""Agent specifications.

An agent is a markdown file with YAML front matter. The front matter is the
contract the runtime enforces (which tools, which model tier, what it may
delegate to, what it must never do); the body is the operating manual the
model reads.

Keeping agents as files rather than code means an SEO lead who is not a
Python engineer can change how the platform practises SEO, which is the
point: the expertise belongs in the roster, not in the executor.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from seoos.core.errors import ValidationFailed

FRONT_MATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)

DEPARTMENTS = (
    "leadership", "strategy", "research", "technical", "content",
    "aeo", "offpage", "local", "commerce", "conversion", "operations",
    # The content marketing offering. Separated from "content" on purpose:
    # that department produces pages for search, these decide what a company
    # should say and why anyone would care.
    "creative", "distribution",
)


@dataclass
class AgentSpec:
    key: str
    name: str
    role: str
    department: str
    summary: str
    system_prompt: str

    tools: list[str] = field(default_factory=list)
    model_tier: str = "standard"
    model_override: str | None = None
    temperature: float = 0.3
    max_tokens: int = 8000
    max_iterations: int = 12

    # Who this agent may hand work to. Enforced by the runtime, so an agent
    # cannot invent a delegation path that bypasses a review gate.
    delegates_to: list[str] = field(default_factory=list)
    reports_to: str | None = None

    # Context the runtime assembles and injects before the agent starts.
    reads: list[str] = field(default_factory=list)

    # Structured output contract. When set, the agent is asked for JSON and
    # the result is validated before anything downstream consumes it.
    output_schema: dict[str, Any] | None = None

    guardrails: list[str] = field(default_factory=list)
    success_criteria: list[str] = field(default_factory=list)
    # What this agent is explicitly not allowed to do, in prose that goes
    # into the prompt and in codes the runtime can check.
    never: list[str] = field(default_factory=list)

    cost_ceiling_usd: float = 3.0
    enabled: bool = True
    tags: list[str] = field(default_factory=list)

    @classmethod
    def from_markdown(cls, text: str, *, source: str = "<inline>") -> AgentSpec:
        match = FRONT_MATTER.match(text)
        if not match:
            raise ValidationFailed(f"Agent file {source} has no YAML front matter")
        try:
            meta = yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError as exc:
            raise ValidationFailed(f"Agent file {source} has invalid front matter: {exc}") from exc
        body = match.group(2).strip()

        missing = [f for f in ("key", "name", "role", "department") if not meta.get(f)]
        if missing:
            raise ValidationFailed(f"Agent file {source} is missing: {', '.join(missing)}")
        if meta["department"] not in DEPARTMENTS:
            raise ValidationFailed(
                f"Agent {meta['key']} has unknown department {meta['department']!r}"
            )
        if not body:
            raise ValidationFailed(f"Agent file {source} has an empty system prompt")

        return cls(
            key=meta["key"],
            name=meta["name"],
            role=meta["role"],
            department=meta["department"],
            summary=meta.get("summary", meta["role"]),
            system_prompt=body,
            tools=list(meta.get("tools", []) or []),
            model_tier=meta.get("model_tier", "standard"),
            model_override=meta.get("model"),
            temperature=float(meta.get("temperature", 0.3)),
            max_tokens=int(meta.get("max_tokens", 8000)),
            max_iterations=int(meta.get("max_iterations", 12)),
            delegates_to=list(meta.get("delegates_to", []) or []),
            reports_to=meta.get("reports_to"),
            reads=list(meta.get("reads", []) or []),
            output_schema=meta.get("output_schema"),
            guardrails=list(meta.get("guardrails", []) or []),
            success_criteria=list(meta.get("success_criteria", []) or []),
            never=list(meta.get("never", []) or []),
            cost_ceiling_usd=float(meta.get("cost_ceiling_usd", 3.0)),
            enabled=bool(meta.get("enabled", True)),
            tags=list(meta.get("tags", []) or []),
        )

    @classmethod
    def from_file(cls, path: Path) -> AgentSpec:
        return cls.from_markdown(path.read_text(encoding="utf-8"), source=str(path))

    def render_system_prompt(self, context_blocks: dict[str, str] | None = None) -> str:
        """Assemble the final system prompt.

        Order matters: house rules first so they are never buried, then the
        agent's own manual, then the live context for this specific site.
        """
        parts = [HOUSE_RULES, f"# You are {self.name}\n\n**Role:** {self.role}\n", self.system_prompt]

        if self.never:
            parts.append(
                "## Absolute limits\n\nYou must never:\n"
                + "\n".join(f"- {n}" for n in self.never)
            )
        if self.guardrails:
            parts.append(
                "## Guardrails\n\n" + "\n".join(f"- {g}" for g in self.guardrails)
            )
        if self.success_criteria:
            parts.append(
                "## What finishing looks like\n\n"
                + "\n".join(f"- {s}" for s in self.success_criteria)
            )
        for title, block in (context_blocks or {}).items():
            if block and block.strip():
                parts.append(f"## {title}\n\n{block.strip()}")
        return "\n\n".join(parts)


# Rules every agent in the roster operates under. Written once, injected
# everywhere, because an agency's standards should not be restated (and
# drift) across fifty job descriptions.
HOUSE_RULES = """\
# Operating standards

You are one specialist inside an autonomous search growth team that works on
behalf of a paying client. The client's business is the only thing that
matters; your own output volume is not an achievement.

**Evidence.** Every claim you make about the client's site, their market or
their competitors must come from a tool result in this conversation. If you
did not measure it, you do not assert it. Say "not measured" rather than
estimating, and never present a guess with a number attached to it.

**No invented facts about the client.** Statistics, credentials, customer
counts, prices, certifications and dates may only come from the brand fact
ledger or a cited external source. A fabricated claim published under the
client's name is the single worst thing this system can do.

**Finish the job.** If a tool fails, read the actual error and try a
different route before giving up. Ask a human only for something no
automated path can produce, and only after you have prepared everything
around it so their part takes under a minute.

**Refuse quietly and move on.** Never buy, exchange or otherwise manufacture
links; never mass-post to communities; never cloak, doorway, scrape-and-spin,
or manipulate reviews; never publish content that misrepresents who wrote it
in a context where authorship is material. If asked, decline in one sentence,
say what you will do instead, and carry on.

**Write like a person.** No em dashes or en dashes as sentence punctuation.
No "delve", "leverage" as a verb, "unlock", "elevate", "seamless", "robust",
"in today's fast-paced world", "it's important to note". No closing paragraph
that restates what you just said. Short sentences beat long ones.

**Stay in your lane.** Do the job described below. If the right next step
belongs to another specialist, say so in your output rather than doing it
badly yourself."""
