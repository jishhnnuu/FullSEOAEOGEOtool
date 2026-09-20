import type { MetadataRoute } from "next";

import { IS_LAUNCHED, SITE_URL, url } from "@/lib/brand";

/**
 * robots.txt.
 *
 * Two things this file has to get right, and both were wrong before it
 * existed. The deployment was serving Cloudflare's default content-signals
 * file, which is 30 lines of comments and not a single directive, so it
 * declared nothing, allowed nothing explicitly and pointed at no sitemap.
 *
 * **Every AI crawler is named and allowed.** This product's own `ai_crawler_
 * blocked` check is a high-severity finding, and the single most common cause
 * of invisibility in AI answers is a robots.txt that blocks the fetch. Naming
 * each agent rather than relying on `User-agent: *` is deliberate: several of
 * these crawlers read only their own block when one exists, and a site that
 * wants to be cited should leave no ambiguity about it.
 *
 * **The pre-launch deployment does not get indexed.** A workers.dev subdomain
 * that later moves to a real domain leaves a full duplicate of the site in the
 * index, competing with the real one for its own terms. Until
 * `NEXT_PUBLIC_SITE_URL` is set to the real origin, everything is disallowed.
 * Setting that variable flips this file to open in one deploy, which is the
 * whole point of the brand layer.
 */

/** Search engines. */
const SEARCH = [
  "Googlebot",
  "Googlebot-Image",
  "Bingbot",
  "DuckDuckBot",
  "Slurp",
  "Baiduspider",
  "YandexBot",
  "Applebot",
  "Applebot-Extended",
];

/**
 * Answer engines and model crawlers.
 *
 * Split into retrieval agents (they fetch to answer a question now, and are
 * the ones that decide whether you appear in an answer) and training agents.
 * Both are allowed here, because this site's whole argument is that the
 * content should be quotable, but the distinction is real and a site with a
 * different view can allow the first list and refuse the second.
 */
const AI_RETRIEVAL = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Amazonbot",
  "Applebot-Extended",
  "MistralAI-User",
  "DeepSeekBot",
  "YouBot",
  "PetalBot",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "FacebookBot",
];

const AI_TRAINING = ["CCBot", "Bytespider", "Diffbot", "ImagesiftBot", "Webzio-Extended", "cohere-ai", "Omgilibot"];

export default function robots(): MetadataRoute.Robots {
  if (!IS_LAUNCHED) {
    // Pre-launch: nothing gets indexed anywhere, so the real domain starts
    // with a clean slate instead of competing with a subdomain copy of itself.
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      host: SITE_URL,
    };
  }

  const allowAll = { allow: "/", disallow: ["/app/", "/api/"] };

  return {
    rules: [
      { userAgent: "*", ...allowAll },
      ...[...SEARCH, ...AI_RETRIEVAL, ...AI_TRAINING].map((agent) => ({ userAgent: agent, ...allowAll })),
    ],
    sitemap: url("/sitemap.xml"),
    host: SITE_URL,
  };
}
