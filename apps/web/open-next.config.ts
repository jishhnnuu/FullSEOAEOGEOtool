import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Default adapter configuration.
 *
 * No incremental cache is configured on purpose: every page in this dashboard
 * is client rendered and reads through SWR, and the one server route is
 * `force-dynamic`, so there is nothing whose staleness a cache would manage.
 */
export default defineCloudflareConfig();
