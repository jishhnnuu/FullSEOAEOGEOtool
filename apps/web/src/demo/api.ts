/**
 * The demo API.
 *
 * Cloudflare Workers cannot host the Python service, so the public demo needs
 * something to answer `/api/v1/*`. Rather than write a second implementation
 * and let the two drift, `scripts/record_demo.py` drives the real FastAPI
 * application over a real crawl and writes down what it answered. This file
 * replays those recordings and applies the few mutations a walkthrough needs.
 *
 * Two rules keep it honest:
 *
 *  - Nothing here invents a payload. Every read is a slice of the recording,
 *    so the demo cannot show a shape the API does not produce.
 *  - Anything that would need a worker, a credential or a real network call
 *    (running a mission, connecting an integration, adding a site) refuses
 *    with an explanation rather than pretending to succeed.
 *
 * Mutations that a walkthrough does need (deciding an approval, editing a
 * draft, changing autonomy) are kept in a cookie, so each visitor gets their
 * own state and nobody's clicking changes what the next visitor sees.
 */

import snapshot from "./snapshot.json";

export const DEMO_COOKIE = "seoos_demo";
const DEMO_TOKEN = "demo-session-token";

type Json = Record<string, any>;

/* ------------------------------------------------------------------ state */

export type DemoState = {
  /** approval id -> the decision taken */
  approvals?: Record<string, "approved" | "rejected">;
  /** content id -> status it was moved to */
  content?: Record<string, string>;
  /** fields the settings screen can change on the site */
  site?: Json;
  /** mission key -> enabled */
  schedules?: Record<string, boolean>;
  /** notification ids marked read */
  read?: string[];
};

