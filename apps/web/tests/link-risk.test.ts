/**
 * The link risk engine, pinned to the behaviour that makes it worth having.
 *
 * Two properties matter more than any individual rule. A link that merely does
 * nothing must never be reported as dangerous, and a disavow file must be hard
 * to reach, because the tool's own maker says it is not part of normal site
 * maintenance and a careless one removes links Google was counting in your
 * favour.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { assessLink, assessProfile, buildDisavowFile } from "../src/engine/link-risk";
import type { LinkUnderReview } from "../src/engine/link-risk";

function link(over: Partial<LinkUnderReview> = {}): LinkUnderReview {
  return {
    sourceUrl: "https://example.com/article",
    sourceDomain: "example.com",
    anchorText: "Acme",
    rel: "",
    followed: true,
    placement: "content",
    sourcePageText: "An ordinary article about an ordinary subject, written by a person for readers.",
    outboundLinks: 12,
    sourceWordCount: 1200,
    ourTopic: "accounting software",
    ...over,
  };
}

test("an ordinary editorial link is left alone", () => {
  const risk = assessLink(link());
  assert.equal(risk.verdict, "leave_it");
  assert.equal(risk.actionRisk, 0);
});

test("a page selling placements is scheme evidence", () => {
  const risk = assessLink(link({
    sourcePageText: "Write for us. Guest post submission fee: $250 per article, paid via PayPal.",
  }));
  assert.ok(risk.actionRisk >= 45, "a price on a placement page is the clearest scheme evidence there is");
  assert.equal(risk.verdict, "disavow_candidate");
  assert.ok(risk.signals.some((s) => s.code === "sells_placements"));
});

test("a worthless link is never called dangerous", () => {
  // A dead directory: hundreds of outbound links, no prose, nofollow. Every
  // commercial tool scores this as toxic. It is not. It does nothing.
  const risk = assessLink(link({
    outboundLinks: 400,
    sourceWordCount: 90,
    followed: false,
    rel: "nofollow",
  }));
  assert.equal(risk.verdict, "ignore_it");
  assert.ok(risk.actionRisk < 25, `wasteful is not dangerous, got actionRisk ${risk.actionRisk}`);
  assert.ok(risk.wasteRisk >= 50);
});

test("a noindexed source is reported as passing nothing, not as a risk", () => {
  const risk = assessLink(link({ sourceNoindex: true }));
  assert.equal(risk.actionRisk, 0);
  assert.ok(risk.wasteRisk >= 50);
  assert.ok(risk.signals.some((s) => s.code === "noindexed_source"));
});

test("every signal carries evidence a person can check", () => {
  const risk = assessLink(link({ sourcePageText: "Buy backlinks cheap, high DA dofollow links." }));
  for (const signal of risk.signals) {
    assert.ok(signal.observed.length > 10, "a signal states what was observed");
    assert.ok(signal.why.length > 20, "a signal explains why it matters");
    assert.ok(signal.verify.length > 10, "a signal says how to check it yourself");
  }
});

test("anchor over-optimisation is caught across the profile, not link by link", () => {
  // No single link here looks wrong. The pattern does.
  const links = Array.from({ length: 10 }, (_, i) =>
    link({ sourceUrl: `https://site${i}.com/p`, sourceDomain: `site${i}.com`, anchorText: "best accounting software" }),
  );
  const perLink = links.map(assessLink);
  assert.ok(perLink.every((r) => r.verdict === "leave_it"), "each link on its own is fine");

  const profile = assessProfile(links, { brand: "Acme", targetTerms: ["best accounting software"] });
  assert.ok(
    profile.patterns.some((p) => p.code === "anchor_over_optimisation"),
    "ten identical exact-match anchors is the shape the spam policy describes",
  );
});

test("no disavow file without a manual action, however bad the links", () => {
  const dirty = Array.from({ length: 5 }, (_, i) =>
    link({
      sourceUrl: `https://farm${i}.com/p`,
      sourceDomain: `farm${i}.com`,
      sourcePageText: "Private blog network. Buy backlinks cheap. Guest post fee $99.",
    }),
  );
  const profile = assessProfile(dirty, { brand: "Acme", targetTerms: [] });
  assert.ok(profile.schemeCandidates.length > 0, "the links are still identified");
  assert.equal(profile.disavow.warranted, false, "but a disavow file is not recommended without a manual action");
  assert.equal(buildDisavowFile(profile, "note"), null);
});

test("a disavow file appears only when a manual action is reported, and lists only scheme links", () => {
  const mixed = [
    link({ sourceUrl: "https://farm.com/p", sourceDomain: "farm.com", sourcePageText: "Buy backlinks cheap, PBN links available." }),
    link({ sourceUrl: "https://good.com/p", sourceDomain: "good.com" }),
    link({ sourceUrl: "https://dead.com/p", sourceDomain: "dead.com", outboundLinks: 500, sourceWordCount: 40, followed: false, rel: "nofollow" }),
  ];
  const profile = assessProfile(mixed, { brand: "Acme", targetTerms: [], manualActionPresent: true });
  assert.equal(profile.disavow.warranted, true);

  const file = buildDisavowFile(profile, "Filed with a reconsideration request.");
  assert.ok(file, "a file is produced");
  assert.ok(file!.includes("domain:farm.com"), "the scheme domain is listed");
  assert.ok(!file!.includes("domain:good.com"), "an ordinary link is never disavowed");
  assert.ok(!file!.includes("domain:dead.com"), "a link that merely does nothing is never disavowed");
});

test("a clean profile says so plainly", () => {
  const clean = Array.from({ length: 6 }, (_, i) =>
    link({ sourceUrl: `https://s${i}.com/p`, sourceDomain: `s${i}.com`, anchorText: i % 2 ? "Acme" : "acme.com" }),
  );
  const profile = assessProfile(clean, { brand: "Acme", targetTerms: ["accounting software"] });
  assert.equal(profile.schemeCandidates.length, 0);
  assert.ok(/nothing.*looks like a link scheme/i.test(profile.headline));
});
