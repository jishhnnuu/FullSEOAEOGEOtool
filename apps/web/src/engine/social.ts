/**
 * Measured social, in the browser.
 *
 * A port of `packages/seoos/analysis/social.py`, kept line for line where it
 * can be, because the two engines must not disagree about what a 2.4x
 * multiple means.
 *
 * The fact that shapes the whole module: **impressions and reach are private
 * on every platform.** They are computed for the account owner and exposed
 * only through that owner's own token. No API sells them and no scraper can
 * see them, so every rival reach figure in this category is an estimate from
 * follower count presented as data.
 *
 * The honest comparable is the performance multiple: a post's engagement
 * against that account's own median. It removes follower count from the
 * comparison, which is what makes a 4,000-follower account's winner legible
 * next to a 400,000-follower account's.
 */

/* ------------------------------------------------------------- thresholds */
/** Posts needed before an account's median means anything. */
export const POST_FLOOR = 12;
/** Multiple of an account's own median that counts as a winner. */
export const OUTLIER_AT = 2.0;
/** Winners needed before a shared trait is called a pattern. */
export const PATTERN_FLOOR = 3;
/** Posts in one format before that format gets a verdict. */
export const FORMAT_FLOOR = 4;
/** Brands with readable data before share of voice is computed. */
export const BRAND_FLOOR = 2;
/** Comments on a post before its comment-to-like ratio is worth reading. */
const COMMENT_FLOOR = 10;

const URL_RE = /https?:\/\/\S+|\b[a-z0-9-]+\.(?:com|co|io|app|uk|net|org)\b/i;
const CTA_RE =
  /\b(link in bio|link below|dm (?:me|us)|message (?:me|us)|comment below|book a|get a quote|free (?:trial|demo|consult\w*|guide|audit|template)|sign ?up|register|apply now|enquire|inquire|call us|whats ?app|swipe up|tap the link|download|claim your|limited spots?)\b/i;

