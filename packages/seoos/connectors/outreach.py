"""Outreach delivery and social distribution.

Two hard rules run through this module, and they are the reason it is written
the way it is rather than as a generic "send" function.

**Email always leaves from the client's own domain.** Never from platform
infrastructure. A shared sending IP would put every client's deliverability
in the hands of the worst-behaved tenant, and a pitch that arrives from an
unknown third party gets ignored anyway. The platform drafts and schedules;
the client's SMTP or ESP sends.

**Nothing is sent in bulk to people who did not ask.** The sender enforces a
per-domain daily cap, a suppression list, and a hard refusal on anything that
looks like a mail merge to a purchased list. Outreach that earns links is
small, researched and personal; automating the other kind would get the
client's domain blocked and is not a service worth offering.
"""

from __future__ import annotations

import re
import smtplib
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from email.message import EmailMessage
from typing import Any

from seoos.connectors.base import Capability, Connector, ConnectorResult
from seoos.core.errors import ConnectorError, SafetyRefusal
from seoos.core.logging import get_logger

log = get_logger("seoos.connectors.outreach")

# Conservative defaults. A real person doing outreach sends a handful of
# researched emails a day, so matching that is both safer and more effective.
DEFAULT_DAILY_CAP = 40
DEFAULT_PER_DOMAIN_CAP = 2
MIN_PERSONALISATION_CHARS = 120

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)
_ROLE_ADDRESSES = {
    "info", "sales", "support", "admin", "contact", "hello", "enquiries",
    "noreply", "no-reply", "webmaster", "postmaster", "abuse",
}


@dataclass
class OutreachMessageDraft:
    to_email: str
    subject: str
    body: str
    to_name: str | None = None
    reply_to: str | None = None
    personalisation: dict[str, Any] = field(default_factory=dict)
    thread_id: str | None = None

    def quality_problems(self) -> list[str]:
        """Refuse to send anything that reads like spam.

        This runs before delivery because the cost of a bad send is borne by
        the client's domain reputation, which takes months to repair.
        """
        problems: list[str] = []
        if not _EMAIL_RE.match(self.to_email or ""):
            problems.append("recipient address is not valid")
        local = (self.to_email or "").split("@")[0].lower()
        if local in _ROLE_ADDRESSES:
            problems.append(
                f"'{local}@' is a role address; find a named person or do not send"
            )
        if len(self.subject or "") < 8:
            problems.append("subject is too short to be meaningful")
        if len(self.subject or "") > 80:
            problems.append("subject will truncate in most clients")
        specific = self.personalisation.get("specific_reference", "")
        if len(str(specific)) < MIN_PERSONALISATION_CHARS:
            problems.append(
                "no substantive reference to the recipient's own work; "
                "a template with a name swapped in is spam"
            )
        body = self.body or ""
        if len(body) < 200:
            problems.append("body is too short to explain why you are writing")
        if len(body) > 2500:
            problems.append("body is too long; outreach over about 200 words does not get read")
        if "{{" in body or "{" in body and "}" in body:
            problems.append("unrendered template placeholder left in the body")
        if not re.search(r"\bunsubscribe|reply .{0,20}stop|let me know if", body, re.I):
            problems.append("no easy way for the recipient to opt out of follow-ups")
        return problems


class SMTPConnector(Connector):
    """Send through the client's own mail server."""

    provider = "smtp"
    display_name = "SMTP (client's own mail server)"
    auth_kind = "basic"
    capabilities = (
        Capability("send_email", "Send from the client's own domain", write=True),
    )

    async def verify(self) -> ConnectorResult:
        self.require("host", "username", "password")
        try:
            await self._connect_and_close()
        except (OSError, smtplib.SMTPException) as exc:
            return ConnectorResult.failure(f"Could not connect: {exc}")
        return ConnectorResult(
            ok=True,
            data={
                "host": self.credentials["host"],
                "from": self.config.get("from_email"),
            },
        )

    async def _connect_and_close(self) -> None:
        import asyncio

        def _probe() -> None:
            host = self.credentials["host"]
            port = int(self.credentials.get("port", 587))
            with smtplib.SMTP(host, port, timeout=20) as server:
                server.starttls()
                server.login(self.credentials["username"], self.credentials["password"])

        await asyncio.get_running_loop().run_in_executor(None, _probe)

    async def send(self, draft: OutreachMessageDraft) -> ConnectorResult:
        problems = draft.quality_problems()
        if problems:
            raise SafetyRefusal(
                "This message would damage the client's sending reputation: "
                + "; ".join(problems)
            )
        self.require("host", "username", "password")
        from_email = self.config.get("from_email") or self.credentials["username"]
        from_name = self.config.get("from_name") or ""

        message = EmailMessage()
        message["Subject"] = draft.subject
        message["From"] = f"{from_name} <{from_email}>" if from_name else from_email
        message["To"] = (
            f"{draft.to_name} <{draft.to_email}>" if draft.to_name else draft.to_email
        )
        if draft.reply_to:
            message["Reply-To"] = draft.reply_to
        # A List-Unsubscribe header is what separates legitimate one-to-one
        # outreach from something mailbox providers treat as bulk.
        message["List-Unsubscribe"] = f"<mailto:{from_email}?subject=unsubscribe>"
        message.set_content(draft.body)

        import asyncio

        def _send() -> str:
            with smtplib.SMTP(
                self.credentials["host"], int(self.credentials.get("port", 587)), timeout=30
            ) as server:
                server.starttls()
                server.login(self.credentials["username"], self.credentials["password"])
                server.send_message(message)
                return message.get("Message-ID", "")

        try:
            message_id = await asyncio.get_running_loop().run_in_executor(None, _send)
        except (OSError, smtplib.SMTPException) as exc:
            return ConnectorResult.failure(f"Send failed: {exc}")
        return ConnectorResult(
            ok=True, data={"message_id": message_id, "to": draft.to_email}
        )


