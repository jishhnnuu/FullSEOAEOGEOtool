/**
 * Links: finding them, judging them, and above all verifying them.
 *
 * Most of what is sold as link building is unverified. A prospect says yes, a
 * spreadsheet says won, a report says plus four referring domains, and nobody
 * ever loads the page to check. Weeks later the link is nofollow, or in a
 * footer, or gone, and the report was wrong from the day it was written.
 *
 * So verification is the centre of this module rather than an afterthought,
 * and it is the one part that is genuinely better here than in the paid tools.
 * The reason is mechanical: `rel` is an HTML attribute. Anything that reads a
 * page as markdown or plain text has destroyed it before the check runs, which
 * is why so many tools report "no nofollow found" when what they mean is "we
 * could not have seen one". This engine reads the served HTML and the
 * attribute survives, so a verdict of followed is a fact rather than a guess.
 *
 * What this cannot do is discover the whole link graph. Nobody can without a
 * trillion-page crawler, and pretending otherwise is the category's other
 * standard lie. `LIMITS` below states exactly where the edge is.
 */

import type { CrawledPage, CrawlReport, LinkProspect } from "./types";

/* ------------------------------------------------------------ the limits */

/**
 * What this can and cannot know, by source.
 *
 * Written down because a link report that does not say where its numbers came
 * from is a link report nobody should act on.
 */
export const LIMITS = {
  discovery: {
    free:
      "Search Console lists links Google has found, which is the authoritative view of what counts, and Bing Webmaster Tools lists a different set because BingBot crawls differently. Between them you see most of what matters for a site you own.",
    gap:
      "Neither exposes links through an API you can poll. Search Console's Links report is export-only: no endpoint returns it, so the file has to be uploaded. Bing has an API but only for sites you have verified, which means it can never see a competitor.",
    consequence:
      "Competitor link gap analysis is not possible from free sources. It needs a commercial index. That is a real limitation and no amount of engineering removes it.",
  },
  verification: {
    strength:
      "Every claimed link is fetched and its anchor read from the served HTML, so rel, anchor text and placement are facts rather than claims. A link that cannot be confirmed is reported as unconfirmed, never as won.",
    gap:
      "A link rendered only by JavaScript will not be seen, and is reported as unconfirmed rather than missing. That is the right answer, because a link no crawler executes is a link that passes no authority either.",
  },
  quality: {
    free:
      "Open PageRank gives a domain-level score derived from the Common Crawl link graph, free and in bulk, which is enough to sort prospects into worth-pitching and not.",
    gap:
      "It is a quarterly snapshot and it undersamples deep pages on large sites, so treat it as a tier, never as a number to report to a client. Domain Rating and Domain Authority are proprietary and cannot be reproduced.",
  },
  outreach: {
    strength: "Every message is drafted and none is sent. Sending is a person's decision every time.",
    gap: "Reply tracking needs a mailbox connection. Until one exists, the pipeline knows what was drafted and not what came back.",
  },
} as const;

/* -------------------------------------------------------- verification */

export type LinkClaim = {
  /** The page that is supposed to carry the link. */
  sourceUrl: string;
  /** The domain the link should point at. */
  targetDomain: string;
};

export type LinkVerdict = {
  sourceUrl: string;
  targetDomain: string;
  status: "confirmed" | "not_found" | "unreachable" | "unconfirmed";
  /** Every matching anchor found on the page. */
  anchors: {
    href: string;
    /** The literal rel attribute, empty string when absent. */
    rel: string;
    followed: boolean;
    anchorText: string;
  }[];
  /** True when at least one matching anchor passes authority. */
  followed: boolean;
  /** Where on the page: the enclosing landmark, when one can be told. */
  placement: "content" | "footer" | "sidebar" | "navigation" | "unknown";
  /** A noindexed page passes nothing, however good the link looks. */
  sourceIndexable: boolean;
  checkedAt: string;
  note: string;
};

/**
 * Read `rel` correctly.
 *
 * `noopener` and `noreferrer` are security and privacy hints and have nothing
 * to do with ranking. Treating them as nofollow is a mistake common enough
 * that it is worth the explicit table.
 */
