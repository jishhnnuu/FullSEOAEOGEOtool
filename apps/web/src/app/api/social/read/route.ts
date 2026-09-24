/**
 * Read one public social account, using the tenant's own credentials.
 *
 * A relay, like the model route. The browser holds the credential, sends it
 * with the request, it is used once and never written down: not to a log, not
 * to a cache, not to storage. The platform holds no API key of its own for any
 * social network, which is the property that keeps a deployment standalone.
 *
 * The route exists at all because a browser cannot read another origin. The
 * host allowlist below is fixed and exhaustive, so this cannot be turned into
 * a general-purpose proxy by crafting a handle.
 */

import { NextRequest } from "next/server";

import type { AccountProfile, SocialPost } from "@/engine/social";
import { capability } from "@/lib/social-platforms";

export const dynamic = "force-dynamic";

type Body = {
  platform?: string;
  handle?: string;
  limit?: number;
  credentials?: { youtubeApiKey?: string; igUserId?: string; igAccessToken?: string };
};

/** Every host this route will ever contact. Not extensible from a request. */
const ALLOWED_HOSTS = new Set([
  "www.googleapis.com",
  "graph.facebook.com",
  "www.reddit.com",
  // The keyless YouTube route: a channel page to resolve a handle, and the
  // public Atom feed that carries views and likes without an API key.
  "www.youtube.com",
]);

function bad(message: string, status = 400) {
  return Response.json({ message }, { status });
}

async function text(url: string): Promise<string> {
  const host = new URL(url).host;
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`Refused: ${host} is not an allowed host.`);
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml",
      // A real browser string, because the channel page serves a consent
      // interstitial to anything it does not recognise and the interstitial
      // carries no channel id.
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/124.0.0.0 Safari/537.36",
      "accept-language": "en-GB,en;q=0.9",
    },
  });
  if (!response.ok) throw new Error(`Upstream answered ${response.status}.`);
  return response.text();
}

async function json(url: string): Promise<unknown> {
  const host = new URL(url).host;
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`Refused: ${host} is not an allowed host.`);
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "thymesnow-social-research/1.0" },
  });
  if (!response.ok && response.status !== 200) {
    // Some of these APIs put a usable error in the body, so read it anyway.
    try { return await response.json(); } catch { throw new Error(`Upstream answered ${response.status}.`); }
  }
  return response.json();
}

function unreadable(platform: string, handle: string, reason: string): AccountProfile {
  return { handle, platform, followers: null, posts: [], unreadable: reason };
}

function isoSeconds(value: string): number | null {
  const m = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value || "");
  if (!m) return null;
  const [h, mi, s] = [m[1], m[2], m[3]].map((g) => Number(g || 0));
  return h * 3600 + mi * 60 + s;
}

/* ------------------------------------------------- YouTube, with no key */
/*
 * The only competitor read on any platform that needs nothing at all.
 *
 * YouTube publishes an Atom feed per channel that carries the view count and
 * the like count for each of the fifteen most recent uploads. Fifteen is a
 * thin sample and the feed has no comment counts and no durations, so this
 * cannot classify Shorts and cannot read the comment ratio. Those limits ride
 * with the numbers as caveats rather than being quietly absorbed, and the
 * keyed route below returns the whole picture for anyone who spends the two
 * minutes it takes to mint a free key.
 *
 * It exists because the alternative was a public tool whose only no-key
 * platform was Reddit, and Reddit refuses data-centre traffic outright: the
 * demo that was meant to prove the product works returned a 403.
 */

function attr(block: string, tag: string, name: string): string {
  const m = new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`).exec(block);
  return m ? m[1] : "";
}

function tagText(block: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block);
  if (!m) return "";
  return m[1]
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Resolve a handle, a channel id or a legacy username to a channel id. */
async function youTubeChannelId(handle: string): Promise<string> {
  const clean = handle.trim().replace(/^@/, "").replace(/[^A-Za-z0-9_\-.]/g, "");
  if (/^UC[A-Za-z0-9_-]{22}$/.test(clean)) return clean;
  const page = await text(`https://www.youtube.com/@${clean}`);
  const m = /"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(page) ||
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/.exec(page);
  if (!m) throw new Error(`No YouTube channel found for @${clean}.`);
  return m[1];
}

