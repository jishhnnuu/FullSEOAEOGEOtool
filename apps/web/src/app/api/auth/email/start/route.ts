/**
 * Ask for a sign-in link by email.
 *
 * Always answers the same way whether or not the address has an account,
 * because an endpoint that says "no such user" is an endpoint that enumerates
 * your customer list. The token is single use, fifteen minutes long, and
 * stored only as its hash.
 */

import { randomToken, sha256Hex } from "@/server/crypto";
import { baseUrl, env } from "@/server/env";
import { fail, json, withEnv } from "@/server/http";
import { insert, inMinutes, nowIso } from "@/server/db";
import { canSend, sendLoginLink } from "@/server/mail";
import { readCookie, CLAIM_COOKIE } from "@/server/session";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request): Promise<Response> {
  return withEnv(request, async (e) => {
    if (!canSend(e)) {
      return fail(
        "no_mail_sender",
        "This deployment has no email sender configured, so a link cannot be sent.",
        503,
        "Set RESEND_API_KEY as a Worker secret, or sign in with Google.",
      );
    }
    const body = (await request.json().catch(() => ({}))) as { email?: string; next?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return fail("bad_email", "That does not look like an email address.");

    const token = randomToken(32);
    await insert(e, "login_tokens", {
      id: await sha256Hex(token),
      email,
      claim_run_id: readCookie(request, CLAIM_COOKIE),
      next: body.next && body.next.startsWith("/") ? body.next : "/app",
      created_at: nowIso(),
      expires_at: inMinutes(15),
      used_at: null,
    });

    const link = `${baseUrl(e, request)}/api/auth/email/callback?token=${encodeURIComponent(token)}`;
    const sent = await sendLoginLink(e, email, link);
    if (!sent.ok) return fail("send_failed", sent.reason, 502);

    // Deliberately the same answer for an address with an account and one
    // without. The user learns nothing they did not already know.
    return json({ ok: true, message: "If that address can receive mail, a link is on its way. It expires in fifteen minutes." });
  });
}
