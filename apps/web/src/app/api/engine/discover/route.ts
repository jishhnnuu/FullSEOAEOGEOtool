/**
 * Start a crawl: normalise the URL, read robots.txt, the sitemaps and the
 * homepage, and hand the browser everything it needs to plan the rest.
 *
 * This runs in the Worker because a browser cannot read a third-party site.
 * Nothing is stored: the response goes straight back to the tab that asked.
 */

import { NextRequest } from "next/server";

import { fetchPage, fetchSiteFiles, validateUrl } from "@/engine/fetcher";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return Response.json({ ok: false, reason: message }, { status });
}

/** Accept "example.com", "https://example.com/path" and everything between. */
function normaliseInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return bad("Send a JSON body with a url.");
  }

  const candidate = normaliseInput(body.url ?? "");
  if (!candidate) return bad("Enter a website address.");

  const check = validateUrl(candidate);
  if (!check.ok) return bad(check.reason);

  const origin = check.url.origin;

  // Fetch the homepage first: if the site does not answer at all, there is no
  // point reading its robots.txt.
  let home = await fetchPage(check.url.toString(), 0);

  // A bare https:// guess that fails is worth one retry over http, because a
  // surprising number of small sites still redirect the other way.
  if (home.status === 0 && check.url.protocol === "https:" && !/^https?:\/\//i.test((body.url ?? "").trim())) {
    const fallback = await fetchPage(`http://${check.url.host}${check.url.pathname}`, 0);
    if (fallback.status > 0) home = fallback;
  }

  if (home.status === 0) {
    return bad(
      `Could not reach ${check.url.host}: ${home.error ?? "no response"}. Check the address, and that the site is not blocking automated requests.`,
      502,
    );
  }
  if (home.status >= 400) {
    return bad(`${check.url.host} answered HTTP ${home.status} at the address given. Try the homepage URL.`, 502);
  }

  const finalOrigin = (() => {
    try {
      return new URL(home.finalUrl).origin;
    } catch {
      return origin;
    }
  })();

  const { files } = await fetchSiteFiles(finalOrigin);

  const host = new URL(finalOrigin).host.toLowerCase().replace(/^www\./, "");
  const seeds = [
    ...new Set(
      (home.signals?.links ?? [])
        .filter((l) => l.internal)
        .map((l) => l.href)
        .slice(0, 200),
    ),
  ];

  return Response.json({
    ok: true,
    baseUrl: finalOrigin,
    host,
    files,
    home,
    seeds,
  });
}
