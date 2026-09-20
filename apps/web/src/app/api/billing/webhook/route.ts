/**
 * The billing provider's webhook.
 *
 * The only route on this deployment that is deliberately not same-origin
 * guarded, because the caller is a third party. Its authentication is the
 * signature, which is verified before the body is parsed and before anything
 * is written. A webhook that skips that is a public endpoint handing out paid
 * features to anyone who can POST to it.
 *
 * Two further rules hold here. The org id is read from the subscription's own
 * metadata, set when the checkout was created, so nothing the request body
 * claims about which workspace to change is trusted on its own. And a
 * cancellation or a failed payment drops the workspace to the free tier
 * rather than locking it, because the audit has never required an account and
 * taking it away over a billing failure would break that property for the
 * person least able to do anything about it at that moment.
 */

import { parseEvent, planAfter, verifyWebhook, billingConfig } from "@/server/billing";
import { env } from "@/server/env";
import { ensureSchema } from "@/server/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const e = await env();
  const config = billingConfig(e);
  if ("capability" in config) {
    // Nothing is configured, so nothing can be verified. Answering 200 would
    // tell a prober the endpoint exists and is live.
    return new Response("Billing is not configured on this deployment.", { status: 503 });
  }
  if (!e.DB) {
    return new Response("No database is bound, so a plan cannot be recorded.", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature") ?? "";
  const raw = await request.text();
  if (!(await verifyWebhook(raw, signature, config.webhookSecret))) {
    return new Response("Bad signature.", { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad body.", { status: 400 });
  }

  const event = parseEvent(payload);
  if (!event) return new Response("Ignored.", { status: 200 });

  await ensureSchema(e);
  const now = new Date().toISOString();

  // Recorded whether or not it names a workspace, so an event that cannot be
  // matched leaves a trace rather than vanishing.
  await e.DB.prepare(
    "INSERT OR REPLACE INTO billing_events (id, org_id, type, plan, status, received_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
  )
    .bind(
      `${event.subscriptionId ?? "evt"}:${event.type}:${now}`,
      event.orgId,
      event.type,
      event.plan,
      event.status,
      now,
    )
    .run();

  if (!event.orgId) return new Response("No workspace named.", { status: 200 });

  const plan = planAfter(event);

  await e.DB.prepare(
    `INSERT INTO subscriptions (org_id, plan, status, provider, subscription_id, customer_id, current_period_end, updated_at)
     VALUES (?1, ?2, ?3, 'stripe', ?4, ?5, ?6, ?7)
     ON CONFLICT(org_id) DO UPDATE SET
       plan = excluded.plan,
       status = excluded.status,
       subscription_id = COALESCE(excluded.subscription_id, subscriptions.subscription_id),
       customer_id = COALESCE(excluded.customer_id, subscriptions.customer_id),
       current_period_end = COALESCE(excluded.current_period_end, subscriptions.current_period_end),
       updated_at = excluded.updated_at`,
  )
    .bind(event.orgId, plan, event.status ?? "unknown", event.subscriptionId, event.customerId, event.currentPeriodEnd, now)
    .run();

  // Denormalised onto the org so a quota check is one read on the hot path.
  await e.DB.prepare("UPDATE orgs SET plan = ?2 WHERE id = ?1").bind(event.orgId, plan).run();

  return new Response("ok", { status: 200 });
}
