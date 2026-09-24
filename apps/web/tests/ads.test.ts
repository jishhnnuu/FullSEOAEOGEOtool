import assert from "node:assert/strict";
import test from "node:test";

import {
  CLICK_FLOOR,
  SMART_BIDDING_MONTHLY,
  NO_TRACKING,
  budgetViable,
  creativeState,
  expectedOutcome,
  findWaste,
  measurementReadiness,
  pacing,
  platformCountFor,
  reconcile,
  type TrackingSignals,
} from "../src/engine/ads";
import { checkAsset, checkCopy, placement, requiredRenders, safeBox } from "../src/engine/ad-specs";
import { review, specialCategory } from "../src/engine/ad-policy";
import { AD_FAILURES, AD_PLATFORMS, FAILURE_BY_CODE } from "../src/engine/ads.generated";

/*
 * These mirror tests/test_ads.py case for case. The two engines decide
 * whether somebody's money may be spent, so they are held to the same
 * answers rather than merely written from the same notes.
 */

const tracking = (o: Partial<TrackingSignals> = {}): TrackingSignals => ({ ...NO_TRACKING, ...o });

/* ------------------------------------------------------------- the gate */

test("ads: no tracking blocks everything", () => {
  const out = measurementReadiness(tracking());
  assert.equal(out.ready, false);
  assert.ok(out.blocking.length);
  // Blocked means no score at all, because a score invites launching at 80.
  assert.equal(out.quality.measured, false);
  assert.equal(out.quality.value, null);
});

test("ads: a tag that fires into nothing still blocks", () => {
  const out = measurementReadiness(tracking({ tagPresent: true }));
  assert.equal(out.ready, false);
  assert.match(out.blocking[0], /did not come back/);
});

test("ads: readiness names every weakness rather than averaging them", () => {
  const out = measurementReadiness(tracking({ tagPresent: true, roundTripVerified: true }));
  assert.equal(out.ready, true);
  assert.equal(out.degraded.length, 4);

  const full = measurementReadiness(tracking({
    tagPresent: true, roundTripVerified: true, serverSide: true, deduplicated: true,
    valuePassed: true, consentMode: true, clickIdCaptured: true,
  }));
  assert.deepEqual(full.degraded, []);
  assert.equal(full.quality.value, 100);
});

/* ----------------------------------------------------------- the budget */

test("ads: a budget below the learning floor is refused", () => {
  const out = budgetViable(600, 75, 3);
  assert.equal(out.viable, false);
  assert.ok((out.impliedMonthly.value ?? 0) < SMART_BIDDING_MONTHLY);
  // A refusal with no remedy is just a complaint.
  assert.ok(out.remedies.length >= 3);
});

test("ads: the same budget on one platform can be viable", () => {
  assert.equal(budgetViable(2000, 40, 3).viable, false);
  assert.equal(budgetViable(2000, 40, 1).viable, true);
  assert.match(budgetViable(2000, 40, 3).remedies[0], /Run one platform instead of 3/);
});

test("ads: platform count never returns zero or more than the budget feeds", () => {
  assert.equal(platformCountFor(0, 0), 1);
  assert.equal(platformCountFor(600, 75), 1);
  assert.equal(platformCountFor(100_000, 50), 2);
});

test("ads: no forecast without two measurements", () => {
  const none = expectedOutcome(3000, { value: null, measured: false, note: "" }, { value: 0.02, measured: true, note: "" });
  assert.equal(none.measured, false);
  assert.match(none.note, /what a click costs/);

  const both = expectedOutcome(3000, { value: 1.5, measured: true, note: "" }, { value: 0.02, measured: true, note: "" });
  assert.equal(both.value, 40);
  assert.match(both.note, /Between 28 and 52/);
});

/* ----------------------------------------------------------- the pacing */

test("ads: pacing reads under and over and says what it implies", () => {
  assert.equal(pacing(500, 1000, 15, 30).state, "on_track");
  assert.equal(pacing(900, 1000, 15, 30).state, "over");
  const under = pacing(200, 1000, 15, 30);
  assert.equal(under.state, "under");
  assert.match(under.note, /not a saving/);
});

/* ------------------------------------------------------ the double count */

test("ads: platform conversions are never summed into the answer", () => {
  const out = reconcile(
    [
      { platform: "google_ads", spend: 1000, clicks: 800, impressions: 20000, claimedConversions: 30 },
      { platform: "meta_ads", spend: 1000, clicks: 1200, impressions: 90000, claimedConversions: 34 },
    ],
    41,
  );
  assert.equal(out.claimedTotalIfSummed, 64);
  assert.equal(out.measuredConversions.value, 41);
  assert.equal(out.blendedCac.value, Math.round((2000 / 41) * 100) / 100);
  assert.match(out.gapNote, /run the business on is 41/);
  assert.ok(out.claimed.every((r) => r.label.includes("platform-claimed")));
});

test("ads: without the site's own numbers nothing is reconciled", () => {
  const out = reconcile([{ platform: "meta_ads", spend: 500, clicks: 400, impressions: 10000, claimedConversions: 20 }], null);
  assert.equal(out.measuredConversions.measured, false);
  assert.equal(out.blendedCac.measured, false);
  assert.match(out.measuredConversions.note, /marking its own homework/);
});

test("ads: platforms claiming sales the site never saw reads as broken tracking", () => {
  const out = reconcile([{ platform: "meta_ads", spend: 900, clicks: 700, impressions: 40000, claimedConversions: 18 }], 0);
  assert.match(out.gapNote, /broken tracking/);
});

/* ------------------------------------------------------------ the waste */

