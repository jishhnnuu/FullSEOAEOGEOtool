"use client";

import Link from "next/link";

import type { AuditResult } from "@/engine/types";
import type { RunDiff } from "@/engine/diff";
import { DIRECTOR, MANAGERS, headcount } from "@/lib/org";
import type { SiteRecord, Workspace } from "@/lib/store";
import { Badge } from "@/components/ui";

/*
 * The brief.
 *
 * One agent speaks to the client, so one block at the top of the workspace
 * speaks for the whole organisation. It says what happened, what is waiting,
 * and what is blocked and why, in that order, because a director who leads
 * with the good news is a director nobody believes twice.
 *
 * Everything on it is derived from the run that just finished. Nothing here is
 * a placeholder number, and where a desk cannot report, it says which
 * connection would let it rather than printing a zero.
 */

type DeskState = {
  key: string;
  name: string;
  title: string;
  status: "working" | "waiting" | "blocked" | "planned";
  line: string;
  href: string | null;
  metric: string | null;
};

function searchDesk(site: SiteRecord, result: AuditResult | null, base: string): DeskState {
  const manager = MANAGERS[0];
  if (!result) {
    return {
      key: manager.key, name: manager.name, title: manager.title, status: "waiting",
      line: `Nothing crawled yet. Start a run and ${manager.team.length} agents go over the live site.`,
      href: null, metric: null,
    };
  }
  const withFix = result.findings.filter((f) => f.fix).length;
  const high = result.findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
  return {
    key: manager.key, name: manager.name, title: manager.title, status: "working",
    line: high > 0
      ? `${high} finding${high === 1 ? "" : "s"} worth acting on, and ${withFix} of the ${result.findings.length} total already have the change written.`
      : `Nothing severe left. ${withFix} smaller fixes are written and ready.`,
    href: `${base}/findings`,
    metric: `${result.findings.length} findings`,
  };
}

function contentDesk(site: SiteRecord, result: AuditResult | null, workspace: Workspace, base: string): DeskState {
  const manager = MANAGERS[1];
  const drafts = workspace.content.filter((c) => c.siteId === site.id);
  if (!result) {
    return {
      key: manager.key, name: manager.name, title: manager.title, status: "waiting",
      line: "Held until the crawl exists. Nothing is briefed before the business and the field have been read.",
      href: null, metric: null,
    };
  }
  if (drafts.length === 0) {
    return {
      key: manager.key, name: manager.name, title: manager.title, status: "working",
      line: `${result.briefs.length} brief${result.briefs.length === 1 ? "" : "s"} built from the gaps in the crawl. Voice is measured from the pages already fetched.`,
      href: `${base}/content`,
      metric: `${result.briefs.length} briefs`,
    };
  }
  return {
    key: manager.key, name: manager.name, title: manager.title, status: "working",
    line: `${drafts.length} draft${drafts.length === 1 ? "" : "s"} written, and ${result.briefs.length} brief${result.briefs.length === 1 ? "" : "s"} still open.`,
    href: `${base}/content`,
    metric: `${drafts.length} drafts`,
  };
}

function plannedDesk(index: number, base: string): DeskState {
  const manager = MANAGERS[index];
  return {
    key: manager.key, name: manager.name, title: manager.title, status: "planned",
    line: `${manager.remit} Opens ${manager.opens}.`,
    href: `${base}/team`,
    metric: manager.opens,
  };
}

/** What the director leads with, which is never the good news if there is bad. */
function headline(result: AuditResult | null, diff: RunDiff | null, pending: number): string {
  if (!result) return "Nothing has been crawled yet, so there is nothing honest to report.";
  if (diff) return diff.headline;
  if (pending > 0) return `${pending} change${pending === 1 ? " is" : "s are"} written and waiting on you. That is the only thing on your list.`;
  return "First run is in. The findings below are the starting point every later claim is measured against.";
}

export function DirectorBrief({
  site,
  result,
  diff,
  workspace,
}: {
  site: SiteRecord;
  result: AuditResult | null;
  diff: RunDiff | null;
  workspace: Workspace;
}) {
  const base = `/app/sites/${site.id}`;
  const pending = workspace.approvals.filter((a) => a.siteId === site.id && a.status === "pending").length;
  const connected = site.integrations.filter((i) => i.status === "connected");

  const desks: DeskState[] = [
    searchDesk(site, result, base),
    contentDesk(site, result, workspace, base),
    plannedDesk(2, base),
    plannedDesk(3, base),
  ];

  /*
   * Blocked stages step aside rather than stopping the programme, and they say
   * which connection would unblock them. A stage that quietly scores itself
   * from a proxy wastes the most expensive work in the programme.
   */
  const blocked: { what: string; why: string; fix: string; href: string }[] = [];
  if (!connected.some((i) => i.provider.includes("search_console") || i.provider.includes("gsc"))) {
    blocked.push({
      what: "Authority is not scored",
      why: "Nothing measures query demand or real ranking movement without Search Console.",
      fix: "Connect Search Console",
      href: `${base}/integrations`,
    });
  }
  if (!connected.some((i) => i.capabilities.includes("publish") || i.provider.includes("wordpress"))) {
    blocked.push({
      what: "Fixes are written but not applied",
      why: "No CMS is connected, so the changes sit in the queue rather than going live.",
      fix: "Connect a CMS",
      href: `${base}/integrations`,
    });
  }

  return (
    <section className="brief">
      <header className="brief-head">
        <div>
          <div className="brief-who">
            <span className="brief-dot" />
            {DIRECTOR.name}
            <span className="tiny faint">· {DIRECTOR.title.toLowerCase()}</span>
          </div>
          <p className="brief-headline">{headline(result, diff, pending)}</p>
        </div>
        {pending > 0 && (
          <Link href={`${base}/approvals`} className="button primary small">
            Review {pending} item{pending === 1 ? "" : "s"}
          </Link>
        )}
      </header>

      <div className="brief-desks">
        {desks.map((desk) => (
          <div key={desk.key} className={`desk desk-${desk.status}`}>
            <div className="desk-top">
              <strong>{desk.name}</strong>
              {desk.metric && <span className="tiny faint">{desk.metric}</span>}
            </div>
            <div className="tiny faint desk-title">{desk.title}</div>
            <p className="small">{desk.line}</p>
            {desk.href && desk.status !== "planned" && (
              <Link href={desk.href} className="tiny">Open this desk</Link>
            )}
          </div>
        ))}
      </div>

      {blocked.length > 0 && (
        <div className="brief-blocked">
          <div className="tiny faint" style={{ marginBottom: "0.4rem" }}>WHAT IS BLOCKED, AND WHY</div>
          {blocked.map((b) => (
            <div key={b.what} className="between small blocked-row">
              <span>
                <Badge kind="warn">blocked</Badge> <strong>{b.what}</strong>
                <span className="muted"> {b.why}</span>
              </span>
              <Link href={b.href} className="tiny">{b.fix}</Link>
            </div>
          ))}
        </div>
      )}

      <footer className="brief-foot tiny faint">
        {headcount()} agents across {MANAGERS.filter((m) => m.status === "live").length} live desks.
        You approve, you do not execute. <Link href={`${base}/team`}>See the organisation</Link>.
      </footer>
    </section>
  );
}
