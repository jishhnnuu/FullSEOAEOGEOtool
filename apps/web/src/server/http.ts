/**
 * Route plumbing: one error shape, one place origin is checked.
 */

import { env, NotConfigured, type Env } from "./env";
import { identify, type Identity } from "./session";

export type ApiError = { code: string; message: string; fix?: string };

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init.headers ?? {}) },
  });
}

export function fail(code: string, message: string, status = 400, fix?: string): Response {
  return json({ code, message, ...(fix ? { fix } : {}) } satisfies ApiError, { status });
}

/**
 * Cross-tenant reads answer 404, never 403.
 *
 * A 403 confirms the row exists, which tells an attacker what to guess next.
 * Everything scoped in this app answers with this.
 */
export function notFound(): Response {
  return fail("not_found", "No such record.", 404);
}

export function unauthorized(): Response {
  return fail("not_signed_in", "Sign in to do that.", 401);
}

/**
 * A mutating request must come from this origin.
 *
 * SameSite=Lax already blocks a cross-site POST from carrying the cookie, and
 * this is the second lock: browsers that predate the attribute, and any future
 * route that relaxes it, still cannot be driven from another page.
 */
export function sameOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Not a browser fetch; no ambient cookie to abuse.
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export type Context = { e: Env; who: Identity };

/**
 * Run a handler with a signed-in identity, or answer 401.
 *
 * Every `NotConfigured` gap raised inside becomes a 503 carrying the sentence
 * that says what to do about it, rather than a stack trace.
 */
export async function withAuth(
  request: Request,
  handler: (context: Context) => Promise<Response>,
): Promise<Response> {
  if (!sameOrigin(request)) return fail("bad_origin", "That request did not come from this site.", 403);
  try {
    const e = await env();
    const who = await identify(e, request);
    if (!who) return unauthorized();
    return await handler({ e, who });
  } catch (error) {
    return handleError(error);
  }
}

/** Run a handler that does not need an identity. */
export async function withEnv(
  request: Request,
  handler: (e: Env, who: Identity | null) => Promise<Response>,
): Promise<Response> {
  if (!sameOrigin(request)) return fail("bad_origin", "That request did not come from this site.", 403);
  try {
    const e = await env();
    const who = await identify(e, request).catch(() => null);
    return await handler(e, who);
  } catch (error) {
    return handleError(error);
  }
}

export function handleError(error: unknown): Response {
  if (error instanceof NotConfigured) {
    return json({ code: "not_configured", message: error.gap.reason, fix: error.gap.fix, capability: error.gap.capability }, { status: 503 });
  }
  const message = error instanceof Error ? error.message : String(error);
  return fail("server_error", message, 500);
}

/** Redirect the browser, carrying a message the sign-in screen can read. */
export function redirect(to: string, headers: string[] = []): Response {
  const h = new Headers({ location: to, "cache-control": "no-store" });
  for (const cookie of headers) h.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers: h });
}
