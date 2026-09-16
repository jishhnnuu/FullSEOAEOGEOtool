/**
 * Generated titles have to read as English.
 *
 * An earlier version of the content brief generator emitted "How much does
 * agents cost?" and "Software: a complete guide", which an independent review
 * called out as ungrammatical template fills. The same trap sits here: strip
 * the question word from "How does X compare to Y" and you are left with "X
 * compare to Y", which is worse than leaving the question alone.
 *
 * The rule this pins: when a clean noun phrase cannot be had, keep the
 * question intact. A title that is simply the question is always better than a
 * mangled one.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { assetIdeas } from "../src/engine/assets";

function titlesFor(prompts: string[]): string[] {
  return assetIdeas({
    lost: prompts.map((prompt) => ({ prompt, kind: "category", wonBy: ["rival.com"] })),
    citedDomains: [{ domain: "g2.com", count: 3 }],
    result: null,
    brand: "Acme",
    industry: "software",
  })
    .filter((idea) => idea.format !== "free_tool")
    .map((idea) => idea.title);
}

/** The shapes that mean a template filled itself badly. */
const MANGLED = [
  /^(are|is|do|does|did|can|could|should|would|will|was|were)\b/i,
  /\b(compare|compares|compared)\s+(to|with)\b.*:/i,
  /^\s*:/,
  /:\s*$/,
];

test("no generated title opens with a stranded auxiliary", () => {
  const titles = titlesFor([
    "What are the best accounting software options for small firms?",
    "How does Acme compare to Xero?",
    "Who are the leading providers of bookkeeping?",
    "Is Acme better than Sage?",
    "Can I use Acme for payroll?",
  ]);
  for (const title of titles) {
    for (const pattern of MANGLED) {
      assert.ok(!pattern.test(title), `"${title}" reads as a broken template fill`);
    }
  }
});

test("a comparison question becomes an X vs Y title", () => {
  const [title] = titlesFor(["How does Acme compare to Xero?"]);
  assert.match(title, /^Acme vs Xero/, `got "${title}"`);
});

test("a question that cannot be cleanly rewritten is kept whole", () => {
  const [title] = titlesFor(["How much does payroll software cost?"]);
  // Either shape is acceptable. What is not is a fragment.
  assert.ok(title.length > 20, `got "${title}"`);
  assert.ok(!/^(does|do|is|are)\b/i.test(title), `got "${title}"`);
});

test("every idea says what we do and what the person must supply", () => {
  const ideas = assetIdeas({
    lost: [{ prompt: "What are the best tools?", kind: "category", wonBy: ["rival.com"] }],
    citedDomains: [{ domain: "g2.com", count: 3 }],
    result: null,
    brand: "Acme",
  });
  assert.ok(ideas.length > 0);
  for (const idea of ideas) {
    assert.ok(idea.weCanDo.length > 20, "each idea states what the product produces");
    assert.ok(idea.youMustSupply.length > 20, "and what only a person can supply");
    assert.ok(idea.evidence.length > 30, "and the evidence that demand exists");
  }
});