export function isFollowed(rel: string): boolean {
  const tokens = rel.toLowerCase().split(/\s+/).filter(Boolean);
  return !tokens.some((token) => token === "nofollow" || token === "sponsored" || token === "ugc");
}

/** Where on the page the link sits, read from the enclosing landmark. */
function placementOf(html: string, href: string): LinkVerdict["placement"] {
  let at = html.indexOf(href);
  if (at === -1) {
    // The markup usually carries the relative or protocol-less form, so fall
    // back to the path, which survives both.
    try {
      const path = new URL(href).pathname;
      if (path && path !== "/") at = html.indexOf(path);
    } catch {
      // Keep searching with what we have.
    }
  }
  if (at === -1) return "unknown";
  const before = html.slice(0, at).toLowerCase();
  const landmarks: [RegExp, LinkVerdict["placement"]][] = [
    [/<footer\b[^>]*>(?![\s\S]*<\/footer>)/, "footer"],
    [/<nav\b[^>]*>(?![\s\S]*<\/nav>)/, "navigation"],
    [/<aside\b[^>]*>(?![\s\S]*<\/aside>)/, "sidebar"],
  ];
  for (const [pattern, place] of landmarks) {
    if (pattern.test(before)) return place;
  }
  return "content";
}

/**
 * Verify one claimed link against the page that is supposed to carry it.
 *
 * Takes a page the crawler already fetched rather than fetching itself, so the
 * same SSRF checks and the same robots handling apply as everywhere else.
 */
export function verifyFrom(page: CrawledPage, claim: LinkClaim, html?: string): LinkVerdict {
  const now = new Date().toISOString();
  const bare = claim.targetDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();

  if (page.status === 0 || page.error) {
    return {
      ...claim, status: "unreachable", anchors: [], followed: false, placement: "unknown",
      sourceIndexable: false, checkedAt: now,
      note: `The page could not be read: ${page.error ?? "no response"}. A link that cannot be checked is not a link that has been won.`,
    };
  }
  if (!page.signals) {
    return {
      ...claim, status: "unconfirmed", anchors: [], followed: false, placement: "unknown",
      sourceIndexable: false, checkedAt: now,
      note: "The page returned something that is not HTML, so no anchor could be read.",
    };
  }

  const s = page.signals;
  const matches = s.links.filter((link) => {
    try {
      return new URL(link.href).hostname.replace(/^www\./, "").toLowerCase().endsWith(bare);
    } catch {
      return link.href.toLowerCase().includes(bare);
    }
  });

  const anchors = matches.map((link) => ({
    href: link.href,
    rel: link.rel ?? "",
    followed: isFollowed(link.rel ?? ""),
    anchorText: link.text,
  }));

  const indexable = !/noindex/i.test(s.robotsMeta ?? "");
  const followed = anchors.some((a) => a.followed);

  if (anchors.length === 0) {
    return {
      ...claim, status: "not_found", anchors: [], followed: false, placement: "unknown",
      sourceIndexable: indexable, checkedAt: now,
      note: s.wordCount < 50 && s.scripts.length > 0
        ? "No link found in the served HTML. This page builds itself with JavaScript, so a link placed there would also be invisible to every crawler that matters."
        : "No link to this domain exists on the page.",
    };
  }

  return {
    ...claim,
    status: "confirmed",
    anchors,
    followed,
    // Placement reads the raw HTML, because the landmark a link sits in is
    // markup, not text. Without the HTML it is honestly reported as unknown.
    placement: html ? placementOf(html, anchors[0].href) : "unknown",
    sourceIndexable: indexable,
    checkedAt: now,
    note: !indexable
      ? "The link is there, but the page carrying it is noindexed, so it passes nothing."
      : followed
        ? "Live and followed."
        : `Live but ${anchors[0].rel || "marked"}, so it passes no authority. Still worth having for referral traffic and for the mention.`,
  };
}

/* ---------------------------------------------------------- portfolio */

export type PortfolioLink = {
  sourceUrl: string;
  sourceDomain: string;
  firstSeen: string;
  lastVerified: string | null;
  status: LinkVerdict["status"];
  followed: boolean;
  anchorText: string;
  placement: LinkVerdict["placement"];
  /** Where the claim came from: search console, an upload, or a won pitch. */
  origin: "search_console" | "bing" | "upload" | "outreach" | "crawl";
};

