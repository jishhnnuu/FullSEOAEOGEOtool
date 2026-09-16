/**
 * Link risk, assessed from evidence rather than asserted as a number.
 *
 * Every tool in this category ships a "toxicity score": one opaque figure out
 * of a hundred, from a proprietary model, that nobody can audit and that turns
 * out to be a rough function of domain authority. Two things are wrong with
 * that, and fixing both is what makes this one better.
 *
 * The first is the category error. "Toxic" conflates two completely different
 * problems. A link from a dead directory is worthless: it does nothing, and
 * removing it changes nothing. A link from a network that sells placements is
 * dangerous: it can earn a manual action. Those need opposite responses, and a
 * single score cannot express both. So this returns two, separately.
 *
 * The second is that a score you cannot audit is a score you cannot act on.
 * Every point here traces to a named, observable fact with the evidence
 * attached, drawn from Google's published link spam policy rather than from
 * folklore. If we say a link carries manual action risk, the reason is a
 * sentence you can check yourself in thirty seconds.
 *
 * And the thing the category will not say out loud: Google's own position is
 * that this rarely matters. John Mueller, March 2026: the disavow tool "is not
 * a part of normal site maintenance. I would really only use that if you have
 * a manual spam action." Googlers have said "toxic backlinks" is a phrase link
 * removal services invented. SpamBrain filters low-quality links
 * algorithmically, and Bing removed its disavow tool entirely in 2023. So this
 * engine is deliberately reluctant: it recommends disavowal only where a
 * manual action exists or a documentable attack is running, and it says so
 * rather than selling a monthly cleanup.
 */

import type { CrawledPage } from "./types";

/* ---------------------------------------------------------------- signals */

export type RiskSignal = {
  code: string;
  /** What was observed, stated as a fact. */
  observed: string;
  /** Why it matters, in terms of Google's actual policy. */
  why: string;
  /** How to check it yourself. */
  verify: string;
  /** Points toward manual action risk. Zero for signals that only waste effort. */
  actionRisk: number;
  /** Points toward the link being worthless. */
  wasteRisk: number;
  evidence: Record<string, unknown>;
};

/*
 * Patterns drawn from Google's published link spam policy. Each is something a
 * human reviewer would recognise as a scheme, not something an algorithm
 * merely discounts.
 */
const SCHEME_PATTERNS: { code: string; pattern: RegExp; observed: string; why: string; weight: number }[] = [
  {
    code: "sells_placements",
    pattern: /\b(guest post|sponsored post|write for us|submit (an? )?article)\b[\s\S]{0,200}?\b(\$\s?\d|£\s?\d|€\s?\d|\d+\s?(usd|eur|gbp)|price|fee|payment|paypal)\b/i,
    observed: "The page advertises paid placement with a price attached",
    why: "Google's link spam policy names buying and selling links for ranking purposes as a link scheme. A price on the page is the clearest possible evidence of one.",
    // Conclusive on its own. This is not a hint that something might be wrong,
    // it is the site stating what it does.
    weight: 65,
  },
  {
    code: "link_network",
    pattern: /\b(private blog network|\bpbn\b|link farm|link exchange program|reciprocal link (program|exchange)|link wheel)\b/i,
    observed: "The page describes itself as a link network",
    why: "Excessive link exchanges and networks built to pass ranking signals are named explicitly in the spam policy.",
    weight: 65,
  },
  {
    code: "sells_links_outright",
    pattern: /\b(buy|purchase|order|cheap)\s+(backlinks?|do-?follow links?|high da links?|pbn links?)\b/i,
    observed: "The page sells links as a product",
    why: "This is the plainest form of a link scheme there is.",
    weight: 70,
  },
  {
    code: "article_spinning",
    pattern: /\b(article spinner|spun article|content spinning|auto-?blog(ging)?)\b/i,
    observed: "The site advertises spun or auto-generated content",
    why: "Scaled content abuse is a separate policy violation, and links from such pages sit inside it. Suggestive rather than conclusive, because the page is not selling links outright.",
    weight: 35,
  },
];

/** Neighbourhoods that attract scrutiny on their own, when nothing explains the link. */
const SENSITIVE = /\b(casino|poker|slots|betting|sportsbook|viagra|cialis|cbd gummies|payday loan|essay writing service|replica watch)\b/i;

/* ------------------------------------------------------------- one link */

