/**
 * Real backlink data, on the tenant's own key.
 *
 * The same shape as the model relay: the key arrives on the request from the
 * browser that holds it, is used once, and is never written down. We hold no
 * account with any data provider, which keeps the deployment standalone and
 * keeps the cost at cost.
 *
 * The cost is the reason this is worth doing. DataForSEO charges $0.024 per
 * request plus $0.000036 per row, so a thousand backlinks is about six cents.
 * Ahrefs charges roughly five dollars for the same thousand rows through their
 * API. A full competitor gap analysis across five rivals at ten thousand rows
 * each lands near two dollars, which turns the one piece of link research that
 * genuinely needed a commercial index from a subscription decision into a
 * rounding error.
 *
 * Providers are kept behind one shape so a screen never has to know which one
 * answered.
 */

import { fail, json, withEnv } from "@/server/http";

export const dynamic = "force-dynamic";

type Provider = "dataforseo" | "ahrefs" | "moz";

type Body = {
  provider?: Provider;
  /** DataForSEO uses login:password; the others use a bearer token. */
  credential?: string;
  target?: string;
  /** What to ask for. */
  report?: "summary" | "backlinks" | "referring_domains" | "anchors" | "broken" | "competitors";
  limit?: number;
  /** For the gap report. */
  competitors?: string[];
};

/** One row, whichever provider produced it. */
export type BacklinkRow = {
  sourceUrl: string;
  sourceDomain: string;
  targetUrl: string;
  anchorText: string;
  followed: boolean;
  rel: string;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Provider's own domain score, normalised to 0 to 100 where possible. */
  domainScore: number | null;
  /** Whether the source page is indexable, when the provider says. */
  sourceIndexable: boolean | null;
};

export type LinkDataResult = {
  provider: Provider;
  report: string;
  target: string;
  rows: BacklinkRow[];
  summary: Record<string, unknown> | null;
  /** What this call cost the tenant, when the provider reports it. */
  cost: number | null;
  notes: string[];
};

export async function POST(request: Request): Promise<Response> {
  return withEnv(request, async () => {
    const body = (await request.json().catch(() => ({}))) as Body;
    const provider = body.provider ?? "dataforseo";
    const credential = (body.credential ?? "").trim();
    const target = (body.target ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const report = body.report ?? "summary";

    if (!credential) {
      return fail(
        "no_credential",
        "No provider key was sent. Add your own in Settings; the platform holds no account with any data provider.",
        400,
        "DataForSEO is pay as you go with no monthly fee, and a thousand backlinks costs about six cents.",
      );
    }
    if (!target) return fail("no_target", "Name the domain to look up.");

    try {
      if (provider === "dataforseo") {
        return json(await dataForSeo(credential, target, report, body));
      }
      return fail("provider_unsupported", `${provider} is not wired up yet. DataForSEO is, and costs a fraction of the others.`, 501);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The provider refused the request.";
      // Never echo a credential back, even inside an upstream error body.
      return fail("provider_error", message.split(credential).join("[redacted]"), 502);
    }
  });
}

/* ------------------------------------------------------------ DataForSEO */

const BASE = "https://api.dataforseo.com/v3";

async function call(credential: string, path: string, payload: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(credential)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([payload]),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`DataForSEO answered ${response.status}: ${text.slice(0, 240)}`);
  }
  const parsed = JSON.parse(text) as {
    status_code?: number;
    status_message?: string;
    cost?: number;
    tasks?: { status_code?: number; status_message?: string; result?: unknown[] }[];
  };
  if (parsed.status_code !== 20000) {
    throw new Error(parsed.status_message ?? "DataForSEO rejected the request.");
  }
  const task = parsed.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(task?.status_message ?? "The task did not complete.");
  }
  return { result: task.result ?? [], cost: parsed.cost ?? null };
}

type DfsBacklink = {
  url_from?: string;
  domain_from?: string;
  url_to?: string;
  anchor?: string;
  dofollow?: boolean;
  is_lost?: boolean;
  first_seen?: string;
  last_seen?: string;
  rank?: number;
  domain_from_rank?: number;
  page_from_external_links?: number;
  is_broken?: boolean;
  item_type?: string;
};

function rowFrom(link: DfsBacklink): BacklinkRow {
  return {
    sourceUrl: link.url_from ?? "",
    sourceDomain: link.domain_from ?? "",
    targetUrl: link.url_to ?? "",
    anchorText: link.anchor ?? "",
    followed: link.dofollow === true,
    rel: link.dofollow === true ? "" : "nofollow",
    firstSeen: link.first_seen ?? null,
    lastSeen: link.last_seen ?? null,
    // DataForSEO's rank runs 0 to 1000. Normalised so a screen never has to
    // know whose scale it is looking at.
    domainScore: typeof link.domain_from_rank === "number" ? Math.round(link.domain_from_rank / 10) : null,
    sourceIndexable: null,
  };
}

