import assert from "node:assert/strict";
import test from "node:test";

import { RIVAL_FLOOR, compare, fingerprint } from "../src/engine/voice";

/*
 * These fixtures are long on purpose. The module refuses to report ratios
 * under 120 words, and a fixture under the floor tests the refusal rather
 * than the measurement, which is a different test.
 */

const COMPANY = `
We are a leading provider of innovative solutions for the modern enterprise.
Our team leverages cutting-edge technology to deliver seamless outcomes for our
clients. We believe in a holistic approach that empowers organisations to
streamline their operations. Our bespoke offerings are designed around the
unique needs of each customer. We have been recognised as a world-class partner
across the landscape of digital transformation. Our solutions are built on a
robust platform that our engineers have optimised for scale. We work with
organisations who want to unlock the full potential of their data. Our journey
began with a simple belief that better tooling elevates every team. We continue
to invest in the ecosystem that supports our customers. Our commitment to
excellence is what separates us from every alternative in this market today.
We would welcome the opportunity to discuss how our platform might possibly
support the objectives your organisation has set for the coming year ahead.
`;

const READER = `
You will need three things before you start. First, a list of the pages you
actually care about. Most sites have far fewer than they think. Second, access
to Search Console, which takes about four minutes to connect and is the single
most useful thing you can do today. Third, an hour. Start by exporting the
pages that got a click in the last 28 days. Sort them by impressions. The rows
near the top with a low click rate are where the money is, because the demand
is already there and something about the listing is losing it. Rewrite those
titles first. Check the result in 14 days, not in 2. If nothing moved, the
problem was never the title, and you have learned that for the price of an
afternoon. Do the same for the next 20 rows. Keep a note of what you changed
and when, because in three months you will not remember.
`;

const RIVALS = [READER, READER.replace(/four/g, "five"), READER.replace(/three/g, "four"), COMPANY];

test("voice refuses to measure a short sample", () => {
  const fp = fingerprint("Too short to mean anything at all.", "stub");
  assert.equal(fp.measured, false);
  assert.match(fp.notes[0], /words/);
});

test("voice separates a company voice from a reader-facing one", () => {
  const company = fingerprint(COMPANY, "home");
  const reader = fingerprint(READER, "guide");
  assert.equal(company.measured, true);
  assert.equal(reader.measured, true);
  assert.equal(company.address, "company-facing");
  assert.equal(reader.address, "reader-facing");
  assert.ok(company.fillerPer1k > reader.fillerPer1k);
  assert.ok(reader.concretePer1k > company.concretePer1k);
});

test("voice counts rhythm as a coefficient of variation", () => {
  const flat = fingerprint(Array.from({ length: 14 }, () =>
    "This sentence carries exactly nine words in total here.").join(" "), "flat");
  const varied = fingerprint(READER, "varied");
  assert.ok(flat.rhythm < varied.rhythm);
});

test("voice refuses a verdict on fewer than three measurable rivals", () => {
  const site = fingerprint(COMPANY, "home");
  const result = compare(site, [fingerprint(READER, "one"), fingerprint("short", "two")]);
  assert.equal(result.measured, false);
  assert.equal(result.sampleSize, 1);
  assert.match(result.reason ?? "", new RegExp(String(RIVAL_FLOOR)));
  assert.equal(result.differences.length, 0);
});

test("voice reports both numbers behind every difference", () => {
  const site = fingerprint(COMPANY, "home");
  const result = compare(site, RIVALS.map((t, i) => fingerprint(t, `rival ${i}`)));
  assert.equal(result.measured, true);
  assert.ok(result.differences.length > 0);
  for (const d of result.differences) {
    assert.equal(typeof d.site, "number");
    assert.equal(typeof d.rivalMedian, "number");
    assert.equal(d.rivalRange.length, 2);
    assert.ok(d.label.length > 0);
  }
});

test("voice stays silent when the voices match", () => {
  const site = fingerprint(READER, "home");
  const result = compare(site, [0, 1, 2, 3].map((i) => fingerprint(READER, `rival ${i}`)));
  assert.equal(result.measured, true);
  assert.equal(result.differences.length, 0);
  assert.match(result.verdict ?? "", /No material difference/);
});
