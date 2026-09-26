import assert from "node:assert/strict";
import test from "node:test";

import { classify, reply, systemPrompt } from "../src/engine/cmo";
import type { AuditResult } from "../src/engine/types";

/*
 * The CMO answers questions about somebody's business, so the tests that
 * matter are the ones pinning what it will not say: no number it did not
 * measure, no desk it cannot sell, and no cheerful deflection when somebody
 * is unhappy.
 */

const ctx = (over: Partial<Parameters<typeof reply>[1]> = {}) => ({
  siteId: "site_1",
  domain: "example.com",
  result: null as AuditResult | null,
  desks: { search: true, content: false, social: false, paid: false },
  planName: "Free",
  firstName: null,
  ...over,
});

function resultWith(over: Record<string, unknown> = {}): AuditResult {
  return {
    crawl: { pages: new Array(29).fill({}) },
    findings: [
      { severity: "critical", fix: {} },
      { severity: "high", fix: {} },
      { severity: "medium", fix: null },
    ],
    quickWins: [{}, {}],
    briefs: [{}],
    estimatedAgencyHours: 12,
    ...over,
  } as unknown as AuditResult;
}

/* --------------------------------------------------------------- intents */

test("cmo: a complaint is heard before the question inside it", () => {
  // "this is not working, what should I do" is both. Answering the question
  // and ignoring the tone is how an account manager loses a client.
  assert.equal(classify("this is not working, what should I do"), "frustration");
  assert.equal(classify("what should I do first"), "priority");
});

test("cmo: asking for a human is not treated as a product question", () => {
  assert.equal(classify("can I speak to a real person"), "handover");
});

test("cmo: each desk is recognised by its own vocabulary", () => {
  assert.equal(classify("how are our google ads doing"), "desk_paid");
  assert.equal(classify("can you post on instagram"), "desk_social");
  assert.equal(classify("who writes the blog"), "desk_content");
  assert.equal(classify("are we ranking yet"), "desk_search");
});

/* ---------------------------------------------------------- the refusals */

test("cmo: with nothing crawled it refuses to characterise the site", () => {
  const out = reply("how are we doing", ctx());
  assert.equal(out.blocked, true);
  assert.match(out.says.join(" "), /would be invention/);
  // And it offers the one thing that would fix that, not a consolation.
  assert.deepEqual(out.actions.map((a) => a.label), ["Run the first audit"]);
});

test("cmo: every number in a status reply came from the result", () => {
  const out = reply("how are we doing", ctx({ result: resultWith() }));
  const said = out.says.join(" ");
  assert.match(said, /3 open items/);
  assert.match(said, /29 pages/);
  assert.match(said, /2 of them already have the fix written/);
  assert.match(said, /12 hours/);
  assert.equal(out.blocked, false);
});

test("cmo: a desk the plan does not include is named as not included", () => {
  const off = reply("can you run our ads", ctx({ result: resultWith() }));
  assert.equal(off.blocked, true);
  assert.match(off.says.join(" "), /not on your plan yet/);
  // And the free route is offered rather than only the upgrade.
  assert.ok(off.actions.some((a) => a.href === "/thymelab/ads/budget"));

  const on = reply("can you run our ads", ctx({
    result: resultWith(),
    desks: { search: true, content: true, social: true, paid: true },
  }));
  assert.equal(on.blocked, false);
  assert.ok(on.actions.every((a) => a.href.startsWith("/app/sites/site_1/paid")));
});

test("cmo: an unhappy client is answered before their question is", () => {
  const out = reply("this is useless, nothing has happened", ctx({ result: resultWith() }));
  assert.equal(out.intent, "frustration");
  assert.match(out.says[0], /That is fair/);
  // It still gives them the real state rather than only sympathy.
  assert.match(out.says.join(" "), /3 open items/);
  assert.ok(out.actions.some((a) => a.label === "What actually happened"));
});

test("cmo: it does not pretend there is a call centre", () => {
  const out = reply("I want to speak to a human", ctx());
  assert.match(out.says.join(" "), /no call centre behind me/);
});

test("cmo: an unparsed message says so rather than guessing", () => {
  const out = reply("mauve sixteen bicycle", ctx());
  assert.equal(out.intent, "unknown");
  assert.match(out.says[0], /did not follow that/);
});

/* ------------------------------------------------ the model never invents */

test("cmo: the model prompt carries the facts and forbids inventing a number", () => {
  const c = ctx({ result: resultWith() });
  const grounded = reply("how are we doing", c);
  const prompt = systemPrompt(c, grounded);
  assert.match(prompt, /Pages crawled: 29/);
  assert.match(prompt, /Open findings: 3/);
  assert.match(prompt, /must appear in the FACTS/);
  assert.match(prompt, /Lead with the bad news/);
  // The grounded answer travels with it, so the model rephrases rather than
  // answers. A model answering freely invents a number within three turns.
  for (const line of grounded.says) assert.ok(prompt.includes(line));
});

test("cmo: no reply offers more than three places to go", () => {
  const messages = [
    "hello", "how are we doing", "what should I do", "what is wrong",
    "how much", "how long", "can you", "approve", "this is useless",
    "speak to a human", "seo", "content", "social", "ads", "asdf",
  ];
  for (const m of messages) {
    const out = reply(m, ctx({ result: resultWith() }));
    assert.ok(out.actions.length <= 3, `${m} offered ${out.actions.length}`);
    assert.ok(out.says.length <= 3, `${m} said ${out.says.length} paragraphs`);
  }
});

test("cmo: one problem on many pages is not reported as many problems", () => {
  // Our own deployment is deliberately noindex before launch, so every page
  // carries the same critical finding. Reporting "29 critical items" is true
  // and alarming in a way the situation does not deserve.
  const repeated = {
    crawl: { pages: new Array(29).fill({}) },
    findings: new Array(29).fill(null).map(() => ({
      severity: "critical",
      code: "noindex",
      title: "Page is blocked from indexing",
      fix: null,
    })),
    quickWins: [],
    briefs: [],
    estimatedAgencyHours: 4,
  } as unknown as AuditResult;

  const out = reply("how are we doing", ctx({ result: repeated }));
  const said = out.says.join(" ");
  assert.match(said, /the same problem on 29 pages/);
  assert.match(said, /Fixing it once fixes all of them/);
  assert.doesNotMatch(said, /29 are serious enough/);
});

test("cmo: genuinely different problems are still counted", () => {
  const varied = {
    crawl: { pages: new Array(10).fill({}) },
    findings: [
      { severity: "critical", code: "a", title: "A", fix: null },
      { severity: "critical", code: "b", title: "B", fix: null },
      { severity: "high", code: "c", title: "C", fix: null },
      { severity: "high", code: "d", title: "D", fix: null },
    ],
    quickWins: [],
    briefs: [],
    estimatedAgencyHours: 2,
  } as unknown as AuditResult;

  const out = reply("how are we doing", ctx({ result: varied }));
  assert.match(out.says.join(" "), /4 of them are serious enough/);
});

test("cmo: a reply never contains an empty paragraph", () => {
  for (const m of ["hello", "status", "what is wrong", "ads", "social", "content"]) {
    const out = reply(m, ctx({ result: resultWith() }));
    assert.ok(out.says.every((line) => line.trim().length > 0), m);
  }
});
