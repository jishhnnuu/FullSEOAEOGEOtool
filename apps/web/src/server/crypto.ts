/**
 * Credential sealing, session tokens and identifiers, on WebCrypto.
 *
 * This mirrors `core/crypto.py`: every secret is envelope-encrypted with a
 * per-record data key which is itself wrapped by the deployment master key,
 * so rotating the master key rewraps keys without rewriting ciphertext and a
 * stolen database row is useless on its own. The primitive differs because
 * Workers have no Fernet: this is AES-256-GCM both times, marked `v: 2` in
 * the envelope so a future reader can tell the two apart.
 *
 * Nothing here ever logs a plaintext, and nothing returns one except `open`.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export type SealedEnvelope = {
  /** Envelope version. 1 is the Python Fernet shape, 2 is this one. */
  v: number;
  /** The data key, wrapped by the master key. */
  k: string;
  /** The payload, encrypted under the data key. */
  c: string;
};

export class SealError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------------------------------------- encodings */

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/** A URL-safe random token. 32 bytes is the floor for anything session-like. */
export function randomToken(bytes = 32): string {
  return toBase64Url(randomBytes(bytes));
}

/** A short, sortable, collision-resistant id: millisecond prefix plus entropy. */
export function newId(prefix: string): string {
  const stamp = Date.now().toString(36).padStart(9, "0");
  return `${prefix}_${stamp}${toBase64Url(randomBytes(9))}`;
}

/** SHA-256, hex. Used for anything stored as a lookup of a bearer token. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string compare, so a lookup never leaks a prefix by timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ----------------------------------------------------------------- keys */

async function importAes(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function masterKey(material: string | undefined): Promise<CryptoKey> {
  if (!material) {
    throw new SealError(
      "no_master_key",
      "SEOOS_MASTER_KEY is not set on this deployment, so credentials cannot be stored. " +
        "Generate one with: openssl rand -base64 32",
    );
  }
  let raw: Uint8Array;
  try {
    raw = fromBase64Url(material.trim());
  } catch {
    throw new SealError("bad_master_key", "SEOOS_MASTER_KEY is not valid base64.");
  }
  if (raw.length !== 32) {
    throw new SealError(
      "bad_master_key",
      `SEOOS_MASTER_KEY decodes to ${raw.length} bytes; it must be exactly 32.`,
    );
  }
  return importAes(raw);
}

/** AES-GCM with the nonce prefixed, which is how both layers store it. */
async function encryptWith(key: CryptoKey, plaintext: Uint8Array): Promise<string> {
  const iv = randomBytes(12);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext as BufferSource),
  );
  const joined = new Uint8Array(iv.length + sealed.length);
  joined.set(iv, 0);
  joined.set(sealed, iv.length);
  return toBase64Url(joined);
}

async function decryptWith(key: CryptoKey, blob: string): Promise<Uint8Array> {
  const joined = fromBase64Url(blob);
  if (joined.length < 13) throw new SealError("decryption_failed", "Sealed value is too short to be valid.");
  const iv = joined.slice(0, 12);
  const body = joined.slice(12);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, body as BufferSource),
    );
  } catch {
    throw new SealError(
      "decryption_failed",
      "A stored credential could not be decrypted. The master key has changed, or the row is corrupt.",
    );
  }
}

/* --------------------------------------------------------------- public */

/** Encrypt a credential and return the JSON envelope to persist. */
export async function seal(value: string | Record<string, unknown>, master: string | undefined): Promise<string> {
  const raw = enc.encode(typeof value === "string" ? value : JSON.stringify(value));
  const dataKeyRaw = randomBytes(32);
  const dataKey = await importAes(dataKeyRaw);
  const ciphertext = await encryptWith(dataKey, raw);
  const wrapped = await encryptWith(await masterKey(master), dataKeyRaw);
  const envelope: SealedEnvelope = { v: 2, k: wrapped, c: ciphertext };
  return JSON.stringify(envelope);
}

/** Decrypt an envelope. The only function in the codebase that returns a secret. */
export async function open(blob: string, master: string | undefined): Promise<string> {
  let envelope: SealedEnvelope;
  try {
    envelope = JSON.parse(blob) as SealedEnvelope;
  } catch {
    throw new SealError("decryption_failed", "Stored secret is not a valid sealed envelope.");
  }
  if (envelope.v !== 2 || !envelope.k || !envelope.c) {
    throw new SealError(
      "decryption_failed",
      `Sealed envelope version ${envelope.v} cannot be read by this runtime.`,
    );
  }
  const dataKeyRaw = await decryptWith(await masterKey(master), envelope.k);
  return dec.decode(await decryptWith(await importAes(dataKeyRaw), envelope.c));
}

/** Decrypt an envelope that holds JSON. */
export async function openJson<T>(blob: string, master: string | undefined): Promise<T> {
  return JSON.parse(await open(blob, master)) as T;
}

/** Rewrap a record's data key under a new master key, ciphertext untouched. */
export async function rewrap(blob: string, oldMaster: string, newMaster: string): Promise<string> {
  const envelope = JSON.parse(blob) as SealedEnvelope;
  const dataKeyRaw = await decryptWith(await masterKey(oldMaster), envelope.k);
  const wrapped = await encryptWith(await masterKey(newMaster), dataKeyRaw);
  return JSON.stringify({ ...envelope, k: wrapped } satisfies SealedEnvelope);
}

/* ------------------------------------------------------------------ PKCE */

export type Pkce = { verifier: string; challenge: string };

/** S256 PKCE, which Google requires for a public client and accepts for ours. */
export async function pkce(): Promise<Pkce> {
  const verifier = randomToken(48);
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(verifier));
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) };
}
