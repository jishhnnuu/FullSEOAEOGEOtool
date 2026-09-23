/**
 * Billing, which this deployment may or may not have.
 *
 * Written to the same rule as every other server capability here: additive,
 * never load-bearing. With no billing provider configured the pricing page
 * still renders, the audit still runs, accounts still work, and every paid
 * surface reports the gap as a sentence a person can act on. Nothing throws.
 *
 * Provider-agnostic on purpose. The checkout call and the webhook parse are
 * the only two places that know which provider is in use, so moving from one
 * to another is two functions rather than an audit of the codebase. Stripe is
 * implemented because it is the most common; a merchant of record such as
 * Paddle or Lemon Squeezy slots into the same two functions and is the better
 * choice for a solo operator selling into the EU and UK, because it makes the
 * provider liable for VAT rather than the seller.
 *
 * What is deliberately absent: card details never touch this Worker, no
 * provider secret is ever returned to a browser, and a subscription record is
 * the only thing stored. The rule that a stored secret never leaves the server
 * applies here exactly as it does to connections.
 */

import { type Env, type Gap, readEnv } from "./env";

export const BILLING_GAP: Gap = {
  capability: "billing",
  reason: "No billing provider is configured on this deployment, so a plan cannot be bought here.",
  fix: "Add BILLING_SECRET_KEY and BILLING_WEBHOOK_SECRET as Worker secrets, and set the price ids for each plan. docs/BILLING.md has the steps. Until then every workspace stays on the free tier and the audit is unaffected.",
};

export type BillingConfig = {
  secretKey: string;
  webhookSecret: string;
  /** Provider price ids, keyed by our plan id. */
  prices: { starter?: string; growth?: string };
};

/** Read the billing configuration, or say precisely what is missing. */
export function billingConfig(env: Env): BillingConfig | Gap {
  if (!env.BILLING_SECRET_KEY || !env.BILLING_WEBHOOK_SECRET) return BILLING_GAP;
  return {
    secretKey: env.BILLING_SECRET_KEY,
    webhookSecret: env.BILLING_WEBHOOK_SECRET,
    prices: { starter: env.BILLING_PRICE_STARTER, growth: env.BILLING_PRICE_GROWTH },
  };
}

export async function billingAvailable(): Promise<boolean> {
  const env = await readEnv();
  return !("capability" in billingConfig(env));
}

/* ------------------------------------------------------------- checkout */

export type CheckoutRequest = {
  plan: "starter" | "growth";
  orgId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult = { ok: true; url: string } | { ok: false; reason: string; fix?: string };

/**
 * Open a hosted checkout session.
 *
 * Hosted rather than an embedded form, because taking card details in our own
 * page means taking on PCI scope for no benefit the customer can see.
 */
export async function createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
  const env = await readEnv();
  const config = billingConfig(env);
  if ("capability" in config) return { ok: false, reason: config.reason, fix: config.fix };

  const price = config.prices[request.plan];
  if (!price) {
    return {
      ok: false,
      reason: `No price id is configured for the ${request.plan} plan.`,
      fix: `Set BILLING_PRICE_${request.plan.toUpperCase()} as a Worker variable.`,
    };
  }

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    customer_email: request.email,
    // The org id travels with the subscription so the webhook can find the
    // workspace without trusting anything the browser sends back.
    "metadata[org_id]": request.orgId,
    "metadata[plan]": request.plan,
    "subscription_data[metadata][org_id]": request.orgId,
    "subscription_data[metadata][plan]": request.plan,
    allow_promotion_codes: "true",
  });

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = (await response.json()) as { url?: string; error?: { message?: string } };
    if (!response.ok || !payload.url) {
      return { ok: false, reason: payload.error?.message ?? "The billing provider refused the request." };
    }
    return { ok: true, url: payload.url };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "The billing provider could not be reached." };
  }
}

/* -------------------------------------------------------------- webhook */

/**
 * Verify a webhook signature in constant time.
 *
 * A webhook that updates a plan without verifying its signature is a public
 * endpoint that grants paid features to anyone who can POST to it. The
 * comparison is constant time for the same reason session tokens are: a
 * timing oracle on a signature is a slow forgery, not a theoretical one.
 */
export async function verifyWebhook(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((piece) => {
      const [key, ...rest] = piece.split("=");
      return [key.trim(), rest.join("=")];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject anything older than five minutes, so a captured request cannot be
  // replayed later to downgrade or upgrade a workspace.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export type BillingEvent = {
  type: string;
  orgId: string | null;
  plan: string | null;
  status: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  currentPeriodEnd: string | null;
};

/** Reduce a provider event to the handful of fields a workspace cares about. */
export function parseEvent(payload: unknown): BillingEvent | null {
  const event = payload as {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  if (!event?.type || !event.data?.object) return null;
  const object = event.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const periodEnd = typeof object.current_period_end === "number" ? object.current_period_end : null;

  return {
    type: event.type,
    orgId: metadata.org_id ?? null,
    plan: metadata.plan ?? null,
    status: typeof object.status === "string" ? object.status : null,
    subscriptionId:
      typeof object.subscription === "string"
        ? object.subscription
        : typeof object.id === "string"
          ? object.id
          : null,
    customerId: typeof object.customer === "string" ? object.customer : null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
}

/**
 * Which plan an event leaves the workspace on.
 *
 * A cancellation or a failed payment drops to free rather than locking the
 * workspace, because the audit has never required an account and taking it
 * away over a billing failure would break that property for the person least
 * able to do anything about it at that moment.
 */
export function planAfter(event: BillingEvent): string {
  if (event.type === "customer.subscription.deleted") return "free";
  if (event.status === "canceled" || event.status === "unpaid" || event.status === "incomplete_expired") return "free";
  if (event.status === "past_due") return event.plan ?? "free";
  return event.plan ?? "free";
}
