/**
 * The API client.
 *
 * Deliberately small: fetch, a token in localStorage, and typed shapes for
 * what the dashboard actually reads. A generated client would be larger
 * than the surface it covers.
 */

const TOKEN_KEY = "seoos.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // A browser with storage disabled should still render the login screen
    // rather than crashing on the first read.
    return null;
  }
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable; the session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401) {
    setToken(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError("Your session expired", 401);
  }

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body.message ?? body.detail ?? message;
      code = body.code;
      if (Array.isArray(body.detail)) {
        message = body.detail.map((d: any) => `${d.loc?.at(-1)}: ${d.msg}`).join("; ");
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: async <T,>(path: string, form: FormData): Promise<T> => {
    const token = getToken();
    const res = await fetch(`/api/v1${path}`, {
      method: "POST",
      body: form,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.detail ?? body.message ?? "Upload failed", res.status);
    }
    return res.json();
  },
};

export const fetcher = <T,>(path: string) => api.get<T>(path);

/* ---------------------------------------------------------------- types */

export type Site = {
  id: string;
  name: string;
  domain: string;
  base_url: string;
  business_type: string;
  industry: string | null;
  cms_platform: string;
  autonomy: string;
  status: string;
  health_score: number | null;
  aeo_score: number | null;
  authority_score: number | null;
  last_crawl_at: string | null;
  goals: Record<string, unknown>;
};

export type Dashboard = {
  site: Site;
  scores: { health: number | null; aeo: number | null; authority: number | null };
  findings: {
    by_severity: Record<string, number>;
    by_category: Record<string, number>;
    total_open: number;
  };
  content_pipeline: Record<string, number>;
  pending_approvals: number;
  integrations: string[];
  capabilities: string[];
  missing_capabilities: Record<string, string[]>;
  kpis: Record<string, { latest: number; change_pct: number | null; points: number }>;
  ai_visibility: Record<string, any>;
  recent_runs: MissionRun[];
  next_scheduled: string | null;
};

export type Finding = {
  id: string;
  code: string;
  category: string;
  severity: string;
  title: string;
  detail: string | null;
  recommendation: string | null;
  url: string | null;
  affected_count: number;
  priority_score: number | null;
  auto_fixable: boolean;
  status: string;
  evidence: Record<string, unknown>;
};

export type MissionRun = {
  id: string;
  mission_key: string;
  title: string | null;
  status: string;
  trigger: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  cost_usd: number;
  summary: string | null;
  outcomes: Record<string, any>;
  escalations: any[];
  steps_total: number;
  steps_done: number;
  current_step: string | null;
};

export type Approval = {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  rationale: string | null;
  expected_impact: string | null;
  risk: string;
  reversible: boolean;
  status: string;
  preview: Record<string, unknown> | null;
  diff: string | null;
  requested_by_agent: string | null;
  auto_approve_at: string | null;
  created_at: string;
  site_id: string | null;
};

export type ApprovalBatch = {
  key: string;
  type: string;
  risk: string;
  count: number;
  reversible: boolean;
  can_bulk_approve: boolean;
  items: Approval[];
};

export type ReviewItem = {
  id: string;
  title: string;
  type: string;
  primary_keyword: string | null;
  word_count: number | null;
  site_id: string;
  scores: Record<string, number | null>;
  all_gates_passed: boolean;
  unverified_claims: string[];
  meta_title: string | null;
  meta_description: string | null;
  waiting_since: string;
};

export type ContentDetail = {
  id: string;
  title: string;
  type: string;
  status: string;
  slug: string | null;
  meta_title: string | null;
  meta_description: string | null;
  primary_keyword: string | null;
  body_markdown: string | null;
  brief: Record<string, any> | null;
  outline: any[] | null;
  word_count: number | null;
  gate_results: Record<string, any>;
  internal_links: any[];
  external_sources: any[];
  unverified_claims: string[];
  published_url: string | null;
};

export type Report = {
  id: string;
  kind: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  narrative_md: string | null;
  data: Record<string, any>;
  share_token: string | null;
  updated_at: string;
};

export type ProviderSpec = {
  provider: string;
  display_name: string;
  category: string;
  auth_kind: string;
  summary: string;
  unlocks: string;
  optional: boolean;
  docs_url: string;
  setup_notes: string;
  credential_fields: FieldSpec[];
  config_fields: FieldSpec[];
};

export type FieldSpec = {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  help: string;
  placeholder: string;
  options: string[] | null;
  secret: boolean;
};

export type BrandAssetOut = {
  id: string;
  kind: string;
  filename: string | null;
  title: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  summary: string | null;
  error: string | null;
  created_at: string;
};

export type Integration = {
  id: string;
  provider: string;
  display_name: string | null;
  account_ref: string;
  status: string;
  capabilities: string[];
  last_verified_at: string | null;
  last_error: string | null;
  site_id: string | null;
};

export type AgentRoster = {
  total: number;
  by_department: Record<
    string,
    { key: string; name: string; role: string; summary: string; reports_to: string | null; delegates_to: string[]; tools: number }[]
  >;
  org_chart: Record<string, string[]>;
};