export type LinkUnderReview = {
  sourceUrl: string;
  sourceDomain: string;
  anchorText: string;
  rel: string;
  followed: boolean;
  /** Where on the page, from the verifier. */
  placement: "content" | "footer" | "sidebar" | "navigation" | "unknown";
  /** True when the page carrying it is noindexed. */
  sourceNoindex?: boolean;
  /** Text of the source page, when it was fetched. */
  sourcePageText?: string;
  /** Outbound links counted on the source page. */
  outboundLinks?: number;
  /** Words on the source page. */
  sourceWordCount?: number;
  /** Domain authority 0 to 10, from Open PageRank or similar. Null when unknown. */
  authority?: number | null;
  /** Whether the link appears on many pages of the source site. */
  sitewide?: boolean;
  /** Our own topic, for the relevance read. */
  ourTopic?: string;
};

export type LinkRisk = {
  sourceUrl: string;
  sourceDomain: string;
  /**
   * Would a human reviewer at Google call this a link scheme? 0 to 100.
   *
   * This is the number that matters and it should be zero for almost every
   * link on almost every site. Anything above 60 is worth a person looking.
   */
  actionRisk: number;
  /**
   * Is this link doing nothing? 0 to 100.
   *
   * High is common and harmless. It means do not spend more effort here, not
   * remove it.
   */
  wasteRisk: number;
  signals: RiskSignal[];
  /** The one thing to do about it. */
  verdict: "leave_it" | "ignore_it" | "investigate" | "disavow_candidate";
  verdictReason: string;
};

export function assessLink(link: LinkUnderReview): LinkRisk {
  const signals: RiskSignal[] = [];
  const text = link.sourcePageText ?? "";

  for (const entry of SCHEME_PATTERNS) {
    const match = entry.pattern.exec(text);
    if (!match) continue;
    signals.push({
      code: entry.code,
      observed: entry.observed,
      why: entry.why,
      verify: `Open ${link.sourceUrl} and search the page for the phrase quoted in the evidence.`,
      actionRisk: entry.weight,
      wasteRisk: 20,
      evidence: { phrase: match[0].slice(0, 160).replace(/\s+/g, " ") },
    });
  }

  if (SENSITIVE.test(text) && !SENSITIVE.test(link.ourTopic ?? "")) {
    signals.push({
      code: "unrelated_sensitive_neighbourhood",
      observed: "The source page is about gambling, pharmaceuticals or a similar category, and your site is not",
      why: "A link from a category that has nothing to do with yours has no editorial reason to exist, which is the pattern a reviewer looks for.",
      verify: `Read ${link.sourceUrl} and ask whether a person would have linked to you from it.`,
      actionRisk: 25,
      wasteRisk: 40,
      evidence: { match: SENSITIVE.exec(text)?.[0] },
    });
  }

  // A page with hundreds of outbound links and little else is a directory that
  // exists to hold links. Worthless rather than dangerous, on its own.
  const outbound = link.outboundLinks ?? 0;
  const words = link.sourceWordCount ?? 0;
  if (outbound > 100 && words < 600) {
    signals.push({
      code: "link_dump",
      observed: `${outbound} outbound links on a page carrying ${words} words`,
      why: "A page that is mostly links passes almost nothing through any one of them. This is not a penalty risk, it is a dead end.",
      verify: `Open ${link.sourceUrl} and count how much of it is prose.`,
      actionRisk: 5,
      wasteRisk: 55,
      evidence: { outbound_links: outbound, words },
    });
  }

  if (link.sourceNoindex) {
    signals.push({
      code: "noindexed_source",
      observed: "The page carrying the link is noindexed",
      why: "Google does not index the page, so it passes nothing at all. The link is invisible for ranking purposes.",
      verify: `View source on ${link.sourceUrl} and look for a robots meta tag containing noindex.`,
      actionRisk: 0,
      wasteRisk: 90,
      evidence: {},
    });
  }

  if (link.sitewide && link.placement === "footer") {
    signals.push({
      code: "sitewide_footer",
      observed: "The link is in the footer of every page on the source site",
      why: "Sitewide footer links are the classic shape of a paid or reciprocal arrangement. Google has discounted them for years, and a large number of them is a pattern a reviewer notices.",
      verify: `Load two unrelated pages on ${link.sourceDomain} and check the link is on both.`,
      actionRisk: 20,
      wasteRisk: 60,
      evidence: {},
    });
  }

  if (!link.followed && link.placement !== "unknown") {
    signals.push({
      code: "nofollow",
      observed: `Marked ${link.rel || "nofollow"}, so it passes no ranking signal`,
      why: "This is not a risk of any kind. It is worth recording because it changes what the link is for: referral traffic and a brand mention, not authority.",
      verify: `View source on ${link.sourceUrl} and read the rel attribute on the anchor.`,
      actionRisk: 0,
      wasteRisk: 45,
      evidence: { rel: link.rel },
    });
  }

  const actionRisk = Math.min(100, signals.reduce((sum, s) => sum + s.actionRisk, 0));
  const wasteRisk = Math.min(100, signals.reduce((sum, s) => sum + s.wasteRisk, 0));

  /*
   * The verdict is deliberately conservative, and "disavow_candidate" is
   * deliberately hard to reach. A disavow file removes links Google may well
   * have been counting in your favour, and the tool's own maker says it is not
   * part of normal maintenance. Recommending it casually is how tools do
   * genuine harm while appearing thorough.
   */
  let verdict: LinkRisk["verdict"];
  let verdictReason: string;
  if (actionRisk >= 60) {
    verdict = "disavow_candidate";
    verdictReason =
      "This carries the marks of a link scheme rather than a low-quality link. It belongs on a disavow list only if you have a manual action, or if you can document an attack. Otherwise note it and move on.";
  } else if (actionRisk >= 25) {
    verdict = "investigate";
    verdictReason = "Something here is worth a person looking at for two minutes. It is not evidence of a scheme on its own.";
  } else if (wasteRisk >= 50) {
    verdict = "ignore_it";
    verdictReason = "This link does nothing for you. That is not a problem to fix, it is a place not to spend more effort. Removing it would change nothing.";
  } else {
    verdict = "leave_it";
    verdictReason = "Nothing here needs attention.";
  }

  return { sourceUrl: link.sourceUrl, sourceDomain: link.sourceDomain, actionRisk, wasteRisk, signals, verdict, verdictReason };
}

