/**
 * Sessions, and the identity they resolve to.
 *
 * The cookie holds a random 32-byte token. The database holds its SHA-256, so
 * a leaked row cannot be replayed as a login. The cookie is `__Host-` prefixed,
 * which browsers refuse to accept unless it is Secure, path `/` and carries no
 * Domain attribute, meaning no subdomain can set or read it. SameSite is Lax
 * rather than Strict so that a redirect back from Google still arrives signed
 * in; nothing here is a state-changing GET, and every mutating route checks
 * the origin.
 */

import { newId, randomToken, sha256Hex } from "./crypto";
import { database, type Env } from "./env";
import { fetchScoped, insert, inDays, isExpired, nowIso, upsert } from "./db";

export const SESSION_COOKIE = "__Host-seoos_session";
export const CLAIM_COOKIE = "__Host-seoos_claim";
const SESSION_DAYS = 30;

export type Identity = {
  userId: string;
  orgId: string;
  email: string;
  name: string | null;
  picture: string | null;
  orgName: string;
  plan: string;
  role: string;
};

/* --------------------------------------------------------------- cookies */

export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

/**
 * A Set-Cookie line.
 *
 * `__Host-` requires Secure, so a plain-http localhost run drops the prefix
 * rather than silently setting a cookie the browser will throw away.
 */
export function setCookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  const realName = secure ? name : name.replace(/^__Host-/, "");
  const bits = [
    `${realName}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  return setCookie(name, "", 0, secure);
}

export function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

/** Read the session cookie under whichever name this origin can set. */
export function readCookie(request: Request, name: string): string | null {
  return cookieValue(request, name) ?? cookieValue(request, name.replace(/^__Host-/, ""));
}

/* -------------------------------------------------------------- sessions */

export async function createSession(
  e: Env,
  userId: string,
  orgId: string,
  userAgent: string | null,
): Promise<{ token: string; cookie: (secure: boolean) => string }> {
  const token = randomToken(32);
  await insert(e, "sessions", {
    id: await sha256Hex(token),
    user_id: userId,
    org_id: orgId,
    created_at: nowIso(),
    expires_at: inDays(SESSION_DAYS),
    last_used_at: nowIso(),
    user_agent: userAgent?.slice(0, 200) ?? null,
  });
  return {
    token,
    cookie: (secure: boolean) => setCookie(SESSION_COOKIE, token, SESSION_DAYS * 86_400, secure),
  };
}

/** Who is making this request, or null. Never throws on a missing database. */
export async function identify(e: Env, request: Request): Promise<Identity | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  let row: Record<string, string> | null = null;
  try {
    row = await database(e)
      .prepare(
        `SELECT s.id AS sid, s.expires_at AS expires_at, s.org_id AS org_id,
                u.id AS user_id, u.email AS email, u.name AS name, u.picture AS picture,
                o.name AS org_name, o.plan AS plan, m.role AS role
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           JOIN orgs  o ON o.id = s.org_id
           LEFT JOIN memberships m ON m.org_id = s.org_id AND m.user_id = s.user_id
          WHERE s.id = ?1 LIMIT 1`,
      )
      .bind(await sha256Hex(token))
      .first<Record<string, string>>();
  } catch {
    return null;
  }
  if (!row || isExpired(row.expires_at)) return null;

  return {
    userId: row.user_id,
    orgId: row.org_id,
    email: row.email,
    name: row.name ?? null,
    picture: row.picture ?? null,
    orgName: row.org_name,
    plan: row.plan,
    role: row.role ?? "owner",
  };
}

export async function destroySession(e: Env, request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  try {
    await database(e).prepare("DELETE FROM sessions WHERE id = ?1").bind(await sha256Hex(token)).run();
  } catch {
    // Signing out of a session that is already gone is a success, not an error.
  }
}

/* -------------------------------------------------------------- identity */

/**
 * Find or create the person behind a verified email address.
 *
 * A first sign-in also creates the org and the membership, because a person
 * with nowhere to put a site is not a usable account. The org is named after
 * the email domain, which is right often enough to be worth doing and is
 * editable afterwards.
 */
export async function upsertUser(
  e: Env,
  profile: { email: string; name?: string | null; picture?: string | null; verified: boolean },
): Promise<{ userId: string; orgId: string; created: boolean }> {
  const email = profile.email.trim().toLowerCase();
  const existing = await database(e)
    .prepare("SELECT id FROM users WHERE email = ?1 LIMIT 1")
    .bind(email)
    .first<{ id: string }>();

  if (existing) {
    await database(e)
      .prepare("UPDATE users SET name = COALESCE(?2, name), picture = COALESCE(?3, picture), email_verified = MAX(email_verified, ?4), last_seen_at = ?5 WHERE id = ?1")
      .bind(existing.id, profile.name ?? null, profile.picture ?? null, profile.verified ? 1 : 0, nowIso())
      .run();
    const membership = await database(e)
      .prepare("SELECT org_id FROM memberships WHERE user_id = ?1 ORDER BY created_at LIMIT 1")
      .bind(existing.id)
      .first<{ org_id: string }>();
    if (membership) return { userId: existing.id, orgId: membership.org_id, created: false };
    const orgId = await createOrg(e, existing.id, email);
    return { userId: existing.id, orgId, created: false };
  }

  const userId = newId("usr");
  await insert(e, "users", {
    id: userId,
    email,
    name: profile.name ?? null,
    picture: profile.picture ?? null,
    email_verified: profile.verified ? 1 : 0,
    created_at: nowIso(),
    last_seen_at: nowIso(),
  });
  const orgId = await createOrg(e, userId, email);
  return { userId, orgId, created: true };
}

async function createOrg(e: Env, userId: string, email: string): Promise<string> {
  const orgId = newId("org");
  const domain = email.split("@")[1] ?? "";
  const generic = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com"]);
  const name = domain && !generic.has(domain) ? domain : email.split("@")[0];
  await insert(e, "orgs", { id: orgId, name, plan: "trial", autonomy: "propose", created_at: nowIso() });
  await upsert(e, "memberships", ["org_id", "user_id"], {
    org_id: orgId,
    user_id: userId,
    role: "owner",
    created_at: nowIso(),
  });
  return orgId;
}

/** Confirm a site belongs to the caller, without saying so when it does not. */
export async function ownedSite(e: Env, siteId: string, orgId: string): Promise<Record<string, string> | null> {
  return fetchScoped<Record<string, string>>(e, "sites", siteId, orgId);
}
