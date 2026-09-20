/**
 * The magic link, for people who will not use a Google account.
 *
 * Sending email is the one part of this that needs a paid service sooner or
 * later. Resend's free tier covers a product being tested, and until a key is
 * set the sign-in screen does not offer the option at all rather than
 * accepting an address and dropping the message on the floor.
 */

import type { Env } from "./env";

import { BRAND } from "@/lib/brand";

export type SendResult = { ok: true } | { ok: false; reason: string };

export function canSend(e: Env): boolean {
  return Boolean(e.RESEND_API_KEY);
}

export async function sendLoginLink(e: Env, to: string, link: string): Promise<SendResult> {
  if (!e.RESEND_API_KEY) {
    return {
      ok: false,
      reason:
        "No email sender is configured on this deployment, so a sign-in link cannot be sent. " +
        "Set RESEND_API_KEY as a Worker secret, or sign in with Google instead.",
    };
  }
  const from = e.MAIL_FROM ?? `${BRAND} <onboarding@resend.dev>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Your sign-in link",
      text: [
        "Here is the link that signs you in. It works once and expires in fifteen minutes.",
        "",
        link,
        "",
        "If you did not ask for this, nothing has happened and you can ignore it.",
      ].join("\n"),
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    return { ok: false, reason: `The email service answered ${response.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

/**
 * Any other message this deployment sends: a report, a milestone, a
 * regression worth knowing about the day it happens.
 *
 * Same rule as the sign-in link. With no sender configured this returns the
 * reason rather than throwing, and the caller records that the report was
 * generated but not delivered. A report that silently never arrives is worse
 * than one that says it could not be sent.
 */
export async function send(
  e: Env,
  message: { to: string; subject: string; text: string },
): Promise<SendResult> {
  if (!e.RESEND_API_KEY) {
    return {
      ok: false,
      reason:
        "No email sender is configured on this deployment, so the report was built but not sent. " +
        "Set RESEND_API_KEY as a Worker secret to turn delivery on.",
    };
  }
  const from = e.MAIL_FROM ?? `${BRAND} <onboarding@resend.dev>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
  });
  if (!response.ok) {
    const body = await response.text();
    return { ok: false, reason: `The email service answered ${response.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}
