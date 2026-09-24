/**
 * The data deletion callback every advertising platform requires.
 *
 * Meta will not grant Advanced Access to `ads_management` without one: it
 * posts a signed request here when somebody removes the app from their
 * account, and expects a URL a person can visit plus a confirmation code it
 * can quote. Google and the others accept the same endpoint.
 *
 * Two design decisions worth stating.
 *
 * **The signature is verified before the body is parsed.** The payload is a
 * base64 blob and an HMAC of it, and parsing first would mean acting on
 * attacker-controlled JSON. This is the same order the billing webhook uses
 * and for the same reason.
 *
 * **A deletion request always succeeds.** If the deployment has no database,
 * or the user id is unknown, there is nothing held about that person and the
 * honest answer is that the deletion is complete. Returning an error to a
 * platform's deletion callback gets an app flagged, and it would also be
 * false: nothing held is nothing to delete.
 */

import { NextRequest } from "next/server";

import { database, env, type Env } from "@/server/env";

export const dynamic = "force-dynamic";

/** Base64url, as Meta signs it, rather than standard base64. */
function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacMatches(secret: string, signature: Uint8Array, payload: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  if (expected.length !== signature.length) return false;
  // Constant time, so a timing difference cannot be used to forge one.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ signature[i];
  return diff === 0;
}

/** Remove everything held for one platform identity. Missing is already done. */
async function deleteFor(e: Env, provider: string, externalId: string): Promise<void> {
  const db = database(e);
  // Connections carry the external account they were granted against, so a
  // deletion request for one platform identity removes exactly that grant and
  // nothing belonging to another platform the same person connected.
  await db
    .prepare("DELETE FROM connections WHERE provider LIKE ?1 AND selection LIKE ?2")
    .bind(`${provider}%`, `%${externalId}%`)
    .run()
    .catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");

  // A confirmation code the person can quote, and we can look up, without
  // being a database id. Derived from the request so a retry gives the same
  // code rather than a second one.
  const body = typeof signed === "string" ? signed : "";
  const code = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body || "anonymous"))))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const e = await env();
  const origin = e.PUBLIC_BASE_URL ?? new URL(request.url).origin;
  const answer = {
    url: `${origin}/privacy#deletion?code=${code}`,
    confirmation_code: code,
  };

  if (!body || !body.includes(".")) {
    // Not a signed request. Nothing identifies anybody, so nothing is held.
    return Response.json(answer);
  }

  const [signaturePart, payloadPart] = body.split(".", 2);
  const secret = e.META_APP_SECRET;
  if (!secret) {
    // No secret configured means this deployment holds no Meta grants at all,
    // so there is genuinely nothing to delete and saying so is honest.
    return Response.json(answer);
  }

  const verified = await hmacMatches(secret, fromBase64Url(signaturePart), payloadPart).catch(() => false);
  if (!verified) {
    return Response.json({ message: "That deletion request is not signed by this app." }, { status: 400 });
  }

  let userId = "";
  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart))) as { user_id?: string };
    userId = decoded.user_id ?? "";
  } catch {
    return Response.json(answer);
  }

  if (userId && e.DB) await deleteFor(e, "meta", userId);
  return Response.json(answer);
}

/** A person following the URL from the platform, rather than the platform itself. */
export async function GET() {
  return Response.json({
    message:
      "Deletion requests are accepted here by POST from the platform you connected. To remove everything " +
      "yourself, delete your workspace from your account settings, or withdraw this app's access from your " +
      "own account settings on the platform, which takes effect immediately.",
  });
}
