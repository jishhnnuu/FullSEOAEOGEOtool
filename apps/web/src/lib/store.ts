/**
 * The workspace.
 *
 * Everything a signed-in user has, held in their own browser: sites, runs,
 * findings, approvals, drafts, connections and settings. The Worker that
 * serves this app is stateless; it fetches and parses pages and relays one
 * model call, and it keeps none of it.
 *
 * That is a deliberate trade, and it is stated on screen rather than hidden.
 * What it buys: no account of ours holds your data, no key of ours is needed
 * to run an audit, and a deployment of this depends on no external service.
 * What it costs: the workspace lives in this browser, so it does not follow
 * you to another machine unless you export it. Export and import are first
 * class for exactly that reason. A self-hosted installation with the Python
 * API and Postgres behind it is the same product with server-side storage.
 */

import type { AuditResult, Finding, Fix } from "@/engine/types";
import type { Draft as WrittenDraft } from "@/engine/writer";
import type { RunDiff } from "@/engine/diff";

export const STORAGE_KEY = "seoos.workspace.v1";
const MAX_FULL_RUNS = 10;

/* ------------------------------------------------------------------ types */

export type Plan = "trial" | "starter" | "growth" | "scale";

export type Account = {
  email: string;
  name: string;
  company: string;
  plan: Plan;
  createdAt: string;
};

export type Autonomy = "observe" | "propose" | "assist" | "operate" | "autopilot";

export const AUTONOMY_LEVELS: { key: Autonomy; label: string; description: string }[] = [
  { key: "observe", label: "Observe", description: "Audit and report. Nothing is proposed for approval." },
  { key: "propose", label: "Propose", description: "Everything is queued for you, including one-line meta changes." },
  { key: "assist", label: "Assist", description: "Reversible, self-verifying changes auto-approve after a delay. Anything in your voice waits." },
  { key: "operate", label: "Operate", description: "Technical fixes and schema ship on their own. Content and outreach wait for you." },
  { key: "autopilot", label: "Autopilot", description: "Everything reversible ships. Site-wide and irreversible actions still need a person, always." },
];

export type IntegrationStatus = "connected" | "needs_setup" | "error";

export type Integration = {
  id: string;
  provider: string;
  label: string;
  status: IntegrationStatus;
  accountRef: string;
  /** Never a secret. Anything sensitive is held as a reference the user pastes again. */
  detail: string;
  capabilities: string[];
  connectedAt: string;
  lastError: string | null;
};

export type SiteRecord = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  businessType: "local" | "ecommerce" | "saas" | "publisher" | "services" | "b2b";
  industry: string;
  cms: string;
  hosting: string;
  locations: string[];
  competitors: string[];
  targetKeywords: string[];
  autonomy: Autonomy;
  goals: string[];
  maxPages: number;
  createdAt: string;
  integrations: Integration[];
  schedule: { mission: string; cadence: "daily" | "weekly" | "monthly"; enabled: boolean }[];
  lastRunId: string | null;
};

export type RunRecord = {
  id: string;
  siteId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "complete" | "failed" | "stopped";
  error: string | null;
  /** Compacted: see `compact`. */
  result: AuditResult | null;
  diff: RunDiff | null;
};

export type ApprovalKind = "fix" | "content" | "outreach" | "local" | "config";

export type ApprovalRecord = {
  id: string;
  siteId: string;
  runId: string | null;
  kind: ApprovalKind;
  title: string;
  summary: string;
  rationale: string;
  expectedImpact: string;
  risk: "low" | "medium" | "high" | "critical";
  reversible: boolean;
  status: "pending" | "approved" | "rejected" | "changes_requested" | "applied";
  findingId: string | null;
  contentId: string | null;
  fix: Fix | null;
  requestedBy: string;
  createdAt: string;
  decidedAt: string | null;
  note: string | null;
  autoApproveAt: string | null;
};

export type ContentRecord = {
  id: string;
  siteId: string;
  briefId: string;
  title: string;
  slug: string;
  format: string;
  targetKeyword: string;
  status: "brief" | "drafting" | "review" | "approved" | "rejected" | "scheduled" | "published";
  markdown: string | null;
  metaTitle: string;
  metaDescription: string;
  wordCount: number;
  gates: WrittenDraft["gates"];
  unverified: string[];
  generatedBy: "model" | "skeleton" | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  publishedUrl: string | null;
  reviewerNote: string | null;
};

export type ModelConfig = {
  provider: "anthropic" | "openai" | "google" | "openai-compatible";
  apiKey: string;
  model: string;
  baseUrl: string;
};

