"""Exception hierarchy.

Every failure an agent can hit is typed, because the resolver ladder in
``seoos.agents.resolver`` branches on the *kind* of failure. An untyped
exception is treated as unknown and gets the most conservative handling,
so raising the right one here is what lets the platform keep moving
instead of stalling on a human.
"""

from __future__ import annotations


class SeoOSError(Exception):
    """Base class. Carries a machine-readable code and optional context."""

    code = "seoos_error"
    http_status = 500
    retryable = False

    def __init__(self, message: str, *, context: dict | None = None):
        super().__init__(message)
        self.message = message
        self.context = context or {}

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "context": self.context}


class NotFound(SeoOSError):
    code = "not_found"
    http_status = 404


class PermissionDenied(SeoOSError):
    code = "permission_denied"
    http_status = 403


class ValidationFailed(SeoOSError):
    code = "validation_failed"
    http_status = 422


class Conflict(SeoOSError):
    code = "conflict"
    http_status = 409


class ConnectorError(SeoOSError):
    """An outbound integration failed. Usually retryable by another route."""

    code = "connector_error"
    http_status = 502
    retryable = True


class CredentialMissing(ConnectorError):
    """A connector is not configured. Not retryable without human action."""

    code = "credential_missing"
    http_status = 424
    retryable = False


class RateLimited(ConnectorError):
    code = "rate_limited"
    http_status = 429
    retryable = True


class BudgetExceeded(SeoOSError):
    """A run or an org hit its spend ceiling. Never silently ignored."""

    code = "budget_exceeded"
    http_status = 402


class ApprovalRequired(SeoOSError):
    """The action is legitimate but policy says a human signs off first."""

    code = "approval_required"
    http_status = 202

    def __init__(self, message: str, *, approval_id: str | None = None, context: dict | None = None):
        super().__init__(message, context=context)
        self.approval_id = approval_id


class SafetyRefusal(SeoOSError):
    """The action would damage the client. Refused, never escalated."""

    code = "safety_refusal"
    http_status = 403


class ProviderError(SeoOSError):
    code = "provider_error"
    http_status = 502
    retryable = True
