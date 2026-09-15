/**
 * What this deployment is actually able to do.
 *
 * Every server capability here needs something the code cannot provide for
 * itself: a database binding, a master key, an OAuth client. Rather than
 * throwing a stack trace when one is missing, each is read through this
 * module, which reports the gap as a sentence a person can act on. That is
 * the same rule the audit engine follows: degrade with a reason, never
 * pretend to have succeeded.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type Env = {
  DB?: D1Database;
  SEOOS_MASTER_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PUBLIC_BASE_URL?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  SEOOS_API_URL?: string;
};

export async function env(): Promise<Env> {
  try {
    const context = await getCloudflareContext({ async: true });
    return { ...(process.env as unknown as Env), ...(context.env as unknown as Env) };
  } catch {
    // `next dev` outside the Workers runtime, and the build's own prerender
    // pass. Both get process.env alone, which is enough to report a gap.
    return process.env as unknown as Env;
  }
}

/* ------------------------------------------------------------ capability */

export type Gap = { capability: string; reason: string; fix: string };

export class NotConfigured extends Error {
  readonly gap: Gap;
  constructor(gap: Gap) {
    super(gap.reason);
    this.gap = gap;
  }
}

const DB_GAP: Gap = {
  capability: "accounts",
  reason: "This deployment has no database bound, so there is nowhere to keep an account.",
  fix: "Run `npm run cf:setup` once against your Cloudflare account. It creates the D1 database, writes the binding into wrangler.jsonc and applies the schema.",
};

const KEY_GAP: Gap = {
  capability: "credentials",
  reason: "SEOOS_MASTER_KEY is not set, so no connected account's token can be stored safely.",
  fix: "Run `npx wrangler secret put SEOOS_MASTER_KEY` and paste the output of `openssl rand -base64 32`.",
};

const GOOGLE_GAP: Gap = {
  capability: "google",
  reason: "No Google OAuth client is configured on this deployment.",
  fix: "Create a Web application client in Google Cloud Console, then set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as Worker secrets. `npm run cf:setup` walks through it.",
};

/** The database, or a stated reason there is none. */
export function database(e: Env): D1Database {
  if (!e.DB) throw new NotConfigured(DB_GAP);
  return e.DB;
}

/** The master key, or a stated reason there is none. */
export function masterKey(e: Env): string {
  if (!e.SEOOS_MASTER_KEY) throw new NotConfigured(KEY_GAP);
  return e.SEOOS_MASTER_KEY;
}

export type GoogleClient = { id: string; secret: string };

export function googleClient(e: Env): GoogleClient {
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new NotConfigured(GOOGLE_GAP);
  return { id: e.GOOGLE_CLIENT_ID, secret: e.GOOGLE_CLIENT_SECRET };
}

/**
 * The origin Google is told to redirect back to.
 *
 * Derived from the request by default, which is what keeps preview
 * deployments working without configuration. PUBLIC_BASE_URL overrides it for
 * the case that matters: a custom domain in front of the same Worker, where
 * the redirect URI registered with Google has to be one fixed string.
 */
export function baseUrl(e: Env, request: Request): string {
  if (e.PUBLIC_BASE_URL) return e.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/** What the sign-in screen is allowed to offer. Read before rendering it. */
export async function authMethods(): Promise<{
  google: boolean;
  email: boolean;
  ready: boolean;
  gaps: Gap[];
}> {
  const e = await env();
  const gaps: Gap[] = [];
  if (!e.DB) gaps.push(DB_GAP);
  if (!e.SEOOS_MASTER_KEY) gaps.push(KEY_GAP);
  const google = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  if (!google) gaps.push(GOOGLE_GAP);
  const email = Boolean(e.RESEND_API_KEY);
  return { google: google && Boolean(e.DB), email: email && Boolean(e.DB), ready: Boolean(e.DB), gaps };
}
