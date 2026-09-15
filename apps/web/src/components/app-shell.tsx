"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { pendingApprovals, siteById } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { signInHref, signOut, useSession } from "@/lib/session";
import { Badge } from "@/components/ui";

const NAV = [
  {
    section: "Overview",
    items: [
      { href: "", label: "Dashboard" },
      { href: "/reports", label: "What changed" },
    ],
  },
  {
    section: "Your input",
    items: [
      { href: "/approvals", label: "Approvals", badge: "approvals" as const },
      { href: "/content", label: "Content" },
    ],
  },
  {
    section: "The work",
    items: [
      { href: "/findings", label: "Findings" },
      { href: "/pages", label: "Pages" },
      { href: "/keywords", label: "Keywords" },
      { href: "/aeo", label: "AI answers" },
      { href: "/local", label: "Local" },
      { href: "/links", label: "Links" },
      { href: "/rivals", label: "Rivals" },
      { href: "/runs", label: "Activity" },
    ],
  },
  {
    section: "Setup",
    items: [
      { href: "/integrations", label: "Connections" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export function AppShell({ siteId, children }: { siteId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [workspace] = useWorkspace();
  const { session } = useSession();
  const site = siteById(workspace, siteId);
  const pending = pendingApprovals(workspace, siteId).length;
  const base = `/app/sites/${siteId}`;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div>
          <Link href="/app" className="brand">
            SEO OS
            {site && <small className="truncate">{site.domain}</small>}
          </Link>
        </div>

        {workspace.sites.length > 1 && (
          <select
            value={siteId}
            onChange={(event) => router.push(`/app/sites/${event.target.value}`)}
            aria-label="Switch site"
          >
            {workspace.sites.map((option) => (
              <option key={option.id} value={option.id}>{option.domain}</option>
            ))}
          </select>
        )}

        {NAV.map((group) => (
          <div key={group.section}>
            <div className="nav-section">{group.section}</div>
            <nav className="nav">
              {group.items.map((item) => {
                const href = `${base}${item.href}`;
                const active = pathname === href;
                const count = "badge" in item && item.badge === "approvals" ? pending : 0;
                return (
                  <Link key={href} href={href} className={active ? "active" : ""}>
                    {item.label}
                    {count > 0 && <Badge kind="high">{count}</Badge>}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        <div style={{ marginTop: "auto" }} className="stack-sm">
          <Link href="/app/new" className="button small">Add a site</Link>
          {session.user ? (
            <>
              <Link href="/app/settings" className="button small ghost truncate" title={session.user.email}>
                {session.user.email}
              </Link>
              <button className="small ghost" onClick={() => void signOut()}>Sign out</button>
            </>
          ) : session.server === "ready" ? (
            // Signed out with a server present: say what an account buys,
            // because this browser is currently the only copy of the work.
            <Link href={signInHref()} className="button small primary">Sign in to keep this</Link>
          ) : (
            <Link href="/app/settings" className="button small ghost">Account</Link>
          )}
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