/* --------------------------------------------------------- whole profile */

export type ProfileRisk = {
  assessed: number;
  /** Links whose evidence points at a scheme. Should normally be zero. */
  schemeCandidates: LinkRisk[];
  /** Links doing nothing. Usually a large number, and usually fine. */
  wasted: LinkRisk[];
  /** Patterns only visible across the whole profile. */
  patterns: RiskSignal[];
  /**
   * The honest headline.
   *
   * Not a score out of a hundred, because a single number here is exactly the
   * thing that misleads. A sentence that says whether anything needs doing.
   */
  headline: string;
  /** Whether a disavow file is genuinely warranted, and why or why not. */
  disavow: { warranted: boolean; reason: string; count: number };
};

export type ProfileContext = {
  brand: string;
  targetTerms: string[];
  /** Set by the user when Search Console reports one. */
  manualActionPresent?: boolean;
  /** Referring domains gained per month, for the velocity read. */
  monthlyGains?: { month: string; gained: number }[];
};

/**
 * Patterns that only exist across a whole profile.
 *
 * A single exact-match anchor is nothing. A third of the profile carrying the
 * same commercial phrase is the strongest signal of manufactured links there
 * is, and it is invisible link by link, which is why per-link toxicity scores
 * miss it entirely.
 */
export function assessProfile(links: LinkUnderReview[], context: ProfileContext): ProfileRisk {
  const assessed = links.map(assessLink);
  const patterns: RiskSignal[] = [];

  const live = links.filter((l) => l.followed);
  const total = live.length || 1;

  // Anchor concentration.
  const anchors = new Map<string, number>();
  for (const link of live) {
    const key = link.anchorText.trim().toLowerCase();
    if (key) anchors.set(key, (anchors.get(key) ?? 0) + 1);
  }
  const exact = [...anchors.entries()].filter(([text]) =>
    context.targetTerms.some((term) => term && text === term.toLowerCase()),
  );
  const exactCount = exact.reduce((sum, [, n]) => sum + n, 0);
  const exactShare = exactCount / total;
  if (exactShare > 0.15 && exactCount >= 3) {
    patterns.push({
      code: "anchor_over_optimisation",
      observed: `${Math.round(exactShare * 100)}% of followed links use an exact commercial phrase as the anchor`,
      why: "People linking naturally use a brand name or a bare URL. A profile weighted toward exact-match commercial anchors is the shape Google's link spam documentation describes, and it is the most common way a small site earns a manual action while believing it is doing well.",
      verify: "Sort the anchor table by count and read the top ten.",
      actionRisk: 35,
      wasteRisk: 0,
      evidence: { exact_share: Number(exactShare.toFixed(3)), top: exact.slice(0, 5).map(([t, n]) => `${t} (${n})`) },
    });
  }

  // Concentration on a small number of domains.
  const byDomain = new Map<string, number>();
  for (const link of live) byDomain.set(link.sourceDomain, (byDomain.get(link.sourceDomain) ?? 0) + 1);
  const biggest = [...byDomain.entries()].sort((a, b) => b[1] - a[1])[0];
  if (biggest && byDomain.size > 3 && biggest[1] / total > 0.4) {
    patterns.push({
      code: "single_domain_concentration",
      observed: `${Math.round((biggest[1] / total) * 100)}% of followed links come from ${biggest[0]}`,
      why: "Referring domains is the number that moves anything. A profile that is mostly one site has one referring domain doing the work, however many links it shows.",
      verify: "Group the link list by domain.",
      actionRisk: 5,
      wasteRisk: 30,
      evidence: { domain: biggest[0], links: biggest[1] },
    });
  }

  // Velocity spikes, which is what a bought batch looks like.
  const gains = context.monthlyGains ?? [];
  if (gains.length >= 3) {
    const recent = gains[gains.length - 1];
    const prior = gains.slice(0, -1);
    const average = prior.reduce((sum, g) => sum + g.gained, 0) / prior.length;
    if (average > 0 && recent.gained > average * 5 && recent.gained >= 10) {
      patterns.push({
        code: "velocity_spike",
        observed: `${recent.gained} new referring domains in ${recent.month}, against an average of ${average.toFixed(1)}`,
        why: "A sudden batch of links is what a purchase looks like from the outside. It is also what a successful PR campaign looks like, so this is a prompt to check rather than a verdict.",
        verify: "Look at what those domains are and whether you know why they linked.",
        actionRisk: 20,
        wasteRisk: 0,
        evidence: { month: recent.month, gained: recent.gained, prior_average: Number(average.toFixed(1)) },
      });
    }
  }

  const schemeCandidates = assessed.filter((a) => a.verdict === "disavow_candidate");
  const investigate = assessed.filter((a) => a.verdict === "investigate");
  const wasted = assessed.filter((a) => a.verdict === "ignore_it");
  const patternRisk = patterns.reduce((sum, p) => sum + p.actionRisk, 0);

  let headline: string;
  if (schemeCandidates.length === 0 && patternRisk < 25) {
    headline =
      assessed.length === 0
        ? "No links assessed yet."
        : `Nothing in this profile looks like a link scheme. ${wasted.length} of ${assessed.length} links pass no authority, which is normal and not worth acting on.`;
  } else if (schemeCandidates.length > 0) {
    headline = schemeCandidates.length === 1
      ? "One link carries the marks of a scheme rather than merely low quality. Read it before doing anything."
      : `${schemeCandidates.length} links carry the marks of a scheme rather than merely low quality. Read each one before doing anything.`;
  } else {
    headline = `No individual link looks bought, but ${patterns.length} pattern${patterns.length === 1 ? "" : "s"} across the profile ${patterns.length === 1 ? "is" : "are"} worth attention.`;
  }

  /*
   * Disavow, recommended almost never and only with a reason.
   *
   * The bar is Google's own: a manual action, or a documented attack. Anything
   * else and the honest answer is that the file would do nothing, and might
   * remove links that were helping.
   */
  const disavow = context.manualActionPresent
    ? {
        warranted: schemeCandidates.length > 0,
        reason: schemeCandidates.length > 0
          ? `You have reported a manual action, and ${schemeCandidates.length} link${schemeCandidates.length === 1 ? "" : "s"} carry scheme evidence. Those are the ones to file, with the evidence attached to the reconsideration request.`
          : "You have reported a manual action, but nothing here looks like a scheme. Before filing anything, get the exact wording of the action from Search Console: it names what Google objected to.",
        count: schemeCandidates.length,
      }
    : {
        warranted: false,
        reason:
          "No manual action reported, so a disavow file would do nothing useful and could remove links Google was counting in your favour. Google's own guidance is that the tool is not part of normal site maintenance and is for manual actions. This stays available if a manual action arrives.",
        count: 0,
      };

  return {
    assessed: assessed.length,
    schemeCandidates,
    wasted,
    patterns: [...patterns, ...investigate.flatMap((i) => i.signals.filter((s) => s.actionRisk >= 20))],
    headline,
    disavow,
  };
}

/** The disavow file itself, in Google's format, only when it is warranted. */
export function buildDisavowFile(risk: ProfileRisk, note: string): string | null {
  if (!risk.disavow.warranted || risk.schemeCandidates.length === 0) return null;
  const lines = [
    "# Disavow file",
    `# Generated ${new Date().toISOString().slice(0, 10)}`,
    "# Only the links carrying documented link scheme evidence are listed.",
    `# ${note}`,
    "",
  ];
  const domains = new Set(risk.schemeCandidates.map((c) => c.sourceDomain));
  for (const domain of [...domains].sort()) {
    const reasons = risk.schemeCandidates
      .filter((c) => c.sourceDomain === domain)
      .flatMap((c) => c.signals.filter((s) => s.actionRisk > 0).map((s) => s.observed));
    lines.push(`# ${[...new Set(reasons)].join("; ")}`);
    lines.push(`domain:${domain}`);
    lines.push("");
  }
  return lines.join("\n");
}
