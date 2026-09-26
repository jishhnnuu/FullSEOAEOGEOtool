/**
 * What this deployment can do, and what is missing.
 *
 * Deliberately readable without an account, because the person who has to fix
 * a gap is standing outside one. It names capabilities and reports booleans
 * plus the exact strings needed elsewhere (the two redirect URLs). It returns
 * no secret and no value of any secret, only whether each one is set.
 */

import { authMethods, baseUrl, env } from "@/server/env";
import { json } from "@/server/http";
import { ensureSchema } from "@/server/schema";
import { schemaReady } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const e = await env();
  let schemaError: string | null = null;
  try {
    await ensureSchema(e);
  } catch (error) {
    schemaError = error instanceof Error ? error.message : String(error);
  }
  const methods = await authMethods();
  const origin = baseUrl(e, request);
  const tables = e.DB ? await schemaReady(e) : false;

  return json({
    origin,
    steps: [
      {
        key: "database",
        name: "The database",
        done: Boolean(e.DB) && tables,
        detail: !e.DB
          ? "Not attached yet. The next deploy creates and attaches it by itself; if it is still missing after one, see below."
          : tables
            ? "Bound, and the tables are built."
            : schemaError
              ? `Bound, but the tables could not be built: ${schemaError}`
              : "Bound. The tables build themselves on the next request.",
        where: "Automatic. wrangler.jsonc names it, and each deploy creates or reuses it.",
      },
      {
        key: "master_key",
        name: "SEOOS_MASTER_KEY",
        done: Boolean(e.SEOOS_MASTER_KEY),
        detail: e.SEOOS_MASTER_KEY
          ? "Set. Every stored credential is sealed with it."
          : "Not set. Sign-in works without it, but no connection can be stored.",
        where: "Generated below. Cloudflare dashboard, this Worker, Settings, Variables and Secrets, as a Secret.",
      },
      {
        key: "google_client",
        name: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
        done: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
        detail: e.GOOGLE_CLIENT_ID
          ? "Set. Sign in with Google, and connecting Search Console and Analytics, both work."
          : "Not set. There is no way to sign in until this exists.",
        where: "Made in Google Cloud (steps below), then added as two Secrets on this Worker.",
      },
      {
        key: "owners",
        name: "OWNER_EMAILS",
        done: Boolean(e.OWNER_EMAILS),
        optional: true,
        detail: e.OWNER_EMAILS
          ? "Set. Those people can read book-a-call enquiries at /app/enquiries after signing in."
          : "Not set, so book-a-call enquiries are stored but nobody can read them in the app yet.",
        where: "A Variable on this Worker: the email addresses you sign in with, separated by commas.",
      },
      {
        key: "contact",
        name: "CONTACT_EMAIL",
        done: Boolean(e.CONTACT_EMAIL && e.RESEND_API_KEY),
        optional: true,
        detail: e.CONTACT_EMAIL
          ? e.RESEND_API_KEY
            ? `Set. Each enquiry is emailed to ${e.CONTACT_EMAIL}, and replying answers the person directly.`
            : "Set, but RESEND_API_KEY is not, so nothing can be emailed yet. Enquiries are still stored."
          : "Not set, so enquiries are stored in the inbox but not emailed to you.",
        where: "A Variable on this Worker: the inbox that should receive enquiries. Needs RESEND_API_KEY too.",
      },
      {
        key: "booking",
        name: "BOOKING_URL",
        done: Boolean(e.BOOKING_URL),
        optional: true,
        detail: e.BOOKING_URL
          ? "Set. After sending the form, people can pick a time straight away."
          : "Not set, so the form says you'll email to find a time.",
        where: "A Variable on this Worker: your Calendly or Cal.com page, starting https://.",
      },
      {
        key: "mail",
        name: "RESEND_API_KEY",
        done: Boolean(e.RESEND_API_KEY),
        optional: true,
        detail: e.RESEND_API_KEY
          ? "Set. The magic link is offered alongside Google."
          : "Not set, so the sign-in screen offers Google alone rather than pretending it can send mail.",
        where: "resend.com, free for 3,000 emails a month.",
      },
      {
        key: "base_url",
        name: "PUBLIC_BASE_URL",
        done: Boolean(e.PUBLIC_BASE_URL),
        optional: true,
        detail: e.PUBLIC_BASE_URL
          ? `Pinned to ${e.PUBLIC_BASE_URL}.`
          : `Not set, so redirects are derived per request. Currently ${origin}.`,
        where: "Set it once a custom domain is in front of this Worker.",
      },
    ],
    /** Paste these two into the Google client, exactly. */
    redirectUris: [`${origin}/api/auth/google/callback`, `${origin}/api/connections/google/callback`],
    scopes: {
      identity: ["openid", "email", "profile"],
      searchConsole: ["https://www.googleapis.com/auth/webmasters.readonly"],
      analytics: ["https://www.googleapis.com/auth/analytics.readonly"],
      businessProfile: ["https://www.googleapis.com/auth/business.manage"],
    },
    apis: ["Google Search Console API", "Google Analytics Data API", "Google Analytics Admin API"],
    ready: methods.google && Boolean(e.DB) && tables && Boolean(e.SEOOS_MASTER_KEY),
  });
}
