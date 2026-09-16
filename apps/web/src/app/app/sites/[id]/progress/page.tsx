"use client";

/**
 * Where the programme is, and what "done" means.
 *
 * The screen that answers the question a findings list never answers: is this
 * finished. Six stages, each with a definition of done you can check rather
 * than a feeling, ordered the way an agency would order them.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Card, Empty, Notice, PageHeader, timeAgo } from "@/components/ui";
import { useSearchQueries } from "@/lib/measured";
import { useSchedule } from "@/lib/schedule";
import { useSession } from "@/lib/session";
import { useSite } from "@/lib/site-hooks";
import { loadLinks } from "@/lib/links";
import { assessProgramme, type Stage } from "@/engine/progress";

export default function ProgressPage() {
  const { site, result, runs, workspace } = useSite();
  const { session } = useSession();
  const signedIn = Boolean(session.user);
  const search = useSearchQueries(signedIn, { siteId: site?.id, days: 28, limit: 1 });
  const { data: schedule } = useSchedule(site?.id, signedIn);

  const [links, setLinks] = useState<{ mentions: number; verified: number }>({ mentions: 0, verified: 0 });
  useEffect(() => {
    if (!site) return;
    const state = loadLinks(site.id);
    setLinks({
      mentions: state.mentions.length,
      verified: state.portfolio.filter((link) => link.status === "confirmed").length,
    });
  }, [site]);

  const programme = useMemo(() => {
    // Two consecutive completed runs with nothing severe new is what the last
    // stage counts. Anything less is not a trend, it is one good week.
    const complete = runs.filter((run) => run.status === "complete");
    let cleanRuns = 0;
    for (const run of complete) {
      const severeNew = (run.diff?.findings.appeared ?? []).filter(
        (finding) => finding.severity === "critical" || finding.severity === "high",
      ).length;
      if (run.diff && severeNew === 0) cleanRuns += 1;
      else break;
    }

    return assessProgramme({
      result,
      hasSearchData: Boolean(search.data),
      mentionsTracked: links.mentions,
      linksVerified: links.verified,
      scheduled: (schedule?.schedules ?? []).some((entry) => entry.enabled && entry.cadence !== "off"),
      cleanRuns,
    });
  }, [result, runs, search.data, links, schedule]);

  if (!site) return null;

  if (!result) {
    return (
      <>
        <PageHeader title="Progress" />
        <Empty title="Nothing has run yet">
          <p className="small">
            The first audit sets the baseline and the programme starts from it.{" "}
            <Link href={`/app/sites/${site.id}`}>Run it</Link>.
          </p>
        </Empty>
      </>
    );
  }

  const milestones = (schedule?.milestones ?? []).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Progress"
        description="Six stages, in the order they have to happen. Each one says how you know it is finished."
      />

      <Card title={`${Math.round(programme.overall * 100)}% of the programme`}>
        <p>{programme.headline}</p>
        <div className="meter">
          <span style={{ width: `${Math.round(programme.overall * 100)}%`, background: "var(--accent)" }} />
        </div>
        <p className="small muted" style={{ marginTop: "0.7rem" }}>
          {programme.nextUp}
        </p>
      </Card>

      <div className="stack">
        {programme.stages.map((stage) => (
          <StageCard key={stage.key} stage={stage} current={stage.key === programme.current} siteId={site.id} />
        ))}
      </div>

      {milestones.length > 0 ? (
        <Card title="What has actually happened">
          <ul className="stack-sm">
            {milestones.map((milestone) => (
              <li key={milestone.id} className="small">
                <span className="tiny faint">{timeAgo(milestone.at)}</span> {milestone.what}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!signedIn ? (
        <Notice kind="warn">
          Without an account this page reads only what is in this browser, so stage six, which is about a schedule
          running without you, cannot complete. Everything before it works as it is.
        </Notice>
      ) : null}

      <p className="small muted">
        Last run {runs.length > 0 ? timeAgo(runs[0].startedAt) : "never"}. A stage that was done and is not any more
        shows as a regression here and in the report, because a site that was fixed once and then edited is the usual
        way this goes backwards. Workspace holds {workspace.runs.length} run{workspace.runs.length === 1 ? "" : "s"}.
      </p>
    </>
  );
}

function StageCard({ stage, current, siteId }: { stage: Stage; current: boolean; siteId: string }) {
  const className = [
    "stage",
    stage.status === "done" ? "stage-done" : "",
    stage.status === "blocked" ? "stage-blocked" : "",
    current ? "stage-current" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div className="between">
        <h3>{stage.name}</h3>
        <span className={`badge badge-${badgeOf(stage.status)}`}>{statusLabel(stage.status)}</span>
      </div>
      <p className="small muted" style={{ marginTop: "0.3rem" }}>
        {stage.purpose}
      </p>

      <div className="meter">
        <span
          style={{
            width: `${Math.round(stage.progress * 100)}%`,
            background: stage.status === "done" ? "var(--ok)" : stage.status === "blocked" ? "var(--warn)" : "var(--accent)",
          }}
        />
      </div>

      <dl className="kv" style={{ marginTop: "0.7rem" }}>
        <dt>Done when</dt>
        <dd className="small">{stage.definitionOfDone}</dd>
        <dt>Why now</dt>
        <dd className="small muted">{stage.whyNow}</dd>
      </dl>

      {stage.blockedBy ? (
        <p className="small" style={{ marginTop: "0.6rem" }}>
          <strong>Blocked.</strong> {stage.blockedBy}{" "}
          <Link href={`/app/sites/${siteId}/integrations`}>Connect it</Link>.
        </p>
      ) : null}

      {stage.remaining.length > 0 ? (
        <p className="small" style={{ marginTop: "0.6rem" }}>
          Left: {stage.remaining.map((item) => `${item.count} ${item.what}`).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function statusLabel(status: Stage["status"]): string {
  return status === "done" ? "Done" : status === "blocked" ? "Blocked" : status === "in_progress" ? "In progress" : "Not started";
}

function badgeOf(status: Stage["status"]): string {
  return status === "done" ? "ok" : status === "blocked" ? "medium" : status === "in_progress" ? "info" : "low";
}
