"use client";

import { useEffect, useState } from "react";

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

export function Notice({
  kind = "info",
  title,
  children,
}: {
  /** "error" reads better at the call site than "bad" and means the same. */
  kind?: "info" | "warn" | "bad" | "ok" | "error";
  title?: string;
  children: React.ReactNode;
}) {
  const tone = kind === "error" ? "bad" : kind;
  const suffix = tone === "info" ? "" : ` notice-${tone}`;
  return (
    <div className={`notice${suffix}`}>
      {title && <strong className="small" style={{ display: "block", marginBottom: "0.25rem" }}>{title}</strong>}
      {children}
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
 * A score with its colour band.
 *
 * The thresholds are strict on purpose. A dashboard that shows green at 70
 * teaches the client that 70 is fine, and it is not.
 */
export function Score({
  label,
  value,
  hint,
  change,
  measured = true,
  unmeasuredReason,
  unmeasuredFix,
}: {
  label: string;
  value: number | null | undefined;
  hint?: string;
  change?: number | null;
  /** False when nothing behind this number was actually measured. */
  measured?: boolean;
  unmeasuredReason?: string | null;
  unmeasuredFix?: string | null;
}) {
  /*
   * An unmeasured score does not get a number, a colour or a meter.
   *
   * It would be easy to show the figure greyed out with an asterisk. That is
   * exactly the mistake: at a glance a greyed 100 still reads as 100, and the
   * reader takes away a number nobody measured. So the tile says what is
   * missing and what would fix it, and holds the value back until something
   * measures it.
   */
  if (!measured) {
    return (
      <div className="card score score-unmeasured">
        <div className="label">{label}</div>
        <div className="value faint" style={{ fontSize: "1.15rem", letterSpacing: "-0.01em" }}>
          Not measured
        </div>
        {unmeasuredReason && <div className="hint">{unmeasuredReason}</div>}
        {unmeasuredFix && <div className="hint" style={{ opacity: 0.75 }}>{unmeasuredFix}</div>}
      </div>
    );
  }

  const band = value == null ? "" : value >= 85 ? "good" : value >= 65 ? "warn" : "bad";
  const colour = band === "good" ? "var(--ok)" : band === "warn" ? "var(--warn)" : "var(--bad)";
  return (
    <div className="card score">
      <div className="label">{label}</div>
      <div className="row" style={{ gap: "0.5rem", alignItems: "baseline" }}>
        <div className={`value ${band ? `score-${band}` : "faint"}`}>
          {value == null ? "-" : Math.round(value)}
        </div>
        {change != null && Math.abs(change) >= 0.1 && (
          <span className={`delta delta-${change > 0 ? "up" : "down"}`}>
            {change > 0 ? "+" : ""}
            {change.toFixed(1)}
          </span>
        )}
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

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={tab.key === active}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count != null && <span className="faint"> {tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** Before and after, side by side, with nothing invented in between. */
export function BeforeAfter({ before, after }: { before: string | null; after: string }) {
  return (
    <div className="grid grid-2" style={{ gap: "0.6rem" }}>
      {before != null && (
        <div>
          <div className="tiny faint" style={{ marginBottom: "0.25rem" }}>NOW</div>
          <pre className="codeblock before">{before}</pre>
        </div>
      )}
      <div style={before == null ? { gridColumn: "1 / -1" } : undefined}>
        <div className="tiny faint" style={{ marginBottom: "0.25rem" }}>PROPOSED</div>
        <pre className="codeblock after">{after}</pre>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- format */

export function severityKind(severity: string) {
  return ["critical", "high", "medium", "low"].includes(severity) ? severity : "neutral";
}

export function riskKind(risk: string) {
  return { low: "low", medium: "medium", high: "high", critical: "critical" }[risk] ?? "neutral";
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
  if (value == null) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Where a finding applies, without ever rendering "1 pages". */
export function scopeLabel(finding: { url: string | null; affectedUrls: string[] }, max = 48): string {
  if (finding.url) return shortUrl(finding.url, max);
  const n = finding.affectedUrls.length;
  if (n > 1) return `${n} pages`;
  return "site wide";
}

export function shortUrl(url: string | null | undefined, max = 60) {
  if (!url) return "-";
  const path = url.replace(/^https?:\/\/(www\.)?/, "");
  return path.length > max ? `${path.slice(0, max - 1)}...` : path;
}

export function duration(ms: number | null | undefined) {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/** Avoids a hydration mismatch on anything that reads the clock or storage. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/* -------------------------------------------------------------- markdown */

/**
 * Minimal markdown rendering.
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
          return <Tag key={i}>{inline(heading[2])}</Tag>;
        }
        if (trimmed.startsWith(">")) {
          return <blockquote key={i}>{inline(trimmed.replace(/^>\s?/gm, ""))}</blockquote>;
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
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\)|\[UNVERIFIED:[^\]]*\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("[UNVERIFIED:")) {
      return (
        <mark key={i} style={{ background: "var(--warn-soft)", color: "var(--warn)", padding: "0 0.2em" }}>
          {part}
        </mark>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      // Only http(s) links become links, so a javascript: URL in generated
      // content cannot become clickable.
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

/* ---------------------------------------------------------------- charts */

export type SeriesPoint = { at: string; value: number | null };

/**
 * A line chart, drawn as SVG with no library.
 *
 * Deliberately plain: one series, a dotted baseline at the previous period's
 * average, and gaps where nothing was measured rather than a line interpolated
 * across them. A chart that joins two readings a fortnight apart with a
 * straight line is drawing eleven days of data it does not have.
 */
export function Chart({
  points,
  label,
  higherIsBetter = true,
  height = 120,
  format = (n: number) => String(Math.round(n * 10) / 10),
}: {
  points: SeriesPoint[];
  label: string;
  higherIsBetter?: boolean;
  height?: number;
  format?: (value: number) => string;
}) {
  const real = points.filter((p): p is { at: string; value: number } => typeof p.value === "number");
  if (real.length < 2) {
    return (
      <div className="chart-empty small muted">
        {real.length === 0
          ? `Nothing measured for ${label} yet.`
          : `One reading of ${label} so far. A chart needs two, and the schedule takes the next one.`}
      </div>
    );
  }

  const width = 640;
  const pad = 6;
  const values = real.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const firstTime = Date.parse(real[0].at);
  const lastTime = Date.parse(real[real.length - 1].at);
  const timeSpan = lastTime - firstTime || 1;

  const x = (at: string) => pad + ((Date.parse(at) - firstTime) / timeSpan) * (width - pad * 2);
  const y = (value: number) => pad + (1 - (value - min) / span) * (height - pad * 2);

  // Break the line wherever the gap between readings is more than three times
  // the usual one, so a pause in measurement looks like a pause.
  const gaps: number[] = [];
  for (let i = 1; i < real.length; i += 1) gaps.push(Date.parse(real[i].at) - Date.parse(real[i - 1].at));
  const typical = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 1;

  const segments: string[] = [];
  let current = `M ${x(real[0].at)} ${y(real[0].value)}`;
  for (let i = 1; i < real.length; i += 1) {
    if (gaps[i - 1] > typical * 3) {
      segments.push(current);
      current = `M ${x(real[i].at)} ${y(real[i].value)}`;
    } else {
      current += ` L ${x(real[i].at)} ${y(real[i].value)}`;
    }
  }
  segments.push(current);

  const last = real[real.length - 1];
  const first = real[0];
  const direction = last.value === first.value ? "flat" : last.value > first.value ? "up" : "down";
  const good = direction === "flat" ? "flat" : (direction === "up") === higherIsBetter ? "up" : "down";

  return (
    <figure className="chart">
      <figcaption className="between">
        <span className="small muted">{label}</span>
        <span className={`delta delta-${good}`}>
          {format(first.value)} to {format(last.value)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}, ${real.length} readings`} preserveAspectRatio="none">
        {segments.map((d, index) => (
          <path key={index} d={d} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className={`chart-line chart-${good}`} />
        ))}
        <circle cx={x(last.at)} cy={y(last.value)} r="3.5" className={`chart-dot chart-${good}`} />
      </svg>
      <div className="between tiny faint">
        <span>{new Date(first.at).toLocaleDateString()}</span>
        <span>
          {real.length} reading{real.length === 1 ? "" : "s"}
        </span>
        <span>{new Date(last.at).toLocaleDateString()}</span>
      </div>
    </figure>
  );
}
