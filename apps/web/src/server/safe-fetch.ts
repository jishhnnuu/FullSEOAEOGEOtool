/**
 * The server side of the same SSRF rule the crawler follows.
 *
 * Connections point at addresses a user typed, and this Worker holds
 * credentials, so a URL that resolves to a private range is exactly the shape
 * of a credential-stealing request. The engine's `validateUrl` already encodes
 * the rule; this wraps it for server routes and adds the redirect check, so a
 * public host that 302s to 169.254.169.254 gets stopped on the second hop
 * rather than the first.
 */

import { validateUrl as checkUrl } from "@/engine/fetcher";

export async function validateUrl(raw: string): Promise<URL> {
  const result = checkUrl(raw);
  if (!result.ok) throw new Error(result.reason);
  return result.url;
}

/**
 * Fetch, re-checking the destination after every redirect.
 *
 * `redirect: "manual"` rather than letting fetch follow, because a followed
 * redirect is a request the check never saw.
 */
export async function safeFetch(raw: string, init: RequestInit = {}, maxHops = 4): Promise<Response> {
  let target = (await validateUrl(raw)).toString();
  for (let hop = 0; hop <= maxHops; hop += 1) {
    const response = await fetch(target, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    target = (await validateUrl(new URL(location, target).toString())).toString();
  }
  throw new Error(`Too many redirects from ${raw}.`);
}
