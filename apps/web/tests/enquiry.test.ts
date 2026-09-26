import assert from "node:assert/strict";
import test from "node:test";

import { enquiryEmail, looksLikeEmail, normaliseWebsite, validateEnquiry } from "../src/engine/enquiry";

test("a name and an email are enough", () => {
  const r = validateEnquiry({ name: "  Ada  Lovelace ", email: "ADA@Example.com" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.enquiry.name, "Ada Lovelace");
  assert.equal(r.enquiry.email, "ada@example.com");
  assert.deepEqual(r.enquiry.services, []);
  assert.equal(r.enquiry.website, null);
});

test("missing name or a bad email is refused with a sentence", () => {
  const noName = validateEnquiry({ email: "a@b.co" });
  assert.equal(noName.ok, false);
  const badEmail = validateEnquiry({ name: "A", email: "not an email" });
  assert.equal(badEmail.ok, false);
  if (!badEmail.ok) assert.match(badEmail.message, /email/);
});

test("email check is plain, not clever", () => {
  assert.equal(looksLikeEmail("founder@startup.io"), true);
  assert.equal(looksLikeEmail("founder@startup"), false);
  assert.equal(looksLikeEmail("two words@x.com"), false);
});

test("a website without a scheme becomes a URL, and nonsense is refused", () => {
  assert.equal(normaliseWebsite("mybusiness.com"), "https://mybusiness.com/");
  assert.equal(normaliseWebsite("http://shop.example.co.uk/about"), "http://shop.example.co.uk/about");
  assert.equal(normaliseWebsite("localhost"), null);
  const bad = validateEnquiry({ name: "A", email: "a@b.co", website: "not a site" });
  assert.equal(bad.ok, false);
});

test("only known services and stages are kept, and duplicates collapse", () => {
  const r = validateEnquiry({ name: "A", email: "a@b.co", services: ["search", "search", "hacking", 7, "paid"], stage: "nonsense" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.enquiry.services, ["search", "paid"]);
  assert.equal(r.enquiry.stage, null);
});

test("fields are capped, and the message keeps its line breaks", () => {
  const r = validateEnquiry({ name: "x".repeat(500), email: "a@b.co", message: "line one\nline two" + "y".repeat(5000) });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.enquiry.name.length, 100);
  assert.equal(r.enquiry.message!.length, 2000);
  assert.ok(r.enquiry.message!.startsWith("line one\nline two"));
});

test("the team's email names every field and says what was not given", () => {
  const r = validateEnquiry({ name: "Ada", email: "ada@example.com", services: ["websites"], stage: "idea" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const mail = enquiryEmail(r.enquiry, "2026-09-26T10:00:00Z");
  assert.equal(mail.subject, "New call request: Ada");
  assert.match(mail.text, /Interested in: A website/);
  assert.match(mail.text, /Where they are: Just starting, no website yet/);
  assert.match(mail.text, /Website: None yet/);
  assert.match(mail.text, /No message\./);
});