async function readYouTubePublic(handle: string): Promise<AccountProfile> {
  const channelId = await youTubeChannelId(handle);
  const feed = await text(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const entries = feed.split("<entry>").slice(1).map((e) => e.split("</entry>")[0]);

  const posts: SocialPost[] = entries.map((e) => {
    const id = tagText(e, "yt:videoId");
    return {
      id,
      platform: "youtube",
      url: `https://www.youtube.com/watch?v=${id}`,
      postedAt: tagText(e, "published"),
      // The feed carries no duration, so a Short and a documentary arrive
      // looking identical. Calling every one of them "video" is wrong in a
      // way the caveat names; guessing from the title would be wrong in a way
      // nobody could see.
      kind: "video",
      text: `${tagText(e, "media:title")}\n${tagText(e, "media:description")}`,
      likes: Number(attr(e, "media:starRating", "count") || 0),
      comments: 0,
      views: Number(attr(e, "media:statistics", "views") || 0) || null,
      durationS: null,
    };
  }).filter((p) => p.id);

  if (!posts.length) {
    return unreadable(
      "youtube", handle,
      `The public feed for ${handle} returned no videos. A channel with no uploads, or one that ` +
      "has hidden them, reads the same way from outside.",
    );
  }

  return {
    handle,
    platform: "youtube",
    // The feed does not carry subscriber count. Better absent than guessed.
    followers: null,
    posts,
    caveats: [
      `Read without a key, from YouTube's public feed: the ${posts.length} most recent uploads ` +
      "only, so this is a read of recent work rather than of the channel.",
      "The free feed publishes no comment counts, so engagement here is likes alone and the " +
      "comment ratio is not calculated.",
      "It publishes no durations either, so Shorts are not separated from long-form and no " +
      "format verdict is given. A free API key fixes all three.",
    ],
  };
}

async function readYouTube(handle: string, key: string, limit: number): Promise<AccountProfile> {
  if (!key) return unreadable("youtube", handle, "No YouTube Data API key was provided.");
  const clean = handle.replace(/^@/, "").replace(/[^A-Za-z0-9_\-.]/g, "");
  const base = "https://www.googleapis.com/youtube/v3";
  let data = (await json(
    `${base}/channels?part=snippet,statistics,contentDetails&forHandle=@${clean}&key=${key}`,
  )) as { items?: Record<string, never>[] };
  if (!data.items?.length) {
    data = (await json(
      `${base}/channels?part=snippet,statistics,contentDetails&id=${clean}&key=${key}`,
    )) as { items?: Record<string, never>[] };
  }
  const channel = data.items?.[0] as
    | { statistics: Record<string, string>; contentDetails: { relatedPlaylists: { uploads: string } } }
    | undefined;
  if (!channel) return unreadable("youtube", handle, `No YouTube channel found for ${handle}.`);

  const followers = Number(channel.statistics.subscriberCount || 0) || null;
  const uploads = channel.contentDetails.relatedPlaylists.uploads;

  const ids: string[] = [];
  let token = "";
  while (ids.length < limit) {
    const page = (await json(
      `${base}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&key=${key}` +
      (token ? `&pageToken=${token}` : ""),
    )) as { items?: { contentDetails: { videoId: string } }[]; nextPageToken?: string };
    ids.push(...(page.items ?? []).map((i) => i.contentDetails.videoId));
    token = page.nextPageToken ?? "";
    if (!token) break;
  }

  const posts: SocialPost[] = [];
  for (let i = 0; i < Math.min(ids.length, limit); i += 50) {
    const chunk = ids.slice(i, i + 50);
    const detail = (await json(
      `${base}/videos?part=snippet,statistics,contentDetails&id=${chunk.join(",")}&key=${key}`,
    )) as {
      items?: {
        id: string;
        snippet: { publishedAt: string; title: string; description: string };
        statistics: Record<string, string>;
        contentDetails: { duration: string };
      }[];
    };
    for (const v of detail.items ?? []) {
      const seconds = isoSeconds(v.contentDetails?.duration ?? "");
      posts.push({
        id: v.id,
        platform: "youtube",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        postedAt: v.snippet.publishedAt,
        // Under a minute is a Short, and Shorts behave like a different
        // platform, so they are not bucketed with long-form video.
        kind: seconds !== null && seconds <= 60 ? "short" : "video",
        text: `${v.snippet.title}\n${v.snippet.description ?? ""}`,
        likes: Number(v.statistics.likeCount || 0),
        comments: Number(v.statistics.commentCount || 0),
        views: Number(v.statistics.viewCount || 0),
        durationS: seconds,
      });
    }
  }
  return { handle, platform: "youtube", followers, posts };
}

async function readInstagram(
  handle: string, igUserId: string, token: string, limit: number,
): Promise<AccountProfile> {
  if (!igUserId || !token) {
    return unreadable(
      "instagram", handle,
      "No Instagram Business account was connected to query through. Business Discovery reads a " +
      "competitor through your own Business or Creator account.",
    );
  }
  const clean = handle.replace(/^@/, "").replace(/[^A-Za-z0-9_.]/g, "");
  const fields =
    `business_discovery.username(${clean})` +
    `{followers_count,media_count,media.limit(${limit})` +
    "{id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp}}";
  const data = (await json(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}` +
    `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
  )) as {
    business_discovery?: {
      followers_count?: number;
      media?: { data?: Record<string, string>[] };
    };
    error?: { message?: string };
  };

  const found = data.business_discovery;
  if (!found) {
    return unreadable(
      "instagram", handle,
      data.error?.message ||
      "Instagram returned nothing. Business Discovery only returns Business and Creator accounts, " +
      "so a personal account cannot be read at all.",
    );
  }

  const posts: SocialPost[] = (found.media?.data ?? []).map((m) => {
    const product = (m.media_product_type ?? "").toLowerCase();
    const type = (m.media_type ?? "").toLowerCase();
    const kind =
      product === "reels" ? "reel"
        : type === "carousel_album" ? "carousel"
          : type === "video" ? "video" : "image";
    return {
      id: m.id ?? "",
      platform: "instagram",
      url: m.permalink ?? "",
      postedAt: m.timestamp ?? "",
      kind,
      text: m.caption ?? "",
      likes: Number(m.like_count ?? 0),
      comments: Number(m.comments_count ?? 0),
      // Deliberately null: Instagram returns no views, impressions, reach or
      // saves for an account you do not own.
      views: null,
    };
  });
  return { handle, platform: "instagram", followers: Number(found.followers_count || 0) || null, posts };
}

