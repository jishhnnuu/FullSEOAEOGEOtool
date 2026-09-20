#!/usr/bin/env node
/**
 * Hold our own site to the catalogue we sell.
 *
 * This exists because of a bug that shipped in the same change that added the
 * SEO layer: `alternates.canonical` was set in the root layout, where it
 * cascades to every page that does not override it. Eleven public pages ended
 * up declaring the homepage as their canonical. That is `canonical_mismatch`,
 * high severity in our own catalogue, and it is worse than having no canonical
 * because it actively asks the engine to drop the page.
 *
 * It was caught by reading the rendered values rather than checking that the
 * tag existed, which is the same distinction the product makes everywhere
 * else. Checking presence would have passed.
 *
 * Run with `npm run seo:check`. It is a static check over the source, so it
 * needs no server and can gate a build.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const APP = join(ROOT, "apps/web/src/app");

/** The signed-in workspace is noindex by design and is not a marketing page. */
const SKIP_PREFIX = join(APP, "app");

function pages(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "api") continue;
      out.push(...pages(full));
    } else if (entry === "page.tsx") {
      out.push(full);
    }
  }
  return out;
}

const problems = [];

for (const file of pages(APP)) {
  if (file.startsWith(SKIP_PREFIX)) continue;
  const source = readFileSync(file, "utf8");
  const route = "/" + relative(APP, file).replace(/\/?page\.tsx$/, "");
  const label = `${relative(ROOT, file)} (${route || "/"})`;

  // A dynamic route declares its canonical inside generateMetadata.
  const hasCanonical = /alternates:\s*\{\s*canonical:/.test(source);
  if (!hasCanonical) {
    problems.push(`${label}: no canonical. Add alternates: { canonical: "${route || "/"}" }.`);
  }

  // The failure that prompted this file: a canonical that is not this route.
  const literal = source.match(/alternates:\s*\{\s*canonical:\s*"([^"]+)"/);
  if (literal && !file.includes("[") && literal[1] !== (route || "/")) {
    problems.push(`${label}: canonical points at ${literal[1]}, not at this route.`);
  }

  // Every page needs exactly one H1. More than one means the page has not
  // decided what it is about; none means a model has no title to anchor on.
  const h1s = (source.match(/<h1[\s>]/g) ?? []).length;
  if (h1s === 0) problems.push(`${label}: no <h1>.`);
  if (h1s > 1) problems.push(`${label}: ${h1s} <h1> elements. There should be one.`);

  // A description seeds the snippet. Dynamic routes set it in generateMetadata.
  if (!/description:/.test(source)) {
    problems.push(`${label}: no meta description.`);
  }
}

// Every public route in the table must have a page behind it, or the sitemap
// advertises a 404 and `sitemap_contains_non_indexable` is our own finding.
const routesFile = readFileSync(join(ROOT, "apps/web/src/lib/routes.ts"), "utf8");
for (const match of routesFile.matchAll(/path:\s*"([^"]+)"/g)) {
  const route = match[1];
  const candidate = join(APP, route === "/" ? "page.tsx" : `${route}/page.tsx`);
  try {
    statSync(candidate);
  } catch {
    problems.push(`lib/routes.ts lists ${route}, but ${relative(ROOT, candidate)} does not exist.`);
  }
}

if (problems.length > 0) {
  console.error("Our own site fails checks we sell. Fix these before shipping.\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log("SEO check passed: every public page has one h1, a description, and a canonical pointing at itself.");