export type Workspace = {
  version: number;
  account: Account | null;
  sites: SiteRecord[];
  runs: RunRecord[];
  approvals: ApprovalRecord[];
  content: ContentRecord[];
  model: ModelConfig | null;
  activity: ActivityRecord[];
  /**
   * What the answer engines said, per site, over time.
   *
   * Kept apart from runs because it moves on its own schedule: a crawl is
   * about the site, and this is about the model's memory of the site, which
   * changes without anyone touching a page.
   */
  visibility: VisibilityHistory[];
};

/** One reading of how often the answer engines named the site. */
export type VisibilityPoint = { at: string; presence: number; citationRate: number; asked: number };

export type VisibilityHistory = {
  siteId: string;
  points: VisibilityPoint[];
  /** The full detail of the most recent run, including every answer. */
  latest: unknown | null;
};

export type ActivityRecord = {
  id: string;
  siteId: string | null;
  at: string;
  actor: string;
  action: string;
  detail: string;
};

const EMPTY: Workspace = {
  version: 1,
  account: null,
  sites: [],
  runs: [],
  approvals: [],
  content: [],
  model: null,
  activity: [],
  visibility: [],
};

/* ------------------------------------------------------------- persistence */

let cache: Workspace | null = null;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function load(): Workspace {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Workspace) } : { ...EMPTY };
  } catch {
    // A corrupt or hand-edited workspace should not brick every screen.
    cache = { ...EMPTY };
  }
  return cache;
}

export function save(next: Workspace) {
  cache = next;
  if (typeof window === "undefined") return;
  const write = (workspace: Workspace) =>
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  try {
    write(next);
  } catch {
    // Browser storage is a few megabytes. When a long history of crawls fills
    // it, the oldest full results are dropped rather than losing the write.
    const trimmed = { ...next, runs: dropOldestResults(next.runs) };
    try {
      write(trimmed);
      cache = trimmed;
    } catch {
      try {
        write({ ...trimmed, runs: trimmed.runs.map((r) => ({ ...r, result: null })) });
      } catch {
        /* out of room entirely; the session continues in memory */
      }
    }
  }
  emit();
}

function dropOldestResults(runs: RunRecord[]): RunRecord[] {
  const sorted = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return sorted.map((run, index) => (index < MAX_FULL_RUNS ? run : { ...run, result: null }));
}

export function update(mutate: (workspace: Workspace) => void) {
  const next = structuredCloneSafe(load());
  mutate(next);
  save(next);
}

function structuredCloneSafe<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

export function reset() {
  cache = { ...EMPTY };
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  emit();
}

export function exportWorkspace(): string {
  return JSON.stringify(load(), null, 2);
}

export function importWorkspace(json: string) {
  const parsed = JSON.parse(json) as Workspace;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sites)) {
    throw new Error("That file is not a workspace export.");
  }
  save({ ...EMPTY, ...parsed });
}

/* ------------------------------------------------------------ compaction */

/**
 * Shrink a result for storage.
 *
 * The body text of every crawled page is by far the largest thing a run
 * produces and nothing downstream reads it once the checks have run, so it is
 * truncated. Everything a screen or a diff needs is kept in full.
 */
export function compact(result: AuditResult): AuditResult {
  return {
    ...result,
    crawl: {
      ...result.crawl,
      files: {
        ...result.crawl.files,
        sitemapEntries: result.crawl.files.sitemapEntries.slice(0, 200),
        robotsTxt: result.crawl.files.robotsTxt?.slice(0, 8000) ?? null,
        llmsTxt: result.crawl.files.llmsTxt?.slice(0, 4000) ?? null,
      },
      pages: result.crawl.pages.map((page) => ({
        ...page,
        inlinks: page.inlinks.slice(0, 5),
        signals: page.signals
          ? {
              ...page.signals,
              // Emptied, not truncated: a stored crawl is several megabytes of
              // body copy otherwise, and browser storage is a few megabytes in
              // total. The diff needs the title, the description, the word
              // count and the hash; everything else was consumed by the checks
              // before this ran.
              text: "",
              paragraphs: [],
              links: [],
              images: [],
              headings: page.signals.headings.slice(0, 12),
              jsonLd: [],
              scripts: [],
              stylesheets: [],
              questionHeadings: page.signals.questionHeadings.slice(0, 6),
              h1: page.signals.h1.slice(0, 2),
              hreflang: page.signals.hreflang.slice(0, 6),
            }
          : null,
      })),
    },
  };
}

/* ---------------------------------------------------------------- helpers */

