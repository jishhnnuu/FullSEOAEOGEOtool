import assert from "node:assert/strict";
import test from "node:test";

import {
  BRAND_FLOOR,
  OUTLIER_AT,
  POST_FLOOR,
  classifyHook,
  engagementOf,
  leadIntent,
  readAccount,
  shareOfVoice,
  strongestPlatform,
  whatWorked,
  type AccountProfile,
  type SocialPost,
} from "../src/engine/social";

/*
 * The refusals are the tests worth having. Any module can produce a number
 * from nine posts; the value is in not producing one.
 *
 * These mirror tests/test_social.py deliberately. The two engines must agree
 * about what a 2x multiple means, so they are checked against the same cases.
 */

function post(i: number, o: Partial<SocialPost> = {}): SocialPost {
  return {
    id: String(i),
    platform: "instagram",
    url: `https://example.com/p/${i}`,
    postedAt: `2026-03-${((i % 27) + 1).toString().padStart(2, "0")}T1${i % 9}:00:00Z`,
    kind: "image",
    text: "A post",
    likes: 100,
    comments: 10,
    ...o,
  };
}

function profile(posts: SocialPost[], o: Partial<AccountProfile> = {}): AccountProfile {
  return { handle: "rival", platform: "instagram", followers: 20000, posts, ...o };
}

const many = (n: number, o: Partial<SocialPost> = {}) =>
  Array.from({ length: n }, (_, i) => post(i, o));

/* ------------------------------------------------------------- refusals */

test("social refuses a median from too few posts", () => {
  const read = readAccount(profile(many(POST_FLOOR - 1)));
  assert.equal(read.measured, false);
  assert.match(read.reason, new RegExp(String(POST_FLOOR)));
});

test("social refuses an account it could not read", () => {
  const read = readAccount(profile([], { unreadable: "TikTok publishes no competitor API." }));
  assert.equal(read.measured, false);
  assert.match(read.reason, /TikTok/);
});

test("social refuses a share of one", () => {
  const result = shareOfVoice([readAccount(profile(many(20)))]);
  assert.equal(result.measured, false);
  assert.match(result.reason, new RegExp(String(BRAND_FLOOR)));
});

test("social refuses an engagement rate without followers", () => {
  const read = readAccount(profile(many(20), { followers: null }));
  assert.equal(read.measured, true);
  assert.equal(read.engagementRate.measured, false);
  assert.equal(read.engagementRate.value, null);
});

test("social refuses a pattern from one winner", () => {
  const posts = many(20);
  posts[0] = post(99, { likes: 100_000, comments: 9_000 });
  const read = readAccount(profile(posts));
  assert.equal(read.winners.length, 1);
  const verdict = whatWorked(read);
  assert.equal(verdict.measured, false);
  assert.match(verdict.reason, /coincidence/);
});

test("social refuses a platform verdict on one platform", () => {
  const result = strongestPlatform({ instagram: readAccount(profile(many(20))) });
  assert.equal(result.measured, false);
});

/* ------------------------------------------------------------ what it finds */

test("social finds the format and hook the winners share", () => {
  const posts = Array.from({ length: 30 }, (_, i) => {
    const winner = i % 3 === 0;
    return post(i, {
      kind: winner ? "reel" : "image",
      text: winner ? "7 mistakes nobody warns you about" : "New in store today",
      likes: winner ? 900 : 120,
      comments: winner ? 90 : 12,
    });
  });
  const read = readAccount(profile(posts));
  assert.equal(read.measured, true);
  assert.ok(read.winners.length > 0);
  assert.ok(read.winners.every((w) => w.multiple >= OUTLIER_AT));

  const verdict = whatWorked(read);
  assert.equal(verdict.measured, true);
  const traits = Object.fromEntries(verdict.traits.map((t) => [t.trait, t.value]));
  assert.equal(traits.format, "reel");
  assert.equal(traits.hook, "number");
});

test("social separates the loud from the effective", () => {
  const loud = readAccount(
    profile(many(40, { likes: 40, comments: 2 }), { handle: "loud", followers: 90000 }),
  );
  const effective = readAccount(
    profile(many(12, { likes: 2000, comments: 300 }), { handle: "effective", followers: 9000 }),
  );
  const result = shareOfVoice([loud, effective]);
  assert.equal(result.measured, true);
  const rows = Object.fromEntries(result.brands.map((b) => [b.handle, b]));
  assert.ok(rows.effective.shareOfEngagement > rows.loud.shareOfEngagement);
  assert.ok(rows.loud.efficiency < 0);
  assert.ok((result.verdict ?? []).some((line) => /not buying attention/.test(line)));
});

test("social compares rates rather than raw engagement across platforms", () => {
  const big = readAccount(
    profile(many(20, { likes: 1000, comments: 50 }), { platform: "youtube", followers: 1_000_000 }),
  );
  const small = readAccount(
    profile(many(20, { likes: 500, comments: 60 }), { platform: "instagram", followers: 10_000 }),
  );
  const result = strongestPlatform({ youtube: big, instagram: small });
  assert.equal(result.measured, true);
  // The smaller account earns far more per follower; raw totals would have
  // picked the other one.
  assert.equal(result.strongest, "instagram");
});

test("social names the platforms it could not read rather than dropping them", () => {
  const yt = readAccount(profile(many(20), { platform: "youtube", followers: 50_000 }));
  const ig = readAccount(profile(many(20), { platform: "instagram", followers: 20_000 }));
  const tt = readAccount(
    profile([], { platform: "tiktok", unreadable: "No commercial competitor API exists." }),
  );
  const result = strongestPlatform({ youtube: yt, tiktok: tt, instagram: ig });
  assert.equal(result.measured, true);
  assert.ok(result.notScored.some((r) => r.platform === "tiktok"));
});

/* --------------------------------------------------------------- details */

test("social reads the hook from the first line only", () => {
  assert.equal(classifyHook("5 ways to do it\nrest of it").type, "number");
  assert.equal(classifyHook("How to fix this").type, "how-to");
  assert.equal(classifyHook("Is your pricing wrong?").type, "question");
  assert.equal(classifyHook("Nobody tells you this").type, "contrarian");
  assert.equal(classifyHook("").type, "none");
  // The device has to be in the hook, not buried three lines down.
  assert.equal(classifyHook("New collection\n\n5 ways to style it").type, "plain");
});

test("social lead intent counts machinery, never leads", () => {
  assert.equal(leadIntent(post(1, { text: "Nice day", likes: 10, comments: 1 })), 0);
  // A call to action and a reply prompt, but no actual link: three of five,
  // because "link in bio" is not a link.
  assert.equal(
    leadIntent(post(2, { text: "Book a free audit. Link in bio. DM us to start.", likes: 10, comments: 1 })),
    3,
  );
  assert.equal(
    leadIntent(post(3, { text: "Book a free audit at example.com. DM us to start.", likes: 400, comments: 40 })),
    5,
  );
});

test("social engagement never counts views", () => {
  const p = post(1, { likes: 10, comments: 2, shares: 3, views: 1_000_000 });
  assert.equal(engagementOf(p), 15);
});
