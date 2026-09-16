/**
 * Brand mentions, and why they now matter more than links.
 *
 * Ahrefs analysed 75,000 brands in 2026 and found branded web mentions
 * correlate with AI Overview visibility at 0.664. Backlinks correlate at
 * 0.218. YouTube mentions are the single strongest factor at roughly 0.737.
 * BuzzStream found 75% of digital PR people have been asked by a client about
 * the link between PR placements and AI citations, and 11% have a process.
 *
 * That is the gap this fills, and it is the reason the link side of this
 * product is organised around mentions rather than around followed links.
 *
 * The mechanism is not mysterious. A language model has no link graph. It has
 * text. Being named repeatedly, in places a model was trained on or retrieves
 * from, is what makes a model able to say who you are. A followed link helps
 * a crawler find you; a mention is what teaches a model you exist.
 *
 * Two consequences the rest of the category has not caught up with:
 *
 *  1. An unlinked mention is not a failure to be reclaimed. It is most of the
 *     value already delivered. Reclaiming the link adds the ranking part, and
 *     the AI part already landed the day the article published.
 *  2. Outreach should be measured on mentions earned, not links earned, and a
 *     placement that refuses a link is still worth having.
 *
 * Nothing here estimates. A mention is a URL we fetched, containing the brand,
 * with the sentence around it recorded.
 */

import type { CrawledPage } from "./types";

export type MentionKind = "linked" | "unlinked";

export type Mention = {
  /** The page the mention sits on. */
  url: string;
  domain: string;
  kind: MentionKind;
  /** The sentence the brand appears in, so a person can judge it. */
  context: string;
  /** The anchor, when it is linked. */
  anchorText: string | null;
  /** Whether the link, if any, passes authority. */
  followed: boolean | null;
  /** When we first saw it. */
  firstSeen: string;
  lastSeen: string;
  /**
   * Whether an AI engine has been observed citing this domain for our topics.
   * Set from the answer visibility runs, not guessed.
   */
  citedByAi: boolean;
  /** Domain authority, when a source supplies one. */
  authority: number | null;
  /** How the mention was found. */
  source: "crawl" | "search" | "upload" | "ai_answer" | "connector";
};

export type MentionProfile = {
  mentions: Mention[];
  total: number;
  linked: number;
  unlinked: number;
  /** Domains that name us, which is the number that tracks AI visibility. */
  mentioningDomains: number;
  /** Of those, how many an answer engine has been seen citing. */
  citedDomains: number;
  /**
   * Unlinked mentions on domains AI engines cite. The highest-value queue in
   * the product: the hard part is done and the link is a two-line email.
   */
  reclamation: Mention[];
  notes: string[];
};

/** Build the profile from whatever mentions have been collected. */
export function profileMentions(mentions: Mention[]): MentionProfile {
  const domains = new Set(mentions.map((m) => m.domain));
  const cited = new Set(mentions.filter((m) => m.citedByAi).map((m) => m.domain));
  const linked = mentions.filter((m) => m.kind === "linked");
  const unlinked = mentions.filter((m) => m.kind === "unlinked");

  const reclamation = unlinked
    .slice()
    .sort((a, b) => {
      // Cited domains first, then authority, then recency.
      if (a.citedByAi !== b.citedByAi) return a.citedByAi ? -1 : 1;
      const authorityGap = (b.authority ?? 0) - (a.authority ?? 0);
      if (authorityGap !== 0) return authorityGap;
      return b.lastSeen.localeCompare(a.lastSeen);
    })
    .slice(0, 50);

  const notes: string[] = [];
  if (unlinked.length > 0) {
    notes.push(
      `${unlinked.length} mention${unlinked.length === 1 ? "" : "s"} name you without linking. Those are not failures. For AI visibility they carry most of the value already, and the link is the cheapest one you will ever ask for, because the editorial decision is made and the ask is a correction rather than a favour.`,
    );
  }
  if (cited.size > 0) {
    notes.push(
      `${cited.size} of the domains naming you ${cited.size === 1 ? "is one" : "are ones"} an answer engine has been seen citing for your topics. A mention there is worth several links from places the engines never quote.`,
    );
  }
  if (mentions.length > 0 && linked.length / mentions.length > 0.9) {
    notes.push(
      "Almost every mention carries a link, which usually means the list came from a backlink source rather than a mention search. Unlinked mentions are invisible to link tools by definition, so they have to be looked for separately.",
    );
  }

  return {
    mentions,
    total: mentions.length,
    linked: linked.length,
    unlinked: unlinked.length,
    mentioningDomains: domains.size,
    citedDomains: cited.size,
    reclamation,
    notes,
  };
}

/**
 * Find mentions of the brand on a page we have already fetched.
 *
 * Deliberately strict about what counts. A brand name that appears only as
 * part of a longer word is not a mention, and a page that lists a hundred
 * company names is a directory rather than a mention.
 */
