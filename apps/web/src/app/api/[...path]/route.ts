/**
 * Runtime proxy to the API service.
 *
 * Keeping the browser on one origin removes CORS preflights and third-party
 * cookie problems. Reading the upstream URL per request (rather than through
 * a Next rewrite, which is resolved at build time) means the same built image
 * runs in development, staging and production.
 */

import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Read per request, not at module scope: Next inlines some process.env
// references during the build, which would freeze the URL into the bundle.
function upstream(): string {
  return process.env.SEOOS_API_URL ?? "http://localhost:8000";
}

// Hop-by-hop headers must not be forwarded, and the upstream sets its own.
const STRIP = new Set([
  "host", "connection", "keep-alive", "transfer-encoding", "upgrade",
  "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "content-length", "content-encoding",
]);

async function proxy(request: NextRequest, path: string[]) {
  const base = upstream();
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
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!STRIP.has(key.toLowerCase())) responseHeaders.set(key, value);
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // A dashboard that shows a blank screen when the API is down is worse
    // than one that says the API is down.
    return Response.json(
      {
        code: "api_unreachable",
        message: `Could not reach the API at ${upstream()}. Is it running?`,
      },
      { status: 502 },
    );
  }
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
