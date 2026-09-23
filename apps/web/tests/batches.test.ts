/**
 * Batching, pinned to the things that would be dangerous or dishonest.
 *
 * The purpose of this module is to turn 150 decisions into six, and the risk
 * it carries is obvious: a batch that bundles a site-wide change behind one
 * click would let a careless approval take a site out of the index. So the
 * tests here are mostly about what must never end up in a batch.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBatches, summarise, type Batch } from "../src/engine/batches";
import type { Finding, Fix, Severity } from "../src/engine/types";

let counter = 0;

function fix(overrides: Partial<Fix> = {}): Fix {
  return {
    kind: "meta",
    label: "Update the description",
    target: "/a",
    before: "old",
    after: "new",
    applyVia: "cms",
    risk: "low",
    reversible: true,
    instructions: "",
    ...overrides,
  };
}

function finding(code: string, options: Partial<Finding> = {}): Finding {
  counter += 1;
  return {
    id: `f${counter}`,
    code,
    category: "content",
    severity: "medium" as Severity,
    title: code,
    why: "",
    recommendation: "",
    detail: "",
    url: "https://example.com/a",
    affectedUrls: ["https://example.com/a"],
    affectedCount: 1,
    evidence: {},
    priority: 50,
    impact: 0.5,
    effort: 0.3,
    confidence: 0.9,
    autoFixable: true,
    fixStrategy: null,
    fix: fix(),
    status: "open",
    firstSeen: "2026-09-20T00:00:00.000Z",
    lastSeen: "2026-09-20T00:00:00.000Z",
    ...options,
  };
}

function byId(batches: Batch[], id: string): Batch | undefined {
  return batches.find((b) => b.id === id);
}

test("identical mechanical fixes collapse into one decision", () => {
  const batches = buildBatches([
    finding("meta_description_missing"),
    finding("meta_description_missing"),
    finding("title_too_long"),
  ]);
  const mechanical = batches.filter((b) => b.kind === "mechanical");
  assert.equal(mechanical.length, 1, "three meta fixes are one decision");
  assert.equal(mechanical[0].findings.length, 3);
  assert.equal(mechanical[0].batchable, true);
});

test("different kinds of change stay different decisions", () => {
  const batches = buildBatches([
    finding("meta_description_missing", { fix: fix({ kind: "meta" }) }),
    finding("image_alt_missing", { fix: fix({ kind: "html" }) }),
    finding("no_organization_schema", { fix: fix({ kind: "jsonld" }) }),
  ]);
  const mechanical = batches.filter((b) => b.kind === "mechanical");
  assert.equal(mechanical.length, 3, "meta, html and jsonld are three different judgements");
});

/* ---- the rules that exist to stop this module doing damage --------------- */

test("a site-wide change is never bundled with anything else", () => {
  const batches = buildBatches([
    finding("robots_blocks_important", { severity: "critical", fix: fix({ risk: "critical", reversible: false }) }),
    finding("meta_description_missing"),
    finding("meta_description_missing"),
  ]);
  const structural = batches.filter((b) => b.kind === "structural");
  assert.equal(structural.length, 1);
  assert.equal(structural[0].findings.length, 1, "it stands alone");
  assert.equal(structural[0].batchable, false, "and it cannot be one-clicked as a group");
});

test("every irreversible or high-risk fix lands in its own decision, even at volume", () => {
  const codes = ["page_noindex", "canonical_mismatch", "redirect_loop", "no_https", "mixed_content"];
  const batches = buildBatches(
    codes.map((code) => finding(code, { severity: "critical", fix: fix({ risk: "high", reversible: false }) })),
  );
  assert.equal(batches.length, codes.length);
  for (const batch of batches) {
    assert.equal(batch.kind, "structural");
    assert.equal(batch.batchable, false);
    assert.equal(batch.findings.length, 1);
  }
});

test("structural decisions sort above everything else", () => {
  const batches = buildBatches([
    finding("meta_description_missing", { priority: 99 }),
    finding("page_noindex", { severity: "critical", priority: 10, fix: fix({ risk: "critical", reversible: false }) }),
  ]);
  assert.equal(batches[0].kind, "structural", "a site-wide change is read first even at lower priority");
});

