/**
 * What is actually running, right now.
 *
 * This exists because a Cloudflare build can fail while the previous version
 * keeps being served, so the site looks fine and two commits sit undeployed.
 * Checking whether a deploy landed meant grepping the rendered HTML for a
 * sentence that happened to change, which is guessing.
 *
 * One request now answers it. The commit is read at build time from whatever
 * the build environment exposes, so no step has to remember to stamp it, and
 * where nothing exposes it the answer is "unknown" rather than a stale value
 * baked in months ago.
 */

export const dynamic = "force-dynamic";

/*
 * Cloudflare Pages and Workers builds set CF_PAGES_COMMIT_SHA or
 * WORKERS_CI_COMMIT_SHA. GitHub Actions sets GITHUB_SHA. A local build sets
 * none of them, which is a true answer rather than a missing one.
 */
const COMMIT =
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.WORKERS_CI_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.NEXT_PUBLIC_COMMIT_SHA ??
  "unknown";

const BUILT_AT = new Date().toISOString();

export async function GET() {
  return Response.json(
    {
      commit: COMMIT === "unknown" ? "unknown" : COMMIT.slice(0, 12),
      builtAt: BUILT_AT,
      note:
        COMMIT === "unknown"
          ? "This build ran somewhere that exposes no commit SHA, so the version is genuinely unknown rather than guessed. builtAt still tells you when the bundle was made."
          : "The commit this bundle was built from. If it lags the repository, a build failed and the previous version is still being served.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