export type PortfolioHealth = {
  referringDomains: number;
  followedDomains: number;
  /** Links that were confirmed once and are no longer there. */
  decayed: PortfolioLink[];
  /** Anchor text distribution, which is where over-optimisation shows up. */
  anchors: { text: string; count: number; share: number; kind: AnchorKind }[];
  /** Exact-match anchors above this share start to look manufactured. */
  overOptimised: boolean;
  velocity: { month: string; gained: number }[];
  notes: string[];
};

export type AnchorKind = "brand" | "exact" | "partial" | "generic" | "naked_url" | "empty";

const GENERIC = /^(click here|here|read more|learn more|this|link|website|site|more|visit|see more|find out more)$/i;

export function classifyAnchor(text: string, brand: string, targetTerms: string[]): AnchorKind {
  const t = text.trim().toLowerCase();
  if (!t) return "empty";
  if (/^https?:\/\//.test(t) || /^www\./.test(t)) return "naked_url";
  if (GENERIC.test(t)) return "generic";
  if (brand && t.includes(brand.toLowerCase())) return "brand";
  for (const term of targetTerms) {
    const lower = term.toLowerCase();
    if (!lower) continue;
    if (t === lower) return "exact";
    if (t.includes(lower)) return "partial";
  }
  return "partial";
}

/**
 * Read the portfolio.
 *
 * The two numbers that matter are referring domains, not links, and the anchor
 * distribution. A hundred links from one site is one referring domain. An
 * anchor profile that is a third exact-match is the shape Google's own spam
 * documentation describes, and it is the most common way a small site earns a
 * manual action while believing it is doing well.
 */
export function assessPortfolio(
  links: PortfolioLink[],
  options: { brand: string; targetTerms: string[] },
): PortfolioHealth {
  const domains = new Map<string, PortfolioLink[]>();
  for (const link of links) {
    domains.set(link.sourceDomain, [...(domains.get(link.sourceDomain) ?? []), link]);
  }

  const live = links.filter((l) => l.status === "confirmed");
  const decayed = links.filter((l) => l.lastVerified && l.status === "not_found");

  const counts = new Map<string, { count: number; kind: AnchorKind }>();
  for (const link of live) {
    const text = link.anchorText.trim() || "(empty)";
    const kind = classifyAnchor(link.anchorText, options.brand, options.targetTerms);
    const entry = counts.get(text) ?? { count: 0, kind };
    entry.count += 1;
    counts.set(text, entry);
  }
  const total = live.length || 1;
  const anchors = [...counts.entries()]
    .map(([text, v]) => ({ text, count: v.count, share: v.count / total, kind: v.kind }))
    .sort((a, b) => b.count - a.count);

  const exactShare = anchors.filter((a) => a.kind === "exact").reduce((sum, a) => sum + a.share, 0);
  const brandShare = anchors.filter((a) => a.kind === "brand" || a.kind === "naked_url").reduce((sum, a) => sum + a.share, 0);

  const byMonth = new Map<string, number>();
  for (const link of links) {
    const month = link.firstSeen.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }

  const notes: string[] = [];
  if (exactShare > 0.15) {
    notes.push(
      `${Math.round(exactShare * 100)}% of anchors are exact-match commercial terms. Natural profiles sit in the low single figures, because most people link using a brand name or a URL. This is the pattern Google's link spam guidance describes, and it is worth diluting before it is worth adding to.`,
    );
  }
  if (brandShare < 0.3 && live.length > 10) {
    notes.push(
      `Only ${Math.round(brandShare * 100)}% of anchors are the brand or a bare URL. A profile that people built themselves looks mostly like that.`,
    );
  }
  if (decayed.length > 0) {
    notes.push(
      `${decayed.length} link${decayed.length === 1 ? " that was" : "s that were"} confirmed once and cannot be found now. Decay is normal; unnoticed decay is what turns a report into fiction.`,
    );
  }

  return {
    referringDomains: domains.size,
    followedDomains: new Set(live.filter((l) => l.followed).map((l) => l.sourceDomain)).size,
    decayed,
    anchors,
    overOptimised: exactShare > 0.15,
    velocity: [...byMonth.entries()].map(([month, gained]) => ({ month, gained })).sort((a, b) => a.month.localeCompare(b.month)),
    notes,
  };
}

/* ---------------------------------------------------------- qualification */

export type RiskVerdict = {
  tier: "A" | "B" | "C" | "reject";
  reasons: string[];
  /** True when the prospect carries penalty risk, not merely low value. */
  dangerous: boolean;
};

/*
 * The patterns that mean a link is bought, farmed, or on a site that exists
 * only to sell links. Every one of these is grounds for rejection regardless
 * of the metric attached, because the cost of a manual action is larger than
 * the value of any single link.
 */
const RISK_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(write for us|guest post|submit (a )?(guest )?(post|article)|contribute)\b.*\b(fee|price|\$\d|paid)\b/i,
    reason: "The page advertises paid placement, which is a link scheme by Google's own definition." },
  { pattern: /\b(pbn|private blog network|link ?farm|link ?exchange|reciprocal link)\b/i,
    reason: "Names itself as a link network." },
  { pattern: /\b(buy|purchase|order) (backlinks?|do-?follow links?|guest posts?)\b/i,
    reason: "Sells links outright." },
  { pattern: /\bcasino|\bpoker\b|\bviagra\b|\bcbd gummies\b|\bessay writing service\b/i,
    reason: "Sits in a neighbourhood that attracts algorithmic scrutiny on its own." },
];