export function id(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

export function siteById(workspace: Workspace, siteId: string): SiteRecord | undefined {
  return workspace.sites.find((s) => s.id === siteId);
}

export function runsForSite(workspace: Workspace, siteId: string): RunRecord[] {
  return workspace.runs
    .filter((r) => r.siteId === siteId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function latestResult(workspace: Workspace, siteId: string): AuditResult | null {
  for (const run of runsForSite(workspace, siteId)) {
    if (run.status === "complete" && run.result) return run.result;
  }
  return null;
}

export function pendingApprovals(workspace: Workspace, siteId?: string): ApprovalRecord[] {
  return workspace.approvals.filter(
    (a) => a.status === "pending" && (!siteId || a.siteId === siteId),
  );
}

export function logActivity(workspace: Workspace, entry: Omit<ActivityRecord, "id" | "at">) {
  workspace.activity.unshift({ ...entry, id: id("act"), at: new Date().toISOString() });
  workspace.activity = workspace.activity.slice(0, 400);
}

/* ------------------------------------------------ approvals from findings */

/**
 * Risk, and therefore who has to say yes.
 *
 * This is the browser-side mirror of `agents/policy.py`. The rule that matters
 * is the one at the bottom: no autonomy level auto-approves a critical action,
 * and nothing site-wide ships without a person.
 */
export function riskOf(fix: Fix, finding: Finding): ApprovalRecord["risk"] {
  if (fix.kind === "file" && /robots\.txt/.test(fix.label)) return "critical";
  if (finding.affectedUrls.length > 20) return "high";
  if (fix.kind === "redirect" || fix.kind === "file") return "high";
  if (fix.kind === "copy") return "medium";
  return fix.risk;
}

const AUTONOMY_FLOOR: Record<ApprovalRecord["risk"], Autonomy[]> = {
  low: ["assist", "operate", "autopilot"],
  medium: ["operate", "autopilot"],
  high: ["autopilot"],
  critical: [],
};

export function autoApproves(risk: ApprovalRecord["risk"], autonomy: Autonomy, kind: ApprovalKind): boolean {
  // Anything published in the client's voice or sent from their domain always
  // waits for a person, whatever the autonomy level says.
  if (kind === "content" || kind === "outreach") return false;
  return AUTONOMY_FLOOR[risk].includes(autonomy);
}

export function approvalsFromResult(result: AuditResult, site: SiteRecord): ApprovalRecord[] {
  const now = new Date();
  const out: ApprovalRecord[] = [];

  for (const finding of result.findings) {
    if (!finding.fix) continue;
    const risk = riskOf(finding.fix, finding);
    const auto = autoApproves(risk, site.autonomy, "fix");
    out.push({
      id: id("apr"),
      siteId: site.id,
      runId: result.runId,
      kind: "fix",
      title: approvalTitle(finding),
      summary: finding.detail || finding.recommendation,
      rationale: finding.why,
      expectedImpact: impactSentence(finding),
      risk,
      reversible: finding.fix.reversible,
      status: "pending",
      findingId: finding.id,
      contentId: null,
      fix: finding.fix,
      requestedBy: agentFor(finding.category),
      createdAt: now.toISOString(),
      decidedAt: null,
      note: null,
      autoApproveAt: auto ? new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString() : null,
    });
  }

  return out.sort((a, b) => riskOrder(a.risk) - riskOrder(b.risk));
}

/** "Meta description on /pricing" reads better in a queue than the check name. */
function approvalTitle(finding: Finding): string {
  const label = finding.fix?.label ?? finding.title;
  if (finding.url) {
    let path = finding.url;
    try {
      const parsed = new URL(finding.url);
      path = `${parsed.pathname}${parsed.search}` || "/";
    } catch {
      /* keep the raw string */
    }
    return `${label} on ${path}`;
  }
  if (finding.affectedUrls.length > 1) return `${label} across ${finding.affectedUrls.length} pages`;
  return `${label}, site wide`;
}

function riskOrder(risk: ApprovalRecord["risk"]): number {
  return ["low", "medium", "high", "critical"].indexOf(risk);
}

function impactSentence(finding: Finding): string {
  const scope = finding.affectedUrls.length > 1 ? `${finding.affectedUrls.length} pages` : "this page";
  return `${finding.severity === "critical" || finding.severity === "high" ? "Material" : "Incremental"} effect on ${scope}. Priority ${finding.priority} of 100, from impact ${finding.impact} and effort ${finding.effort}.`;
}

export function agentFor(category: string): string {
  const map: Record<string, string> = {
    technical: "technical-auditor",
    content: "content-editor",
    performance: "performance-engineer",
    schema: "schema-engineer",
    aeo: "citation-engineer",
    local: "local-manager",
    offpage: "link-prospector",
    international: "international-lead",
    ecommerce: "ecommerce-specialist",
    ux: "conversion-analyst",
    compliance: "compliance-reviewer",
    analytics: "measurement-lead",
  };
  return map[category] ?? "strategist";
}
