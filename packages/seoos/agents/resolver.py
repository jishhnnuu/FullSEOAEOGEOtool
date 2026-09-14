"""The unblocker.

An agency that stops working every time something is missing is worth
nothing. No agent in this platform is allowed to fail, skip a task or ask
the client for anything until this ladder has been climbed and each rung
logged.

The ladder is code, not advice, because "try harder" written in a prompt is
not enforceable. Each rung is a concrete strategy with a concrete artefact:
either it produced a result, or it produced a logged reason why not.

Two things the resolver may never do, no matter how blocked it is:

* weaken a safety gate (disable a quality check, publish without approval
  where policy requires one, remove a guardrail to make an action possible)
* resolve toward a tactic that risks the client's standing (bought links,
  cloaking, fake reviews, mass community posting)

If the only available "fix" is one of those, it is a human item, not a fix.
"""

from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from seoos.core.errors import SafetyRefusal, SeoOSError
from seoos.core.logging import get_logger

log = get_logger("seoos.agents.resolver")

RUNGS = (
    (1, "read_the_error", "Read the actual error, status code or validator message."),
    (2, "retry_differently", "Retry with different parameters, rendering, batching or backoff."),
    (3, "another_route", "Reach the same outcome through a different data source or API."),
    (4, "decompose", "Do the part that can be done now, completely, and scope the rest."),
    (5, "lower_fidelity", "Substitute a weaker but valid answer, labelled as such."),
    (6, "defer_changed", "Defer to the next cycle by a different method, never the same retry."),
    (7, "human_atom", "Reduce to the single irreducible human action, fully prepared."),
)

# Actions that can never be the resolution, whatever the blocker.
FORBIDDEN_RESOLUTIONS = {
    "disable_quality_gate",
    "publish_without_required_approval",
    "bypass_tester",
    "force_push",
    "silence_failing_check",
    "buy_links",
    "exchange_links",
    "private_blog_network",
    "cloaking",
    "doorway_pages",
    "scraped_content",
    "fake_reviews",
    "review_gating",
    "mass_community_posting",
    "impersonation",
    "hidden_text",
    "expired_domain_abuse",
}


@dataclass
class Attempt:
    rung: int
    strategy: str
    description: str
    succeeded: bool
    detail: str = ""
    at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict:
        return {
            "rung": self.rung,
            "strategy": self.strategy,
            "description": self.description,
            "succeeded": self.succeeded,
            "detail": self.detail[:1000],
            "at": self.at.isoformat(),
        }


@dataclass
class Route:
    """One alternative way to get the same outcome, with its cost in quality."""

    name: str
    rung: int
    run: Callable[[], Awaitable[Any]]
    fidelity: float = 1.0          # 1.0 = as good as the primary route
    description: str = ""
    forbidden: bool = False


@dataclass
class Resolution:
    resolved: bool
    value: Any = None
    fidelity: float = 1.0
    rung_reached: int = 1
    route_used: str | None = None
    attempts: list[Attempt] = field(default_factory=list)
    human_required: bool = False
    human_atom: str | None = None
    rationale: str = ""
    signature: str = ""
    reverses_if: str | None = None

    @property
    def degraded(self) -> bool:
        return self.resolved and self.fidelity < 1.0

    def to_record(self) -> dict:
        return {
            "signature": self.signature,
            "rung_reached": self.rung_reached,
            "attempts": [a.to_dict() for a in self.attempts],
            "decision": self.rationale,
            "human_required": self.human_required,
            "human_atom": self.human_atom,
            "reverses_if": self.reverses_if,
        }


def signature_for(problem: str, context: dict | None = None) -> str:
    """Stable id for a class of problem, so the same wall is never hit twice."""
    basis = problem.lower().strip()
    if context:
        basis += "|" + "|".join(
            f"{k}={context[k]}" for k in sorted(context) if k in ("provider", "tool", "code")
        )
    return hashlib.blake2b(basis.encode(), digest_size=10).hexdigest()


