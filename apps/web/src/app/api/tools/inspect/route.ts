/**
 * One request that powers every free tool.
 *
 * The competing free tools in this category are toys: a word counter, a slug
 * generator, a favicon resizer. They are built as link bait and they are
 * honest about being link bait. These run the same fetcher, the same parser
 * and the same 90-check catalogue that the paid audit runs, against the
 * visitor's real site, which is why they are worth the CPU.
 *
 * Everything happens in the Worker because a browser cannot read a
 * third-party origin, and nothing is stored: the response goes straight back
 * to the tab that asked. The same SSRF validation the crawler uses applies
 * here, so a tool cannot be pointed at a private range or a metadata endpoint.
 */

import { NextRequest } from "next/server";

import { fetchPage, fetchSiteFiles, validateUrl } from "@/engine/fetcher";
import { AI_CRAWLER_LIST, robotsAllows } from "@/engine/robots";
import type { CrawledPage, SiteFiles } from "@/engine/types";

export const dynamic = "force-dynamic";

export type InspectScope = "page" | "site";

export type CrawlerVerdict = {
  agent: string;
  matters: string;
  allowed: boolean;
  /** Whether the file names this agent, as opposed to falling through to `*`. */
  named: boolean;
};

export type InspectResult = {
  ok: true;
  url: string;
  origin: string;
  page: CrawledPage;
  files: SiteFiles | null;
  crawlers: CrawlerVerdict[] | null;
  fetchedAt: string;
};

function bad(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

/** Accept "example.com" as readily as a full URL, but never a non-web scheme. */
function normalise(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Enter a website address." };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    return { error: `Only http and https addresses are fetched, not ${scheme}.` };
  }
  return { url: scheme ? trimmed : `https://${trimmed}` };
}

export async function POST(request: NextRequest) {
  let body: { url?: string; scope?: InspectScope };
  try {
    body = await request.json();
  } catch {
    return bad("Send a JSON body with a url.");
  }

  const normalised = normalise(body.url ?? "");
  if ("error" in normalised) return bad(normalised.error);

  const check = validateUrl(normalised.url);
  if (!check.ok) return bad(check.reason);

  const target = check.url.toString();
  const origin = check.url.origin;
  const scope: InspectScope = body.scope === "site" ? "site" : "page";

  try {
    // The page always. The site files only when a tool needs them, because
    // robots plus up to four sitemaps is several more round trips and most
    // tools work from one page.
    const [page, site] = await Promise.all([
      fetchPage(target, 0),
      scope === "site" ? fetchSiteFiles(origin) : Promise.resolve(null),
    ]);

    let crawlers: CrawlerVerdict[] | null = null;
    if (site) {
      const named = new Set([...site.rules.groups.keys()]);
      crawlers = AI_CRAWLER_LIST.map(({ agent, matters }) => ({
        agent,
        matters,
        allowed: robotsAllows(site.rules, agent, "/"),
        named: named.has(agent.toLowerCase()),
      }));
    }

    const result: InspectResult = {
      ok: true,
      url: target,
      origin,
      page,
      files: site?.files ?? null,
      crawlers,
      fetchedAt: new Date().toISOString(),
    };
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "That address could not be read.", 502);
  }
}
