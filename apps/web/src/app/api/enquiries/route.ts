/**
 * The book-a-call form.
 *
 *   GET   the form's settings (whether a scheduling link exists), and, for an
 *         owner listed in OWNER_EMAILS, the enquiries inbox
 *   POST  a new enquiry
 *
 * The POST needs no account, so it carries its own defences: the same-origin
 * check every mutating route has, a hidden field a person never fills, a
 * minimum time on the page, and five enquiries an hour per network address.
 * A submission caught by the first two is answered as a success, so a bot
 * learns nothing from the reply.
 */

import { env } from "@/server/env";
import { fail, handleError, json, notFound, sameOrigin } from "@/server/http";
import { ensureSchema } from "@/server/schema";
import { identify } from "@/server/session";
import { ipHash, isOwner, listEnquiries, takeEnquiry, tooMany } from "@/server/enquiries";
import { validateEnquiry, type EnquiryInput } from "@/engine/enquiry";

export const dynamic = "force-dynamic";

/** A person takes longer than this to fill the form in. */
const MIN_MS = 2500;

export async function GET(request: Request): Promise<Response> {
  try {
    const e = await env();
    await ensureSchema(e);
    const params = new URL(request.url).searchParams;
    if (params.get("inbox") === "1") {
      const who = await identify(e, request).catch(() => null);
      if (!who || !isOwner(e, who.email) || !e.DB) return notFound();
      return json({ enquiries: await listEnquiries(e) });
    }
    return json({ bookingUrl: bookingUrl(e.BOOKING_URL), accepting: Boolean(e.DB || (e.CONTACT_EMAIL && e.RESEND_API_KEY)) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return fail("bad_origin", "That request did not come from this site.", 403);
  try {
    const text = await request.text();
    if (text.length > 8000) return fail("too_large", "That message is longer than the form allows.", 413);
    let body: EnquiryInput & { trap?: unknown; openedAt?: unknown };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      return fail("bad_body", "The form did not send what we expected. Refresh and try again.");
    }

    // Caught by the trap or too quick to be a person: pretend it worked.
    const opened = typeof body.openedAt === "number" ? body.openedAt : 0;
    if ((typeof body.trap === "string" && body.trap.trim()) || Date.now() - opened < MIN_MS) {
      return json({ ok: true, stored: false, emailed: false });
    }

    const checked = validateEnquiry(body);
    if (!checked.ok) return fail("invalid", checked.message);

    const e = await env();
    await ensureSchema(e);
    if (!e.DB && !(e.CONTACT_EMAIL && e.RESEND_API_KEY)) {
      return fail(
        "not_accepting",
        "This deployment has nowhere to put your message yet. Please try again later.",
        503,
      );
    }
    const hash = await ipHash(request);
    if (await tooMany(e, hash)) {
      return fail("too_many", "We've had a few messages from you already. We'll be in touch, or try again in an hour.", 429);
    }
    const result = await takeEnquiry(e, checked.enquiry, hash);
    return json({ ok: true, ...result, bookingUrl: bookingUrl(e.BOOKING_URL) });
  } catch (error) {
    return handleError(error);
  }
}

/** Only an https link is ever handed to the page as somewhere to send people. */
function bookingUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
