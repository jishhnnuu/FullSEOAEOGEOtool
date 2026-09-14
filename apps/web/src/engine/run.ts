/**
 * The run: crawl, check, score, plan, and generate the work.
 *
 * This is the equivalent of a mission in the Python engine. The steps are
 * real, they are reported as they happen, and a step that cannot run says so
 * and names what would unblock it rather than failing the run.
 */

import { materialise, runChecks, type Draft } from "./checks";
import { crawlSite, type Progress } from "./crawl";
import { buildContext, generateFix } from "./fixes";
import { scoreAll } from "./score";
import { assessAeo, assessLocal, briefFor, buildInventory, deriveKeywords, findGaps, findProspects } from "./strategy";
import type { AuditResult, CrawlOptions, CrawlReport, Finding, RunStep } from "./types";

export const RESULT_VERSION = 3;

export type RunContext = {
  siteId: string;
  runId: string;
  /** Providers the tenant has actually connected, by key. */
  connected: string[];
};

const STEPS: Omit<RunStep, "status" | "detail">[] = [
  { key: "discover", label: "Read robots.txt, sitemaps and the homepage", agent: "crawl-operator" },
  { key: "crawl", label: "Crawl the site", agent: "crawl-operator" },
  { key: "technical", label: "Technical, indexability and canonical checks", agent: "technical-auditor" },
  { key: "content", label: "On-page, duplication and thin content", agent: "content-auditor" },
  { key: "schema", label: "Structured data validation", agent: "schema-engineer" },
  { key: "aeo", label: "AI answer readiness", agent: "ai-visibility-analyst" },
  { key: "local", label: "Local and entity signals", agent: "local-manager" },
  { key: "offpage", label: "Authority and link prospecting", agent: "link-prospector" },
  { key: "keywords", label: "Keyword and topic model from the site's own content", agent: "keyword-strategist" },
  { key: "gaps", label: "Content gaps and the publishing plan", agent: "content-strategist" },
  { key: "fixes", label: "Generate the fixes", agent: "fix-engineer" },
  { key: "score", label: "Score and prioritise", agent: "strategist" },
];

export type RunProgress = Progress & { steps: RunStep[] };

