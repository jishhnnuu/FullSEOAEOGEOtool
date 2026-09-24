/**
 * What is actually running, right now.
 *
 * This exists because a Cloudflare build can fail while the previous version
 * keeps being served, so the site looks fine and commits sit undeployed.
 * Checking whether a deploy landed meant grepping the rendered HTML for a
 * sentence that happened to change, which is guessing.
 *
 * The values come from `build-info.generated.ts` rather than from
 * `process.env`. The first version of this route read the environment
 * directly, which looked right and was wrong: the CI variables exist in the
 * build container and a route evaluates them at runtime on the Worker, where
 * they are gone, so it answered "unknown" on every deploy. `new Date()` at
 * module scope was the same mistake in a different coat, reporting when the
 * isolate started rather than when the bundle was made.
 */

import { BUILD_AT, BUILD_BRANCH, BUILD_COMMIT } from "@/lib/build-info.generated";

export const dynamic = "force-dynamic";

export async function GET() {
  const known = BUILD_COMMIT !== "unknown";
  return Response.json(
    {
      commit: BUILD_COMMIT,
      branch: BUILD_BRANCH,
      builtAt: BUILD_AT,
      note: known
        ? "The commit this bundle was built from. If it lags the repository, a build failed and the previous version is still being served."
        : "This build ran with no git checkout and no CI commit variable, so the version is genuinely unknown rather than guessed. builtAt still says when the bundle was made.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