async function dataForSeo(credential: string, target: string, report: string, body: Body): Promise<LinkDataResult> {
  const limit = Math.min(body.limit ?? 500, 5000);
  const notes: string[] = [];

  if (report === "summary") {
    const { result, cost } = await call(credential, "/backlinks/summary/live", { target, internal_list_limit: 10 });
    const summary = (result as Record<string, unknown>[])[0] ?? null;
    return { provider: "dataforseo", report, target, rows: [], summary, cost: cost as number | null, notes };
  }

  if (report === "backlinks" || report === "broken") {
    const filters = report === "broken" ? [["is_broken", "=", true]] : undefined;
    const { result, cost } = await call(credential, "/backlinks/backlinks/live", {
      target,
      limit,
      mode: "as_is",
      ...(filters ? { filters } : {}),
      order_by: ["domain_from_rank,desc"],
    });
    const items = ((result as { items?: DfsBacklink[] }[])[0]?.items ?? []).map(rowFrom);
    if (report === "broken" && items.length > 0) {
      notes.push(
        `${items.length} link${items.length === 1 ? "" : "s"} point at a URL of yours that no longer resolves. Each one is equity you already earned, currently landing on nothing, and a redirect recovers it with no outreach at all.`,
      );
    }
    return { provider: "dataforseo", report, target, rows: items, summary: null, cost: cost as number | null, notes };
  }

  if (report === "referring_domains") {
    const { result, cost } = await call(credential, "/backlinks/referring_domains/live", {
      target, limit, order_by: ["rank,desc"],
    });
    const items = (result as { items?: Record<string, unknown>[] }[])[0]?.items ?? [];
    return {
      provider: "dataforseo", report, target,
      rows: items.map((item) => ({
        sourceUrl: `https://${String(item.domain ?? "")}`,
        sourceDomain: String(item.domain ?? ""),
        targetUrl: target,
        anchorText: "",
        followed: Number(item.backlinks ?? 0) > Number(item.backlinks_nofollow ?? 0),
        rel: "",
        firstSeen: (item.first_seen as string) ?? null,
        lastSeen: (item.last_seen as string) ?? null,
        domainScore: typeof item.rank === "number" ? Math.round(item.rank / 10) : null,
        sourceIndexable: null,
      })),
      summary: null, cost: cost as number | null, notes,
    };
  }

  if (report === "anchors") {
    const { result, cost } = await call(credential, "/backlinks/anchors/live", { target, limit: Math.min(limit, 1000) });
    const items = (result as { items?: Record<string, unknown>[] }[])[0]?.items ?? [];
    return {
      provider: "dataforseo", report, target, rows: [],
      summary: { anchors: items }, cost: cost as number | null,
      notes: ["Anchor distribution is where over-optimisation shows up, and it is invisible link by link."],
    };
  }

  if (report === "competitors") {
    /*
     * The gap analysis. Domains linking to rivals and not to us.
     *
     * This is the single highest-yield piece of link research there is, and
     * until the pricing was checked it looked like it needed a subscription.
     * At six cents a thousand rows it does not.
     */
    const rivals = (body.competitors ?? []).slice(0, 5).map((c) => c.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
    if (rivals.length === 0) return { provider: "dataforseo", report, target, rows: [], summary: null, cost: null, notes: ["Name at least one competitor."] };

    const ours = new Set<string>();
    let spend = 0;
    const mine = await call(credential, "/backlinks/referring_domains/live", { target, limit: 2000 });
    spend += (mine.cost as number) ?? 0;
    for (const item of ((mine.result as { items?: Record<string, unknown>[] }[])[0]?.items ?? [])) {
      ours.add(String(item.domain ?? "").toLowerCase());
    }

    const gap = new Map<string, { domain: string; score: number | null; linksTo: string[] }>();
    for (const rival of rivals) {
      const theirs = await call(credential, "/backlinks/referring_domains/live", { target: rival, limit: 1000, order_by: ["rank,desc"] });
      spend += (theirs.cost as number) ?? 0;
      for (const item of ((theirs.result as { items?: Record<string, unknown>[] }[])[0]?.items ?? [])) {
        const domain = String(item.domain ?? "").toLowerCase();
        if (!domain || ours.has(domain)) continue;
        const entry = gap.get(domain) ?? {
          domain,
          score: typeof item.rank === "number" ? Math.round(item.rank / 10) : null,
          linksTo: [],
        };
        if (!entry.linksTo.includes(rival)) entry.linksTo.push(rival);
        gap.set(domain, entry);
      }
    }

    // A domain linking to several rivals and not to us is the strongest
    // prospect in link building: the editorial appetite is proven twice over.
    const ranked = [...gap.values()]
      .sort((a, b) => b.linksTo.length - a.linksTo.length || (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 300);

    return {
      provider: "dataforseo", report, target, rows: [],
      summary: {
        gap: ranked,
        rivals,
        multiple: ranked.filter((r) => r.linksTo.length > 1).length,
      },
      cost: spend,
      notes: [
        `${ranked.length} domains link to at least one competitor and not to you.`,
        `${ranked.filter((r) => r.linksTo.length > 1).length} of them link to more than one, which is the strongest prospect list in link building: the editorial appetite is proven twice over.`,
      ],
    };
  }

  return { provider: "dataforseo", report, target, rows: [], summary: null, cost: null, notes: [`${report} is not a report this understands.`] };
}