/** Hook archetypes, in the order a strategist would test them. */
const HOOKS: { name: string; re: RegExp; why: string }[] = [
  { name: "number", re: /^\W*\d+\s+\w/, why: "Opens with a count, which promises a finite read" },
  { name: "how-to", re: /^\W*(how (?:to|i|we)|the way to)\b/i, why: "Promises a method" },
  { name: "question", re: /^[^.!?]{0,90}\?/, why: "Opens on a question the reader has to resolve" },
  { name: "mistake", re: /\b(mistake|wrong|stop doing|never|don'?t|avoid|worst)\b/i,
    why: "Names an error, which reads as a warning rather than a pitch" },
  { name: "contrarian", re: /\b(nobody|no ?one|everyone (?:is|gets)|unpopular|actually|myth|truth about)\b/i,
    why: "Contradicts the consensus" },
  { name: "result", re: /\b(\d+[kKmM%]|[$£€₹]\d)\b/,
    why: "Leads with a figure, which is the cheapest proof available" },
  { name: "story", re: /^\W*(i |we |my |our |last (?:week|month|year)|when i|the day)/i,
    why: "First person, which buys attention that a claim does not" },
  { name: "list", re: /\b(here(?:'| i)s|these are|things? (?:i|we|you))\b/i, why: "Promises a list" },
  { name: "urgency", re: /\b(today|right now|before|deadline|last chance|closing)\b/i, why: "Time pressure" },
];

export type SocialPost = {
  id: string;
  platform: string;
  url: string;
  postedAt: string;
  /** video | short | reel | carousel | image | text | link */
  kind: string;
  text: string;
  likes: number;
  comments: number;
  shares?: number | null;
  /** Public on YouTube and TikTok, absent on Instagram. Never an impression. */
  views?: number | null;
  durationS?: number | null;
};

export type AccountProfile = {
  handle: string;
  platform: string;
  followers: number | null;
  posts: SocialPost[];
  /** Why this account could not be read, when it could not be. */
  unreadable?: string | null;
  /**
   * What is wrong with this read, when it was read by a lesser route.
   *
   * A keyless feed returns fewer posts and fewer fields than the same
   * platform's real API. Both reads are honest; only one of them is complete,
   * and the difference has to travel with the numbers rather than sit in the
   * documentation of the route that produced them.
   */
  caveats?: string[] | null;
};

export type Measured = { value: number | null; measured: boolean; note: string };

/**
 * Likes plus comments plus shares where the platform publishes them.
 *
 * Views are excluded on purpose. A view is a distribution outcome and an
 * engagement is an audience decision, and adding them makes a video platform
 * look better than an image one for reasons unrelated to the work.
 */
export function engagementOf(p: SocialPost): number {
  return p.likes + p.comments + (p.shares ?? 0);
}

export function hookOf(text: string): string {
  for (const line of (text || "").split("\n")) if (line.trim()) return line.trim();
  return "";
}

export function classifyHook(text: string): { type: string; why: string } {
  const first = hookOf(text);
  if (!first) return { type: "none", why: "No caption, so the thumbnail or first frame is the whole hook" };
  for (const h of HOOKS) if (h.re.test(first)) return { type: h.name, why: h.why };
  return { type: "plain", why: "States the subject without a device, which relies entirely on the visual" };
}

/**
 * How hard a post tries to start a conversation. Zero to five.
 *
 * This is not leads. Nobody outside a business can count a competitor's leads.
 * It counts the machinery: a call to action, a route off-platform, a prompt to
 * reply. A business running social for leads leaves this everywhere.
 */
export function leadIntent(p: SocialPost): number {
  const text = p.text || "";
  let score = 0;
  if (CTA_RE.test(text)) score += 2;
  if (URL_RE.test(text)) score += 1;
  if (/\b(dm|message|comment)\b/i.test(text)) score += 1;
  // An absolute floor: one comment on ten likes is a 0.1 ratio and also just
  // one comment, and reading intent off that is reading noise.
  if (p.comments >= COMMENT_FLOOR && p.comments / Math.max(p.likes, 1) > 0.06) score += 1;
  return Math.min(score, 5);
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function pstdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
function slot(iso: string): { day: number; hour: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { day: (d.getUTCDay() + 6) % 7, hour: d.getUTCHours() };
}

export type Winner = {
  url: string; postedAt: string; format: string; multiple: number;
  engagement: number; likes: number; comments: number; views: number | null;
  hook: string; hookType: string; hookWhy: string; leadIntent: number;
};

export type AccountRead = {
  handle: string; platform: string; followers: number | null;
  postsRead: number; measured: boolean; reason: string;
  medianEngagement: number; meanEngagement: number;
  engagementRate: Measured; postsPerWeek: Measured;
  commentRatio: number; leadIntentMean: number;
  winners: Winner[];
  formats: { format: string; posts: number; median: number; shareOfPosts: number; multiple?: number; measured: boolean; note?: string }[];
  hooks: { hookType: string; posts: number; median: number; multiple?: number; measured: boolean; note?: string }[];
  bestWindows: { day: string; hourUtc: number; posts: number; median: number; multiple: number | null }[];
  notes: string[];
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Measure one account from its public posts.
 *
 * Under twelve posts the median is not a median, it is a small number, and
 * everything derived from it inherits that. The read says so and stops.
 */
export function readAccount(profile: AccountProfile): AccountRead {
  const out: AccountRead = {
    handle: profile.handle, platform: profile.platform, followers: profile.followers,
    postsRead: profile.posts.length, measured: false, reason: "",
    medianEngagement: 0, meanEngagement: 0,
    engagementRate: { value: null, measured: false, note: "" },
    postsPerWeek: { value: null, measured: false, note: "" },
    commentRatio: 0, leadIntentMean: 0,
    winners: [], formats: [], hooks: [], bestWindows: [], notes: [],
  };

  // Caveats come first, before any number, for the same reason coverage is
  // printed above a score: a limit read after the conclusion is a footnote,
  // and a footnote is not a disclosure.
  if (profile.caveats?.length) out.notes.push(...profile.caveats);

  if (profile.unreadable) {
    out.reason = profile.unreadable;
    out.notes.push(profile.unreadable);
    return out;
  }

  const posts = profile.posts.filter((p) => p.postedAt);
  if (posts.length < POST_FLOOR) {
    out.reason =
      `Only ${posts.length} posts could be read. ${POST_FLOOR} is the floor for a median that ` +
      "means anything, and every judgement below one would inherit the noise.";
    out.notes.push(out.reason);
    return out;
  }

  out.measured = true;
  const engagements = posts.map(engagementOf);
  out.medianEngagement = median(engagements);
  out.meanEngagement = mean(engagements);

  const totalLikes = posts.reduce((n, p) => n + p.likes, 0);
  const totalComments = posts.reduce((n, p) => n + p.comments, 0);
  out.commentRatio = totalComments / Math.max(totalLikes, 1);
  out.leadIntentMean = mean(posts.map(leadIntent));

  if (profile.followers && profile.followers > 0) {
    out.engagementRate = {
      value: (out.medianEngagement / profile.followers) * 100,
      measured: true,
      note: "Median engagement as a percentage of followers. The comparable practitioners use.",
    };
  } else {
    out.engagementRate = {
      value: null, measured: false,
      note: "No public follower count on this platform, so the rate cannot be computed.",
    };
  }

  const stamps = posts.map((p) => p.postedAt).sort();
  const d0 = new Date(stamps[0]).getTime();
  const d1 = new Date(stamps[stamps.length - 1]).getTime();
  if (!Number.isNaN(d0) && !Number.isNaN(d1)) {
    const days = (d1 - d0) / 86_400_000;
    const weeks = Math.max(days / 7, 0.14);
    out.postsPerWeek = {
      value: posts.length / weeks, measured: true,
      note: `Across ${Math.round(days)} days of posts read.`,
    };
  } else {
    out.postsPerWeek = { value: null, measured: false, note: "Timestamps could not be parsed." };
  }

  // The winners. Twice this account's own median, whatever its follower count.
  const threshold = out.medianEngagement * OUTLIER_AT;
  const winners = posts
    .filter((p) => out.medianEngagement > 0 && engagementOf(p) >= threshold)
    .sort((a, b) => engagementOf(b) - engagementOf(a));

  for (const p of winners.slice(0, 10)) {
    const { type, why } = classifyHook(p.text);
    out.winners.push({
      url: p.url, postedAt: p.postedAt, format: p.kind,
      multiple: Math.round((engagementOf(p) / out.medianEngagement) * 100) / 100,
      engagement: engagementOf(p), likes: p.likes, comments: p.comments,
      views: p.views ?? null, hook: hookOf(p.text).slice(0, 180),
      hookType: type, hookWhy: why, leadIntent: leadIntent(p),
    });
  }

  const byFormat = new Map<string, number[]>();
  for (const p of posts) {
    const key = p.kind || "unknown";
    byFormat.set(key, [...(byFormat.get(key) ?? []), engagementOf(p)]);
  }
  // One format is not a comparison. An account that posts nothing but video
  // has a video multiple of exactly 1x against its own median, by arithmetic,
  // and printing that as a finding is printing a tautology as insight.
  const oneFormat = byFormat.size < 2;
  for (const [format, values] of [...byFormat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const enough = !oneFormat && values.length >= FORMAT_FLOOR && out.medianEngagement > 0;
    out.formats.push({
      format, posts: values.length,
      median: Math.round(median(values) * 10) / 10,
      shareOfPosts: Math.round((values.length / posts.length) * 1000) / 1000,
      ...(enough
        ? { multiple: Math.round((median(values) / out.medianEngagement) * 100) / 100, measured: true }
        : {
          measured: false,
          note: oneFormat
            ? "Every post read is this format, so there is nothing to compare it against."
            : `Only ${values.length} posts in this format. ${FORMAT_FLOOR} is the floor.`,
        }),
    });
  }

  const byHook = new Map<string, number[]>();
  for (const p of posts) {
    const { type } = classifyHook(p.text);
    byHook.set(type, [...(byHook.get(type) ?? []), engagementOf(p)]);
  }
  for (const [hookType, values] of [...byHook.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const enough = values.length >= PATTERN_FLOOR && out.medianEngagement > 0;
    out.hooks.push({
      hookType, posts: values.length, median: Math.round(median(values) * 10) / 10,
      ...(enough
        ? { multiple: Math.round((median(values) / out.medianEngagement) * 100) / 100, measured: true }
        : { measured: false, note: `Only ${values.length} posts open this way. ${PATTERN_FLOOR} is the floor.` }),
    });
  }

  // Posting windows in UTC. A competitor's local timezone is not knowable, so
  // the window is labelled rather than guessed at.
  const windows = new Map<string, number[]>();
  for (const p of posts) {
    const s = slot(p.postedAt);
    if (!s) continue;
    const key = `${s.day}:${Math.floor(s.hour / 3) * 3}`;
    windows.set(key, [...(windows.get(key) ?? []), engagementOf(p)]);
  }
  const ranked = [...windows.entries()]
    .filter(([, v]) => v.length >= 2)
    .sort((a, b) => median(b[1]) - median(a[1]))
    .slice(0, 3);
  for (const [key, values] of ranked) {
    const [day, hour] = key.split(":").map(Number);
    out.bestWindows.push({
      day: DAYS[day], hourUtc: hour, posts: values.length,
      median: Math.round(median(values) * 10) / 10,
      multiple: out.medianEngagement
        ? Math.round((median(values) / out.medianEngagement) * 100) / 100
        : null,
    });
  }
  if (!out.bestWindows.length) {
    out.notes.push("No posting window had two posts in it, so timing is not called.");
  }

  if (!winners.length) {
    out.notes.push(
      "Nothing cleared twice the median. This account is consistent rather than spiky, which is " +
      "a finding: there is no breakout format to copy.",
    );
  } else if (winners.length < PATTERN_FLOOR) {
    out.notes.push(
      `Only ${winners.length} posts cleared the bar. That is enough to look at and not enough to ` +
      "call a pattern, so the traits below are observations rather than a playbook.",
    );
  }
  return out;
}

export type Trait = { trait: string; value: string; shareOfWinners: number | null; evidence: string };
export type WhatWorked = {
  measured: boolean; reason: string; traits: Trait[];
  winnerCount?: number; threshold?: string;
};

/**
 * The traits the winners share, where enough winners share them.
 *
 * A leaderboard tells you which post won. This tells you what the winners have
 * in common, which is the only part a client can act on.
 */
export function whatWorked(read: AccountRead): WhatWorked {
  if (!read.measured) return { measured: false, reason: read.reason, traits: [] };
  if (read.winners.length < PATTERN_FLOOR) {
    return {
      measured: false,
      reason:
        `${read.winners.length} posts cleared ${OUTLIER_AT}x the median and ${PATTERN_FLOOR} is the ` +
        "floor for calling a shared trait a pattern rather than a coincidence.",
      traits: [],
    };
  }

  const traits: Trait[] = [];
  const winners = read.winners;
  const count = <T,>(xs: T[]) => {
    const m = new Map<T, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const [[topFormat, formatN]] = count(winners.map((w) => w.format));
  if (formatN / winners.length >= 0.5) {
    const base = read.formats.find((f) => f.format === topFormat);
    traits.push({
      trait: "format", value: topFormat,
      shareOfWinners: Math.round((formatN / winners.length) * 100) / 100,
      evidence:
        `${formatN} of ${winners.length} winners are ${topFormat}.` +
        (base?.measured ? ` That format runs at ${base.multiple}x their own median overall.` : ""),
    });
  }

  const [[topHook, hookN]] = count(winners.map((w) => w.hookType));
  if (hookN >= PATTERN_FLOOR && topHook !== "plain") {
    const why = winners.find((w) => w.hookType === topHook)?.hookWhy ?? "";
    traits.push({
      trait: "hook", value: topHook,
      shareOfWinners: Math.round((hookN / winners.length) * 100) / 100,
      evidence: `${hookN} of ${winners.length} winners open this way. ${why}.`,
    });
  }

  const winIntent = mean(winners.map((w) => w.leadIntent));
  if (Math.abs(winIntent - read.leadIntentMean) >= 0.8) {
    const more = winIntent > read.leadIntentMean;
    traits.push({
      trait: "lead intent", value: `${more ? "more" : "less"} than their average post`,
      shareOfWinners: null,
      evidence:
        `Winners score ${winIntent.toFixed(1)} out of 5 on call-to-action machinery against ` +
        `${read.leadIntentMean.toFixed(1)} across everything. ` +
        (more ? "Their best posts sell harder, not softer." : "Their best posts are the ones that ask for nothing."),
    });
  }

  const lengths = winners.map((w) => w.hook.length);
  if (lengths.length && pstdev(lengths) < 30) {
    traits.push({
      trait: "hook length", value: `about ${Math.round(mean(lengths))} characters`,
      shareOfWinners: null,
      evidence: "The winning hooks are consistently the same length, which usually means a template rather than an accident.",
    });
  }

  return {
    measured: true, reason: "", winnerCount: winners.length,
    threshold: `${OUTLIER_AT}x this account's own median engagement`, traits,
  };
}

export type SovBrand = {
  handle: string; followers: number | null; postsRead: number;
  shareOfPosts: number; shareOfEngagement: number; efficiency: number;
  engagementRate: Measured; medianEngagement: number;
};
export type ShareOfVoice = {
  measured: boolean; reason: string; platform: string;
  brands: SovBrand[]; sample?: string; verdict?: string[]; caveat?: string;
};

/**
 * Who owns the conversation, and who is merely loud.
 *
 * Two numbers, because one misleads. Share of posts is how loud a brand is.
 * Share of engagement is how much anyone cared. A brand with 40% of the posts
 * and 12% of the engagement is not winning, it is shouting, and that gap is
 * the single most useful figure in a competitive social review.
 */
export function shareOfVoice(reads: AccountRead[]): ShareOfVoice {
  const usable = reads.filter((r) => r.measured);
  if (usable.length < BRAND_FLOOR) {
    return {
      measured: false,
      reason:
        `Only ${usable.length} of ${reads.length} accounts could be measured, and ${BRAND_FLOOR} is ` +
        "the floor for a share. A share of one is not a share.",
      platform: reads[0]?.platform ?? "",
      brands: [],
    };
  }

  const totalPosts = usable.reduce((n, r) => n + r.postsRead, 0);
  const totalEng = usable.reduce((n, r) => n + r.medianEngagement * r.postsRead, 0);
  const brands: SovBrand[] = usable.map((r) => {
    const eng = r.medianEngagement * r.postsRead;
    const postShare = totalPosts ? r.postsRead / totalPosts : 0;
    const engShare = totalEng ? eng / totalEng : 0;
    return {
      handle: r.handle, followers: r.followers, postsRead: r.postsRead,
      shareOfPosts: Math.round(postShare * 1000) / 1000,
      shareOfEngagement: Math.round(engShare * 1000) / 1000,
      efficiency: Math.round((engShare - postShare) * 1000) / 1000,
      engagementRate: r.engagementRate,
      medianEngagement: Math.round(r.medianEngagement * 10) / 10,
    };
  });
  brands.sort((a, b) => b.shareOfEngagement - a.shareOfEngagement);

  const verdict: string[] = [];
  const leader = brands[0];
  verdict.push(
    `${leader.handle} takes ${(leader.shareOfEngagement * 100).toFixed(0)}% of the engagement from ` +
    `${(leader.shareOfPosts * 100).toFixed(0)}% of the posts.`,
  );
  for (const b of brands.filter((x) => x.efficiency <= -0.08)) {
    verdict.push(
      `${b.handle} publishes ${(b.shareOfPosts * 100).toFixed(0)}% of the posts and takes ` +
      `${(b.shareOfEngagement * 100).toFixed(0)}% of the engagement. Volume is not buying attention.`,
    );
  }

  return {
    measured: true, reason: "", platform: usable[0].platform,
    sample: `${totalPosts} posts across ${usable.length} accounts`,
    brands, verdict,
    caveat:
      "Shares are of the posts this read covered, not of the whole platform. Nobody can see the " +
      "whole platform, and a tool that implies it can is estimating.",
  };
}

export type PlatformFit = {
  measured: boolean; reason: string; strongest?: string;
  ranked: { platform: string; engagementRate: number; followers: number | null; postsRead: number; leadIntentMean: number; commentRatio: number }[];
  notScored: { platform: string; reason: string }[];
  why?: string[]; caveat?: string;
};

/**
 * Where one brand is actually strongest, and why.
 *
 * Raw engagement across platforms is meaningless: a YouTube like and an
 * Instagram like cost the viewer different effort and the audiences are
 * different sizes. Engagement rate against their own follower base is the only
 * comparison that survives, and a platform withholding the follower count has
 * no comparison to make.
 */
export function strongestPlatform(byPlatform: Record<string, AccountRead>): PlatformFit {
  const ranked: PlatformFit["ranked"] = [];
  const notScored: PlatformFit["notScored"] = [];

  for (const [platform, read] of Object.entries(byPlatform)) {
    if (!read.measured) { notScored.push({ platform, reason: read.reason }); continue; }
    if (!read.engagementRate.measured || read.engagementRate.value === null) {
      notScored.push({ platform, reason: read.engagementRate.note });
      continue;
    }
    ranked.push({
      platform,
      engagementRate: Math.round(read.engagementRate.value * 1000) / 1000,
      followers: read.followers, postsRead: read.postsRead,
      leadIntentMean: Math.round(read.leadIntentMean * 100) / 100,
      commentRatio: Math.round(read.commentRatio * 10000) / 10000,
    });
  }

  if (ranked.length < 2) {
    return {
      measured: false,
      reason:
        `${ranked.length} platforms had both a follower count and enough posts. Two is the floor ` +
        "for saying one is stronger than another.",
      ranked, notScored,
    };
  }

  ranked.sort((a, b) => b.engagementRate - a.engagementRate);
  const [best, second] = ranked;
  const gap = second.engagementRate ? best.engagementRate / second.engagementRate : Infinity;
  const why: string[] = [];
  why.push(
    gap >= 1.5
      ? `${best.platform} earns ${best.engagementRate.toFixed(2)}% against ${second.engagementRate.toFixed(2)}% on ${second.platform}, which is a real gap rather than noise.`
      : `${best.platform} leads on engagement rate but only by ${gap.toFixed(2)}x, which is inside the range a quarter of different posting could move. Treat them as level.`,
  );
  const chatty = ranked.reduce((a, b) => (b.commentRatio > a.commentRatio ? b : a));
  why.push(
    `${chatty.platform} draws the most comments per like at ${chatty.commentRatio.toFixed(3)}, which is where conversations start and therefore where enquiries come from.`,
  );
  const intent = ranked.reduce((a, b) => (b.leadIntentMean > a.leadIntentMean ? b : a));
  why.push(
    `${intent.platform} carries the most call-to-action machinery at ${intent.leadIntentMean.toFixed(1)} out of 5. That is where they are trying to convert, which is not the same as where they succeed, and nobody outside the business can see which.`,
  );

  return {
    measured: true, reason: "", strongest: best.platform, ranked, notScored, why,
    caveat:
      "Strongest means best engagement rate against their own audience on the posts read. It does " +
      "not mean most revenue, and no public data can tell you that.",
  };
}
