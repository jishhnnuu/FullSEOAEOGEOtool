/**
 * One Google handshake, extended when it needs to be.
 *
 * Sign-in asks for identity alone. Later, when a screen can say why it wants
 * Search Console, the same grant is extended with `include_granted_scopes`,
 * so the user approves a scope rather than picking an account again. That is
 * the whole trick, and it is why Google sign-in is the default here and the
 * magic link is the fallback.
 *
 * Scope notes:
 *  - `webmasters.readonly` is read only and not a restricted scope. While the
 *    app is in Testing it works for listed test users; publishing the app
 *    goes through Google's verification with the Analytics scope anyway.
 *  - `analytics.readonly` is sensitive. It works immediately for accounts
 *    listed as testers on the OAuth consent screen, and needs Google's review
 *    before it works for the public. That review is weeks, so it starts early.
 *  - Business Profile needs a separate access request against the API itself,
 *    not just a scope. Until it clears, the product drafts posts for pasting.
 */

import { pkce, randomToken } from "./crypto";
import { googleClient, type Env } from "./env";
import { database } from "./env";
import { insert, inMinutes, isExpired, nowIso } from "./db";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const IDENTITY_SCOPES = ["openid", "email", "profile"];

export const PRODUCT_SCOPES: Record<string, { scopes: string[]; name: string; note: string }> = {
  gsc: {
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    name: "Google Search Console",
    note: "Read-only. Queries, impressions, clicks and index coverage for properties you already own.",
  },
  ga4: {
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    name: "Google Analytics 4",
    note: "Read-only. Sessions, conversions and revenue per landing page, so a ranking change can be tied to money.",
  },
  gbp: {
    scopes: ["https://www.googleapis.com/auth/business.manage"],
    name: "Google Business Profile",
    note: "Posts, hours and review replies. Google also gates this API behind its own access request.",
  },
};

/**
 * Search Console and Analytics together, on one approval.
 *
 * Asking for them one at a time is two trips to Google for something a person
 * thinks of as one decision: "let it see my Google data". Google shows each
 * scope as its own checkbox, so the person can still untick one, and the grant
 * is stored for whichever they left ticked.
 */
export const GOOGLE_BUNDLE = ["gsc", "ga4"] as const;

/** The scopes for a product name, where "google" means the bundle. */
export function scopesFor(product: string): string[] | null {
  if (product === "google") return GOOGLE_BUNDLE.flatMap((p) => PRODUCT_SCOPES[p].scopes);
  return PRODUCT_SCOPES[product]?.scopes ?? null;
}

export type StateKind = "signin" | "connect";

export type PendingState = {
  id: string;
  kind: StateKind;
  provider: string;
  user_id: string | null;
  org_id: string | null;
  site_id: string | null;
  product: string | null;
  code_verifier: string;
  next: string | null;
  claim_run_id: string | null;
  expires_at: string;
};

/** Store the round trip, hand back the URL to send the browser to. */
export async function startAuth(
  e: Env,
  options: {
    kind: StateKind;
    scopes: string[];
    redirectUri: string;
    /** Extends an existing grant rather than replacing it. */
    incremental?: boolean;
    /** Skips the account chooser when we already know whose account it is. */
    loginHint?: string;
    userId?: string;
    orgId?: string;
    siteId?: string;
    product?: string;
    next?: string;
    claimRunId?: string;
  },
): Promise<string> {
  const client = googleClient(e);
  const { verifier, challenge } = await pkce();
  const state = randomToken(24);

  await insert(e, "oauth_states", {
    id: state,
    kind: options.kind,
    provider: "google",
    user_id: options.userId ?? null,
    org_id: options.orgId ?? null,
    site_id: options.siteId ?? null,
    product: options.product ?? null,
    code_verifier: verifier,
    next: options.next ?? null,
    claim_run_id: options.claimRunId ?? null,
    created_at: nowIso(),
    expires_at: inMinutes(15),
  });

  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", client.id);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", options.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // A refresh token is the difference between a dashboard and a platform:
  // without one nothing can run on a schedule while the tab is closed.
  url.searchParams.set("access_type", "offline");
  // select_account: the person picks which Gmail, every time, because the
  // one that owns Search Console is often not the one they are signed into.
  // consent: Google only returns a refresh token on a consent screen.
  url.searchParams.set("prompt", "select_account consent");
  if (options.incremental) url.searchParams.set("include_granted_scopes", "true");
  if (options.loginHint) url.searchParams.set("login_hint", options.loginHint);
  return url.toString();
}

/** Read and spend a state. Single use, so a replayed callback goes nowhere. */
export async function takeState(e: Env, state: string): Promise<PendingState | null> {
  const row = await database(e)
    .prepare("SELECT * FROM oauth_states WHERE id = ?1 LIMIT 1")
    .bind(state)
    .first<PendingState>();
  if (!row) return null;
  await database(e).prepare("DELETE FROM oauth_states WHERE id = ?1").bind(state).run();
  if (isExpired(row.expires_at)) return null;
  return row;
}

export type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

export class GoogleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: string; error_description?: string };
      detail = parsed.error_description ?? parsed.error ?? detail;
    } catch {
      // Keep the raw body; Google occasionally answers with HTML.
    }
    throw new GoogleError("google_token_failed", `Google refused the token exchange: ${detail}`);
  }
  return JSON.parse(text) as TokenSet;
}

export async function exchangeCode(e: Env, code: string, verifier: string, redirectUri: string): Promise<TokenSet> {
  const client = googleClient(e);
  return tokenRequest(
    new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  );
}

export async function refresh(e: Env, refreshToken: string): Promise<TokenSet> {
  const client = googleClient(e);
  return tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: client.id,
      client_secret: client.secret,
      grant_type: "refresh_token",
    }),
  );
}

export async function revoke(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

export type Profile = { email: string; name: string | null; picture: string | null; verified: boolean };

/**
 * Who the tokens belong to.
 *
 * The id_token is read for its claims but its signature is not verified here,
 * because it arrived over TLS directly from Google's token endpoint in
 * response to a request carrying our client secret and a PKCE verifier. That
 * is the one case the OpenID spec says verification may be skipped. If the
 * id_token is absent, userinfo is called with the access token instead.
 */
export async function profileFrom(tokens: TokenSet): Promise<Profile> {
  if (tokens.id_token) {
    const claims = decodeJwtPayload(tokens.id_token);
    if (claims && typeof claims.email === "string") {
      return {
        email: claims.email,
        name: typeof claims.name === "string" ? claims.name : null,
        picture: typeof claims.picture === "string" ? claims.picture : null,
        verified: claims.email_verified === true || claims.email_verified === "true",
      };
    }
  }
  const response = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!response.ok) throw new GoogleError("google_profile_failed", "Google returned the tokens but not the profile.");
  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.email !== "string") throw new GoogleError("google_no_email", "Google did not return an email address.");
  return {
    email: body.email,
    name: typeof body.name === "string" ? body.name : null,
    picture: typeof body.picture === "string" ? body.picture : null,
    verified: body.email_verified === true,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