class SendGridConnector(Connector):
    """SendGrid, sending from a domain the client has authenticated."""

    provider = "sendgrid"
    display_name = "SendGrid"
    auth_kind = "api_key"
    capabilities = (Capability("send_email", "Send from an authenticated domain", write=True),)
    BASE = "https://api.sendgrid.com/v3"

    def _headers(self) -> dict[str, str]:
        self.require("api_key")
        return {
            "Authorization": f"Bearer {self.credentials['api_key']}",
            "Content-Type": "application/json",
        }

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET", f"{self.BASE}/whitelabel/domains", headers=self._headers()
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        validated = [d.get("domain") for d in data if d.get("valid")]
        if not validated:
            return ConnectorResult(
                ok=True,
                degraded=True,
                data={"domains": []},
                meta={
                    "note": (
                        "No authenticated sending domain. Outreach would send "
                        "unauthenticated and land in spam; authenticate the "
                        "client's domain before enabling sending."
                    )
                },
            )
        return ConnectorResult(ok=True, data={"domains": validated})

    async def send(self, draft: OutreachMessageDraft) -> ConnectorResult:
        problems = draft.quality_problems()
        if problems:
            raise SafetyRefusal(
                "This message would damage the client's sending reputation: "
                + "; ".join(problems)
            )
        from_email = self.config.get("from_email")
        if not from_email:
            return ConnectorResult.failure("No sending address configured")
        try:
            await self.request(
                "POST", f"{self.BASE}/mail/send",
                headers=self._headers(),
                expect_json=False,
                json={
                    "personalizations": [
                        {"to": [{"email": draft.to_email, "name": draft.to_name}]}
                    ],
                    "from": {
                        "email": from_email,
                        "name": self.config.get("from_name", ""),
                    },
                    "reply_to": {"email": draft.reply_to or from_email},
                    "subject": draft.subject,
                    "content": [{"type": "text/plain", "value": draft.body}],
                    "tracking_settings": {
                        "click_tracking": {"enable": False},
                        "open_tracking": {"enable": True},
                    },
                },
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data={"to": draft.to_email, "provider": "sendgrid"})


@dataclass
class SendingGovernor:
    """Rate limiting and suppression, enforced before any send."""

    daily_cap: int = DEFAULT_DAILY_CAP
    per_domain_cap: int = DEFAULT_PER_DOMAIN_CAP
    suppression: set[str] = field(default_factory=set)
    sent_today: dict[str, int] = field(default_factory=dict)
    day: date = field(default_factory=date.today)

    def _roll(self) -> None:
        if self.day != date.today():
            self.day = date.today()
            self.sent_today.clear()

    def check(self, to_email: str) -> str | None:
        """Returns a refusal reason, or None if the send may proceed."""
        self._roll()
        address = (to_email or "").lower()
        domain = address.split("@")[-1]
        if address in self.suppression or domain in self.suppression:
            return "recipient or their domain is on the suppression list"
        if sum(self.sent_today.values()) >= self.daily_cap:
            return f"daily sending cap of {self.daily_cap} reached"
        if self.sent_today.get(domain, 0) >= self.per_domain_cap:
            return f"already contacted {domain} {self.per_domain_cap} times today"
        return None

    def record(self, to_email: str) -> None:
        self._roll()
        domain = (to_email or "").lower().split("@")[-1]
        self.sent_today[domain] = self.sent_today.get(domain, 0) + 1

    def suppress(self, value: str) -> None:
        self.suppression.add(value.lower())


class LinkedInConnector(Connector):
    """LinkedIn company page posting.

    Read access and organic company posting only. The platform never connects
    a personal profile or automates connection requests and direct messages:
    those breach LinkedIn's terms and put the client's own account at risk.
    """

    provider = "linkedin"
    display_name = "LinkedIn"
    auth_kind = "oauth2"
    capabilities = (
        Capability("post", "Publish to a company page", write=True),
        Capability("page_stats", "Follower and engagement statistics"),
    )
    BASE = "https://api.linkedin.com/rest"

    def _headers(self) -> dict[str, str]:
        self.require("access_token")
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "LinkedIn-Version": "202411",
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
        }

    async def verify(self) -> ConnectorResult:
        try:
            data = await self.request(
                "GET", f"{self.BASE}/organizationAcls",
                headers=self._headers(), params={"q": "roleAssignee"},
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(
            ok=True,
            data={"organizations": [e.get("organization") for e in data.get("elements", [])]},
        )

    async def post(self, *, text: str, link_url: str | None = None) -> ConnectorResult:
        org = self.config.get("organization_urn")
        if not org:
            return ConnectorResult.failure("No LinkedIn company page selected")
        body: dict[str, Any] = {
            "author": org,
            "commentary": text[:3000],
            "visibility": "PUBLIC",
            "distribution": {"feedDistribution": "MAIN_FEED"},
            "lifecycleState": "PUBLISHED",
        }
        if link_url:
            body["content"] = {"article": {"source": link_url}}
        try:
            await self.request(
                "POST", f"{self.BASE}/posts", headers=self._headers(),
                json=body, expect_json=False,
            )
        except ConnectorError as exc:
            return ConnectorResult.failure(exc.message)
        return ConnectorResult(ok=True, data={"posted_at": datetime.now(UTC).isoformat()})