test("anything that writes prose is counted, never batched", () => {
  const batches = buildBatches([
    finding("no_direct_answer"),
    finding("thin_content"),
    finding("unsubstantiated_claim"),
  ]);
  const editorial = byId(batches, "editorial");
  assert.ok(editorial);
  assert.equal(editorial.kind, "editorial");
  assert.equal(editorial.findings.length, 3);
  assert.equal(editorial.batchable, false, "a generated sentence gets read");
});

test("a low-confidence check is shown on its own rather than applied forty times", () => {
  const batches = buildBatches([
    finding("intent_mismatch", { confidence: 0.55 }),
    finding("meta_description_missing", { confidence: 0.95 }),
    finding("meta_description_missing", { confidence: 0.95 }),
  ]);
  const batchable = batches.filter((b) => b.batchable && b.kind === "mechanical");
  for (const batch of batchable) {
    for (const item of batch.findings) {
      assert.ok(item.confidence >= 0.8, `${item.code} at ${item.confidence} should not be batchable`);
    }
  }
  assert.ok(
    batches.some((b) => !b.batchable && b.findings.some((f) => f.code === "intent_mismatch")),
    "the uncertain one is shown on its own",
  );
});

test("a finding with no fix is counted as diagnosis, not offered as work", () => {
  const batches = buildBatches([
    finding("gsc_not_connected", { fix: null }),
    finding("authority_gap", { fix: null }),
  ]);
  const manual = byId(batches, "manual");
  assert.ok(manual);
  assert.equal(manual.findings.length, 2);
  assert.equal(manual.batchable, false);
  assert.equal(manual.priority, -1, "it sorts last, because there is nothing to decide");
});

test("root files are one decision each, not one decision together", () => {
  const batches = buildBatches([
    finding("no_sitemap", { fix: fix({ kind: "file", target: "/sitemap.xml" }) }),
    finding("missing_llms_txt", { fix: fix({ kind: "file", target: "/llms.txt" }) }),
  ]);
  const roots = batches.filter((b) => b.kind === "root_file");
  assert.equal(roots.length, 2);
  assert.ok(roots.every((b) => b.findings.length === 1));
  assert.ok(roots.some((b) => b.title.includes("sitemap.xml")));
  assert.ok(roots.some((b) => b.title.includes("llms.txt")));
});

/* ---- the number the screen shows ---------------------------------------- */

test("the summary shows far fewer decisions than findings, which is the point", () => {
  const many = Array.from({ length: 38 }, () => finding("meta_description_missing"));
  const batches = buildBatches([...many, finding("no_direct_answer")]);
  const line = summarise(batches);
  assert.match(line, /39 findings/);
  assert.match(line, /1 batched decision/);
  assert.match(line, /1 item that needs reading first/);
});

test("an empty audit says nothing is waiting rather than showing a zero", () => {
  assert.equal(summarise(buildBatches([])), "Nothing is waiting on you.");
});

test("one of a thing is singular, because '1 findings' reads as a bug", () => {
  const line = summarise(buildBatches([finding("meta_description_missing")]));
  assert.match(line, /1 finding\b/);
  assert.doesNotMatch(line, /1 findings/);
});

test("a batch states its blast radius in pages, not just in findings", () => {
  const batches = buildBatches([
    finding("meta_description_missing", { affectedUrls: ["/a", "/b", "/c"] }),
    finding("meta_description_missing", { affectedUrls: ["/d"] }),
  ]);
  const mechanical = batches.find((b) => b.kind === "mechanical");
  assert.ok(mechanical);
  assert.equal(mechanical.pages, 4);
});

test("every batch explains why it is one decision, or why it is not", () => {
  const batches = buildBatches([
    finding("meta_description_missing"),
    finding("page_noindex", { severity: "critical" }),
    finding("thin_content"),
    finding("gsc_not_connected", { fix: null }),
  ]);
  assert.ok(batches.length > 0);
  for (const batch of batches) {
    assert.ok(batch.rationale.length > 40, `${batch.id} has no rationale worth reading`);
    assert.ok(batch.title.length > 0);
  }
});
