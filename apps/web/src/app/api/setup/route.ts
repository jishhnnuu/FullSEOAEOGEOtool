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
        name: "A D1 database bound as DB",
        done: Boolean(e.DB) && tables,
        detail: !e.DB
          ? "No binding on this Worker yet."
          : tables
            ? "Bound, and the tables are built."
            : schemaError
              ? `Bound, but the tables could not be built: ${schemaError}`
              : "Bound. The tables build themselves on the next request.",
        where: "Cloudflare dashboard, Storage and Databases, D1, then Workers, this Worker, Settings, Bindings.",
      },
      {
        key: "master_key",
        name: "SEOOS_MASTER_KEY",
        done: Boolean(e.SEOOS_MASTER_KEY),
        detail: e.SEOOS_MASTER_KEY
          ? "Set. Every stored credential is sealed with it."
          : "Not set. Sign-in works without it, but no connection can be stored.",
        where: "Cloudflare dashboard, this Worker, Settings, Variables and Secrets. 32 random bytes, base64.",
      },
      {
        key: "google_client",
        name: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
        done: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
        detail: e.GOOGLE_CLIENT_ID
          ? "Set. Sign in with Google, and connecting Search Console, both work."
          : "Not set. There is no way to sign in until this exists.",
        where: "console.cloud.google.com/apis/credentials, then add both as secrets here.",
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
    ready: methods.google && Boolean(e.DB) && tables,
  });
}
