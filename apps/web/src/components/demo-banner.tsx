"use client";

/**
 * Says what this deployment is, and which parts of it were measured.
 *
 * It asks the API rather than reading a build-time flag, so one built artifact
 * serves both the public demo and a real installation: on a real installation
 * `/api/v1/demo` is not a route, the fetch fails, and nothing renders.
 */

import { useEffect, useState } from "react";

type DemoInfo = {
  demo: boolean;
  generated_at: string;
  domain: string;
  login: { email: string; password: string };
  measured: { pages: number | null; findings: number | null; health: number | null; aeo: number | null };
  note: string;
};

export function DemoBanner() {
  const [info, setInfo] = useState<DemoInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/v1/demo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.demo) setInfo(d); })
      .catch(() => { /* a real installation has no such route */ });
    return () => { live = false; };
  }, []);

  if (!info) return null;

  const crawled = new Date(info.generated_at).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="demo-banner">
      <div className="demo-banner-row">
        <span className="demo-chip">Demo</span>
        <span>
          Crawled <strong>{info.domain}</strong> on {crawled}: {info.measured.pages} pages,{" "}
          {info.measured.findings} findings, health {Math.round(info.measured.health ?? 0)}.
        </span>
        <button type="button" className="demo-more" onClick={() => setOpen(!open)}>
          {open ? "Hide detail" : "What is real here?"}
        </button>
      </div>
      {open && (
        <div className="demo-detail">
          <p>{info.note}</p>
          <p>
            Sign in with any email and password. Approving, rejecting and editing all work and
            are kept in your browser, so nothing you click changes what anyone else sees.
            Anything needing a credential or a worker (adding a site, connecting an account,
            starting a mission) says so instead of pretending.
          </p>
        </div>
      )}
    </div>
  );
}