test("ads: waste needs more than three clicks before it excludes anything", () => {
  const out = findWaste(
    [
      { kind: "search_term", name: "cheap free thing", spend: 400, clicks: 160, conversions: 0 },
      { kind: "search_term", name: "promising term", spend: 40, clicks: 3, conversions: 0 },
    ],
    100,
  );
  assert.deepEqual(out.map((w) => w.name), ["cheap free thing"]);
  assert.match(out[0].action, /negative keyword/);
  assert.equal(CLICK_FLOOR, 100);
});

test("ads: something that converts expensively is repriced, not excluded", () => {
  const out = findWaste([{ kind: "search_term", name: "works but pricey", spend: 900, clicks: 300, conversions: 2 }], 100);
  assert.equal(out.length, 1);
  assert.match(out[0].action, /Lower the bid/);
});

/* --------------------------------------------------------- the creative */

test("ads: a creative is not judged before a thousand impressions", () => {
  assert.equal(creativeState("a", 400, 0.001, 0.02, 1.0, 0).state, "too_early");
});

test("ads: fatigue and never worked are told apart", () => {
  assert.equal(creativeState("a", 50_000, 0.006, 0.014, 3.4, 12).state, "fatigued");
  const never = creativeState("b", 40_000, 0.004, 0.004, 3.6, 0);
  assert.equal(never.state, "failing");
  assert.match(never.note, /never worked/);
});

/* ------------------------------------------------------------ the specs */

test("ads: one render serves several placements and takes the tighter safe zone", () => {
  const renders = requiredRenders(["meta_ads", "tiktok_ads", "google_ads"]);
  const sizes = new Set(renders.map((p) => `${p.width}x${p.height}`));
  assert.ok(sizes.has("1080x1920"));
  assert.equal(renders.length, sizes.size);
});

test("ads: the Reels safe box says how much of the frame is covered", () => {
  const box = safeBox(placement("meta_story")!);
  // Nearly half the frame is platform interface.
  assert.ok(box.coveredFraction > 0.4);
  assert.ok(box.y > 0);
});

test("ads: copy over a limit shows what would be cut", () => {
  const problems = checkCopy(placement("google_rsa")!, { headline: "x".repeat(48) });
  assert.equal(problems[0].blocking, true);
  assert.match(problems[0].problem, /18 would be cut/);
});

test("ads: an asset is checked before it is uploaded, not after", () => {
  const problems = checkAsset(placement("meta_feed_square")!, 600, 900, 40, "gif");
  const fields = new Set(problems.map((p) => p.field));
  for (const f of ["format", "size", "ratio", "resolution"]) assert.ok(fields.has(f), f);
  assert.ok(problems.some((p) => p.blocking));
});

/* ----------------------------------------------------------- the policy */

test("ads: copy that would restrict the account is never submitted", () => {
  const out = review({ primary_text: "Struggling with debt? Guaranteed relief." }, "meta_ads");
  assert.equal(out.canSubmit, false);
  const rules = new Set(out.blocks.map((b) => b.rule));
  assert.ok(rules.has("personal_attributes"));
  assert.ok(rules.has("guaranteed_outcome"));
  assert.match(out.blocks.find((b) => b.rule === "personal_attributes")!.why, /Meta prohibits/);
});

test("ads: a rule firing in three fields is reported once", () => {
  const out = review({ a: "guaranteed", b: "guaranteed", c: "guaranteed" });
  assert.equal(out.blocks.filter((b) => b.rule === "guaranteed_outcome").length, 1);
});

test("ads: a clean ad is not promised approval", () => {
  const out = review({ headline: "Bookkeeping for builders", description: "Fixed monthly fee." });
  assert.equal(out.canSubmit, true);
  assert.match(out.note, /not a guarantee of approval/);
});

test("ads: restricted categories err toward declaring", () => {
  assert.equal(specialCategory("Debt consolidation from 4.9% APR"), "credit");
  assert.equal(specialCategory("We're hiring a site manager"), "employment");
  assert.equal(specialCategory("Two-bed apartments for rent in Leeds"), "housing");
  assert.equal(specialCategory("Handmade ceramic mugs"), null);
});

/* --------------------------------------------------------- the failures */

test("ads: every failure says what happens rather than logging it", () => {
  assert.ok(AD_FAILURES.length >= 25);
  for (const f of AD_FAILURES) {
    assert.ok(f.detect && f.respond && f.tell, f.code);
  }
});

test("ads: a partial build can never leave something spending", () => {
  const partial = FAILURE_BY_CODE.get("partial_build")!;
  assert.equal(partial.severity, "money");
  assert.match(partial.respond, /paused/);
  assert.match(partial.respond, /reverse order/);
});

test("ads: the measurement gate states that it has no fallback", () => {
  const gate = FAILURE_BY_CODE.get("tracking_absent")!;
  assert.ok(gate.fallback.startsWith("None, deliberately"));
  assert.match(gate.fallback, /the thing this product exists to replace/);
});

/* -------------------------------------------------------- the platforms */

test("ads: the advertiser never handles a credential", () => {
  for (const p of AD_PLATFORMS) {
    assert.ok(p.oauthScopes.length, p.key);
    assert.ok(p.scopeReasons.length, p.key);
    // Every platform costs us something. A row claiming otherwise is wrong.
    assert.ok(p.appRequirements.length, p.key);
    assert.ok(p.userAction, p.key);
  }
});

test("ads: nothing claims to be live before its approval exists", () => {
  for (const p of AD_PLATFORMS) {
    assert.ok(["live", "pending_review", "planned"].includes(p.status), p.key);
  }
});
