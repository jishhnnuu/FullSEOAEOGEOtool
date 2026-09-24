/**
 * What each social platform will and will not let this desk read.
 *
 * A mirror of `packages/seoos/connectors/social.py`, because Cloudflare
 * Workers cannot run Python and the browser needs the same map. The two are
 * kept in step by hand and the numbers are asserted in the engine tests.
 *
 * The map exists because the most common lie in social tooling is a
 * competitor's impressions. Impressions and reach are computed by the platform
 * for the account owner and exposed only through that owner's own token. No
 * API sells them. Every dashboard showing a rival's reach is estimating it
 * from follower count and calling the estimate data.
 */

export type PlatformCapability = {
  key: string;
  name: string;
  /** Can the client connect their own account and read their own insights? */
  ownAccount: boolean;
  /** Can a competitor's public posts be read at all? */
  competitorPosts: boolean;
  /** Which public per-post metrics come back. Never includes impressions. */
  competitorMetrics: string[];
  requires: string;
  access: "free" | "paid" | "gated" | "none";
  /** Why a no is a no. Empty when everything is available. */
  limitation: string;
  canPublish: boolean;
};

/** Owner-only on every platform in existence. Worth naming once. */
export const NEVER_AVAILABLE = [
  "impressions", "reach", "saves", "profile visits", "follower demographics",
  "watch time", "click-throughs", "conversions",
];

export const PLATFORMS: PlatformCapability[] = [
  {
    key: "youtube", name: "YouTube", ownAccount: true, competitorPosts: true,
    competitorMetrics: ["views", "likes", "comments", "duration", "title", "description", "tags", "published"],
    requires:
      "Nothing for a shallow read: the public channel feed carries views and likes for the fifteen " +
      "most recent uploads. A free YouTube Data API v3 key raises that to a hundred, with comment " +
      "counts and durations, which is what separates Shorts from long-form.",
    access: "free", limitation: "", canPublish: true,
  },
  {
    key: "instagram", name: "Instagram", ownAccount: true, competitorPosts: true,
    competitorMetrics: ["likes", "comments", "media type", "caption", "permalink", "posted at", "followers"],
    requires:
      "Your own Instagram Business or Creator account connected to a Facebook Page, plus a Meta app. " +
      "Competitor reads go through the Business Discovery edge of the Instagram Graph API, which only " +
      "returns accounts that are themselves Business or Creator.",
    access: "free",
    limitation:
      "Impressions, reach and saves are never returned for an account you do not own, and a personal " +
      "account cannot be read at all. Stories are owner-only in every case.",
    canPublish: true,
  },
  {
    key: "reddit", name: "Reddit", ownAccount: true, competitorPosts: true,
    competitorMetrics: ["score", "upvote ratio", "comments", "subreddit", "title", "body", "posted at"],
    requires: "Nothing for light use. The public JSON endpoints work without a key at low volume.",
    access: "free",
    limitation:
      "Two things. Vote counts are fuzzed by Reddit on purpose, so treat score as approximate. And " +
      "Reddit refuses requests from data-centre address ranges, which is where a hosted deployment " +
      "runs, so a read from the public site will often answer 403 rather than data.",
    canPublish: true,
  },
  {
    key: "x", name: "X", ownAccount: true, competitorPosts: true,
    competitorMetrics: ["likes", "reposts", "replies", "quotes", "text", "posted at"],
    requires: "An X API v2 plan. The Basic tier is roughly $200 a month and there is no free read tier.",
    access: "paid",
    limitation:
      "Impression counts are returned only for posts on the authenticated account. Rate limits on the " +
      "Basic tier make a wide competitive sweep slow rather than impossible.",
    canPublish: true,
  },
  {
    key: "tiktok", name: "TikTok", ownAccount: true, competitorPosts: false, competitorMetrics: [],
    requires: "A TikTok for Developers app for your own account, through the Display API.",
    access: "gated",
    limitation:
      "There is no commercial competitor endpoint. The Research API that returns other accounts' public " +
      "videos is restricted to approved academic researchers in the US and EU, and its terms forbid " +
      "commercial use. Anything else on the market is scraping, which breaks TikTok's terms and stops " +
      "working without warning.",
    canPublish: true,
  },
  {
    key: "facebook", name: "Facebook Pages", ownAccount: true, competitorPosts: false, competitorMetrics: [],
    requires: "A Meta app with Pages access for the client's own Page.",
    access: "gated",
    limitation:
      "Reading another company's Page posts needs Page Public Content Access, which Meta has reviewed " +
      "case by case since 2018 and grants almost exclusively to research and moderation use cases. " +
      "Assume no competitor data here.",
    canPublish: true,
  },
  {
    key: "linkedin", name: "LinkedIn", ownAccount: true, competitorPosts: false, competitorMetrics: [],
    requires: "A LinkedIn app with Community Management access for the client's own Page.",
    access: "gated",
    limitation:
      "There is no API that returns another company's Page posts. Competitive reading on LinkedIn is " +
      "manual, and a tool claiming otherwise is scraping a logged-in session.",
    canPublish: true,
  },
  {
    key: "pinterest", name: "Pinterest", ownAccount: true, competitorPosts: false, competitorMetrics: [],
    requires: "A Pinterest app for the client's own account.",
    access: "free",
    limitation: "No competitor endpoint. Public boards can be viewed but not read through the API.",
    canPublish: true,
  },
  {
    key: "threads", name: "Threads", ownAccount: true, competitorPosts: false, competitorMetrics: [],
    requires: "A Meta app with Threads access for the client's own account.",
    access: "free",
    limitation: "The Threads API covers your own posts and insights. No competitor endpoint exists.",
    canPublish: true,
  },
  {
    key: "snapchat", name: "Snapchat", ownAccount: false, competitorPosts: false, competitorMetrics: [],
    requires: "Nothing available. Snapchat's public APIs are for advertising, not content.",
    access: "none",
    limitation:
      "There is no content API for organic Snapchat, for your own account or anybody else's. This desk " +
      "will not pretend to cover it.",
    canPublish: false,
  },
];

export const BY_KEY = new Map(PLATFORMS.map((p) => [p.key, p]));

export function capability(key: string): PlatformCapability | undefined {
  return BY_KEY.get(key.toLowerCase());
}

/** The platforms where a competitor teardown is genuinely possible. */
export function readableForCompetitors(): PlatformCapability[] {
  return PLATFORMS.filter((p) => p.competitorPosts);
}

/** The ones a browser can read today with no paid plan and no app review. */
export function readableInBrowser(): PlatformCapability[] {
  return PLATFORMS.filter((p) => p.competitorPosts && p.access === "free");
}
