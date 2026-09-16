/**
 * Verify claimed backlinks against the pages that are supposed to carry them.
 *
 * This is the one thing in link building that is nearly always done badly, and
 * the reason is mechanical. `rel` is an HTML attribute, so any pipeline that
 * reads a page as markdown or plain text has thrown it away before the check
 * runs. Tools then report "no nofollow found" when what they mean is "we could
 * not have seen one". Here the served HTML is parsed and the attribute
 * survives, so followed is a fact.
 *
 * Runs on the server rather than in the browser because a third-party page
 * will not allow a cross-origin read, and because every fetch has to go
 * through the same SSRF checks as the crawler.
 */

import { fail, json, withEnv } from "@/server/http";
import { safeFetch } from "@/server/safe-fetch";
import { parseHtml } from "@/engine/parse";
import { verifyFrom, type LinkClaim, type LinkVerdict } from "@/engine/backlinks";
import { USER_AGENT } from "@/engine/fetcher";
import type { CrawledPage } from "@/engine/types";

export const dynamic = "force-dynamic";

/** Kept low: each one is a fetch of somebody else's server. */
const MAX_PER_REQUEST = 10;

export async function POST(request: Request): Promise<Response> {
  return withEnv(request, async () => {
    const body = (await request.json().catch(() => ({}))) as { claims?: LinkClaim[] };
    const claims = (body.claims ?? []).filter((c) => c && typeof c.sourceUrl === "string" && typeof c.targetDomain === "string");
    if (claims.length === 0) return fail("no_claims", "Send the links to check.");
    if (claims.length > MAX_PER_REQUEST) {
      return fail("too_many", `Send at most ${MAX_PER_REQUEST} at a time. Each one is a request to somebody else's server.`);
    }

    const verdicts: LinkVerdict[] = [];
    for (const claim of claims) {
      verdicts.push(await verifyOne(claim));
    }
    return json({ verdicts });
  });
}

async function verifyOne(claim: LinkClaim): Promise<LinkVerdict> {
  const started = Date.now();
  let page: CrawledPage;
  try {
    const response = await safeFetch(claim.sourceUrl, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const html = contentType.includes("html") ? await response.text() : "";
    page = {
      url: claim.sourceUrl,
      finalUrl: response.url || claim.sourceUrl,
      status: response.status,
      depth: 0,
      contentType,
      bytes: html.length,
      elapsedMs: Date.now() - started,
      redirectChain: [],
      error: response.ok ? null : `HTTP ${response.status}`,
      signals: html ? parseHtml(html, response.url || claim.sourceUrl) : null,
      inlinks: [],
      textHash: null,
    };
    return verifyFrom(page, claim, html);
  } catch (error) {
    page = {
      url: claim.sourceUrl, finalUrl: claim.sourceUrl, status: 0, depth: 0, contentType: "",
      bytes: 0, elapsedMs: Date.now() - started, redirectChain: [],
      error: error instanceof Error ? error.message : "could not be fetched",
      signals: null, inlinks: [], textHash: null,
    };
  }
  return verifyFrom(page, claim);
}
