"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BRAND } from "@/lib/brand";
import { MANAGERS, DIRECTOR } from "@/lib/org";
import { pendingApprovals, siteById } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { signInHref, signOut, useSession } from "@/lib/session";
import { Badge } from "@/components/ui";

/*
 * The shell is organised by who does the work, not by feature.
 *
 * The client talks to one agent, and everything else sits under the manager
 * that owns it. That is the product's central claim, so the navigation is the
 * first place it should be visible: a flat list of nineteen screens says
 * "tool", and a director with four desks under it says "agency".
 *
 * The managers that do not exist yet are in the list, greyed, with the quarter
 * they open. A roadmap you can read is worth more than a features page that
 * implies everything already exists.
 */

const DIRECTOR_NAV = [
  // First, because the product's claim is that you talk to one person and the
  // desks organise themselves behind them. A rail that opened on a dashboard
  // made that a sentence on a marketing page rather than a thing you can do.
  { href: "/cmo", label: "Talk to your CMO" },
  { href: "", label: "The brief" },
  { href: "/approvals", label: "Approvals", badge: "approvals" as const },
  { href: "/progress", label: "Progress" },
  { href: "/reports", label: "Reports" },
  { href: "/google", label: "Your Google data" },
  { href: "/team", label: "The organisation" },
];

const SETUP_NAV = [
  { href: "/integrations", label: "Connections" },
  { href: "/schedule", label: "Schedule" },
  { href: "/runs", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ siteId, children }: { siteId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [workspace] = useWorkspace();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const site = siteById(workspace, siteId);
  const pending = pendingApprovals(workspace, siteId).length;
  const base = `/app/sites/${siteId}`;

  // A drawer that survives navigation is a drawer covering the page you just
  // asked for, so it closes on every route change.
  useEffect(() => { setOpen(false); }, [pathname]);

  function itemFor(item: { href: string; label: string; badge?: "approvals" }) {
    const href = `${base}${item.href}`;
    const active = pathname === href;
    const count = item.badge === "approvals" ? pending : 0;
    return (
      <Link key={href} href={href} className={active ? "active" : ""}>
        {item.label}
        {count > 0 && <Badge kind="high">{count}</Badge>}
      </Link>
    );
  }

  const rail = (
    <>
      <div>
        <Link href="/app" className="brand">
          {BRAND}
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

      <div>
        <div className="nav-section">
          {DIRECTOR.name}
          <span className="nav-note">talks to you</span>
        </div>
        <nav className="nav">{DIRECTOR_NAV.map(itemFor)}</nav>
      </div>

      {MANAGERS.map((manager) => (
        <div key={manager.key}>
          <div className="nav-section">
            {manager.name}
            {manager.status === "planned" && <span className="nav-note">{manager.opens}</span>}
          </div>
          {manager.status === "live" ? (
            <nav className="nav">{manager.nav.map(itemFor)}</nav>
          ) : (
            <nav className="nav">
              <Link href={`${base}/team#${manager.key}`} className="planned">
                Not built yet
              </Link>
            </nav>
          )}
        </div>
      ))}

      <div>
        <div className="nav-section">Setup</div>
        <nav className="nav">{SETUP_NAV.map(itemFor)}</nav>
      </div>

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
    </>
  );

  return (
    <div className="layout">
      {/* Phone header. The rail is a drawer below 900px rather than a
          horizontal scroller, because five manager groups do not fit in one. */}
      <header className="app-bar">
        <button
          className="app-bar-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="app-rail"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          <span /><span /><span />
        </button>
        <Link href="/app" className="app-bar-brand">
          {BRAND}
          {site && <small className="truncate">{site.domain}</small>}
        </Link>
        {pending > 0 && (
          <Link href={`${base}/approvals`} className="app-bar-badge">
            <Badge kind="high">{pending}</Badge>
          </Link>
        )}
      </header>

      {open && <button className="app-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <aside id="app-rail" className={open ? "sidebar open" : "sidebar"}>{rail}</aside>
      <main className="main">{children}</main>
    </div>
  );
}
