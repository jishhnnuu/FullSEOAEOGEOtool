"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { siteById } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { Card, useMounted } from "@/components/ui";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const siteId = params?.id ?? "";
  const [workspace] = useWorkspace();
  const mounted = useMounted();

  if (!mounted) return <div className="auth-shell"><span className="spinner" /></div>;

  if (!siteById(workspace, siteId)) {
    return (
      <div className="auth-shell">
        <Card className="auth-card">
          <h1>That site is not in this browser</h1>
          <p className="muted small">
            Workspaces are held per browser. If you set this up somewhere else, import the export from Settings on
            that machine.
          </p>
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <Link href="/app/new" className="button primary">Audit a site</Link>
            <Link href="/app/signin" className="button">Restore a workspace</Link>
          </div>
        </Card>
      </div>
    );
  }

  return <AppShell siteId={siteId}>{children}</AppShell>;
}
