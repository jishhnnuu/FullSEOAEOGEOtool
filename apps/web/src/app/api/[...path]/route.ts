/**
 * Proxy to a self-hosted API service.
 *
 * The dashboard on this deployment is local first: it runs the engine itself
 * and keeps the workspace in the browser. A self-hosted installation also runs
 * the Python service, and pointing SEOOS_API_URL at it makes every /api/v1
 * path reachable from this same origin, which removes CORS preflights and
 * third-party cookie problems for the CLI, the worker and anything else
 * talking to it through the dashboard's domain.
 *
 * The URL is read per request rather than through a Next rewrite, because Next
 * resolves rewrites at build time and bakes the destination into the route
 * manifest. Reading it here means one built image runs in every environment.
 */

import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function upstream(): string | null {
  return process.env.SEOOS_API_URL ?? null;
}

// Hop-by-hop headers must not be forwarded, and the upstream sets its own.
const STRIP = new Set([
  "host", "connection", "keep-alive", "transfer-encoding", "upgrade",
  "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "content-length", "content-encoding",
]);

async function proxy(request: NextRequest, path: string[]) {
  const base = upstream();
  if (!base) {
    return Response.json(
      {
        code: "no_api_configured",
        message:
          "This deployment runs the engine in the browser and has no API service behind it. " +
          "Set SEOOS_API_URL to proxy /api/v1 to a self-hosted installation.",
      },
      { status: 501 },
    );
  }

  const target = new URL(`/api/${path.join("/")}`, base);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIP.has(key.toLowerCase())) headers.set(key, value);
  });

  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!STRIP.has(key.toLowerCase())) responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    // A dashboard that shows a blank screen when the API is down is worse than
    // one that says the API is down.
    return Response.json(
      { code: "api_unreachable", message: `Could not reach the API at ${base}. Is it running?` },
      { status: 502 },
    );
  }
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Context) { return proxy(req, (await ctx.params).path); }
export async function POST(req: NextRequest, ctx: Context) { return proxy(req, (await ctx.params).path); }
export async function PATCH(req: NextRequest, ctx: Context) { return proxy(req, (await ctx.params).path); }
export async function PUT(req: NextRequest, ctx: Context) { return proxy(req, (await ctx.params).path); }
export async function DELETE(req: NextRequest, ctx: Context) { return proxy(req, (await ctx.params).path); }
