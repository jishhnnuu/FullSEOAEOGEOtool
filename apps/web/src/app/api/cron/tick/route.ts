/**
 * What the cron trigger calls.
 *
 * Cloudflare's scheduled handler lives outside Next, in `deploy/worker.js`,
 * and it reaches the schedule by calling this route inside the same isolate
 * rather than over the network. That keeps every line of scheduling logic in
 * one place and means the cron path is the same code a person can exercise.
 *
 * It is guarded by a token minted in memory when the isolate starts. Nothing
 * outside the Worker can know it, nothing persists it, and there is no secret
 * for an operator to set or leak. A request without it gets 404, not 403,
 * because 403 would confirm the route is here.
 */

import { env } from "@/server/env";
import { handleError, json, notFound } from "@/server/http";
import { tick } from "@/server/scheduler";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const expected = (globalThis as { __seoosCronToken?: string }).__seoosCronToken;
  const given = request.headers.get("x-seoos-cron");
  if (!expected || !given || given !== expected) return notFound();

  try {
    const e = await env();
    const result = await tick(e);
    return json(result);
  } catch (error) {
    return handleError(error);
  }
}
