#!/usr/bin/env node
/**
 * Turn accounts on, in one command.
 *
 * Everything this does needs a Cloudflare account and a Google Cloud project,
 * which is why it cannot happen in CI or from a deploy hook: it creates the D1
 * database, writes the binding into wrangler.jsonc, applies the schema, and
 * sets the secrets. Run it once, from a machine logged into `wrangler`.
 *
 * It is safe to run again. An existing database is reused, an existing binding
 * is left alone, and applied migrations are skipped.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "wrangler.jsonc");
const DB_NAME = process.env.SEOOS_D1_NAME ?? "seoos";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function say(line = "") {
  process.stdout.write(`${line}\n`);
}

function wrangler(args, { capture = false } = {}) {
  if (capture) {
    return execFileSync("npx", ["wrangler", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
  }
  const result = spawnSync("npx", ["wrangler", ...args], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`wrangler ${args.join(" ")} exited with ${result.status}`);
  return "";
}

/* ------------------------------------------------------------------ steps */

/** The database id, creating the database if this account has no such one. */
function ensureDatabase() {
  let listed = "[]";
  try {
    listed = wrangler(["d1", "list", "--json"], { capture: true });
  } catch {
    throw new Error("`wrangler d1 list` failed. Run `npx wrangler login` first.");
  }
  const existing = JSON.parse(listed).find((row) => row.name === DB_NAME);
  if (existing) {
    say(`Using the existing D1 database "${DB_NAME}".`);
    return existing.uuid ?? existing.database_id;
  }
  say(`Creating the D1 database "${DB_NAME}".`);
  const created = wrangler(["d1", "create", DB_NAME, "--json"], { capture: true });
  const parsed = JSON.parse(created);
  const id = parsed.uuid ?? parsed.database_id ?? parsed?.d1_databases?.[0]?.database_id;
  if (!id) throw new Error(`D1 was created but the reply carried no id:\n${created}`);
  return id;
}

/**
 * Write the binding into wrangler.jsonc.
 *
 * Text surgery rather than a JSON round trip, because the file is jsonc and
 * its comments are load-bearing documentation.
 */
function writeBinding(databaseId) {
  const source = readFileSync(CONFIG, "utf8");
  if (/"d1_databases"\s*:\s*\[/.test(source)) {
    if (!/"database_id"/.test(source)) {
      say("wrangler.jsonc names the database without an id, so the next deploy connects to it by name.");
      return;
    }
    if (source.includes(databaseId)) {
      say("The binding is already in wrangler.jsonc.");
      return;
    }
    const updated = source.replace(/("d1_databases"[\s\S]*?"database_id"\s*:\s*")[^"]*(")/, `$1${databaseId}$2`);
    writeFileSync(CONFIG, updated);
    say("Pointed the existing binding at this database.");
    return;
  }
  const block =
    `  "d1_databases": [\n` +
    `    {\n` +
    `      "binding": "DB",\n` +
    `      "database_name": "${DB_NAME}",\n` +
    `      "database_id": "${databaseId}",\n` +
    `      "migrations_dir": "deploy/d1/migrations"\n` +
    `    }\n` +
    `  ],\n\n`;
  const anchor = `  "observability":`;
  if (!source.includes(anchor)) throw new Error("wrangler.jsonc has no observability block to write the binding above.");
  writeFileSync(CONFIG, source.replace(anchor, block + anchor));
  say("Wrote the binding into wrangler.jsonc. Commit that change.");
}

function applySchema() {
  say("Applying the schema to the remote database.");
  wrangler(["d1", "migrations", "apply", DB_NAME, "--remote"]);
}

async function putSecret(name, value) {
  const result = spawnSync("npx", ["wrangler", "secret", "put", name], {
    cwd: ROOT,
    input: `${value}\n`,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) throw new Error(`Setting ${name} failed.`);
}

async function secrets() {
  say("");
  say("Secrets. Blank skips one, leaving whatever is already set.");

  const key = randomBytes(32).toString("base64");
  const setKey = (await rl.question(`  Generate and set SEOOS_MASTER_KEY? [Y/n] `)).trim().toLowerCase();
  if (setKey !== "n") {
    await putSecret("SEOOS_MASTER_KEY", key);
    say("  SEOOS_MASTER_KEY set. Keep a copy somewhere safe:");
    say(`    ${key}`);
    say("  Losing it means every stored connection has to be reconnected.");
  }

  const clientId = (await rl.question("  GOOGLE_CLIENT_ID: ")).trim();
  if (clientId) await putSecret("GOOGLE_CLIENT_ID", clientId);
  const clientSecret = (await rl.question("  GOOGLE_CLIENT_SECRET: ")).trim();
  if (clientSecret) await putSecret("GOOGLE_CLIENT_SECRET", clientSecret);
  const resend = (await rl.question("  RESEND_API_KEY (optional, magic links): ")).trim();
  if (resend) await putSecret("RESEND_API_KEY", resend);
  const base = (await rl.question("  PUBLIC_BASE_URL (optional, a custom domain): ")).trim();
  if (base) await putSecret("PUBLIC_BASE_URL", base.replace(/\/+$/, ""));
}

/* ------------------------------------------------------------------- main */

async function main() {
  say("SEO OS: switching accounts on.");
  say("");

  const databaseId = ensureDatabase();
  writeBinding(databaseId);
  applySchema();
  await secrets();

  say("");
  say("Done. Two things are left, and only you can do them.");
  say("");
  say("1. The Google OAuth client, at console.cloud.google.com/apis/credentials");
  say("   Type: Web application.");
  say("   Authorised redirect URIs, both of them, exactly:");
  say("     https://<your-worker>.workers.dev/api/auth/google/callback");
  say("     https://<your-worker>.workers.dev/api/connections/google/callback");
  say("   On the consent screen add these scopes:");
  say("     openid, email, profile");
  say("     .../auth/webmasters.readonly       (read only)");
  say("     .../auth/analytics.readonly        (sensitive: add yourself as a test user)");
  say("   Add your own Gmail address under Test users while the app is unverified.");
  say("");
  say("2. Commit the wrangler.jsonc change and push, so the deploy picks up the binding.");
  say("");
  say("Then open /app/signin. It will say what is still missing, if anything.");
  rl.close();
}

main().catch((error) => {
  say("");
  say(`Stopped: ${error.message}`);
  rl.close();
  process.exitCode = 1;
});