async function readReddit(handle: string, limit: number): Promise<AccountProfile> {
  const clean = handle.replace(/^u\//, "").replace(/^@/, "").replace(/[^A-Za-z0-9_-]/g, "");
  const data = (await json(
    `https://www.reddit.com/user/${clean}/submitted.json?limit=${Math.min(limit, 100)}`,
  )) as { data?: { children?: { data: Record<string, never> }[] } };
  const children = data.data?.children ?? [];
  if (!children.length) {
    return unreadable("reddit", handle, `No public submissions found for ${handle}.`);
  }
  const posts: SocialPost[] = children.map((c) => {
    const d = c.data as Record<string, string | number | boolean>;
    return {
      id: String(d.id ?? ""),
      platform: "reddit",
      url: "https://www.reddit.com" + String(d.permalink ?? ""),
      postedAt: new Date(Number(d.created_utc ?? 0) * 1000).toISOString(),
      kind: d.is_self ? "text" : "link",
      text: `${d.title ?? ""}\n${d.selftext ?? ""}`,
      likes: Number(d.score ?? 0),
      comments: Number(d.num_comments ?? 0),
    };
  });
  return { handle, platform: "reddit", followers: null, posts };
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("Send a JSON body.");
  }

  const platform = (body.platform ?? "").toLowerCase();
  const handle = (body.handle ?? "").trim();
  const limit = Math.min(Math.max(body.limit ?? 40, 12), 100);
  if (!platform || !handle) return bad("A platform and a handle are both required.");

  const cap = capability(platform);
  if (!cap) return bad(`${platform} is not a platform this desk knows about.`);
  if (!cap.competitorPosts) {
    // Not an error. The platform's terms are the answer, and the client needs
    // to read them rather than see a failed request.
    return Response.json(
      unreadable(platform, handle, cap.limitation),
      { status: 200 },
    );
  }

  const creds = body.credentials ?? {};
  try {
    let profile: AccountProfile;
    if (platform === "youtube") {
      // No key is not an error on this platform, it is a smaller read.
      profile = creds.youtubeApiKey
        ? await readYouTube(handle, creds.youtubeApiKey, limit)
        : await readYouTubePublic(handle);
    } else if (platform === "instagram") {
      profile = await readInstagram(handle, creds.igUserId ?? "", creds.igAccessToken ?? "", limit);
    } else if (platform === "reddit") {
      profile = await readReddit(handle, limit);
    } else {
      profile = unreadable(
        platform, handle,
        `${cap.name} needs a paid plan this deployment does not hold. ${cap.limitation}`,
      );
    }
    return Response.json(profile);
  } catch (error) {
    // The failure is reported rather than swallowed, same as everywhere else.
    return Response.json(
      unreadable(
        platform, handle,
        error instanceof Error ? error.message : "The platform could not be read.",
      ),
      { status: 200 },
    );
  }
}
