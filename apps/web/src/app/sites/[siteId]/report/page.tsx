"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { api, fetcher, type Report } from "@/lib/api";
import { Card, Empty, ErrorNote, Loading, Markdown, PageHeader, timeAgo } from "@/components/ui";

export default function ReportPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const { data, error, isLoading, mutate } = useSWR<Report>(
    `/sites/${siteId}/reports/live`,
    fetcher,
  );
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  if (error) {
    const notFound = (error as any)?.status === 404;
    return (
      <>
        <PageHeader title="Audit report" />
        <Card>
          {notFound ? (
            <Empty title="No report yet">
              <span className="small">
                The first audit produces this. Run a cycle from the dashboard.
              </span>
            </Empty>
          ) : <ErrorNote error={error} />}
        </Card>
      </>
    );
  }
  if (isLoading || !data) return <Loading label="Loading your report" />;

  async function share() {
    const res = await api.post<{ url: string }>(`/reports/${data!.id}/share`);
    setShareUrl(`${window.location.origin}/api/v1${res.url}`);
    mutate();
  }

  return (
    <>
      <PageHeader
        title={data.title}
        description={`Rewritten by every audit. Last updated ${timeAgo(data.updated_at)}.`}
        action={<button onClick={share}>Share a read-only link</button>}
      />

      {shareUrl && (
        <div className="notice notice-ok" style={{ marginBottom: "0.9rem" }}>
          <div className="small">Anyone with this link can read the report for 90 days.</div>
          <code className="small" style={{ wordBreak: "break-all" }}>{shareUrl}</code>
        </div>
      )}

      <Card>
        {data.narrative_md ? (
          <Markdown source={data.narrative_md} />
        ) : (
          <Empty title="This report has no narrative yet">
            <span className="small">
              The written analysis is produced by the reporting agent, which needs a
              model provider configured.
            </span>
          </Empty>
        )}
      </Card>

      {Object.keys(data.data ?? {}).length > 0 && (
        <Card title="Figures">
          <pre className="mono" style={{ overflowX: "auto", margin: 0 }}>
            {JSON.stringify(data.data, null, 2)}
          </pre>
        </Card>
      )}
    </>
  );
}
