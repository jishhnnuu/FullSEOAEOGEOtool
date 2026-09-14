"""Structured logging with run/tenant correlation.

Every log line emitted inside an agent run carries the org, site, mission
run and agent, so a client-visible incident can be traced end to end
without grepping across services.
"""

from __future__ import annotations

import contextvars
import json
import logging
import sys
import time
from typing import Any

# The default must not be a shared mutable: every context would see the same
# dict, and one mutation would leak across requests. None is replaced on read.
_context: contextvars.ContextVar[dict | None] = contextvars.ContextVar(
    "seoos_log_context", default=None
)


def bind(**kwargs: Any) -> contextvars.Token:
    """Add fields to the ambient log context. Returns a token for reset()."""
    merged = {**(_context.get() or {}), **{k: v for k, v in kwargs.items() if v is not None}}
    return _context.set(merged)


def unbind(token: contextvars.Token) -> None:
    _context.reset(token)


def current_context() -> dict:
    return dict(_context.get() or {})


class ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.seoos_context = current_context()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        payload.update(getattr(record, "seoos_context", {}) or {})
        extra = getattr(record, "extra_fields", None)
        if extra:
            payload.update(extra)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class ConsoleFormatter(logging.Formatter):
    _COLORS = {
        "DEBUG": "\033[36m",
        "INFO": "\033[32m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
        "CRITICAL": "\033[35m",
    }
    _RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self._COLORS.get(record.levelname, "")
        ctx = getattr(record, "seoos_context", {}) or {}
        tail = ""
        if ctx:
            interesting = {k: v for k, v in ctx.items() if k in ("site", "run", "agent", "org")}
            if interesting:
                tail = "  " + " ".join(f"{k}={v}" for k, v in interesting.items())
        stamp = time.strftime("%H:%M:%S", time.localtime(record.created))
        line = f"{stamp} {color}{record.levelname:<8}{self._RESET} {record.name:<28} {record.getMessage()}{tail}"
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def configure_logging(level: str = "INFO", fmt: str = "console") -> None:
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if fmt == "json" else ConsoleFormatter())
    handler.addFilter(ContextFilter())
    root.addHandler(handler)
    root.setLevel(level.upper())
    # Third-party noise that is never actionable for us.
    for noisy in ("httpx", "httpcore", "urllib3", "asyncio", "multipart"):
        logging.getLogger(noisy).setLevel("WARNING")


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
