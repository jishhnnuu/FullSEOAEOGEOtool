import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * Serve prerendered pages as files, not as renders.
 *
 * This used to be the default configuration, with no incremental cache. That
 * sounds harmless for a site with no revalidation, but it means the adapter
 * has nowhere to read a prerendered page from, so every request for a static
 * page re-ran the React render inside the Worker: `x-nextjs-cache: MISS` on
 * the homepage, every time. On the free plan a request gets about 10 ms of
 * CPU, a full render can take longer, and Cloudflare answers the overrun with
 * Error 1102. It was intermittent because Cloudflare tolerates some bursts.
 *
 * The static assets cache reads the HTML the build already produced from
 * Workers static assets, and cache interception answers from it before the
 * Next server is even loaded. It is read only, which is correct here: nothing
 * in this app uses `revalidate`, `revalidateTag` or `unstable_cache`. Add
 * any of those and this has to become the KV or R2 cache instead, or the
 * revalidation will silently never happen.
 *
 * The dashboard's dynamic routes are unaffected: they still render on demand,
 * and they are client components reading through SWR, so the server part is
 * a thin shell.
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
