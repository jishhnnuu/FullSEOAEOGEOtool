/**
 * What this workspace is currently allowed to do.
 *
 * One endpoint so the screen and the server never disagree about a limit. A
 * button the server refuses is a worse experience than no button, and it is
 * also exactly how a pricing page ends up making a claim the product gates
 * somewhere else.
 *
 * Answers for signed-out visitors too, with the free tier, because the audit
 * has never needed an account and the limits screen should say so rather than
 * demanding a sign-in to explain itself.
 */

import { billingConfig } from "@/server/billing";
import { json, withEnv } from "@/server/http";
import { PLANS, planOf } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withEnv(request, async (e, who) => {
    const gap = billingConfig(e);
    const billingAvailable = !("capability" in gap);

    if (!who || !e.DB) {
      return json({
        plan: PLANS.free,
        status: "anonymous",
        billingAvailable,
        billingGap: billingAvailable ? null : gap,
      });
    }

    const row = await e.DB.prepare("SELECT plan FROM orgs WHERE id = ?1")
      .bind(who.orgId)
      .first<{ plan: string }>();

    const sub = await e.DB.prepare(
      "SELECT status, current_period_end FROM subscriptions WHERE org_id = ?1",
    )
      .bind(who.orgId)
      .first<{ status: string; current_period_end: string | null }>();

    return json({
      plan: planOf(row?.plan),
      status: sub?.status ?? "free",
      renewsAt: sub?.current_period_end ?? null,
      billingAvailable,
      billingGap: billingAvailable ? null : gap,
    });
  });
}
