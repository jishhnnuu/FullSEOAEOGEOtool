"""Loading and validating mission definitions."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from seoos.core.errors import NotFound, ValidationFailed
from seoos.core.logging import get_logger
from seoos.missions.spec import MissionSpec

log = get_logger("seoos.missions.registry")

WORKFLOW_DIR = Path(__file__).parent / "workflows"


class MissionRegistry:
    def __init__(self, missions: dict[str, MissionSpec]):
        self._missions = missions

    def get(self, key: str) -> MissionSpec:
        spec = self._missions.get(key)
        if spec is None:
            raise NotFound(
                f"No mission named {key!r}. Known: {', '.join(self.keys())}"
            )
        return spec

    def has(self, key: str) -> bool:
        return key in self._missions

    def keys(self) -> list[str]:
        return sorted(self._missions)

    def all(self) -> list[MissionSpec]:
        return [self._missions[k] for k in self.keys()]

    def for_site(self, *, business_type: str, capabilities: set[str], status: str) -> list[MissionSpec]:
        """Which missions are worth running for this specific site.

        Filtering here rather than failing mid-run is what stops the platform
        promising a client work it has no route to perform.
        """
        out = []
        for spec in self.all():
            if spec.applies_to and status not in spec.applies_to:
                continue
            if spec.business_types and business_type not in spec.business_types:
                continue
            if spec.requires_capabilities and not set(spec.requires_capabilities) <= capabilities:
                continue
            out.append(spec)
        return out

    def validate(self) -> list[str]:
        from seoos.agents.registry import get_registry
        from seoos.tools import load_all_tools

        problems: list[str] = []
        agents = get_registry()
        tools = load_all_tools()
        tool_names = set(tools.names())

        def check_steps(spec: MissionSpec, steps) -> None:
            for step in steps:
                if step.type == "tool" and step.tool not in tool_names:
                    problems.append(
                        f"{spec.key}.{step.id} calls unknown tool {step.tool!r}"
                    )
                if step.type == "agent" and not agents.has(step.agent):
                    problems.append(
                        f"{spec.key}.{step.id} uses unknown agent {step.agent!r}"
                    )
                if step.type == "agent" and agents.has(step.agent):
                    # An agent can only do a job it has the tools for.
                    agent = agents.get(step.agent)
                    if not tools.resolve(agent.tools):
                        problems.append(
                            f"{spec.key}.{step.id}: agent {step.agent} has no usable tools"
                        )
                check_steps(spec, step.steps)

        for spec in self.all():
            try:
                spec.execution_order()
            except ValidationFailed as exc:
                problems.append(str(exc))
            check_steps(spec, spec.steps)
            budget_sum = sum(s.budget_usd or 0 for s in spec.steps)
            if budget_sum > spec.budget_usd * 1.5:
                problems.append(
                    f"{spec.key}: step budgets total ${budget_sum:.2f} against a "
                    f"mission budget of ${spec.budget_usd:.2f}"
                )
        return problems


def load_missions(directory: Path | None = None) -> MissionRegistry:
    directory = directory or WORKFLOW_DIR
    missions: dict[str, MissionSpec] = {}
    if not directory.exists():
        log.warning("mission directory %s does not exist", directory)
        return MissionRegistry(missions)
    # Recursive, for the same reason the roster is: missions live under the
    # desk that owns them, and shared/ holds the ones every desk depends on.
    for path in sorted(directory.rglob("*.yaml")):
        try:
            spec = MissionSpec.from_file(path)
        except (ValidationFailed, Exception) as exc:  # noqa: BLE001
            log.error("skipping mission %s: %s", path.name, exc)
            continue
        if spec.key in missions:
            log.error("duplicate mission key %s in %s", spec.key, path.name)
            continue
        missions[spec.key] = spec
    log.info("loaded %d missions", len(missions))
    return MissionRegistry(missions)


@lru_cache(maxsize=1)
def get_mission_registry() -> MissionRegistry:
    return load_missions()


def reset_mission_cache() -> None:
    get_mission_registry.cache_clear()