class Resolver:
    """Climbs the ladder for one blocked operation.

    ``memory`` is a lookup of previously logged resolutions for this site, so
    a route already known to fail is skipped instead of re-attempted, and a
    known-good substitution is applied immediately.
    """

    def __init__(self, *, memory: dict[str, dict] | None = None, on_resolution=None):
        # `memory or {}` would silently swap a caller's empty dict for a new
        # one, so nothing written here would reach the mission's blackboard on
        # a first run. The identity of the passed dict matters.
        self.memory = memory if memory is not None else {}
        self.on_resolution = on_resolution

    async def resolve(
        self,
        problem: str,
        routes: list[Route],
        *,
        context: dict | None = None,
        human_atom: str | None = None,
        allow_degraded: bool = True,
    ) -> Resolution:
        sig = signature_for(problem, context)
        attempts: list[Attempt] = []

        prior = self.memory.get(sig)
        if prior and prior.get("decision_route"):
            known = next((r for r in routes if r.name == prior["decision_route"]), None)
            if known is not None:
                attempts.append(
                    Attempt(
                        rung=0,
                        strategy="recall",
                        description=f"Reused a logged resolution for {sig}",
                        succeeded=True,
                        detail=prior.get("decision", ""),
                    )
                )
                routes = [known] + [r for r in routes if r.name != known.name]

        dead_routes = set((prior or {}).get("failed_routes", []))

        for route in sorted(routes, key=lambda r: (r.rung, -r.fidelity)):
            if route.forbidden or route.name in FORBIDDEN_RESOLUTIONS:
                raise SafetyRefusal(
                    f"Route {route.name!r} is never an acceptable resolution. "
                    "This is a human decision, not a workaround."
                )
            if route.name in dead_routes:
                attempts.append(
                    Attempt(route.rung, route.name, route.description, False, "skipped: known to fail")
                )
                continue
            if not allow_degraded and route.fidelity < 1.0:
                continue

            try:
                value = await route.run()
            except SafetyRefusal:
                raise
            except SeoOSError as exc:
                attempts.append(
                    Attempt(route.rung, route.name, route.description, False, f"{exc.code}: {exc.message}")
                )
                continue
            except Exception as exc:  # noqa: BLE001
                attempts.append(
                    Attempt(route.rung, route.name, route.description, False, str(exc)[:500])
                )
                continue

            if value is None or value is False:
                attempts.append(
                    Attempt(route.rung, route.name, route.description, False, "route returned nothing")
                )
                continue

            attempts.append(Attempt(route.rung, route.name, route.description, True))
            resolution = Resolution(
                resolved=True,
                value=value,
                fidelity=route.fidelity,
                rung_reached=route.rung,
                route_used=route.name,
                attempts=attempts,
                signature=sig,
                rationale=(
                    f"Resolved via {route.name} at rung {route.rung}"
                    + (f" at {route.fidelity:.0%} fidelity" if route.fidelity < 1.0 else "")
                ),
            )
            await self._record(resolution, problem)
            return resolution

        # Every route exhausted. Rung 7: the smallest possible human action.
        resolution = Resolution(
            resolved=False,
            rung_reached=7,
            attempts=attempts,
            human_required=True,
            human_atom=human_atom or _default_atom(problem),
            signature=sig,
            rationale=(
                f"{len(attempts)} routes attempted and logged; none produced a result. "
                "Reduced to a single human action."
            ),
        )
        await self._record(resolution, problem)
        log.warning("resolver escalated to human: %s", problem)
        return resolution

    async def _record(self, resolution: Resolution, problem: str) -> None:
        record = resolution.to_record()
        record["problem"] = problem
        record["failed_routes"] = [a.strategy for a in resolution.attempts if not a.succeeded]
        record["decision_route"] = resolution.route_used
        self.memory[resolution.signature] = record
        if self.on_resolution:
            await self.on_resolution(resolution, problem)


def _default_atom(problem: str) -> str:
    return (
        f"One action is needed that no automated route can perform: {problem}. "
        "Everything around it is already prepared."
    )


@dataclass
class Decision:
    """Binding tie-break when specialists disagree.

    A logged, reversible decision that keeps the system running beats a
    correct hesitation that stops it. Every decision records what evidence
    would reverse it, and the next cycle checks for that evidence.
    """

    question: str
    chosen: str
    alternatives: list[str]
    rationale: str
    reverses_if: str
    decided_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    review_after: timedelta = timedelta(days=28)

    def due_for_review(self, now: datetime | None = None) -> bool:
        now = now or datetime.now(UTC)
        return now - self.decided_at > self.review_after

    def to_dict(self) -> dict:
        return {
            "question": self.question,
            "chosen": self.chosen,
            "alternatives": self.alternatives,
            "rationale": self.rationale,
            "reverses_if": self.reverses_if,
            "decided_at": self.decided_at.isoformat(),
        }
