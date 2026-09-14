/**
 * Scores.
 *
 * A score is only useful if you can see what moved it. Every headline number
 * decomposes into weighted category components, each of which maps back to
 * findings the platform already knows how to fix.
 */

import type { Category, Finding, ScoreBreakdown, Scores, Severity } from "./types";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 12, high: 6, medium: 2.5, low: 1, info: 0.25,
};

const HEALTH_WEIGHTS: Partial<Record<Category, number>> = {
  technical: 0.26, content: 0.22, performance: 0.16, schema: 0.1,
  ux: 0.1, analytics: 0.08, compliance: 0.08,
};
const AEO_WEIGHTS: Partial<Record<Category, number>> = { aeo: 0.7, schema: 0.18, content: 0.12 };
const AUTHORITY_WEIGHTS: Partial<Record<Category, number>> = { offpage: 0.75, local: 0.25 };
const EXPERIENCE_WEIGHTS: Partial<Record<Category, number>> = { ux: 0.5, performance: 0.5 };

export function categoryScore(findings: Finding[], category: string, pageCount = 1): number {
  const relevant = findings.filter((f) => f.category === category && f.status === "open");
  if (!relevant.length) return 100;

  const scale = Math.max(pageCount, 1) ** 0.5;
  let penalty = 0;
  for (const finding of relevant) {
    const weight = SEVERITY_WEIGHT[finding.severity] ?? 1;
    const breadth = 1 + Math.min(Math.max(finding.affectedUrls.length, 1) / Math.max(pageCount, 1), 2);
    penalty += weight * breadth;
  }
  const normalised = (penalty / scale) * 2.2;

  // Size normalisation alone lets one catastrophic issue hide inside a large
  // site, which is how audit tools end up reporting 98/100 for a site that is
  // returning 500s. The presence of a severity therefore caps the category.
  let ceiling = 100;
  for (const [severity, cap] of [["critical", 55], ["high", 78], ["medium", 92]] as const) {
    const matching = relevant.filter((f) => f.severity === severity);
    if (matching.length) {
      ceiling = Math.min(ceiling, cap - Math.min(matching.length - 1, 8) * (cap * 0.04));
      break;
    }
  }
  return Math.round(Math.max(0, Math.min(100 - normalised, ceiling)) * 10) / 10;
}

function weighted(findings: Finding[], weights: Partial<Record<Category, number>>, pageCount: number): ScoreBreakdown {
  const categories = Object.keys(weights) as Category[];
  const components: Record<string, number> = {};
  let total = 0;
  for (const category of categories) {
    const value = categoryScore(findings, category, pageCount);
    components[category] = value;
    total += value * (weights[category] ?? 0);
  }

  const relevant = findings.filter((f) => categories.includes(f.category) && f.status === "open");
  if (relevant.some((f) => f.severity === "critical")) total = Math.min(total, 69);
  else if (relevant.some((f) => f.severity === "high")) total = Math.min(total, 87);

  const counts: Partial<Record<Severity, number>> = {};
  for (const finding of relevant) counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;

  const topIssues = [...relevant]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8)
    .map((f) => ({ code: f.code, title: f.title, severity: f.severity, url: f.url, priority: f.priority }));

  return { score: Math.round(total * 10) / 10, components, counts, topIssues };
}

export function scoreAll(findings: Finding[], pageCount: number): Scores {
  return {
    health: weighted(findings, HEALTH_WEIGHTS, pageCount),
    aeo: weighted(findings, AEO_WEIGHTS, pageCount),
    authority: weighted(findings, AUTHORITY_WEIGHTS, pageCount),
    experience: weighted(findings, EXPERIENCE_WEIGHTS, pageCount),
  };
}

export const SCORE_LABELS: Record<keyof Scores, { label: string; hint: string }> = {
  health: { label: "Search health", hint: "Can this site be crawled, indexed and understood" },
  aeo: { label: "AI answer readiness", hint: "Whether answer engines can reach, parse and cite it" },
  authority: { label: "Authority", hint: "Links, entity strength and local presence" },
  experience: { label: "Experience", hint: "Speed, mobile and whether a visitor can act" },
};

export function band(value: number | null | undefined): "good" | "warn" | "bad" | "none" {
  if (value == null) return "none";
  if (value >= 85) return "good";
  if (value >= 65) return "warn";
  return "bad";
}
