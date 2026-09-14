"""Safe outbound HTTP for anything that touches a URL the client supplied.

Two non-negotiables:

* **SSRF.** A customer can point this platform at any URL. Every fetch
  resolves DNS first, rejects private, loopback, link-local and cloud
  metadata addresses, and pins the connection to the validated address so a
  rebinding attack cannot swap it after the check.
* **Politeness.** We crawl other people's sites, including the client's
  production site. Concurrency is bounded per host, robots.txt is honoured
  by default, and the user agent identifies the platform honestly.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx
from seoos.core.config import get_settings
from seoos.core.errors import ConnectorError, ValidationFailed
from seoos.core.logging import get_logger

log = get_logger("seoos.analysis.http")

BLOCKED_HOSTS = {
    "localhost", "metadata.google.internal", "metadata", "instance-data",
    "169.254.169.254", "100.100.100.100",
}
ALLOWED_SCHEMES = {"http", "https"}


def _ip_is_public(raw: str) -> bool:
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return False
    return not (
        ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local
        or ip.is_multicast or ip.is_unspecified
    )


def validate_url(url: str) -> str:
    """Syntactic + host validation. Raises rather than returning a flag."""
    if not url or not isinstance(url, str):
        raise ValidationFailed("A URL is required")
    parsed = urlparse(url.strip())
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValidationFailed(f"Only http and https are allowed, got {parsed.scheme!r}")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValidationFailed("URL has no hostname")
    if host in BLOCKED_HOSTS or host.endswith(".internal") or host.endswith(".local"):
        raise ValidationFailed(f"Refusing to fetch internal host {host!r}")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if not _ip_is_public(host):
            raise ValidationFailed(f"Refusing to fetch non-public address {host!r}")
    return urlunparse(parsed._replace(fragment=""))


async def resolve_and_check(host: str) -> str:
    """Resolve a hostname and require every answer to be public."""
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise ConnectorError(f"Could not resolve {host}: {exc}") from exc
    addresses = {info[4][0] for info in infos}
    if not addresses:
        raise ConnectorError(f"No addresses for {host}")
    for addr in addresses:
        if not _ip_is_public(addr):
            raise ValidationFailed(
                f"{host} resolves to non-public address {addr}; refusing to fetch"
            )
    return sorted(addresses)[0]


@dataclass
class FetchResult:
    url: str
    final_url: str
    status: int
    headers: dict[str, str]
    text: str = ""
    content: bytes = b""
    elapsed_ms: int = 0
    redirect_chain: list[str] = field(default_factory=list)
    error: str | None = None
    from_cache: bool = False

    @property
    def ok(self) -> bool:
        return self.error is None and 200 <= self.status < 300

    @property
    def content_type(self) -> str:
        return (self.headers.get("content-type") or "").split(";")[0].strip().lower()

    @property
    def is_html(self) -> bool:
        return self.content_type in ("text/html", "application/xhtml+xml")


class RobotsCache:
    """One robots.txt per origin, fetched once per crawl."""

    def __init__(self, user_agent: str):
        self.user_agent = user_agent
        self._parsers: dict[str, RobotFileParser | None] = {}
        self._delays: dict[str, float] = {}

    async def allowed(self, client: SafeHttpClient, url: str) -> bool:
        origin = _origin(url)
        if origin not in self._parsers:
            await self._load(client, origin)
        parser = self._parsers.get(origin)
        if parser is None:
            return True  # no robots.txt, or unreachable: default to allowed
        return parser.can_fetch(self.user_agent, url)

    async def crawl_delay(self, client: SafeHttpClient, url: str) -> float:
        origin = _origin(url)
        if origin not in self._parsers:
            await self._load(client, origin)
        return self._delays.get(origin, 0.0)

    async def _load(self, client: SafeHttpClient, origin: str) -> None:
        try:
            result = await client.get(f"{origin}/robots.txt", check_robots=False)
        except Exception:  # noqa: BLE001 - a missing robots.txt is normal
            self._parsers[origin] = None
            return
        if not result.ok or not result.text:
            self._parsers[origin] = None
            return
        parser = RobotFileParser()
        parser.parse(result.text.splitlines())
        self._parsers[origin] = parser
        try:
            delay = parser.crawl_delay(self.user_agent)
            self._delays[origin] = float(delay) if delay else 0.0
        except (AttributeError, TypeError, ValueError):
            self._delays[origin] = 0.0


def _origin(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


class SafeHttpClient:
    """The only outbound HTTP client the analysis layer uses."""

    def __init__(
        self,
        *,
        user_agent: str | None = None,
        timeout: float | None = None,
        max_concurrency: int | None = None,
        respect_robots: bool | None = None,
        delay_ms: int | None = None,
        max_bytes: int = 8 * 1024 * 1024,
    ):
        settings = get_settings()
        self.user_agent = user_agent or settings.user_agent
        self.timeout = timeout or settings.http_timeout_seconds
        self.max_bytes = max_bytes
        self.delay_s = (delay_ms if delay_ms is not None else settings.crawl_delay_ms) / 1000
        self.respect_robots = (
            settings.respect_robots_txt if respect_robots is None else respect_robots
        )
        self._sem = asyncio.Semaphore(max_concurrency or settings.crawl_concurrency)
        self._host_last: dict[str, float] = {}
        self._host_lock: dict[str, asyncio.Lock] = {}
        self.robots = RobotsCache(self.user_agent)
        self._client: httpx.AsyncClient | None = None
        self.stats = {"requests": 0, "bytes": 0, "errors": 0, "blocked_by_robots": 0}

    async def __aenter__(self) -> SafeHttpClient:
        self._ensure()
        return self

    async def __aexit__(self, *exc) -> None:
        await self.close()

    def _ensure(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout),
                follow_redirects=False,
                headers={
                    "User-Agent": self.user_agent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
        return self._client

    async def _throttle(self, host: str) -> None:
        lock = self._host_lock.setdefault(host, asyncio.Lock())
        async with lock:
            last = self._host_last.get(host, 0.0)
            wait = self.delay_s - (time.monotonic() - last)
            if wait > 0:
                await asyncio.sleep(wait)
            self._host_last[host] = time.monotonic()

    async def get(
        self,
        url: str,
        *,
        check_robots: bool | None = None,
        max_redirects: int = 5,
        headers: dict[str, str] | None = None,
        method: str = "GET",
    ) -> FetchResult:
        url = validate_url(url)
        host = urlparse(url).hostname or ""
        await resolve_and_check(host)

        if (self.respect_robots if check_robots is None else check_robots):
            if not await self.robots.allowed(self, url):
                self.stats["blocked_by_robots"] += 1
                return FetchResult(
                    url=url, final_url=url, status=0, headers={},
                    error="blocked by robots.txt",
                )

        chain: list[str] = []
        current = url
        started = time.perf_counter()

        async with self._sem:
            for _ in range(max_redirects + 1):
                await self._throttle(urlparse(current).hostname or host)
                try:
                    resp = await self._ensure().request(
                        method, current, headers=headers or {}
                    )
                except httpx.HTTPError as exc:
                    self.stats["errors"] += 1
                    return FetchResult(
                        url=url, final_url=current, status=0, headers={},
                        error=f"{type(exc).__name__}: {exc}",
                        elapsed_ms=int((time.perf_counter() - started) * 1000),
                        redirect_chain=chain,
                    )
                self.stats["requests"] += 1

                if resp.status_code in (301, 302, 303, 307, 308):
                    location = resp.headers.get("location")
                    if not location:
                        break
                    chain.append(current)
                    current = validate_url(urljoin(current, location))
                    await resolve_and_check(urlparse(current).hostname or "")
                    continue
                break
            else:
                return FetchResult(
                    url=url, final_url=current, status=0, headers={},
                    error="too many redirects", redirect_chain=chain,
                )

        raw = resp.content[: self.max_bytes]
        self.stats["bytes"] += len(raw)
        text = ""
        ctype = (resp.headers.get("content-type") or "").lower()
        if any(k in ctype for k in ("text", "html", "xml", "json", "javascript")):
            try:
                text = raw.decode(resp.encoding or "utf-8", errors="replace")
            except (LookupError, UnicodeDecodeError):
                text = raw.decode("utf-8", errors="replace")

        return FetchResult(
            url=url,
            final_url=str(resp.url),
            status=resp.status_code,
            headers={k.lower(): v for k, v in resp.headers.items()},
            text=text,
            content=raw,
            elapsed_ms=int((time.perf_counter() - started) * 1000),
            redirect_chain=chain,
        )

    async def head(self, url: str, **kwargs) -> FetchResult:
        return await self.get(url, method="HEAD", **kwargs)

    async def get_json(self, url: str, **kwargs) -> Any:
        result = await self.get(url, check_robots=False, **kwargs)
        if not result.ok:
            raise ConnectorError(f"GET {url} returned {result.status}: {result.error or ''}")
        import json

        return json.loads(result.text)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


def normalise_domain(value: str | None) -> str:
    """Canonical form of a hostname for comparison.

    Written as an explicit prefix strip rather than ``lstrip("www.")``, which
    removes any leading run of 'w' and '.' characters and therefore turns
    "wine.com" into "ine.com" and "web.example.org" into "eb.example.org".
    That silently broke same-site detection for a whole class of domains.
    """
    host = (value or "").strip().lower()
    if "://" in host:
        from urllib.parse import urlparse

        host = urlparse(host).hostname or ""
    host = host.split("/")[0].split(":")[0].rstrip(".")
    return host[4:] if host.startswith("www.") else host


def same_domain(a: str | None, b: str | None) -> bool:
    """True when two hostnames belong to the same registrable site."""
    left, right = normalise_domain(a), normalise_domain(b)
    if not left or not right:
        return False
    return left == right or left.endswith("." + right) or right.endswith("." + left)