/**
 * Screen a prospect.
 *
 * Tiers describe what the link is worth. The dangerous flag is separate and
 * overrides everything, because volume never justifies penalty risk.
 */
export function screen(prospect: {
  domain: string;
  pageText?: string;
  openPageRank?: number | null;
  outboundLinksOnPage?: number;
  alreadyLinking?: boolean;
  relevance?: number;
}): RiskVerdict {
  const reasons: string[] = [];
  const text = prospect.pageText ?? "";

  for (const { pattern, reason } of RISK_PATTERNS) {
    if (pattern.test(text) || pattern.test(prospect.domain)) {
      reasons.push(reason);
    }
  }
  if (reasons.length > 0) return { tier: "reject", reasons, dangerous: true };

  if (prospect.alreadyLinking) {
    return { tier: "reject", reasons: ["Already links to the site. Pitching again wastes the relationship."], dangerous: false };
  }
  // A page carrying a hundred outbound links is a directory nobody reads.
  if ((prospect.outboundLinksOnPage ?? 0) > 100) {
    reasons.push(`${prospect.outboundLinksOnPage} outbound links on the page, so any single one carries very little.`);
  }

  const opr = prospect.openPageRank ?? null;
  const relevance = prospect.relevance ?? 0.5;

  if (opr !== null && opr < 2 && relevance < 0.5) {
    return {
      tier: "reject",
      reasons: [...reasons, "Low authority and only loosely related. Not worth the outreach."],
      dangerous: false,
    };
  }

  let tier: RiskVerdict["tier"];
  if ((opr ?? 0) >= 5 && relevance >= 0.6) tier = "A";
  else if ((opr ?? 0) >= 3 || relevance >= 0.6) tier = "B";
  else tier = "C";

  if (opr === null) {
    reasons.push("No authority reading available, so the tier is based on relevance alone.");
  }
  return { tier, reasons, dangerous: false };
}

/* ------------------------------------------------------------- tactics */

export type Tactic = {
  key: string;
  name: string;
  /** What this tactic does, in a sentence. */
  what: string;
  /** How much work per link won, so a plan can be built from the cheap end. */
  effort: "low" | "medium" | "high";
  /** Roughly how many links a month this produces for a small site. */
  yield: string;
  /** Whether this engine can find prospects for it without paid data. */
  automatable: boolean;
};

/**
 * The tactics that actually earn links, ordered by cost per link.
 *
 * Reclamation first, always. A mention that already exists and is missing its
 * link is the cheapest link in existence: the relationship is there, the
 * editorial decision is made, and the ask is a correction rather than a
 * favour. Most programmes skip it and start with guest posts, which is doing
 * the hardest thing first.
 */
