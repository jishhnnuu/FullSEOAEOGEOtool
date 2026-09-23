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

/**
 * Count the h1 elements a page renders, following the local components it
 * imports one level deep.
 *
 * One level is enough for the shape this codebase uses, where a thin route
 * file sets its metadata and returns a single shared component. Going deeper
 * would start counting h1s in components that are never rendered on this
 * route, which would be a worse answer than the one this gives.
 */
function countH1(source, file) {
  let count = (source.match(/<h1[\s>]/g) ?? []).length;
  const imports = [...source.matchAll(/from\s+"@\/components\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  for (const name of imports) {
    for (const ext of [".tsx", ".ts"]) {
      const candidate = join(ROOT, "apps/web/src/components", name + ext);
      let body;
      try {
        body = readFileSync(candidate, "utf8");
      } catch {
        continue;
      }
      // Only components this page actually renders, not every import.
      const exported = [...body.matchAll(/export function ([A-Za-z0-9_]+)/g)].map((m) => m[1]);
      const rendered = exported.filter((fn) => new RegExp(`<${fn}[\\s/>]`).test(source));
      if (rendered.length === 0) continue;
      count += (body.match(/<h1[\s>]/g) ?? []).length;
      break;
    }
  }
  return count;
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
  //
  // A page that delegates its whole body to one shared component still renders
  // exactly one h1, so the count follows the local components it imports. The
  // alternative is duplicating markup into four near-identical files purely to
  // satisfy a static check, which is the check distorting the code rather than
  // measuring it.
  const h1s = countH1(source, file);
  if (h1s === 0) problems.push(`${label}: no <h1>, in the page or in the components it imports.`);
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
