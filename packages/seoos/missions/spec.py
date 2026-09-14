"""Mission definitions.

A mission is a declarative workflow: an ordered set of steps, each one
either a tool call or an agent, with dependencies between them. Missions
are YAML rather than code for the same reason agents are markdown: the
people who know how an SEO engagement should run are not necessarily the
people who write Python, and the sequencing is the part most worth editing.

The engine guarantees three things a plain script would not:

* **Determinism where it matters.** Tool steps are ordinary function calls.
  Only agent steps involve a model, so a mission's shape is inspectable.
* **Bounded cost.** Every mission carries a budget and every step a share.
* **Resumability.** State is checkpointed after each step, so a mission
  interrupted by a deploy or a rate limit continues rather than restarts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import yaml

from seoos.core.errors import ValidationFailed

StepType = Literal["tool", "agent", "gate", "foreach", "checkpoint"]
OnError = Literal["fail", "continue", "resolve", "retry"]


@dataclass
class Step:
    id: str
    type: StepType
    # tool steps
    tool: str | None = None
    args: dict[str, Any] = field(default_factory=dict)
    # agent steps
    agent: str | None = None
    task: str | None = None
    expect_json: bool | None = None
    context: list[str] = field(default_factory=list)
    # flow control
    needs: list[str] = field(default_factory=list)
    when: str | None = None
    on_error: OnError = "resolve"
    retries: int = 1
    optional: bool = False
    timeout_s: int = 900
    budget_usd: float | None = None
    # foreach steps
    over: str | None = None
    as_: str = "item"
    max_items: int = 20
    steps: list[Step] = field(default_factory=list)
    # bookkeeping
    label: str | None = None
    stores: str | None = None  # blackboard key, defaults to the step id

    @property
    def output_key(self) -> str:
        return self.stores or self.id

    @classmethod
    def from_dict(cls, raw: dict, *, path: str) -> Step:
        if "id" not in raw:
            raise ValidationFailed(f"{path}: a step is missing 'id'")
        step_type = raw.get("type", "tool")
        if step_type not in ("tool", "agent", "gate", "foreach", "checkpoint"):
            raise ValidationFailed(f"{path}: step {raw['id']} has unknown type {step_type!r}")

        step = cls(
            id=raw["id"],
            type=step_type,
            tool=raw.get("tool"),
            args=raw.get("args") or {},
            agent=raw.get("agent"),
            task=raw.get("task"),
            expect_json=raw.get("expect_json"),
            context=list(raw.get("context") or []),
            needs=list(raw.get("needs") or []),
            when=raw.get("when"),
            on_error=raw.get("on_error", "resolve"),
            retries=int(raw.get("retries", 1)),
            optional=bool(raw.get("optional", False)),
            timeout_s=int(raw.get("timeout_s", 900)),
            budget_usd=raw.get("budget_usd"),
            over=raw.get("over"),
            as_=raw.get("as", "item"),
            max_items=int(raw.get("max_items", 20)),
            label=raw.get("label"),
            stores=raw.get("stores"),
            steps=[
                cls.from_dict(s, path=f"{path}.{raw['id']}")
                for s in (raw.get("steps") or [])
            ],
        )
        if step.type == "tool" and not step.tool:
            raise ValidationFailed(f"{path}: tool step {step.id} has no 'tool'")
        if step.type == "agent" and not step.agent:
            raise ValidationFailed(f"{path}: agent step {step.id} has no 'agent'")
        if step.type == "agent" and not step.task:
            raise ValidationFailed(f"{path}: agent step {step.id} has no 'task'")
        if step.type == "foreach" and not (step.over and step.steps):
            raise ValidationFailed(f"{path}: foreach step {step.id} needs 'over' and 'steps'")
        if step.type == "gate" and not step.when:
            raise ValidationFailed(f"{path}: gate step {step.id} needs a 'when' condition")
        return step


@dataclass
class MissionSpec:
    key: str
    name: str
    description: str
    steps: list[Step]
    schedule_hint: str | None = None
    budget_usd: float = 10.0
    timeout_minutes: int = 60
    # Which site states this mission may run against.
    applies_to: list[str] = field(default_factory=lambda: ["active"])
    requires_capabilities: list[str] = field(default_factory=list)
    business_types: list[str] = field(default_factory=list)
    concurrency: int = 4
    tags: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: dict, *, source: str = "<inline>") -> MissionSpec:
        for required in ("key", "name", "steps"):
            if required not in raw:
                raise ValidationFailed(f"{source}: mission is missing {required!r}")
        steps = [Step.from_dict(s, path=source) for s in raw["steps"]]

        ids = [s.id for s in steps]
        duplicates = {i for i in ids if ids.count(i) > 1}
        if duplicates:
            raise ValidationFailed(f"{source}: duplicate step ids {sorted(duplicates)}")
        known = set(ids)
        for step in steps:
            unknown = [n for n in step.needs if n not in known]
            if unknown:
                raise ValidationFailed(
                    f"{source}: step {step.id} depends on unknown steps {unknown}"
                )

        spec = cls(
            key=raw["key"],
            name=raw["name"],
            description=raw.get("description", ""),
            steps=steps,
            schedule_hint=raw.get("schedule_hint"),
            budget_usd=float(raw.get("budget_usd", 10.0)),
            timeout_minutes=int(raw.get("timeout_minutes", 60)),
            applies_to=list(raw.get("applies_to") or ["active"]),
            requires_capabilities=list(raw.get("requires_capabilities") or []),
            business_types=list(raw.get("business_types") or []),
            concurrency=int(raw.get("concurrency", 4)),
            tags=list(raw.get("tags") or []),
        )
        spec.execution_order()  # raises on a dependency cycle
        return spec

    @classmethod
    def from_file(cls, path: Path) -> MissionSpec:
        return cls.from_dict(
            yaml.safe_load(path.read_text(encoding="utf-8")), source=str(path)
        )

    def execution_order(self) -> list[list[Step]]:
        """Group steps into waves that can run concurrently.

        Everything in a wave has its dependencies satisfied by earlier waves,
        so the engine runs each wave with asyncio.gather. That is where the
        speed comes from: a full audit runs its technical, content and AEO
        analysis at the same time rather than in sequence.
        """
        remaining = {s.id: s for s in self.steps}
        done: set[str] = set()
        waves: list[list[Step]] = []

        while remaining:
            wave = [s for s in remaining.values() if all(n in done for n in s.needs)]
            if not wave:
                raise ValidationFailed(
                    f"mission {self.key} has a dependency cycle among: "
                    + ", ".join(sorted(remaining))
                )
            waves.append(wave)
            for step in wave:
                done.add(step.id)
                remaining.pop(step.id)
        return waves

    def step(self, step_id: str) -> Step | None:
        return next((s for s in self.steps if s.id == step_id), None)


# ---------------------------------------------------------------------------
# Templating and conditions
# ---------------------------------------------------------------------------

_TEMPLATE_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.\[\]-]+)\s*\}\}")


def render(template: str, state: dict) -> str:
    """Substitute ``{{ path.to.value }}`` from the mission blackboard.

    Deliberately not a full template language. Missions should read as a
    plan, and logic in a template is logic nobody can see when debugging a
    run that went wrong.
    """

    def lookup(match: re.Match) -> str:
        value = resolve_path(state, match.group(1))
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            import json

            return json.dumps(value, default=str)[:12000]
        return str(value)

    return _TEMPLATE_RE.sub(lookup, template or "")


def resolve_path(state: dict, path: str) -> Any:
    """Walk a dotted path, tolerating list indices and missing keys."""
    current: Any = state
    for part in path.split("."):
        if part == "":
            continue
        index_match = re.match(r"^([a-zA-Z0-9_-]*)\[(\d+)\]$", part)
        if index_match:
            name, index = index_match.group(1), int(index_match.group(2))
            if name:
                current = _get(current, name)
            if isinstance(current, list) and index < len(current):
                current = current[index]
            else:
                return None
            continue
        current = _get(current, part)
        if current is None:
            return None
    return current


def _get(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


_CONDITION_RE = re.compile(
    r"^\s*(?P<left>[a-zA-Z0-9_.\[\]-]+)\s*"
    r"(?P<op>==|!=|>=|<=|>|<|contains|exists|not_exists|is_empty|not_empty)\s*"
    r"(?P<right>.*?)\s*$"
)


def evaluate(condition: str | None, state: dict) -> bool:
    """Evaluate a step condition.

    A tiny expression language rather than eval(), because mission files are
    configuration and configuration must never be able to execute arbitrary
    code. Supports one comparison, optionally joined by ``and`` / ``or``.
    """
    if not condition:
        return True
    condition = condition.strip()

    for joiner, combine in ((" and ", all), (" or ", any)):
        if joiner in condition:
            return combine(evaluate(part, state) for part in condition.split(joiner))

    if condition.startswith("not "):
        return not evaluate(condition[4:], state)

    match = _CONDITION_RE.match(condition)
    if not match:
        # An unparseable condition must not silently pass; a step that was
        # meant to be gated running unconditionally is the dangerous failure.
        raise ValidationFailed(f"Cannot parse mission condition: {condition!r}")

    left = resolve_path(state, match.group("left"))
    op = match.group("op")
    raw_right = match.group("right")

    if op == "exists":
        return left is not None
    if op == "not_exists":
        return left is None
    if op == "is_empty":
        return not left
    if op == "not_empty":
        return bool(left)

    right = _coerce(raw_right, state)
    try:
        if op == "==":
            return left == right
        if op == "!=":
            return left != right
        if op == "contains":
            return right in (left or [])
        left_number, right_number = float(left), float(right)
        return {
            ">": left_number > right_number,
            "<": left_number < right_number,
            ">=": left_number >= right_number,
            "<=": left_number <= right_number,
        }[op]
    except (TypeError, ValueError):
        return False


def _coerce(raw: str, state: dict) -> Any:
    raw = raw.strip()
    if raw.startswith(("'", '"')) and raw.endswith(("'", '"')):
        return raw[1:-1]
    if raw in ("true", "True"):
        return True
    if raw in ("false", "False"):
        return False
    if raw in ("null", "None"):
        return None
    try:
        return float(raw) if "." in raw else int(raw)
    except ValueError:
        pass
    resolved = resolve_path(state, raw)
    return resolved if resolved is not None else raw
