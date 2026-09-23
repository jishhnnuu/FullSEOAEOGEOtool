/**
 * Fetch and parse a small batch of pages.
 *
 * Small on purpose. An edge runtime bills CPU per request, so a hundred-page
 * crawl is a hundred small requests rather than one long one, and the caller
 * gets progress it can show instead of a spinner that might never resolve.
 */

import { NextRequest } from "next/server";

import { fetchPage } from "@/engine/fetcher";
import { allowanceFor } from "@/server/quota";

export const dynamic = "force-dynamic";

const MAX_PER_REQUEST = 4;

export async function POST(request: NextRequest) {
  let body: { targets?: { url?: string; depth?: number }[]; fetched?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Send a JSON body with targets." }, { status: 400 });
  }

  const targets = (body.targets ?? [])
    .filter((t): t is { url: string; depth?: number } => typeof t?.url === "string")
    .slice(0, MAX_PER_REQUEST);

  if (!targets.length) {
    return Response.json({ message: "No targets given." }, { status: 400 });
  }

  // The plan is read here too, not only at discovery, because the browser
  // drives the crawl and a client that ignored the ceiling it was handed
  // would otherwise keep asking for batches. The cap that matters is the one
  // enforced where the fetching happens.
  const allowance = await allowanceFor(request);
  const fetched = (body as { fetched?: number }).fetched ?? 0;
  if (Number.isFinite(fetched) && fetched >= allowance.pagesPerRun) {
    return Response.json(
      {
        pages: [],
        capped: true,
        reason:
          `This run has reached its ${allowance.pagesPerRun}-page ceiling on the ${allowance.plan.name} plan. ` +
          `Everything crawled so far is scored and usable; the score is a score of those pages.`,
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const pages = await Promise.all(
    targets.map((target) => fetchPage(target.url, Math.max(0, Math.min(target.depth ?? 1, 10)))),
  );

  return Response.json({ pages, capped: false }, { headers: { "cache-control": "no-store" } });
}
