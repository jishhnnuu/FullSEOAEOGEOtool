#!/usr/bin/env node
/**
 * Write deploy/d1/migrations from src/server/schema.ts.
 *
 * The TypeScript module is the source of truth because it is what actually
 * runs: the Worker applies missing migrations itself on the first request. The
 * .sql files exist for anyone who prefers `wrangler d1 migrations apply`, and
 * for reading the schema without reading TypeScript. Run this after changing
 * the schema; `make check` fails if they have drifted.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "apps/web/src/server/schema.ts");
const OUT = join(ROOT, "deploy/d1/migrations");

const text = readFileSync(SOURCE, "utf8");

// Each migration is `{ id: "...", statements: [ `...`, `...` ] }`. Parsed
// rather than imported so this runs with no build step and no TypeScript.
const migrations = [];
const blocks = text.split(/\n\s*\{\s*\n\s*id:\s*"/).slice(1);
for (const block of blocks) {
  const id = block.slice(0, block.indexOf('"'));
  const start = block.indexOf("statements: [");
  const end = block.indexOf("\n    ],");
  if (start === -1 || end === -1) throw new Error(`Could not read the statements of ${id}.`);
  const body = block.slice(start + "statements: [".length, end);
  const statements = [...body.matchAll(/`([\s\S]*?)`,/g)].map((m) => m[1].replace(/\\`/g, "`").replace(/\\\$\{/g, "${").replace(/\\\\/g, "\\"));
  if (statements.length === 0) throw new Error(`${id} has no statements.`);
  migrations.push({ id, statements });
}
if (migrations.length === 0) throw new Error("No migrations found in schema.ts.");

mkdirSync(OUT, { recursive: true });
const banner =
  "-- Generated from apps/web/src/server/schema.ts by `npm run d1:sql`.\n" +
  "-- Do not edit by hand. The Worker applies these itself on first use;\n" +
  "-- this file exists for `wrangler d1 migrations apply` and for reading.\n\n";

let changed = 0;
for (const migration of migrations) {
  const path = join(OUT, `${migration.id}.sql`);
  const next = banner + migration.statements.map((s) => `${s};`).join("\n\n") + "\n";
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch {
    // A new migration.
  }
  if (current !== next) {
    if (process.argv.includes("--check")) {
      console.error(`${migration.id}.sql is out of date. Run: npm run d1:sql`);
      process.exitCode = 1;
      continue;
    }
    writeFileSync(path, next);
    changed += 1;
  }
}

if (process.argv.includes("--check")) {
  if (!process.exitCode) console.log(`d1: ${migrations.length} migration(s), files current.`);
} else {
  console.log(`d1: ${migrations.length} migration(s), ${changed} file(s) written.`);
}
