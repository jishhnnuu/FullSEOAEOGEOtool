"""Loading and validating the agent roster."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from seoos.agents.spec import AgentSpec
from seoos.core.errors import NotFound, ValidationFailed
from seoos.core.logging import get_logger

log = get_logger("seoos.agents.registry")

ROSTER_DIR = Path(__file__).parent / "roster"


class AgentRegistry:
    def __init__(self, specs: dict[str, AgentSpec]):
        self._specs = specs

    def get(self, key: str) -> AgentSpec:
        spec = self._specs.get(key)
        if spec is None:
            raise NotFound(f"No agent named {key!r}. Known agents: {', '.join(self.keys()[:12])}...")
        return spec

    def has(self, key: str) -> bool:
        return key in self._specs

    def keys(self) -> list[str]:
        return sorted(self._specs)

    def all(self) -> list[AgentSpec]:
        return [self._specs[k] for k in self.keys()]

    def by_department(self, department: str) -> list[AgentSpec]:
        return [s for s in self.all() if s.department == department]

    def org_chart(self) -> dict[str, list[str]]:
        chart: dict[str, list[str]] = {}
        for spec in self.all():
            chart.setdefault(spec.reports_to or "client", []).append(spec.key)
        return chart

    def validate(self) -> list[str]:
        """Structural checks. Run at boot and in CI so a broken roster never
        reaches a client's site."""
        problems: list[str] = []
        known = set(self._specs)
        from seoos.tools import load_all_tools

        registry = load_all_tools()
        tool_names = set(registry.names())

        for spec in self.all():
            for target in spec.delegates_to:
                if target not in known:
                    problems.append(f"{spec.key} delegates to unknown agent {target!r}")
            if spec.reports_to and spec.reports_to not in known and spec.reports_to != "client":
                problems.append(f"{spec.key} reports to unknown agent {spec.reports_to!r}")
            for pattern in spec.tools:
                if pattern.startswith("category:") or pattern.endswith("*"):
                    if not registry.resolve([pattern]):
                        problems.append(f"{spec.key} tool pattern {pattern!r} matches nothing")
                elif pattern not in tool_names:
                    problems.append(f"{spec.key} references unknown tool {pattern!r}")
            if spec.model_tier not in ("fast", "standard", "deep"):
                problems.append(f"{spec.key} has unknown model tier {spec.model_tier!r}")

        # Delegation must not contain a cycle, or a mission can loop forever.
        # Proper three-colour DFS: a diamond (two paths to the same agent) is
        # perfectly legal and a naive visited-set check would flag it as a cycle.
        WHITE, GREY, BLACK = 0, 1, 2
        colour = dict.fromkeys(self._specs, WHITE)
        cycles: set[tuple[str, ...]] = set()

        def visit(key: str, path: list[str]) -> None:
            colour[key] = GREY
            for target in self._specs[key].delegates_to:
                if target not in self._specs:
                    continue
                if colour[target] == GREY:
                    loop = path[path.index(target):] + [target] if target in path else [key, target]
                    cycles.add(tuple(loop))
                elif colour[target] == WHITE:
                    visit(target, path + [target])
            colour[key] = BLACK

        for key in self._specs:
            if colour[key] == WHITE:
                visit(key, [key])
        for loop in sorted(cycles):
            problems.append("delegation cycle: " + " -> ".join(loop))
        return problems


def load_roster(directory: Path | None = None) -> AgentRegistry:
    directory = directory or ROSTER_DIR
    specs: dict[str, AgentSpec] = {}
    if not directory.exists():
        log.warning("agent roster directory %s does not exist", directory)
        return AgentRegistry(specs)
    # Recursive: the roster is split by desk (search/, content/, shared/) so a
    # new desk is a new folder rather than fifty more files in one directory.
    for path in sorted(directory.rglob("*.md")):
        try:
            spec = AgentSpec.from_file(path)
        except ValidationFailed as exc:
            log.error("skipping agent file %s: %s", path.name, exc.message)
            continue
        if spec.key in specs:
            log.error("duplicate agent key %s in %s", spec.key, path.name)
            continue
        if spec.enabled:
            specs[spec.key] = spec
    log.info("loaded %d agents from %s", len(specs), directory)
    return AgentRegistry(specs)


@lru_cache(maxsize=1)
def get_registry() -> AgentRegistry:
    return load_roster()


def reset_registry_cache() -> None:
    get_registry.cache_clear()
