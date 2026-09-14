"""Runtime configuration.

Everything is environment-driven so the same image runs locally, in CI, and
in production. Two design rules matter here:

1. **No vendor is mandatory.** The platform must run without any specific
   model provider, data provider, or cloud. Every integration degrades to a
   documented lower-fidelity path (see ``seoos.agents.resolver``), and the
   platform boots with none of them configured.
2. **Secrets never live in this object.** Per-tenant credentials live
   encrypted in the database. Only the platform's own master key and its
   default (optional) fallback provider keys come from the environment.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SEOOS_",
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- identity -------------------------------------------------------
    app_name: str = "SEO OS"
    environment: Literal["dev", "test", "staging", "prod"] = "dev"
    public_url: str = "http://localhost:8000"
    web_url: str = "http://localhost:3000"

    # ---- persistence ----------------------------------------------------
    database_url: str = "sqlite+aiosqlite:///./seoos.db"
    database_echo: bool = False
    redis_url: str | None = None

    # ---- security -------------------------------------------------------
    # 32 url-safe base64 bytes. Generate with:  python -m seoos.cli keygen
    master_key: str = Field(
        default="",
        description="Fernet key used to envelope-encrypt every tenant credential.",
    )
    jwt_secret: str = Field(default="", description="HS256 signing key for session tokens.")
    jwt_ttl_minutes: int = 60 * 12
    allow_insecure_dev_keys: bool = True

    # ---- model access ---------------------------------------------------
    # The platform is provider-agnostic. These are only the *platform default*
    # keys; any tenant may bring its own and they take precedence.
    default_llm_provider: str = "anthropic"
    default_llm_model: str = "claude-sonnet-5"
    default_fast_model: str = "claude-haiku-4-5-20251001"
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None
    openrouter_api_key: str | None = None
    azure_openai_endpoint: str | None = None
    azure_openai_api_key: str | None = None
    ollama_base_url: str | None = None
    llm_timeout_seconds: int = 300

    # ---- OAuth clients (platform-level, one per provider) ----------------
    google_client_id: str | None = None
    google_client_secret: str | None = None
    linkedin_client_id: str | None = None
    linkedin_client_secret: str | None = None
    meta_app_id: str | None = None
    meta_app_secret: str | None = None
    x_client_id: str | None = None
    x_client_secret: str | None = None
    shopify_client_id: str | None = None
    shopify_client_secret: str | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = None

    # ---- data providers (platform-level fallbacks) -----------------------
    dataforseo_login: str | None = None
    dataforseo_password: str | None = None
    moz_access_id: str | None = None
    moz_secret_key: str | None = None
    bing_webmaster_api_key: str | None = None
    serper_api_key: str | None = None

    # ---- crawling -------------------------------------------------------
    user_agent: str = "SEO-OS/0.1 (+https://seo-os.dev/bot)"
    crawl_concurrency: int = 6
    crawl_delay_ms: int = 250
    crawl_max_pages_default: int = 500
    respect_robots_txt: bool = True
    http_timeout_seconds: int = 30

    # ---- autonomy and spend --------------------------------------------
    # Per-org ceilings are stored on the org; these are the platform caps that
    # no org may exceed, so a runaway loop can never bill unbounded.
    max_usd_per_run: float = 25.0
    max_usd_per_org_per_day: float = 200.0
    max_tool_calls_per_run: int = 120
    max_agent_depth: int = 4
    dry_run: bool = False

    # ---- storage --------------------------------------------------------
    storage_backend: Literal["local", "s3"] = "local"
    storage_dir: str = "./var/storage"
    s3_bucket: str | None = None
    s3_endpoint_url: str | None = None
    s3_region: str | None = None

    # ---- email (approvals, digests) -------------------------------------
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    mail_from: str = "seo-os@localhost"

    # ---- observability --------------------------------------------------
    log_level: str = "INFO"
    log_format: Literal["json", "console"] = "console"

    @field_validator("master_key", "jwt_secret", mode="before")
    @classmethod
    def _blank_to_empty(cls, v):
        return (v or "").strip()

    @property
    def is_production(self) -> bool:
        return self.environment in ("staging", "prod")

    @property
    def db_is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def configured_llm_providers(self) -> list[str]:
        """Which model providers this deployment can actually reach."""
        found = []
        if self.anthropic_api_key:
            found.append("anthropic")
        if self.openai_api_key:
            found.append("openai")
        if self.google_api_key:
            found.append("google")
        if self.openrouter_api_key:
            found.append("openrouter")
        if self.azure_openai_api_key and self.azure_openai_endpoint:
            found.append("azure")
        if self.ollama_base_url:
            found.append("ollama")
        return found


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    s = Settings()
    if s.is_production:
        missing = [n for n in ("master_key", "jwt_secret") if not getattr(s, n)]
        if missing:
            raise RuntimeError(
                f"Refusing to start in {s.environment} without: "
                + ", ".join(f"SEOOS_{m.upper()}" for m in missing)
            )
    return s


def reset_settings_cache() -> None:
    """Tests mutate the environment; this drops the memoised Settings."""
    get_settings.cache_clear()
    os.environ.pop("__seoos_settings_cached__", None)
