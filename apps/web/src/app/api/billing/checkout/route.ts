/**
 * Start a checkout.
 *
 * Returns a URL to redirect to, never a form. Card details never touch this
 * Worker, which keeps PCI scope out of the codebase entirely.
 *
 * With no billing provider configured this answers with the same shape every
 * other gap uses: a reason and a fix, both written for a person rather than a
 * log. The pricing page reads that and says "not configured on this
 * deployment" instead of offering a button that fails.
 */

import { createCheckout } from "@/server/billing";
import { fail, json, withAuth } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return withAuth(request, async ({ e, who }) => {
    const body = (await request.json().catch(() => ({}))) as { plan?: string };
    const plan = body.plan;
    if (plan !== "starter" && plan !== "growth") {
      return fail("bad_plan", "Only the starter and growth plans are self-serve. Scale is a conversation.");
    }

    const origin = e.PUBLIC_BASE_URL ?? new URL(request.url).origin;
    const result = await createCheckout({
      plan,
      orgId: who.orgId,
      email: who.email,
      successUrl: `${origin}/app?billing=done`,
      cancelUrl: `${origin}/pricing?billing=cancelled`,
    });

    if (!result.ok) return fail("billing_unavailable", result.reason, 503, result.fix);
    return json({ ok: true, url: result.url });
  });
}