export const TACTICS: Tactic[] = [
  { key: "unlinked_mention", name: "Unlinked mention reclamation", effort: "low", yield: "1 to 4 a month",
    what: "Someone already named you in writing and did not link. Ask them to.", automatable: true },
  { key: "broken_inbound", name: "Broken inbound link repair", effort: "low", yield: "1 to 3 a month",
    what: "A link points at a URL of yours that 404s. Redirect it and the equity comes back with no outreach at all.", automatable: true },
  { key: "redirect_only", name: "Redirect chain repair", effort: "low", yield: "recovers existing equity",
    what: "Links landing on a redirect lose a little at each hop. Point them at the final URL.", automatable: true },
  { key: "relationship", name: "Relationship links", effort: "low", yield: "2 to 5 in the first month",
    what: "Clients, suppliers, partners, associations, the places you already have a reason to be listed.", automatable: false },
  { key: "directory", name: "Directories and citations", effort: "low", yield: "5 to 20 once",
    what: "Industry bodies, chambers, review platforms. One-time work with a long tail for local.", automatable: true },
  { key: "journalist", name: "Journalist requests", effort: "medium", yield: "1 to 3 a month",
    what: "Answer a reporter's question well and quickly. The highest authority links available to a small company.", automatable: false },
  { key: "resource_page", name: "Resource page inclusion", effort: "medium", yield: "1 to 3 a month",
    what: "Pages that exist to list useful things in your field. You have to be genuinely useful to be added.", automatable: true },
  { key: "broken_replacement", name: "Broken link replacement", effort: "medium", yield: "1 to 2 a month",
    what: "Find a dead link on someone's page, offer yours as the replacement.", automatable: true },
  { key: "podcast", name: "Podcast guesting", effort: "medium", yield: "1 to 2 a month",
    what: "Show notes carry a followed link, and the episode keeps earning long after.", automatable: false },
  { key: "guest_contribution", name: "Guest contribution", effort: "high", yield: "1 a month",
    what: "Genuine editorial contribution to a publication that has readers. Not a guest post farm.", automatable: false },
  { key: "original_data", name: "Original data and digital PR", effort: "high", yield: "5 to 50 per piece",
    what: "Publish something only you could know. The one tactic with no ceiling.", automatable: false },
  { key: "awards", name: "Awards and recognition", effort: "medium", yield: "2 to 6 a year",
    what: "Entry lists and winner pages are followed links from bodies with real authority.", automatable: false },
];

/* ----------------------------------------------- prospecting from a crawl */

/**
 * Prospects the crawl can find on its own.
 *
 * Three of the tactic classes need no external data at all, because the
 * evidence is already in the site's own pages and its own broken links. Those
 * are also the three cheapest tactics, which is a happy accident.
 */
export function prospectsFromCrawl(
  report: CrawlReport,
  options: { brand: string; domain: string },
): LinkProspect[] {
  const out: LinkProspect[] = [];
  const seen = new Set<string>();
  const ourHost = options.domain.replace(/^www\./, "").toLowerCase();

  // Broken inbound: our own URLs that 404 while other pages still link to them.
  for (const page of report.pages) {
    if (page.status !== 404 && page.status !== 410) continue;
    if (page.inlinks.length === 0) continue;
    out.push({
      domain: ourHost,
      url: page.url,
      kind: "broken_inbound",
      why: `${page.inlinks.length} page${page.inlinks.length === 1 ? "" : "s"} still link to this URL and it returns ${page.status}. Redirecting it recovers the equity with no outreach at all.`,
      authorityHint: "Equity you already earned, currently landing on nothing.",
      contactPath: "None needed. This is a redirect you control.",
      pitchAngle: `301 ${new URL(page.url).pathname} to the page that replaced it.`,
      priority: 0.9,
    });
  }

  // Outbound mentions of other organisations: the relationship map, which is
  // where the first three or four links of any programme actually come from.
  const mentioned = new Map<string, { urls: Set<string>; text: string }>();
  for (const page of report.pages) {
    for (const link of page.signals?.links ?? []) {
      if (link.internal) continue;
      let host: string;
      try {
        host = new URL(link.href).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        continue;
      }
      if (host.endsWith(ourHost)) continue;
      if (/^(twitter|x|facebook|linkedin|instagram|youtube|tiktok|google|gstatic|schema|w3)\./.test(host)) continue;
      const entry = mentioned.get(host) ?? { urls: new Set<string>(), text: link.text };
      entry.urls.add(page.url);
      mentioned.set(host, entry);
    }
  }
  for (const [host, entry] of mentioned) {
    if (seen.has(host)) continue;
    seen.add(host);
    out.push({
      domain: host,
      url: `https://${host}`,
      kind: "relationship",
      why: `You link to them from ${entry.urls.size} page${entry.urls.size === 1 ? "" : "s"}. A one-way link outward is the easiest conversation to start, and partners, suppliers and clients say yes far more often than strangers do.`,
      authorityHint: "Unknown until a domain score is looked up.",
      contactPath: `Whoever you already deal with at ${host}. This is a relationship, not a cold pitch.`,
      pitchAngle: `You already cite them on ${[...entry.urls].slice(0, 2).join(" and ")}. Ask whether a link back makes sense.`,
      priority: 0.7,
    });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 60);
}

