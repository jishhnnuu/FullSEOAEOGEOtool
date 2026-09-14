"""Credential encryption.

Tenant credentials (OAuth refresh tokens, CMS app passwords, data-provider
keys) are the most sensitive thing the platform holds. They are stored
envelope-encrypted: a per-record data key wrapped by the deployment master
key, so rotating the master key never requires touching ciphertext rows and
a leaked database row is useless on its own.

The implementation deliberately uses only ``cryptography`` primitives that
ship in every environment, with no KMS dependency, while keeping the shape
(wrapped data key + ciphertext) that a KMS drop-in needs.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken

from seoos.core.config import get_settings
from seoos.core.errors import SeoOSError

# Exactly 32 bytes, as Fernet requires. Only ever used when the deployment
# is explicitly in dev mode with no master key set.
_DEV_KEY_MATERIAL = b"seoos-dev-key-do-not-use-in-prod"


class DecryptionFailed(SeoOSError):
    code = "decryption_failed"
    http_status = 500


@dataclass(frozen=True)
class SealedSecret:
    """What actually gets written to the database."""

    wrapped_key: str
    ciphertext: str
    version: int = 1

    def to_json(self) -> str:
        return json.dumps(
            {"v": self.version, "k": self.wrapped_key, "c": self.ciphertext},
            separators=(",", ":"),
        )

    @classmethod
    def from_json(cls, blob: str) -> SealedSecret:
        try:
            data = json.loads(blob)
            return cls(wrapped_key=data["k"], ciphertext=data["c"], version=int(data.get("v", 1)))
        except (ValueError, KeyError, TypeError) as exc:
            raise DecryptionFailed("Stored secret is not a valid sealed envelope") from exc


def _master_fernet() -> Fernet:
    settings = get_settings()
    key = settings.master_key
    if not key:
        if not settings.allow_insecure_dev_keys or settings.is_production:
            raise SeoOSError(
                "SEOOS_MASTER_KEY is not set. Generate one with: python -m seoos.cli keygen"
            )
        key = base64.urlsafe_b64encode(_DEV_KEY_MATERIAL).decode()
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, TypeError) as exc:
        raise SeoOSError("SEOOS_MASTER_KEY is not a valid 32-byte url-safe base64 key") from exc


def generate_master_key() -> str:
    return Fernet.generate_key().decode()


def seal(plaintext: str | bytes | dict) -> str:
    """Encrypt a credential and return the JSON envelope to persist."""
    if isinstance(plaintext, dict):
        raw = json.dumps(plaintext, separators=(",", ":")).encode()
    elif isinstance(plaintext, str):
        raw = plaintext.encode()
    else:
        raw = plaintext

    data_key = Fernet.generate_key()
    ciphertext = Fernet(data_key).encrypt(raw)
    wrapped = _master_fernet().encrypt(data_key)
    return SealedSecret(
        wrapped_key=wrapped.decode(), ciphertext=ciphertext.decode()
    ).to_json()


def unseal(envelope: str) -> bytes:
    sealed = SealedSecret.from_json(envelope)
    try:
        data_key = _master_fernet().decrypt(sealed.wrapped_key.encode())
        return Fernet(data_key).decrypt(sealed.ciphertext.encode())
    except InvalidToken as exc:
        raise DecryptionFailed(
            "Could not decrypt a stored credential. The master key has most "
            "likely changed since it was written."
        ) from exc


def unseal_text(envelope: str) -> str:
    return unseal(envelope).decode()


def unseal_json(envelope: str) -> dict:
    return json.loads(unseal(envelope).decode())


def rewrap(envelope: str, new_master: str) -> str:
    """Re-encrypt an envelope under a new master key. Used by key rotation."""
    plaintext = unseal(envelope)
    old = os.environ.get("SEOOS_MASTER_KEY")
    try:
        os.environ["SEOOS_MASTER_KEY"] = new_master
        get_settings.cache_clear()
        return seal(plaintext)
    finally:
        if old is None:
            os.environ.pop("SEOOS_MASTER_KEY", None)
        else:
            os.environ["SEOOS_MASTER_KEY"] = old
        get_settings.cache_clear()


def new_token(prefix: str = "", nbytes: int = 24) -> str:
    body = secrets.token_urlsafe(nbytes)
    return f"{prefix}_{body}" if prefix else body


def constant_time_equals(a: str, b: str) -> bool:
    return secrets.compare_digest(a.encode(), b.encode())
