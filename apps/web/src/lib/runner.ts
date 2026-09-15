/**
 * Starting a run from the dashboard.
 *
 * Wraps the engine so every screen that can start work does it the same way:
 * create the run record, stream progress into it, and on completion write the
 * result, the diff against the previous run and the approvals it produced.
 */

import { diffRuns } from "@/engine/diff";
import { pushWorkspace, recordRun } from "./sync";
import { runAudit, type RunProgress } from "@/engine/run";
import type { AuditResult, CrawlOptions } from "@/engine/types";

import {
  approvalsFromResult,
  compact,
  id,
  latestResult,
  load,
  logActivity,
  update,
  type RunRecord,
  type SiteRecord,
} from "./store";

export function optionsFor(site: SiteRecord): CrawlOptions {
  return {
    url: site.baseUrl,
    maxPages: site.maxPages,
    maxDepth: 4,
    respectRobots: true,
    businessType: site.businessType,
    industry: site.industry || undefined,
    locations: site.locations,
    competitors: site.competitors,
    targetKeywords: site.targetKeywords,
    brandName: site.name,
  };
}

export type RunHandle = {
  runId: string;
  promise: Promise<AuditResult>;
  stop: () => void;
};

export function startRun(
  site: SiteRecord,
  onProgress: (progress: RunProgress) => void,
): RunHandle {
  const runId = id("run");
  const controller = new AbortController();
  const startedAt = new Date().toISOString();

  update((workspace) => {
    workspace.runs.unshift({
      id: runId,
      siteId: site.id,
      startedAt,
      finishedAt: null,
      status: "running",
      error: null,
      result: null,
      diff: null,
    } satisfies RunRecord);
    logActivity(workspace, {
      siteId: site.id,
      actor: "scheduler",
      action: "Run started",
      detail: `Crawling ${site.domain}, up to ${site.maxPages} pages`,
    });
  });

  const previous = latestResult(load(), site.id);

  const promise = runAudit(
    optionsFor(site),
    { siteId: site.id, runId, connected: site.integrations.filter((i) => i.status === "connected").map((i) => i.provider) },
    onProgress,
    controller.signal,
  )
    .then((result) => {
      const diff = diffRuns(result, previous);
      const approvals = approvalsFromResult(result, site);

      update((workspace) => {
        const run = workspace.runs.find((r) => r.id === runId);
        if (run) {
          run.status = "complete";
          run.finishedAt = result.finishedAt;
          run.result = compact(result);
          run.diff = diff;
        }
        const record = workspace.sites.find((s) => s.id === site.id);
        if (record) record.lastRunId = runId;

        // Anything still pending from the previous run that this run no longer
        // finds is withdrawn rather than left to rot in the queue.
        const stillOpen = new Set(result.findings.map((f) => f.id));
        for (const approval of workspace.approvals) {
          if (approval.siteId !== site.id || approval.status !== "pending") continue;
          if (approval.findingId && !stillOpen.has(approval.findingId)) {
            approval.status = "applied";
            approval.decidedAt = new Date().toISOString();
            approval.note = "Withdrawn: the finding is no longer present on the site.";
          }
        }

        // And anything already queued for a finding that is still open is kept,
        // so approving something twice is not possible.
        const queued = new Set(
          workspace.approvals
            .filter((a) => a.siteId === site.id && a.findingId)
            .map((a) => a.findingId as string),
        );
        workspace.approvals.unshift(...approvals.filter((a) => !a.findingId || !queued.has(a.findingId)));

        logActivity(workspace, {
          siteId: site.id,
          actor: "strategist",
          action: "Run complete",
          detail: diff.headline,
        });
      });

      // Server side, when there is one. A signed-out visitor's run is stored
      // against a claim cookie so that signing in later moves it into the new
      // account rather than making them crawl the site a second time. Both
      // calls fail quietly: the audit above is already finished and saved.
      void recordRun({ url: site.baseUrl, status: "complete", result, startedAt });
      void pushWorkspace();

      return result;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "The run failed";
      update((workspace) => {
        const run = workspace.runs.find((r) => r.id === runId);
        if (run) {
          run.status = controller.signal.aborted ? "stopped" : "failed";
          run.finishedAt = new Date().toISOString();
          run.error = message;
        }
        logActivity(workspace, {
          siteId: site.id,
          actor: "crawl-operator",
          action: controller.signal.aborted ? "Run stopped" : "Run failed",
          detail: message,
        });
      });
      throw error;
    });

  return { runId, promise, stop: () => controller.abort() };
}

/** Turn an approved fix into an applied change, or say why it cannot ship here. */
export function applyApproval(approvalId: string) {
  update((workspace) => {
    const approval = workspace.approvals.find((a) => a.id === approvalId);
    if (!approval) return;
    const site = workspace.sites.find((s) => s.id === approval.siteId);
    const cms = site?.integrations.find((i) => i.status === "connected" && ["wordpress", "shopify", "webflow", "generic_cms"].includes(i.provider));

    approval.status = "applied";
    approval.decidedAt = new Date().toISOString();
    approval.note = cms
      ? `Queued for ${cms.label}. The change is written on the next publish pass.`
      : "No CMS is connected, so the change is yours to apply. The exact text and where it goes are on the approval.";

    logActivity(workspace, {
      siteId: approval.siteId,
      actor: approval.requestedBy,
      action: "Change approved",
      detail: approval.title,
    });
  });
}