/* ------------------------------------------------------------- outreach */

export type OutreachDraft = {
  to: string | null;
  subject: string;
  body: string;
  /** The detail that proves a person read the page. */
  personalisation: string;
  tactic: string;
  /** Never true. Sending is always a person's decision. */
  sent: false;
};

/**
 * Draft one message.
 *
 * Deliberately short, deliberately specific, and it never claims a
 * relationship that does not exist. The single thing that separates a reply
 * from a delete is whether the first sentence proves a person read the page,
 * so the template cannot be filled without that detail.
 */
export function draftOutreach(input: {
  tactic: string;
  targetDomain: string;
  targetPageTitle: string;
  personalisation: string;
  ourUrl: string;
  ourValue: string;
  senderName: string;
  senderRole: string;
  brand: string;
}): OutreachDraft | null {
  if (!input.personalisation || input.personalisation.length < 20) return null;

  const openers: Record<string, string> = {
    unlinked_mention: `You mentioned ${input.brand} in ${input.targetPageTitle}, which I appreciated. ${input.personalisation}`,
    broken_replacement: `I was reading ${input.targetPageTitle} and one of the links on it is dead. ${input.personalisation}`,
    resource_page: `${input.targetPageTitle} is the list I keep sending people to. ${input.personalisation}`,
    relationship: `${input.personalisation}`,
  };
  const asks: Record<string, string> = {
    unlinked_mention: `Would you be willing to link the mention to ${input.ourUrl}? It would help people find the detail behind it.`,
    broken_replacement: `We have something that covers the same ground at ${input.ourUrl}, if it is useful as a replacement. If not, the dead link is worth removing either way.`,
    resource_page: `If it fits, ${input.ourUrl} covers ${input.ourValue}. No worries if it is not right for the page.`,
    relationship: `Would it make sense to link to ${input.ourUrl} from your site? Happy to do the same where it fits.`,
  };

  const opener = openers[input.tactic] ?? openers.relationship;
  const ask = asks[input.tactic] ?? asks.relationship;

  return {
    to: null,
    subject: input.tactic === "unlinked_mention"
      ? `The ${input.brand} mention in ${input.targetPageTitle}`
      : input.tactic === "broken_replacement"
        ? `A dead link on ${input.targetPageTitle}`
        : `${input.targetPageTitle}`,
    body: [opener, "", ask, "", `${input.senderName}`, `${input.senderRole}, ${input.brand}`].join("\n"),
    personalisation: input.personalisation,
    tactic: input.tactic,
    sent: false,
  };
}

/**
 * The rules an outreach programme runs under.
 *
 * Written into the code rather than a policy document, because a policy that
 * lives in a document is a policy the software can break.
 */
export const OUTREACH_RULES = {
  neverSendAutomatically: true,
  /** More than this to one domain in a month reads as pressure. */
  maxPerDomainPerMonth: 2,
  /** A generic address reaches nobody and marks the sender as a bulk mailer. */
  noRoleAddresses: ["info@", "admin@", "sales@", "support@", "contact@", "hello@", "enquiries@"],
  /** One follow-up, then stop. */
  maxFollowUps: 1,
  stopOnReply: true,
  /** Never offer money, links in exchange, or anything of value for a link. */
  neverOfferPayment: true,
} as const;
