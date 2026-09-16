"use client";

/**
 * The link programme, held in the browser and synced with everything else.
 *
 * A link programme is a long-running thing. A mention found in March is still
 * worth watching in September, an outreach draft sent in April earns a link in
 * June, and a link that landed in May falls off in August without anyone
 * noticing. So this is state, not a report, and the state is what turns a list
 * of prospects into a programme.
 */

import type { LinkVerdict, PortfolioLink } from "@/engine/backlinks";
import type { Mention } from "@/engine/mentions";
import type { LinkUnderReview } from "@/engine/link-risk";
import { post } from "./session";

export type LinkCredential = {
  provider: "dataforseo" | "ahrefs" | "moz";
  /** login:password for DataForSEO, a token for the others. Browser only. */
  credential: string;
};

export type LinkState = {
  siteId: string;
  /** Links we know about, verified or claimed. */
  portfolio: PortfolioLink[];
  /** Every mention, linked or not. */
  mentions: Mention[];
  /** Outreach in flight. */
  pipeline: PipelineEntry[];
  lastVerifiedAt: string | null;
  lastDataPullAt: string | null;
};

export type PipelineStage =
  | "prospect"
  | "qualified"
  | "contact_found"
  | "drafted"
  | "sent"
  | "replied"
  | "won"
  | "declined"
  | "no_reply";

export type PipelineEntry = {
  id: string;
  domain: string;
  targetUrl: string;
  tactic: string;
  stage: PipelineStage;
  /** Set once the verifier confirms it, never from a claim. */
  verifiedLinkUrl: string | null;
  contact: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  /** Approaches made, for the per-domain cap. */
  approaches: number;
};

const KEY = "seoos.links.v1";

export function loadLinks(siteId: string): LinkState {
  const empty: LinkState = { siteId, portfolio: [], mentions: [], pipeline: [], lastVerifiedAt: null, lastDataPullAt: null };
  try {
    const raw = localStorage.getItem(`${KEY}.${siteId}`);
    return raw ? { ...empty, ...(JSON.parse(raw) as LinkState) } : empty;
  } catch {
    return empty;
  }
}

export function saveLinks(state: LinkState): void {
  try {
    localStorage.setItem(`${KEY}.${state.siteId}`, JSON.stringify(state));
  } catch {
    // A browser refusing storage still gets a working session.
  }
}

/** The provider credential, held in this browser and sent with one request. */
export function loadCredential(): LinkCredential | null {
  try {
    const raw = localStorage.getItem("seoos.linkdata.v1");
    return raw ? (JSON.parse(raw) as LinkCredential) : null;
  } catch {
    return null;
  }
}

export function saveCredential(credential: LinkCredential | null): void {
  try {
    if (credential) localStorage.setItem("seoos.linkdata.v1", JSON.stringify(credential));
    else localStorage.removeItem("seoos.linkdata.v1");
  } catch {
    // Same as above.
  }
}

/* ------------------------------------------------------------ data pulls */

export type LinkDataResult = {
  provider: string;
  report: string;
  target: string;
  rows: {
    sourceUrl: string;
    sourceDomain: string;
    targetUrl: string;
    anchorText: string;
    followed: boolean;
    rel: string;
    firstSeen: string | null;
    lastSeen: string | null;
    domainScore: number | null;
    sourceIndexable: boolean | null;
  }[];
  summary: Record<string, unknown> | null;
  cost: number | null;
  notes: string[];
};

export async function pullLinkData(
  report: "summary" | "backlinks" | "referring_domains" | "anchors" | "broken" | "competitors",
  target: string,
  options: { competitors?: string[]; limit?: number } = {},
): Promise<LinkDataResult> {
  const credential = loadCredential();
  if (!credential) {
    throw new Error(
      "No link data provider is connected. Add a DataForSEO key in Settings: it is pay as you go with no monthly fee, and a thousand backlinks costs about six cents.",
    );
  }
  return post<LinkDataResult>("/api/links/data", {
    provider: credential.provider,
    credential: credential.credential,
    target,
    report,
    ...options,
  });
}

/** Rows from a provider, turned into the portfolio shape. */
export function portfolioFrom(rows: LinkDataResult["rows"], origin: PortfolioLink["origin"]): PortfolioLink[] {
  const now = new Date().toISOString();
  return rows.map((row) => ({
    sourceUrl: row.sourceUrl,
    sourceDomain: row.sourceDomain,
    firstSeen: row.firstSeen ?? now,
    lastVerified: null,
    // A provider saying a link exists is a claim, not a verification. Nothing
    // here is marked confirmed until this product has fetched the page itself.
    status: "unconfirmed" as const,
    followed: row.followed,
    anchorText: row.anchorText,
    placement: "unknown" as const,
    origin,
  }));
}

/** What a provider row needs to become to be risk-assessed. */
export function reviewableFrom(links: PortfolioLink[], topic: string): LinkUnderReview[] {
  return links.map((link) => ({
    sourceUrl: link.sourceUrl,
    sourceDomain: link.sourceDomain,
    anchorText: link.anchorText,
    rel: link.followed ? "" : "nofollow",
    followed: link.followed,
    placement: link.placement,
    ourTopic: topic,
  }));
}

/* ------------------------------------------------------------ verification */

export async function verifyBatch(
  sourceUrls: string[],
  targetDomain: string,
  onProgress?: (done: number, total: number) => void,
): Promise<LinkVerdict[]> {
  const out: LinkVerdict[] = [];
  for (let i = 0; i < sourceUrls.length; i += 10) {
    const batch = sourceUrls.slice(i, i + 10);
    const response = await post<{ verdicts: LinkVerdict[] }>("/api/links/verify", {
      claims: batch.map((sourceUrl) => ({ sourceUrl, targetDomain })),
    });
    out.push(...response.verdicts);
    onProgress?.(out.length, sourceUrls.length);
  }
  return out;
}

/** Fold verification results back into the portfolio, so decay becomes visible. */
export function applyVerdicts(portfolio: PortfolioLink[], verdicts: LinkVerdict[]): PortfolioLink[] {
  const byUrl = new Map(verdicts.map((v) => [v.sourceUrl, v]));
  const now = new Date().toISOString();
  return portfolio.map((link) => {
    const verdict = byUrl.get(link.sourceUrl);
    if (!verdict) return link;
    return {
      ...link,
      status: verdict.status,
      followed: verdict.followed,
      anchorText: verdict.anchors[0]?.anchorText ?? link.anchorText,
      placement: verdict.placement,
      lastVerified: now,
    };
  });
}
