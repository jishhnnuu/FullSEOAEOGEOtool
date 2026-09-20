#!/usr/bin/env node
/**
 * Fail the build if the product name or the pre-launch domain has been
 * hard-coded anywhere outside `lib/brand.ts`.
 *
 * The whole point of the brand layer is that naming the product and moving it
 * to a real domain is two environment variables and a redeploy. That property
 * decays silently: one hard-coded string in a page title, and the launch
 * becomes a search-and-replace with a missed occurrence sitting in a canonical
 * tag pointing at a subdomain that no longer serves anything.
 *
 * So it is checked rather than remembered. Run with `npm run brand:check`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN = join(ROOT, "apps/web/src");

/** The one file allowed to contain the fallbacks, because it defines them. */
const ALLOWED = new Set([join(SCAN, "lib/brand.ts")]);

const FORBIDDEN = [
  {
    pattern: /fullseoaeogeotool\.[a-z0-9-]*\.?workers\.dev/gi,
    why: "the pre-launch workers.dev origin. Use url() or SITE_URL from lib/brand.ts.",
  },
  {
    // The wordmark as a literal in JSX or a metadata string. Matched with
    // word boundaries so prose mentioning the phrase in a comment is fine.
    pattern: /(["'`>])\s*SEO OS\s*(["'`<])/g,
    why: "the product name as a literal. Use BRAND from lib/brand.ts.",
  },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const problems = [];
for (const file of walk(SCAN)) {
  if (ALLOWED.has(file)) continue;
  const source = readFileSync(file, "utf8");
  for (const { pattern, why } of FORBIDDEN) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const line = source.slice(0, match.index).split("\n").length;
      problems.push(`${relative(ROOT, file)}:${line}  ${match[0].trim()}  -> ${why}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Hard-coded brand values found. The launch has to stay a one-variable change.\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log("Brand check passed: nothing outside lib/brand.ts hard-codes the name or the origin.");