export function mentionsOnPage(
  page: CrawledPage,
  options: { brand: string; domain: string; source: Mention["source"] },
): Mention[] {
  const s = page.signals;
  if (!s || page.status !== 200) return [];

  const brand = options.brand.trim();
  if (brand.length < 3) return [];
  const bare = options.domain.replace(/^www\./, "").toLowerCase();

  let host: string;
  try {
    host = new URL(page.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return [];
  }
  // Our own pages are not mentions of us.
  if (host.endsWith(bare)) return [];

  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
  const text = s.text;
  const hit = pattern.exec(text);
  if (!hit) return [];

  // A page naming very many organisations is a list, not a mention.
  const externalDomains = new Set(
    s.links.filter((l) => !l.internal).map((l) => {
      try {
        return new URL(l.href).hostname;
      } catch {
        return l.href;
      }
    }),
  );
  if (externalDomains.size > 80) return [];

  const linkToUs = s.links.find((l) => {
    try {
      return new URL(l.href).hostname.replace(/^www\./, "").toLowerCase().endsWith(bare);
    } catch {
      return false;
    }
  });

  const start = Math.max(0, text.lastIndexOf(".", hit.index) + 1);
  const end = text.indexOf(".", hit.index);
  const context = text.slice(start, end === -1 ? Math.min(text.length, hit.index + 240) : end + 1).trim().slice(0, 300);

  const now = new Date().toISOString();
  return [{
    url: page.url,
    domain: host,
    kind: linkToUs ? "linked" : "unlinked",
    context,
    anchorText: linkToUs?.text ?? null,
    followed: linkToUs ? !/\b(nofollow|sponsored|ugc)\b/i.test(linkToUs.rel ?? "") : null,
    firstSeen: now,
    lastSeen: now,
    citedByAi: false,
    authority: null,
    source: options.source,
  }];
}

/* ------------------------------------------- mentions against AI visibility */

export type VisibilityPoint = { at: string; presence: number; citationRate: number; asked: number };

export type MentionImpact = {
  /** Mentions gained in each window, against the AI presence measured after it. */
  points: { at: string; mentions: number; presence: number }[];
  /**
   * Whether the two move together, as a correlation between -1 and 1.
   *
   * Null until there are at least four readings, because a correlation from
   * three points is arithmetic rather than evidence.
   */
  correlation: number | null;
  /** What the number means, in a sentence, including when it means nothing. */
  reading: string;
};

/**
 * Does earning mentions move AI visibility, on this site?
 *
 * The industry number is 0.664 across 75,000 brands. That is the population.
 * This measures the individual, which is the only thing a client actually
 * cares about, and it refuses to report a figure until there are enough
 * readings for one to mean anything.
 */
export function measureImpact(
  mentions: Mention[],
  visibility: VisibilityPoint[],
): MentionImpact {
  const readings = [...visibility].sort((a, b) => a.at.localeCompare(b.at));
  const points = readings.map((reading, index) => {
    const from = index === 0 ? "0000" : readings[index - 1].at;
    const gained = mentions.filter((m) => m.firstSeen > from && m.firstSeen <= reading.at).length;
    return { at: reading.at, mentions: gained, presence: reading.presence };
  });

  if (points.length < 4) {
    return {
      points,
      correlation: null,
      reading:
        `${points.length} reading${points.length === 1 ? "" : "s"} so far. Four are needed before a relationship between mentions and AI visibility means anything on one site. Keep asking the engines on a regular cadence and this fills in.`,
    };
  }

  // Pearson, on gained mentions against measured presence.
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.mentions, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.presence, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (const p of points) {
    const dx = p.mentions - meanX;
    const dy = p.presence - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  const denominator = Math.sqrt(varX * varY);
  const correlation = denominator === 0 ? 0 : cov / denominator;

  const reading =
    denominator === 0
      ? "One of the two has not moved at all yet, so there is nothing to correlate."
      : correlation > 0.5
        ? `Mentions and AI visibility are moving together on this site (${correlation.toFixed(2)}). That is consistent with the 0.664 Ahrefs measured across 75,000 brands, and it means earning mentions is the lever here.`
        : correlation > 0.2
          ? `A weak positive relationship (${correlation.toFixed(2)}). Real but not yet decisive. More readings will settle it.`
          : correlation < -0.2
            ? `The two are moving in opposite directions (${correlation.toFixed(2)}), which usually means something else changed. Check what shipped between readings before drawing a conclusion.`
            : `No relationship visible yet (${correlation.toFixed(2)}). On a small number of mentions that is expected.`;

  return { points, correlation, reading };
}

/**
 * Where mentions are worth earning, ranked by what the engines actually quote.
 *
 * Built from the answer visibility runs: every domain an engine named while
 * answering a question about our category is a domain that, if it named us,
 * would put us in that answer. That is a far better prospect list than domain
 * authority, because it is derived from the thing we are trying to influence.
 */
export type MentionTarget = {
  domain: string;
  /** How many of our tracked prompts produced an answer citing this domain. */
  citedInAnswers: number;
  /** Whether they already mention us. */
  alreadyMentions: boolean;
  why: string;
  priority: number;
};

export function targetsFromAnswers(
  citedDomains: { domain: string; count: number }[],
  existing: Mention[],
): MentionTarget[] {
  const mentioned = new Set(existing.map((m) => m.domain));
  return citedDomains
    .map((entry) => ({
      domain: entry.domain,
      citedInAnswers: entry.count,
      alreadyMentions: mentioned.has(entry.domain),
      why: mentioned.has(entry.domain)
        ? `Already names you, and answer engines cited this domain in ${entry.count} of the questions asked. Keep the relationship warm.`
        : `Answer engines cited this domain in ${entry.count} of the questions asked about your category, and it does not mention you. A mention here puts you in those answers.`,
      priority: mentioned.has(entry.domain) ? 0.3 : Math.min(1, 0.5 + entry.count * 0.12),
    }))
    .sort((a, b) => b.priority - a.priority);
}
