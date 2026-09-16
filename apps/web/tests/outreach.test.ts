/**
 * The outreach engine, pinned to the one property that makes it worth having.
 *
 * Every draft has to carry a fact from the recipient's own page. Without that
 * it is a template, a template burns the sender's domain, and the whole
 * programme is worth less than not running it. So the interesting tests here
 * are the refusals.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RULES,
  canApproach,
  composeUrl,
  composeUrlFits,
  draft,
  isRoleAddress,
  proofFromMention,
  proofFromResourcePage,
  type Proof,
  type Sender,
} from "../src/engine/outreach";

const sender: Sender = {
  name: "Jane Okafor",
  role: "Founder",
  company: "Northwind Solar",
  url: "https://northwind.example/commercial-solar-cost",
  covers: "what commercial solar actually costs in New South Wales, with the 2026 rebate figures",
};

const proof: Proof = {
  fact: 'You wrote: "most installers quote per panel, which hides the inverter cost entirely"',
  sourceUrl: "https://energyreview.example/solar-quotes",
  pageTitle: "How to read a solar quote",
};

test("a draft without a real fact is refused rather than filled in", () => {
  assert.equal(draft({ tactic: "unlinked_mention", proof: { ...proof, fact: "Nice site" }, sender }), null);
  assert.equal(draft({ tactic: "unlinked_mention", proof: { ...proof, fact: "" }, sender }), null);
});

test("a draft without a sender is refused", () => {
  assert.equal(draft({ tactic: "resource_page", proof, sender: { ...sender, company: "" } }), null);
  assert.equal(draft({ tactic: "resource_page", proof, sender: { ...sender, url: "" } }), null);
});

test("a real proof produces a short email that quotes the page", () => {
  const written = draft({ tactic: "unlinked_mention", proof, sender });
  assert.ok(written, "a draft with a fact should be written");
  assert.ok(written.body.includes("inverter cost"), "the fact has to survive into the body");
  assert.ok(written.words < 160, `outreach that gets read is short; this was ${written.words} words`);
  assert.ok(written.subject.length > 0 && written.subject.length < 80);
  // Nothing about the draft should read as a mail merge.
  assert.ok(!/\[REPLACE/i.test(written.body), "no placeholders may reach a draft");
  assert.ok(!/\{\{/.test(written.body), "no merge tags may reach a draft");
});

test("no tactic ever offers payment or a link swap", () => {
  const tactics = ["unlinked_mention", "broken_replacement", "broken_inbound", "resource_page", "relationship", "journalist", "podcast"] as const;
  for (const tactic of tactics) {
    const written = draft({ tactic, proof, sender });
    assert.ok(written, `${tactic} should write`);
    assert.ok(
      !/\b(pay|payment|fee|sponsor|sponsored|link exchange|swap|in return for a link)\b/i.test(written.body),
      `${tactic} must never offer anything Google treats as a link scheme`,
    );
  }
  assert.equal(RULES.neverOffersPayment, true);
  assert.equal(RULES.neverSends, true);
});

test("the compose URL carries the whole draft and stays inside every client's limit", () => {
  const written = draft({ tactic: "resource_page", proof, sender, to: "editor@energyreview.example" });
  assert.ok(written);
  const url = composeUrl(written, "gmail");
  assert.ok(url.startsWith("https://mail.google.com/mail/?view=cm&fs=1"));
  assert.ok(url.includes(encodeURIComponent("editor@energyreview.example")));
  assert.ok(decodeURIComponent(url).includes("inverter cost"));
  assert.equal(composeUrlFits(written), true);
  assert.ok(composeUrl(written, "default").startsWith("mailto:"));
});

test("shared mailboxes are recognised, because they are where outreach dies", () => {
  assert.equal(isRoleAddress("info@example.com"), true);
  assert.equal(isRoleAddress("Hello@Example.com"), true);
  assert.equal(isRoleAddress("sarah.chen@example.com"), false);
});

test("a domain cannot be approached more than twice in a month", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const recent = [
    { domain: "energyreview.example", at: "2026-05-20T00:00:00Z" },
    { domain: "energyreview.example", at: "2026-05-28T00:00:00Z" },
  ];
  assert.equal(canApproach(recent, "energyreview.example", now), false);
  assert.equal(canApproach(recent.slice(0, 1), "energyreview.example", now), true);
  // Old approaches age out.
  assert.equal(
    canApproach(
      [
        { domain: "energyreview.example", at: "2026-01-02T00:00:00Z" },
        { domain: "energyreview.example", at: "2026-01-09T00:00:00Z" },
      ],
      "energyreview.example",
      now,
    ),
    true,
  );
});

test("proof builders refuse what is not a proof", () => {
  assert.equal(proofFromMention({ url: "https://x.example/a", context: "Northwind" }, "A page"), null);
  assert.equal(proofFromResourcePage({ pageUrl: "https://x.example/a", pageTitle: "Links", listedCount: 2 }), null);
  assert.ok(proofFromResourcePage({ pageUrl: "https://x.example/a", pageTitle: "Solar resources", listedCount: 14 }));
});
