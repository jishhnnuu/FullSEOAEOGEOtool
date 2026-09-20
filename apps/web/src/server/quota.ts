/**
 * What this request is allowed to crawl.
 *
 * Enforced at the one boundary that matters, which is where pages are
 * actually fetched. Enforcing in the browser would be decoration: the engine
 * runs client side and anyone can open the console.
 *
 * Three properties this deliberately keeps:
 *
 * **A deployment with no database is not a locked deployment.** With no D1
 * bound there are no accounts, so there is nothing to bill and everyone gets
 * the free tier's page cap. The audit still runs. That is the product's spine
 * and a quota check is not allowed to be the thing that breaks it.
 *
 * **A billing outage does not stop an audit.** Every failure path here falls
 * back to the free tier rather than refusing, because a person whose payment
 * provider is having a bad morning should still be able to see what is wrong
 * with their site.
 *
 * **The cap is stated, not silently applied.** A crawl that quietly stops at
 * 40 pages and reports a score over those 40 without saying so violates the
 * rule that coverage is stated before conclusions. The cap travels back with
 * the response so the screen can say which plan lifts it.
 */

import { PLANS, type Plan, planOf } from "@/lib/plans";

import { env } from "./env";
import { identify } from "./session";

export type Allowance = {
  plan: Plan;
  /** The page ceiling for this run. */
  pagesPerRun: number;
  /** True when the account layer answered; false when we fell back. */
  known: boolean;
  /** Why the free tier applies, when it is not simply "this is the free plan". */
  note: string | null;
};

const FREE: Allowance = {
  plan: PLANS.free,
  pagesPerRun: PLANS.free.limits.pagesPerRun,
  known: false,
  note: null,
};

/**
 * Read the caller's allowance.
 *
 * Never throws. Every unexpected condition resolves to the free tier, because
 * the alternative is an audit that fails for a reason the visitor cannot see
 * or fix.
 */
export async function allowanceFor(request: Request): Promise<Allowance> {
  try {
    const e = await env();
    if (!e.DB) {
      return {
        ...FREE,
        note: "This deployment has no database, so there are no accounts and everyone gets the free tier.",
      };
    }
    const who = await identify(e, request);
    if (!who) return { ...FREE, known: true, note: null };

    const row = await e.DB.prepare("SELECT plan FROM orgs WHERE id = ?1")
      .bind(who.orgId)
      .first<{ plan: string }>();
    const plan = planOf(row?.plan);
    return { plan, pagesPerRun: plan.limits.pagesPerRun, known: true, note: null };
  } catch {
    return {
      ...FREE,
      note: "The account layer could not be read, so the free tier applies. The audit is unaffected.",
    };
  }
}

// The two pure helpers live in lib/plans.ts, next to the definitions they
// read, so they can be tested without importing the Workers runtime.
export { capMessage, clampPages } from "@/lib/plans";