export async function runAudit(
  options: CrawlOptions,
  context: RunContext,
  onProgress: (progress: RunProgress) => void,
  signal?: AbortSignal,
): Promise<AuditResult> {
  const startedAt = new Date().toISOString();
  const steps: RunStep[] = STEPS.map((s) => ({ ...s, status: "pending", detail: "" }));

  const mark = (key: string, status: RunStep["status"], detail: string, blockedBy?: string) => {
    const step = steps.find((s) => s.key === key);
    if (!step) return;
    if (status === "running" && !step.startedAt) step.startedAt = new Date().toISOString();
    if (status !== "running" && status !== "pending") step.finishedAt = new Date().toISOString();
    step.status = status;
    step.detail = detail;
    if (blockedBy) step.blockedBy = blockedBy;
  };

  const report = (progress: Progress) => onProgress({ ...progress, steps: [...steps] });

  /* ---- crawl ---- */
  mark("discover", "running", "");
  let crawl: CrawlReport;
  try {
    crawl = await crawlSite(options, (progress) => {
      if (progress.phase === "crawling") {
        mark("discover", "done", "robots.txt, sitemaps and the homepage read");
        mark("crawl", "running", progress.message);
      }
      report(progress);
    }, signal);
  } catch (error) {
    mark("discover", "blocked", error instanceof Error ? error.message : "Could not reach the site");
    throw error;
  }
  mark("discover", "done", `${crawl.files.sitemapUrls.length} sitemaps, robots.txt ${crawl.files.robotsStatus === 200 ? "found" : "missing"}`);
  mark("crawl", "done", `${crawl.fetched} pages fetched, ${crawl.discovered} URLs discovered`);

  const analysing = (message: string) =>
    report({ phase: "analysing", fetched: crawl.pages.length, queued: 0, target: crawl.pages.length, current: null, message });

  /* ---- checks ---- */
  analysing("Running the check catalogue");
  const drafts: Draft[] = runChecks(crawl, options);

  // Checks that depend on a connection rather than on the crawl.
  if (!context.connected.includes("gsc")) {
    drafts.push({ code: "gsc_not_connected", url: null, detail: "No Search Console property is connected, so query data, indexing status and the real backlink sample are all unavailable.", affectedUrls: [crawl.baseUrl] });
  }
  if (!context.connected.includes("ga4")) {
    drafts.push({ code: "ga4_not_connected", url: null, detail: "No analytics property is connected, so results cannot be attributed to the work.", affectedUrls: [crawl.baseUrl] });
  }
  if (!context.connected.includes("gbp") && (options.businessType === "local" || (options.locations?.length ?? 0) > 0)) {
    drafts.push({ code: "gbp_incomplete", url: null, detail: "No Business Profile is connected, so posts, review replies and the geo grid cannot run.", affectedUrls: [crawl.baseUrl] });
  }

  const now = new Date().toISOString();
  const findings: Finding[] = materialise(drafts, now);

  const countFor = (categories: string[]) => findings.filter((f) => categories.includes(f.category)).length;
  mark("technical", "done", `${countFor(["technical"])} findings across indexability, canonicals and crawl`);
  mark("content", "done", `${countFor(["content"])} findings across titles, headings, duplication and depth of copy`);
  mark("schema", "done", `${countFor(["schema"])} structured data findings`);

  /* ---- strategy ---- */
  analysing("Building the topic model");
  const ctx = buildContext(crawl, options);
  const keywords = deriveKeywords(crawl, options, ctx.brand);
  mark("keywords", "done", `${keywords.length} terms modelled from ${crawl.fetched} pages`);

  analysing("Assessing AI answer readiness");
  const aeo = assessAeo(crawl, findings, ctx.brand);
  mark("aeo", "done", `${aeo.crawlerAccess.filter((a) => !a.allowed).length} AI crawlers blocked, ${aeo.citableAssets} citable pages`);

  const local = assessLocal(crawl, options, ctx.brand);
  mark(
    "local",
    local.applicable ? "done" : "skipped",
    local.applicable
      ? `${local.recommendations.length} local actions, ${local.locationPages.length} location pages found`
      : "Not a local business, so the local checks were skipped",
  );

  analysing("Finding link prospects");
  const prospects = findProspects(crawl, options, ctx.brand);
  mark(
    "offpage",
    context.connected.some((c) => ["gsc", "dataforseo", "ahrefs", "majestic"].includes(c)) ? "done" : "blocked",
    `${prospects.length} prospects from the site's own outbound links and the entity records it is missing`,
    context.connected.some((c) => ["gsc", "dataforseo", "ahrefs", "majestic"].includes(c))
      ? undefined
      : "Connect Search Console or a link index to work from the real referring domain set",
  );

  analysing("Finding the content gaps");
  const gaps = findGaps(crawl, keywords, options, ctx.brand);
  const briefs = gaps.slice(0, 8).map((gap) => briefFor(gap, crawl, ctx.brand, options));
  mark("gaps", "done", `${gaps.length} gaps, ${briefs.length} briefs written`);

  /* ---- fixes ---- */
  analysing("Generating the fixes");
  let generated = 0;
  for (const finding of findings) {
    if (!finding.autoFixable) continue;
    try {
      finding.fix = generateFix(finding, ctx);
      if (finding.fix) generated++;
    } catch {
      // A fix generator failing must not take the audit down with it.
      finding.fix = null;
    }
  }
  mark("fixes", "done", `${generated} fixes generated and ready to review`);

  /* ---- scores ---- */
  analysing("Scoring");
  const scores = scoreAll(findings, Math.max(crawl.fetched, 1));
  const inventory = buildInventory(crawl, findings);
  mark("score", "done", `Health ${Math.round(scores.health.score)}, AI readiness ${Math.round(scores.aeo.score)}`);

  const quickWins = findings
    .filter((f) => f.effort <= 0.3 && f.impact >= 0.3 && f.status === "open")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 12);

  const finishedAt = new Date().toISOString();
  report({ phase: "done", fetched: crawl.fetched, queued: 0, target: crawl.fetched, current: null, message: "Run complete" });

  return {
    version: RESULT_VERSION,
    siteId: context.siteId,
    runId: context.runId,
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
    crawl,
    findings,
    scores,
    keywords,
    gaps,
    briefs,
    prospects,
    aeo,
    local,
    inventory,
    steps,
    quickWins,
    estimatedAgencyHours: estimateHours(findings, briefs.length),
    notes: crawl.notes,
  };
}

/**
 * Hours an agency would bill for the same output.
 *
 * Effort is already on the finding, and a brief is roughly half a day of a
 * strategist's time. The number is an estimate and is labelled as one, but it
 * is derived from the actual work produced rather than picked to look good.
 */
function estimateHours(findings: Finding[], briefCount: number): number {
  const audit = 6;
  const perFinding = findings.reduce((sum, f) => sum + f.effort * 1.5 * Math.min(Math.max(f.affectedUrls.length, 1), 6), 0);
  return Math.round(audit + perFinding + briefCount * 3.5);
}
