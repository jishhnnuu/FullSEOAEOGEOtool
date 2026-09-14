"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher, getToken, setToken, type Site } from "@/lib/api";

/* ------------------------------------------------------------ primitives */

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-header">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="row muted small" style={{ padding: "1rem 0" }}>
      <span className="spinner" /> {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return <div className="notice notice-bad">{message}</div>;
}

/**
 * A score with its colour band. The thresholds are deliberately strict:
 * a dashboard that shows green at 70 teaches the client that 70 is fine.
 */
export function Score({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  hint?: string;
}) {
  const band = value == null ? "" : value >= 85 ? "good" : value >= 65 ? "warn" : "bad";
  const colour =
    band === "good" ? "var(--ok)" : band === "warn" ? "var(--warn)" : "var(--bad)";
  return (
    <div className="card score">
      <div className="label">{label}</div>
      <div className={`value ${band ? `score-${band}` : "faint"}`}>
        {value == null ? "–" : Math.round(value)}
      </div>
      {value != null && (
        <div className="meter">
          <span style={{ width: `${Math.min(value, 100)}%`, background: colour }} />
        </div>
      )}
      {hint && <div className="hint">{hint}</div>}
      {value == null && <div className="hint faint">Not measured yet</div>}
    </div>
  );
}

export function severityKind(severity: string) {
  return ["critical", "high", "medium", "low"].includes(severity) ? severity : "neutral";
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (Number.isNaN(seconds)) return "unknown";
  const future = seconds < 0;
  const n = Math.abs(seconds);
  const pick = (v: number, unit: string) => {
    const rounded = Math.round(v);
    const text = `${rounded} ${unit}${rounded === 1 ? "" : "s"}`;
    return future ? `in ${text}` : `${text} ago`;
  };
  if (n < 60) return future ? "shortly" : "just now";
  if (n < 3600) return pick(n / 60, "minute");
  if (n < 86400) return pick(n / 3600, "hour");
  if (n < 2592000) return pick(n / 86400, "day");
  return pick(n / 2592000, "month");
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null) return "–";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/* ---------------------------------------------------------------- shell */

const NAV = [
  { section: "Overview", items: [
    { href: "", label: "Dashboard" },
    { href: "/report", label: "Audit report" },
  ]},
  { section: "Your input", items: [
    { href: "/approvals", label: "Approvals" },
    { href: "/content", label: "Content review" },
  ]},
  { section: "The work", items: [
    { href: "/findings", label: "Findings" },
    { href: "/pages", label: "Pages" },
    { href: "/runs", label: "Activity" },
  ]},
  { section: "Setup", items: [
    { href: "/brand", label: "Brand" },
    { href: "/integrations", label: "Integrations" },
    { href: "/team", label: "Your team" },
    { href: "/settings", label: "Settings" },
  ]},
];

export function Shell({ siteId, children }: { siteId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const { data: sites } = useSWR<Site[]>(ready ? "/sites" : null, fetcher);
  const { data: pending } = useSWR<{ total_pending: number }>(
    ready ? "/approvals/grouped" : null,
    fetcher,
    { refreshInterval: 60_000 },
  );

  useEffect(() => {
    if (!getToken()) router.replace("/login");
    else setReady(true);
  }, [router]);

  if (!ready) return null;
  const base = `/sites/${siteId}`;
  const current = sites?.find((s) => s.id === siteId);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          SEO OS
          {current && <small className="truncate">{current.domain}</small>}
        </div>

        {sites && sites.length > 1 && (
          <select
            value={siteId}
            onChange={(e) => router.push(`/sites/${e.target.value}`)}
            aria-label="Switch site"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.domain}</option>
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
                const count =
                  item.href === "/approvals" ? pending?.total_pending ?? 0 : 0;
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

        <div style={{ marginTop: "auto" }}>
          <button
            className="small"
            onClick={() => {
              setToken(null);
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header between">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}

/**
 * Minimal markdown rendering for agent-written reports.
 *
 * A full markdown library would be a large dependency for content this
 * platform generates itself and therefore controls the shape of.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = source.split(/\n\s*\n/);
  return (
    <div className="prose">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
        if (heading) {
          const Tag = `h${Math.min(heading[1].length + 1, 4)}` as "h2" | "h3" | "h4";
          return <Tag key={i}>{heading[2]}</Tag>;
        }
        if (/^\s*[-*]\s+/.test(trimmed)) {
          return (
            <ul key={i}>
              {trimmed.split("\n").map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        if (/^\s*\d+\.\s+/.test(trimmed)) {
          return (
            <ol key={i}>
              {trimmed.split("\n").map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>
              ))}
            </ol>
          );
        }
        if (trimmed.startsWith("|")) {
          const rows = trimmed.split("\n").filter((r) => !/^\|[\s|:-]+\|$/.test(r));
          return (
            <div className="table-scroll" key={i}>
              <table>
                <tbody>
                  {rows.map((row, r) => (
                    <tr key={r}>
                      {row.split("|").slice(1, -1).map((cell, c) =>
                        r === 0 ? <th key={c}>{cell.trim()}</th> : <td key={c}>{inline(cell.trim())}</td>,
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={i}>{inline(trimmed)}</p>;
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      // Only http(s) links are rendered as links; anything else is text, so
      // a javascript: URL in generated content cannot become clickable.
      const safe = /^https?:\/\//i.test(link[2]);
      return safe ? (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>
      ) : (
        <span key={i}>{link[1]}</span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
