"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { latestResult, runsForSite } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { Badge, Card, PageHeader, Score, timeAgo, useMounted } from "@/components/ui";

export default function SitesPage() {
  const router = useRouter();
  const [workspace] = useWorkspace();
  const mounted = useMounted();

  useEffect(() => {
    if (mounted && workspace.sites.length === 0) router.replace("/app/new");
  }, [mounted, workspace.sites.length, router]);

  if (!mounted) {
    return <div className="auth-shell"><span className="spinner" /></div>;
  }

  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "2.5rem 1.25rem 4rem" }}>
      <PageHeader
        title="Your sites"
        description="Each one has its own crawl, its own findings and its own approval queue."
        action={
          <div className="button-row">
            <Link href="/app/settings" className="button small">Account</Link>
            <Link href="/app/new" className="button primary small">Add a site</Link>
          </div>
        }
      />

      <div className="stack">
        {workspace.sites.map((site) => {
          const result = latestResult(workspace, site.id);
          const runs = runsForSite(workspace, site.id);
          const pending = workspace.approvals.filter((a) => a.siteId === site.id && a.status === "pending").length;
          return (
            <Card key={site.id}>
              <div className="between" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ marginBottom: "0.2rem" }}>
                    <Link href={`/app/sites/${site.id}`}>{site.name}</Link>
                  </h2>
                  <div className="small muted truncate">{site.domain}</div>
                  <div className="row small faint" style={{ marginTop: "0.5rem", gap: "0.9rem" }}>
                    <span>{site.businessType}</span>
                    <span>{runs.length} run{runs.length === 1 ? "" : "s"}</span>
                    <span>last {timeAgo(runs[0]?.finishedAt ?? runs[0]?.startedAt)}</span>
                    {pending > 0 && <Badge kind="high">{pending} waiting on you</Badge>}
                  </div>
                </div>
                <Link href={`/app/sites/${site.id}`} className="button small">Open</Link>
              </div>

              {result && (
                <div className="grid grid-4" style={{ marginTop: "1rem" }}>
                  <Score label="Search health" value={result.scores.health.score} />
                  <Score label="AI readiness" value={result.scores.aeo.score} />
                  <Score label="Authority" value={result.scores.authority.score} />
                  <Score label="Experience" value={result.scores.experience.score} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
