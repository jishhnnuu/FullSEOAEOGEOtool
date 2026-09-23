/**
 * Billing, pinned to the parts that would cost money or grant it wrongly.
 *
 * Three things matter here and none of them is the happy path. A webhook that
 * accepts an unsigned body hands paid features to anyone who can POST. A
 * replayed request re-applies a plan change that was already superseded. And a
 * failed payment that locks a workspace out of its own audit breaks the
 * property the whole product rests on, which is that the audit never needed an
 * account in the first place.
 *
 * The plan definitions are tested too, because the pricing page now derives
 * from them: an error there is a public claim about what a customer gets.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseEvent, planAfter, verifyWebhook, type BillingEvent } from "../src/server/billing";
import {
  EXCLUDED_FOR,
  PLANS,
  PLAN_ORDER,
  capMessage,
  clampPages,
  permits,
  planOf,
  priceLabel,
  upgradeFor,
} from "../src/lib/plans";

const SECRET = "whsec_test_secret_value";

async function sign(body: string, secret: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

test("a correctly signed webhook verifies", async () => {
  const body = JSON.stringify({ type: "customer.subscription.updated" });
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await verifyWebhook(body, await sign(body, SECRET, now), SECRET), true);
});

test("a webhook signed with the wrong secret is refused", async () => {
  const body = JSON.stringify({ type: "customer.subscription.updated" });
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await verifyWebhook(body, await sign(body, "whsec_wrong", now), SECRET), false);
});

test("a tampered body is refused even with a valid-looking signature", async () => {
  const body = JSON.stringify({ type: "customer.subscription.updated", plan: "growth" });
  const now = Math.floor(Date.now() / 1000);
  const header = await sign(body, SECRET, now);
  const tampered = JSON.stringify({ type: "customer.subscription.updated", plan: "scale" });
  assert.equal(await verifyWebhook(tampered, header, SECRET), false);
});

test("an old signature is refused, so a captured request cannot be replayed", async () => {
  const body = JSON.stringify({ type: "customer.subscription.deleted" });
  const stale = Math.floor(Date.now() / 1000) - 3600;
  assert.equal(await verifyWebhook(body, await sign(body, SECRET, stale), SECRET), false);
});

test("a malformed signature header is refused rather than throwing", async () => {
  assert.equal(await verifyWebhook("{}", "nonsense", SECRET), false);
  assert.equal(await verifyWebhook("{}", "", SECRET), false);
  assert.equal(await verifyWebhook("{}", "t=abc,v1=def", SECRET), false);
});

test("an event carries the org from subscription metadata, not from the body's word for it", () => {
  const event = parseEvent({
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_123",
        status: "active",
        customer: "cus_456",
        metadata: { org_id: "org_abc", plan: "growth" },
        current_period_end: 1800000000,
      },
    },
  });
  assert.ok(event);
  assert.equal(event.orgId, "org_abc");
  assert.equal(event.plan, "growth");
  assert.equal(event.subscriptionId, "sub_123");
  assert.equal(event.customerId, "cus_456");
  assert.ok(event.currentPeriodEnd?.startsWith("20"));
});

test("an unrecognisable payload returns null rather than a half-built event", () => {
  assert.equal(parseEvent({}), null);
  assert.equal(parseEvent({ type: "x" }), null);
  assert.equal(parseEvent(null), null);
});

test("cancellation drops to free, and never locks the workspace", () => {
  const base: BillingEvent = {
    type: "customer.subscription.deleted",
    orgId: "org_abc",
    plan: "growth",
    status: "canceled",
    subscriptionId: "sub_1",
    customerId: "cus_1",
    currentPeriodEnd: null,
  };
  assert.equal(planAfter(base), "free");
  assert.equal(planAfter({ ...base, type: "customer.subscription.updated", status: "unpaid" }), "free");
  assert.equal(planAfter({ ...base, type: "customer.subscription.updated", status: "incomplete_expired" }), "free");
});

test("past due keeps the plan, because a card that expired is not a cancellation", () => {
  const event: BillingEvent = {
    type: "customer.subscription.updated",
    orgId: "org_abc",
    plan: "growth",
    status: "past_due",
    subscriptionId: "sub_1",
    customerId: "cus_1",
    currentPeriodEnd: null,
  };
  assert.equal(planAfter(event), "growth");
});

test("an active subscription with no plan in metadata falls back to free, never to the top tier", () => {
  const event: BillingEvent = {
    type: "customer.subscription.updated",
    orgId: "org_abc",
    plan: null,
    status: "active",
    subscriptionId: "sub_1",
    customerId: "cus_1",
    currentPeriodEnd: null,
  };
  assert.equal(planAfter(event), "free");
});

/* ------------------------------------------------------------------ plans */

