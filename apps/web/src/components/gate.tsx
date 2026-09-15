"use client";

import Link from "next/link";

import { signInHref, useSession } from "@/lib/session";

/**
 * The gate.
 *
 * Findings stay free, always: what is wrong with a site is the part worth
 * giving away, and it is the part that earns the trust to ask for anything.
 * The written fix is what sits behind an account, and the first one is open
 * so the ask lands after the value rather than before it.
 *
 * The blur matters. A hidden fix reads as a paywall over work that might not
 * exist. A blurred one reads as work that already exists, which is the truth:
 * every fix was generated during the crawl, before anyone was asked for
 * anything.
 *
 * Where there is no server at all this renders its children untouched. A
 * deployment with no accounts has nothing to gate and no way to take an
 * account, and putting a locked door in front of a room with no key would be
 * theatre.
 */
export function Gate({
  open,
  what,
  children,
}: {
  /** True when this particular item is one of the free ones. */
  open: boolean;
  /** What is behind it, named in the cover text. */
  what: string;
  children: React.ReactNode;
}) {
  const { session } = useSession();
  if (open || session.user || session.server !== "ready") return <>{children}</>;

  return (
    <div className="gated">
      <div className="gated-body" aria-hidden="true">{children}</div>
      <div className="gated-cover">
        <strong className="small">{what} is written and waiting</strong>
        <p>
          It was generated during the crawl you just ran. Signing in takes it with you, along with this whole
          audit. Nothing re-crawls.
        </p>
        <Link href={signInHref()} className="button small primary">Sign in to take it</Link>
      </div>
    </div>
  );
}

/**
 * The prompt at the end of a run.
 *
 * Offered, not demanded, and at the moment the report exists rather than
 * before it. Someone who says no still keeps everything on this screen.
 */
export function KeepThisRun({ siteId }: { siteId?: string }) {
  const { session } = useSession();
  if (session.user || session.server !== "ready") return null;

  return (
    <div className="notice info">
      <strong className="small">This audit lives in this browser</strong>
      <p className="small" style={{ marginBottom: "0.6rem" }}>
        Clear the browser and it goes. An account keeps it, lets a schedule re-run it without you, and is what
        Search Console and Analytics attach to. It costs nothing and there is no password.
      </p>
      <Link href={signInHref(siteId ? `/app/sites/${siteId}` : "/app")} className="button small primary">
        Keep this audit
      </Link>
    </div>
  );
}
