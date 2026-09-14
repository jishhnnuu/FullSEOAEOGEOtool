"""The approval policy engine.

This is the product's central promise: the client approves content and
almost nothing else. Getting that right means being precise about three
different categories of action, because collapsing them is what makes other
tools either dangerous or useless:

1. **Reversible, low-blast-radius, self-verifying.** An alt text, a meta
   description, an internal link, an image filename. At ``assisted`` and up
   these ship on their own, with an audit row and a one-click undo.
2. **Client-voice or client-facing.** Published copy, outreach sent under
   their name, a review reply, a social post. These need a human unless the
   client has explicitly said otherwise for that class.
3. **Site-wide or hard to reverse.** robots.txt, canonical strategy, mass
   redirects, disavow files, hreflang topology, a migration. These always
   need a human at every autonomy level below ``autopilot``, and the
   destructive subset needs one even there.

A policy that asks about everything trains the client to click approve
without reading, which is worse than not asking.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from seoos.core.logging import get_logger
from seoos.tools.registry import Tool, ToolContext, autonomy_allows

log = get_logger("seoos.agents.policy")

# Actions the platform refuses regardless of what the client authorises.
# A client cannot consent to being penalised on their own behalf, and a
# platform that ships these becomes the reason their traffic disappears.
NEVER_ALLOWED = {
    "buy_backlinks",
    "join_link_scheme",
    "post_to_community_platform",
    "generate_fake_reviews",
    "gate_negative_reviews",
    "cloak_content",
    "create_doorway_pages",
    "publish_scraped_content",
    "impersonate_person",
    "hidden_text_or_links",
    "auto_send_unsolicited_bulk_email",
}

# Actions that always need a human, at every autonomy level. These either
# cannot be undone or can take a site off the index in one move.
ALWAYS_HUMAN = {
    "robots_txt_write",
    "disavow_submit",
    "bulk_redirect_apply",
    "domain_migration_execute",
    "delete_pages",
    "noindex_bulk_apply",
    "hreflang_topology_change",
    "cms_credential_change",
    "billing_increase",
}


# The minimum autonomy level at which a tool of each risk level may run
# unattended. "critical" maps to None, meaning never: no autonomy setting
# authorises an action that can take a site out of the index.
RISK_AUTONOMY_FLOOR: dict[str, str | None] = {
    "internal": "observe",
    "none": "assisted",
    "low": "assisted",
    "medium": "managed",
    "high": "autopilot",
    "critical": None,
}


@dataclass
class PolicyDecision:
    requires_approval: bool
    refuse: bool = False
    reason: str = ""
    title: str = ""
    risk: str = "low"
    reversible: bool = True
    rule: str = ""
    auto_approve_after: timedelta | None = None
    batch_key: str | None = None
    expected_impact: str = ""


@dataclass
class SitePolicy:
    """Per-site overrides layered on the defaults.

    Stored as JSON on the site row, so a client can say "you may publish blog
    posts without asking but never touch product pages" and have that be a
    real, enforced rule rather than a note in an email.
    """

    autonomy: str = "propose"
    auto_publish_types: list[str] = field(default_factory=list)
    never_touch_paths: list[str] = field(default_factory=list)
    require_approval_types: list[str] = field(default_factory=list)
    auto_approve_after_hours: int | None = None
    max_auto_publishes_per_week: int = 10
    max_auto_fixes_per_run: int = 25
    outreach_sending: str = "draft_only"  # draft_only | approved | autonomous
    review_reply_min_rating: int = 4      # replies at or above this may auto-post
    quiet_hours: list[int] = field(default_factory=list)
    require_two_person_for: list[str] = field(default_factory=list)

    @classmethod
    def from_site(cls, site: Any) -> SitePolicy:
        raw = dict(getattr(site, "policy", None) or {})
        return cls(
            autonomy=getattr(site, "autonomy", "propose"),
            auto_publish_types=raw.get("auto_publish_types", []),
            never_touch_paths=raw.get("never_touch_paths", []),
            require_approval_types=raw.get("require_approval_types", []),
            auto_approve_after_hours=raw.get("auto_approve_after_hours"),
            max_auto_publishes_per_week=raw.get("max_auto_publishes_per_week", 10),
            max_auto_fixes_per_run=raw.get("max_auto_fixes_per_run", 25),
            outreach_sending=raw.get("outreach_sending", "draft_only"),
            review_reply_min_rating=raw.get("review_reply_min_rating", 4),
            quiet_hours=raw.get("quiet_hours", []),
            require_two_person_for=raw.get("require_two_person_for", []),
        )

    def path_is_protected(self, url: str | None) -> bool:
        if not url:
            return False
        return any(p and p in url for p in self.never_touch_paths)


class ApprovalPolicy:
    """Decides, per tool call, whether a human signs off first."""

    def __init__(self, *, approvals_service=None):
        self.approvals = approvals_service

    async def evaluate(self, tool: Tool, args: dict, ctx: ToolContext) -> PolicyDecision:
        site_policy = SitePolicy.from_site(ctx.site) if ctx.site else SitePolicy(autonomy=ctx.autonomy)

        # 1. Hard refusals come first and are not negotiable.
        for tag in tool.tags:
            if tag in NEVER_ALLOWED:
                return PolicyDecision(
                    requires_approval=False,
                    refuse=True,
                    reason=(
                        f"{tool.name} falls under a tactic this platform never performs "
                        f"({tag}). It risks a manual action against the client."
                    ),
                    rule="never_allowed",
                    risk="critical",
                )

        target_url = args.get("url") or args.get("target_url") or args.get("published_url")
        if site_policy.path_is_protected(target_url):
            return PolicyDecision(
                requires_approval=True,
                title=f"Change to a protected path: {target_url}",
                reason="The client marked this path as never-touch without explicit sign-off.",
                risk="high",
                rule="protected_path",
                reversible=tool.risk != "critical",
            )

        # 2. Irreversible or site-wide actions always need a person.
        if tool.name in ALWAYS_HUMAN or any(t in ALWAYS_HUMAN for t in tool.tags):
            return PolicyDecision(
                requires_approval=True,
                title=_title_for(tool, args),
                reason="This change is site-wide or hard to reverse.",
                risk="high",
                reversible=False,
                rule="always_human",
                expected_impact=_impact_for(tool, args),
            )

        # 3. The client's own explicit overrides.
        approval_type = tool.approval_type or "other"
        if approval_type in site_policy.require_approval_types:
            return PolicyDecision(
                requires_approval=True,
                title=_title_for(tool, args),
                reason="The client asked to review every action of this kind.",
                risk=tool.risk,
                rule="client_override",
            )

        # 4. Content publication: the one thing the client is promised a say in.
        if approval_type in ("content_publish", "content_update"):
            content_type = args.get("content_type") or args.get("type") or ""
            if content_type and content_type in site_policy.auto_publish_types:
                if autonomy_allows(site_policy.autonomy, "managed"):
                    return PolicyDecision(
                        requires_approval=False,
                        rule="pre_approved_content_type",
                        risk="medium",
                    )
            return PolicyDecision(
                requires_approval=True,
                title=_title_for(tool, args),
                reason="Published copy goes out in the client's name.",
                risk="medium",
                rule="content_gate",
                auto_approve_after=(
                    timedelta(hours=site_policy.auto_approve_after_hours)
                    if site_policy.auto_approve_after_hours
                    else None
                ),
                batch_key="content",
                expected_impact=_impact_for(tool, args),
            )

        # 5. Anything sent under the client's name to a third party.
        if approval_type in ("outreach_send", "social_post", "review_reply", "gbp_post"):
            if approval_type == "review_reply":
                rating = int(args.get("rating") or 0)
                if (
                    rating >= site_policy.review_reply_min_rating
                    and autonomy_allows(site_policy.autonomy, "managed")
                ):
                    return PolicyDecision(requires_approval=False, rule="positive_review_autoreply")
            if approval_type == "outreach_send" and site_policy.outreach_sending == "autonomous":
                if autonomy_allows(site_policy.autonomy, "autopilot"):
                    return PolicyDecision(requires_approval=False, rule="outreach_autonomous")
            return PolicyDecision(
                requires_approval=True,
                title=_title_for(tool, args),
                reason="This goes to a third party under the client's name.",
                risk="medium",
                rule="third_party_gate",
                batch_key=approval_type,
            )

        # 6. Platform-internal bookkeeping never reaches the client's site,
        # so it is audited but never queued for approval.
        if tool.risk == "internal":
            return PolicyDecision(requires_approval=False, rule="internal_write", risk="internal")

        # 7. Everything else: reversible technical work, gated by autonomy.
        # The floor is derived from risk, never assumed. A tool that forgets to
        # declare auto_from must not inherit the most permissive default, which
        # would let a critical action through at "assisted".
        required_level = tool.auto_from or RISK_AUTONOMY_FLOOR.get(tool.risk, "autopilot")
        if required_level is None:
            return PolicyDecision(
                requires_approval=True,
                title=_title_for(tool, args),
                reason=f"{tool.name} is critical-risk and always needs a person.",
                risk=tool.risk,
                reversible=False,
                rule="critical_risk",
                expected_impact=_impact_for(tool, args),
            )
        if autonomy_allows(site_policy.autonomy, required_level):
            return PolicyDecision(requires_approval=False, rule="autonomy_permits", risk=tool.risk)

        return PolicyDecision(
            requires_approval=True,
            title=_title_for(tool, args),
            reason=(
                f"This site runs at '{site_policy.autonomy}' autonomy; "
                f"{tool.name} needs '{required_level}' or higher to run unattended."
            ),
            risk=tool.risk,
            rule="autonomy_insufficient",
            batch_key="technical",
            auto_approve_after=(
                timedelta(hours=site_policy.auto_approve_after_hours)
                if site_policy.auto_approve_after_hours and tool.risk in ("none", "low")
                else None
            ),
            expected_impact=_impact_for(tool, args),
        )

    async def request_approval(
        self, tool: Tool, args: dict, ctx: ToolContext, decision: PolicyDecision
    ) -> str | None:
        if self.approvals is None:
            log.warning("approval needed for %s but no approvals service is wired", tool.name)
            return None
        return await self.approvals.create(
            ctx=ctx,
            approval_type=tool.approval_type or "other",
            title=decision.title or _title_for(tool, args),
            summary=decision.reason,
            action={"tool": tool.name, "args": args},
            risk=decision.risk,
            reversible=decision.reversible,
            rule=decision.rule,
            batch_key=decision.batch_key,
            expected_impact=decision.expected_impact,
            auto_approve_at=(
                datetime.now(UTC) + decision.auto_approve_after
                if decision.auto_approve_after
                else None
            ),
        )


def _title_for(tool: Tool, args: dict) -> str:
    for key in ("title", "url", "target_url", "content_title", "subject", "path"):
        if args.get(key):
            return f"{_humanise(tool.name)}: {str(args[key])[:160]}"
    return _humanise(tool.name)


def _humanise(name: str) -> str:
    return name.replace(".", " ").replace("_", " ").strip().capitalize()


def _impact_for(tool: Tool, args: dict) -> str:
    count = args.get("count") or len(args.get("urls", []) or []) or 1
    if count > 1:
        return f"Affects {count} URLs."
    return "Affects one page."