test("an unknown plan id degrades to free rather than throwing", () => {
  assert.equal(planOf("enterprise_platinum").id, "free");
  assert.equal(planOf(null).id, "free");
  assert.equal(planOf(undefined).id, "free");
});

test("every tier above free raises the page ceiling", () => {
  let previous = 0;
  for (const id of PLAN_ORDER) {
    const pages = PLANS[id].limits.pagesPerRun;
    assert.ok(pages > previous, `${id} does not raise the ceiling above the tier below it`);
    previous = pages;
  }
});

test("the free tier grants the audit and nothing that costs us money to run", () => {
  const free = PLANS.free;
  assert.ok(free.limits.pagesPerRun > 0, "the free audit has to actually run");
  assert.equal(permits(free, "scheduling"), false);
  assert.equal(permits(free, "publishing"), false);
});

test("exclusions are derived, and never name something no plan offers", () => {
  for (const id of PLAN_ORDER) {
    for (const capability of EXCLUDED_FOR[id]) {
      const offered = PLAN_ORDER.some((other) => PLANS[other].limits[capability as "scheduling"]);
      assert.ok(offered, `${id} lists ${capability} as excluded, but no plan provides it`);
      assert.equal(PLANS[id].limits[capability as "scheduling"], false);
    }
  }
  assert.deepEqual(EXCLUDED_FOR.scale, [], "the top tier should exclude nothing");
});

test("upgradeFor names the cheapest plan that clears a capability", () => {
  assert.equal(upgradeFor("scheduling"), "starter");
  assert.equal(upgradeFor("linkProgramme"), "growth");
  assert.equal(upgradeFor("whiteLabel"), "scale");
});

test("the price label never renders a real number for a talk-to-us tier", () => {
  assert.equal(priceLabel(PLANS.free), "£0");
  assert.equal(priceLabel(PLANS.starter), "£79");
  assert.equal(priceLabel(PLANS.growth), "£249");
  assert.equal(priceLabel(PLANS.scale), "Talk to us");
});

/* ------------------------------------------------------------------ quota */

const FREE_ALLOWANCE = {
  plan: PLANS.free,
  pagesPerRun: PLANS.free.limits.pagesPerRun,
  known: true,
  note: null,
};

test("a request above the ceiling is clamped and reports that it was", () => {
  const result = clampPages(5000, FREE_ALLOWANCE);
  assert.equal(result.pages, PLANS.free.limits.pagesPerRun);
  assert.equal(result.capped, true);
});

test("a request inside the ceiling is untouched", () => {
  const result = clampPages(10, FREE_ALLOWANCE);
  assert.equal(result.pages, 10);
  assert.equal(result.capped, false);
});

test("a nonsense page count falls back to the plan ceiling rather than zero", () => {
  assert.equal(clampPages(Number.NaN, FREE_ALLOWANCE).pages, PLANS.free.limits.pagesPerRun);
  assert.equal(clampPages(-5, FREE_ALLOWANCE).pages, PLANS.free.limits.pagesPerRun);
});

test("a capped run states its coverage before it names an upgrade", () => {
  const message = capMessage(FREE_ALLOWANCE, 500);
  assert.ok(message);
  // Coverage first: the reader is told what the score covers, above the number.
  assert.ok(message.indexOf("40 pages") < message.indexOf("Starter"), "coverage has to come before the upsell");
  assert.match(message, /score of those 40/);
});

test("a run inside its ceiling says nothing about coverage at all", () => {
  assert.equal(capMessage(FREE_ALLOWANCE, 20), null);
});

test("the top tier names no upgrade, because there is not one", () => {
  const scale = { plan: PLANS.scale, pagesPerRun: PLANS.scale.limits.pagesPerRun, known: true, note: null };
  const message = capMessage(scale, 99999);
  assert.ok(message);
  assert.doesNotMatch(message, /raises the ceiling/);
});