export function readState(cookieHeader: string | null): DemoState {
  if (!cookieHeader) return {};
  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEMO_COOKIE}=`));
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(raw.slice(DEMO_COOKIE.length + 1))) as DemoState;
  } catch {
    // A truncated or hand-edited cookie should reset the walkthrough, not
    // break every screen behind it.
    return {};
  }
}

function cookieFor(state: DemoState): string {
  const value = encodeURIComponent(JSON.stringify(state));
  return `${DEMO_COOKIE}=${value}; Path=/; Max-Age=604800; SameSite=Lax`;
}

/* ------------------------------------------------------------- responses */

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init.headers ?? {}) },
  });
}

function withState(body: unknown, state: DemoState, init: ResponseInit = {}): Response {
  return json(body, { ...init, headers: { "set-cookie": cookieFor(state), ...(init.headers ?? {}) } });
}

function notFound(message = "Not found"): Response {
  return json({ code: "not_found", message }, { status: 404 });
}

/** Refuse the things a recording genuinely cannot stand in for. */
function unavailable(message: string): Response {
  return json({ code: "demo_unavailable", message }, { status: 503 });
}

/* --------------------------------------------------------------- helpers */

const SITE_ID: string = snapshot.meta.site_id;
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

function site(state: DemoState): Json {
  return { ...(snapshot.site as Json), ...(state.site ?? {}) };
}

type Decision = "approved" | "rejected";

function decided(state: DemoState): Record<string, Decision> {
  return state.approvals ?? {};
}

function pendingApprovals(state: DemoState): Json[] {
  const seen = decided(state);
  return Object.values(snapshot.approvals as Record<string, Json>).filter((a) => !seen[a.id]);
}

/** Rebuild the batches the way the API groups them, minus anything decided. */
function groupedApprovals(state: DemoState): Json {
  const pending = pendingApprovals(state);
  const order = ["low", "medium", "high", "critical"];
  const batches = new Map<string, Json>();

  for (const approval of pending) {
    const key = approval.batch_key ?? approval.type;
    let batch = batches.get(key);
    if (!batch) {
      batch = {
        key,
        type: approval.type,
        risk: approval.risk,
        count: 0,
        reversible: true,
        items: [],
        can_bulk_approve: approval.risk === "low" || approval.risk === "medium",
      };
      batches.set(key, batch);
    }
    batch.count += 1;
    batch.reversible = batch.reversible && approval.reversible;
    if (order.indexOf(approval.risk) > order.indexOf(batch.risk)) {
      batch.risk = approval.risk;
      batch.can_bulk_approve = approval.risk === "low" || approval.risk === "medium";
    }
    if (batch.items.length < 25) batch.items.push(approval);
  }

  const ordered = [...batches.values()].sort(
    (a, b) => order.indexOf(a.risk) - order.indexOf(b.risk) || b.count - a.count,
  );
  return { batches: ordered, total_pending: pending.length };
}

function reviewQueue(state: DemoState): Json {
  const moved = state.content ?? {};
  const base = snapshot.content_queue as Json;
  const items = (base.items ?? []).filter((item: Json) => (moved[item.id] ?? "review") === "review");
  return { ...base, count: items.length, items };
}

function dashboard(state: DemoState): Json {
  const base = snapshot.dashboard as Json;
  const moved = state.content ?? {};
  const pipeline: Record<string, number> = { ...(base.content_pipeline ?? {}) };

  // Moving a draft out of review has to show up in the pipeline counts, or
  // the dashboard contradicts the screen the reviewer just used.
  for (const [id, status] of Object.entries(moved)) {
    const from = (snapshot.content as Record<string, Json>)[id]?.status ?? "review";
    if (from === status) continue;
    pipeline[from] = Math.max(0, (pipeline[from] ?? 0) - 1);
    pipeline[status] = (pipeline[status] ?? 0) + 1;
  }

  return {
    ...base,
    site: site(state),
    content_pipeline: pipeline,
    pending_approvals: pendingApprovals(state).length,
  };
}

function findings(params: URLSearchParams): Json[] {
  const severity = params.get("severity");
  const category = params.get("category");
  const limit = Number(params.get("limit") ?? 200);
  let rows = snapshot.findings as Json[];
  if (severity) rows = rows.filter((f) => f.severity === severity);
  if (category) rows = rows.filter((f) => f.category === category);
  return rows.slice(0, Number.isFinite(limit) ? limit : 200);
}

function pages(params: URLSearchParams): Json {
  const order = params.get("order") ?? "opportunity";
  const limit = Number(params.get("limit") ?? 100);
  const rows = [...((snapshot.pages as Json).pages ?? [])];

  const key = (row: Json): number => {
    switch (order) {
      case "aeo":
        return row.aeo_score ?? -1;
      case "clicks":
        return row.clicks_28d ?? -1;
      case "impressions":
        return row.impressions_28d ?? -1;
      case "words":
        return row.word_count ?? -1;
      case "depth":
        // Shallow first: the only ordering where a small number wins.
        return -(row.depth ?? 99);
      default:
        return row.opportunity ?? row.opportunity_score ?? -1;
    }
  };
  rows.sort((a, b) => key(b) - key(a));
  return { pages: rows.slice(0, Number.isFinite(limit) ? limit : 100) };
}

function notifications(state: DemoState): Json[] {
  const read = new Set(state.read ?? []);
  return (snapshot.notifications as Json[]).map((n) =>
    read.has(n.id) ? { ...n, read_at: new Date().toISOString() } : n,
  );
}

function schedules(state: DemoState): Json[] {
  const toggles = state.schedules ?? {};
  return (snapshot.schedules as Json[]).map((s) =>
    s.mission_key in toggles ? { ...s, enabled: toggles[s.mission_key] } : s,
  );
}

/* ----------------------------------------------------------------- router */

export type DemoRequest = {
  method: string;
  segments: string[];
  params: URLSearchParams;
  cookie: string | null;
  body: () => Promise<any>;
};

/** The banner the dashboard shows, and the reason it exists. */
export function demoInfo(): Json {
  return {
    demo: true,
    generated_at: snapshot.meta.generated_at,
    site_id: SITE_ID,
    domain: (snapshot.site as Json).domain,
    login: snapshot.meta.login,
    measured: {
      pages: ((snapshot.pages as Json).pages ?? []).length,
      findings: (snapshot.dashboard as Json).findings?.total_open ?? null,
      health: (snapshot.site as Json).health_score,
      aeo: (snapshot.site as Json).aeo_score,
    },
    note:
      "Pages, findings and scores come from a real crawl of this site. Drafts, " +
      "approvals and the traffic series are sample records, because writing and " +
      "measuring both need credentials the public demo does not hold.",
  };
}

export async function handle(request: DemoRequest): Promise<Response> {
  const { method, segments, params, cookie } = request;
  const state = readState(cookie);

  // Every path the dashboard uses is /api/v1/...
  if (segments[0] !== "v1") return notFound();
  const p = segments.slice(1);
  const at = (i: number) => p[i] ?? "";

  /* --- the demo's own endpoint, absent outside demo mode ---------------- */
  if (at(0) === "demo" && method === "GET") return json(demoInfo());

  /* --- auth ------------------------------------------------------------ */
  if (at(0) === "auth") {
    if (at(1) === "login" && method === "POST") {
      // Any credentials are accepted: there is one tenant and it is public.
      return json({
        access_token: DEMO_TOKEN,
        token_type: "bearer",
        expires_in: 86400,
        ...(snapshot.auth as Json),
      });
    }
    if (at(1) === "signup" && method === "POST") {
      return json(
        {
          code: "demo_unavailable",
          message:
            "The demo runs on one shared tenant, so it cannot create accounts. " +
            "Sign in with any email and password to look around.",
        },
        { status: 503 },
      );
    }
    if (at(1) === "me" && method === "GET") return json(snapshot.me);
  }

  /* --- sites ----------------------------------------------------------- */
  if (at(0) === "sites") {
    if (!at(1)) {
      if (method === "GET") return json([site(state)]);
      if (method === "POST") {
        return unavailable(
          "Adding a site starts a real crawl, which the demo cannot run. " +
            "The demo is loaded with one site that was crawled for real.",
        );
      }
    }

    const rest = p.slice(2);
    if (at(1) && rest.length === 0) {
      if (method === "GET") return json(site(state));
      if (method === "PATCH") {
        const body = (await request.body()) ?? {};
        const next = { ...state, site: { ...(state.site ?? {}), ...body } };
        return withState(site(next), next);
      }
      if (method === "DELETE") return unavailable("The demo site cannot be removed.");
    }

    switch (rest[0]) {
      case "dashboard":
        return json(dashboard(state));
      case "findings":
        return json(findings(params));
      case "pages":
        return json(pages(params));
      case "runs":
        return json((snapshot.runs as Json[]).slice(0, Number(params.get("limit") ?? 20)));
      case "schedules":
        if (method === "PUT") {
          const body = (await request.body()) ?? {};
          const next = {
            ...state,
            schedules: { ...(state.schedules ?? {}), [body.mission_key]: !!body.enabled },
          };
          return withState(schedules(next), next);
        }
        return json(schedules(state));
      case "reports":
        if (rest[1] === "live") {
          return snapshot.report_live ? json(snapshot.report_live) : notFound("No audit yet.");
        }
        return json(snapshot.reports ?? []);
      case "activate":
        return json(site(state));
      case "run":
        return unavailable(
          "Starting a mission needs the worker and a model provider. The demo " +
            "shows the traces of runs that already happened instead.",
        );
      case "brand":
        if (rest[1] === "profile") {
          if (method === "PATCH") {
            return unavailable("The demo's brand profile is read only.");
          }
          return json((snapshot.brand as Json).profile);
        }
        if (rest[1] === "assets") {
          if (method === "POST") {
            return unavailable(
              "Uploading a brand asset runs extraction over the file, which the demo does not do.",
            );
          }
          return json((snapshot.brand as Json).assets ?? []);
        }
        if (rest[1] === "facts") {
          if (method === "POST" || method === "DELETE") {
            return unavailable("The demo's brand facts are read only.");
          }
          return json((snapshot.brand as Json).facts);
        }
        break;
    }
  }

  /* --- runs ------------------------------------------------------------ */
  if (at(0) === "runs" && at(1) && method === "GET") {
    const trace = (snapshot.traces as Record<string, Json>)[at(1)];
    return trace ? json(trace) : notFound("No such run");
  }

  /* --- approvals ------------------------------------------------------- */
  if (at(0) === "approvals") {
    if (at(1) === "grouped" && method === "GET") return json(groupedApprovals(state));

    if (at(1) === "bulk" && method === "POST") {
      const body = (await request.body()) ?? {};
      const decision: Decision = body.decision === "rejected" ? "rejected" : "approved";
      const ids: string[] = Array.isArray(body.approval_ids) ? body.approval_ids.slice(0, 200) : [];
      const next: DemoState = { ...state, approvals: { ...decided(state) } };
      const results: Record<string, string> = {};
      const skipped: Json[] = [];

      for (const id of ids) {
        const approval = (snapshot.approvals as Record<string, Json>)[id];
        if (!approval) {
          results[id] = "not_found";
          continue;
        }
        // The real endpoint refuses to bulk-approve high and critical risk,
        // and that refusal is worth seeing in the demo rather than hiding.
        if (decision === "approved" && (approval.risk === "high" || approval.risk === "critical")) {
          skipped.push({
            id,
            title: approval.title,
            reason: `${approval.risk} risk items must be approved individually`,
          });
          continue;
        }
        next.approvals![id] = decision;
        results[id] = "ok";
      }

      return withState(
        { decided: Object.values(results).filter((v) => v === "ok").length, results, skipped },
        next,
      );
    }

    if (at(1) && at(2) === "decide" && method === "POST") {
      const body = (await request.body()) ?? {};
      // The API's vocabulary: approved, rejected, changes_requested.
      const decision: Decision = body.decision === "approved" ? "approved" : "rejected";
      const approval = (snapshot.approvals as Record<string, Json>)[at(1)];
      if (!approval) return notFound("No such approval");
      const next: DemoState = { ...state, approvals: { ...decided(state), [at(1)]: decision } };
      return withState(
        {
          ...approval,
          status: body.decision ?? decision,
          decided_at: new Date().toISOString(),
          decision_note: body.note ?? null,
        },
        next,
      );
    }

    if (at(1) && method === "GET") {
      const approval = (snapshot.approvals as Record<string, Json>)[at(1)];
      if (!approval) return notFound("No such approval");
      const decision = decided(state)[at(1)];
      return json(decision ? { ...approval, status: decision } : approval);
    }
  }

  /* --- content --------------------------------------------------------- */
  if (at(0) === "content") {
    if (at(1) === "review-queue" && method === "GET") return json(reviewQueue(state));

    const item = (snapshot.content as Record<string, Json>)[at(1)];
    if (at(1) && at(2) === "review" && method === "POST") {
      if (!item) return notFound("No such draft");
      const body = (await request.body()) ?? {};
      const status =
        ({ approve: "approved", reject: "rejected", request_changes: "changes_requested" } as const)[
          body.decision as "approve" | "reject" | "request_changes"
        ] ?? "approved";
      const already = (state.content ?? {})[at(1)];
      if (already && already !== "review") {
        return json(
          { code: "conflict", message: `'${item.title}' is at status '${already}', not awaiting review` },
          { status: 409 },
        );
      }
      const next: DemoState = { ...state, content: { ...(state.content ?? {}), [at(1)]: status } };
      return withState({ ...item, status, reviewer_notes: body.note ?? null }, next);
    }
    if (at(1) && at(2) === "versions" && method === "GET") return json([]);
    if (at(1) && !at(2)) {
      if (!item) return notFound("No such draft");
      const status = (state.content ?? {})[at(1)] ?? item.status;
      if (method === "GET") return json({ ...item, status });
      if (method === "PATCH") {
        const body = (await request.body()) ?? {};
        return json({ ...item, ...body, status });
      }
    }
  }

  /* --- integrations ---------------------------------------------------- */
  if (at(0) === "integrations") {
    if (at(1) === "catalogue" && method === "GET") return json(snapshot.catalogue);
    if (at(1) === "connect" && method === "POST") {
      return unavailable(
        "Connecting an account stores a real credential against a real tenant. " +
          "Run the platform yourself to do that; the demo holds no credentials.",
      );
    }
    if (at(1) && at(2) === "verify" && method === "POST") {
      return unavailable("Nothing is connected in the demo, so there is nothing to verify.");
    }
    if (!at(1) && method === "GET") return json(snapshot.integrations ?? []);
    if (at(1) && method === "DELETE") return notFound("Nothing is connected in the demo.");
  }

  /* --- everything else ------------------------------------------------- */
  if (at(0) === "agents" && method === "GET") return json(snapshot.agents);
  if (at(0) === "missions" && method === "GET") return json(snapshot.missions ?? []);

  if (at(0) === "notifications") {
    if (method === "GET") return json(notifications(state));
    if (at(1) && at(2) === "read" && method === "POST") {
      const next: DemoState = { ...state, read: [...new Set([...(state.read ?? []), at(1)])] };
      return withState({ ok: true }, next);
    }
  }

  if (at(0) === "reports" && at(1)) {
    if (at(2) === "share" && method === "POST") {
      return unavailable("A shared report link needs somewhere to serve it from.");
    }
    if (at(2) === "share" && method === "DELETE") return json({ ok: true });
  }

  return notFound(`The demo does not serve ${method} /api/${segments.join("/")}`);
}
