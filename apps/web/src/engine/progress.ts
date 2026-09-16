/**
 * Whether the work is done, and what "done" means.
 *
 * The thing a retainer buys that a tool does not is the feeling of a
 * programme: someone is on this, here is where we are, here is what is next.
 * A tool that shows the same 150 findings every week feels like a treadmill
 * even when it is working, because nothing ever says "that part is finished".
 *
 * So the work is divided into stages a person can hold in their head, each
 * with a definition of done that is checkable rather than a feeling. The
 * stages are ordered the way an agency would order them: nothing about
 * content or links matters while pages are not being indexed.
 */

import type { AuditResult, Finding } from "./types";

export type StageKey = "crawlable" | "understood" | "answerable" | "competitive" | "known" | "compounding";

export type Stage = {
  key: StageKey;
  name: string;
  /** What this stage is for, in one sentence. */
  purpose: string;
  /** How you know it is finished. */
  definitionOfDone: string;
  /** Why this order. */
  whyNow: string;
  status: "done" | "in_progress" | "not_started" | "blocked";
  /** 0 to 1. */
  progress: number;
  /** What is left, specifically. */
  remaining: { what: string; count: number }[];
  /** What is blocking it, when blocked. */
  blockedBy: string | null;
};

export type Programme = {
  stages: Stage[];
  /** The stage to work on now. */
  current: StageKey;
  /** How far through the whole programme. */
  overall: number;
  /** The sentence a person reads first. */
  headline: string;
  /** What finishing the current stage unlocks. */
  nextUp: string;
};

/** Findings that belong to each stage, by the category they sit in. */
const STAGE_CODES: Record<StageKey, (f: Finding) => boolean> = {
  crawlable: (f) =>
    ["page_noindex", "robots_blocks_important", "redirect_loop", "page_5xx", "page_404_linked", "canonical_mismatch",
     "sitemap_missing", "noindex_in_sitemap", "orphan_page", "content_needs_javascript"].includes(f.code),
  understood: (f) =>
    f.category === "schema" ||
    ["title_missing", "title_too_long", "title_too_short", "meta_description_missing", "h1_missing", "heading_skip",
     "image_alt_missing", "entity_unclear"].includes(f.code),
  answerable: (f) => f.category === "aeo",
  competitive: (f) => f.category === "content" && !["title_missing", "title_too_long", "title_too_short"].includes(f.code),
  known: (f) => f.category === "offpage" || f.category === "local",
  compounding: () => false,
};

const STAGE_META: Record<StageKey, Omit<Stage, "status" | "progress" | "remaining" | "blockedBy" | "key">> = {
  crawlable: {
    name: "Can it be found",
    purpose: "Every page you want ranked is reachable, indexable and returns something.",
    definitionOfDone: "No critical or high finding in the technical category, and nothing in the sitemap that cannot be indexed.",
    whyNow: "Nothing else matters while a page cannot be crawled. A perfect article on a noindexed URL earns nothing.",
  },
  understood: {
    name: "Can it be understood",
    purpose: "Each page tells a machine what it is: a title, a description, one h1, structured data that resolves.",
    definitionOfDone: "Every indexable page has a title, a description and an h1, and the entity graph resolves to one organisation.",
    whyNow: "A page that cannot be classified competes for nothing in particular. This is the cheapest work in the programme and it gates everything after it.",
  },
  answerable: {
    name: "Can it be quoted",
    purpose: "Answer engines can reach the site, parse it, and find a passage worth lifting.",
    definitionOfDone: "No AI crawler blocked by accident, an llms.txt published, and the pages that answer questions do so in their opening paragraph.",
    whyNow: "More searches end inside an answer every quarter. This is where the growth is, and almost nobody has done it.",
  },
  competitive: {
    name: "Is it better than theirs",
    purpose: "The pages that could rank actually deserve to, measured against the pages above them.",
    definitionOfDone: "Every page with impressions and a position between 5 and 30 has been compared against what outranks it, and the closable differences are closed.",
    whyNow: "Hygiene gets you considered. This is what gets you chosen, and it is the first stage where the work is genuinely hard.",
  },
  known: {
    name: "Is it known",
    purpose: "Other people name you, in places that matter and places answer engines quote.",
    definitionOfDone: "A mention programme running, links verified rather than claimed, and mentions on at least three domains the engines cite.",
    whyNow: "Brand mentions correlate with AI visibility at three times the rate backlinks do. This compounds and nothing before it does.",
  },
  compounding: {
    name: "Keep it running",
    purpose: "The site is audited on a schedule, regressions are caught, and the report goes out without anyone asking.",
    definitionOfDone: "A schedule running, two consecutive reports with no new severe findings, and a measured trend.",
    whyNow: "Search results decay. A site that was fixed once and never looked at again is a site slowly going backwards.",
  },
};

function severe(findings: Finding[]): number {
  return findings.filter((f) => (f.severity === "critical" || f.severity === "high") && f.status === "open").length;
}

export function assessProgramme(input: {
  result: AuditResult | null;
  /** Whether Search Console is connected, which gates the competitive stage. */
  hasSearchData: boolean;
  /** Whether any link or mention work exists. */
  mentionsTracked: number;
  linksVerified: number;
  /** Whether a schedule is running. */
  scheduled: boolean;
  /** Consecutive clean runs, for the last stage. */
  cleanRuns: number;
}): Programme {
  const findings = input.result?.findings ?? [];
  const stages: Stage[] = [];

  for (const key of ["crawlable", "understood", "answerable", "competitive", "known", "compounding"] as StageKey[]) {
    const meta = STAGE_META[key];
    const own = findings.filter((f) => STAGE_CODES[key](f) && f.status === "open");
    const severeCount = severe(own);

    let status: Stage["status"] = "not_started";
    let progress = 0;
    let blockedBy: string | null = null;
    const remaining: { what: string; count: number }[] = [];

    if (!input.result) {
      status = "not_started";
    } else if (key === "competitive") {
      if (!input.hasSearchData) {
        status = "blocked";
        blockedBy = "Search Console is not connected, so there is no way to know which pages are close enough to rank to be worth rewriting. Guessing at this stage wastes the most expensive work in the programme.";
      } else {
        progress = own.length === 0 ? 1 : Math.max(0, 1 - own.length / 20);
        status = progress >= 1 ? "done" : "in_progress";
        if (own.length) remaining.push({ what: "pages behind what outranks them", count: own.length });
      }
    } else if (key === "known") {
      const target = 3;
      progress = Math.min(1, (input.mentionsTracked / 10) * 0.5 + (input.linksVerified / 10) * 0.5);
      status = progress >= 1 ? "done" : progress > 0 ? "in_progress" : "not_started";
      if (input.mentionsTracked < 10) remaining.push({ what: "more mentions to find or earn", count: 10 - input.mentionsTracked });
      if (input.linksVerified < target) remaining.push({ what: "links still to verify", count: target - input.linksVerified });
    } else if (key === "compounding") {
      progress = (input.scheduled ? 0.5 : 0) + Math.min(0.5, input.cleanRuns * 0.25);
      status = progress >= 1 ? "done" : progress > 0 ? "in_progress" : "not_started";
      if (!input.scheduled) remaining.push({ what: "a schedule to set", count: 1 });
      if (input.cleanRuns < 2) remaining.push({ what: "consecutive clean runs needed", count: 2 - input.cleanRuns });
    } else {
      // Technical stages: done when nothing severe is open, and the progress
      // bar reflects how much of what was found has been cleared.
      const total = findings.filter((f) => STAGE_CODES[key](f)).length;
      const open = own.length;
      progress = total === 0 ? 1 : Math.max(0, 1 - open / total);
      status = severeCount === 0 && open === 0 ? "done" : severeCount === 0 ? "in_progress" : "in_progress";
      if (severeCount > 0) remaining.push({ what: "severe findings", count: severeCount });
      if (open - severeCount > 0) remaining.push({ what: "smaller findings", count: open - severeCount });
    }

    stages.push({ key, ...meta, status, progress: Math.min(1, Math.max(0, progress)), remaining, blockedBy });
  }

  // The current stage is the first that is not done. A blocked stage does not
  // stop the programme, it steps aside.
  const current = stages.find((s) => s.status !== "done" && s.status !== "blocked")?.key ?? "compounding";
  const overall = stages.reduce((sum, s) => sum + s.progress, 0) / stages.length;
  const currentStage = stages.find((s) => s.key === current)!;
  const nextStage = stages[stages.findIndex((s) => s.key === current) + 1];

  const done = stages.filter((s) => s.status === "done");
  const headline = !input.result
    ? "Nothing has run yet. The first audit sets the baseline."
    : done.length === stages.length
      ? "Every stage is done. The programme is in maintenance, which is where it should stay."
      : done.length > 0
        ? `${done.map((s) => s.name.toLowerCase()).join(" and ")} ${done.length === 1 ? "is" : "are"} done. You are on "${currentStage.name.toLowerCase()}".`
        : `Starting on "${currentStage.name.toLowerCase()}". ${currentStage.whyNow}`;

  return {
    stages,
    current,
    overall,
    headline,
    nextUp: nextStage
      ? `Finishing this opens "${nextStage.name.toLowerCase()}": ${nextStage.purpose}`
      : "This is the last stage. After it the programme runs itself and reports.",
  };
}

/* ---------------------------------------------------------- what changed */

/** A thing worth telling the user about, whether or not they are looking. */
export type Milestone = {
  at: string;
  kind: "stage_complete" | "severe_cleared" | "first_measurement" | "link_won" | "regression";
  what: string;
  /** Whether it is worth an email rather than only a badge in the app. */
  notify: boolean;
};

/**
 * Compare two programme states and say what actually happened.
 *
 * Deliberately quiet. A notification for every finding cleared trains people
 * to ignore notifications, so only a stage completing, a severe finding
 * appearing, or the first real measurement earns one.
 */
export function milestonesBetween(before: Programme | null, after: Programme, now = new Date()): Milestone[] {
  const at = now.toISOString();
  const out: Milestone[] = [];
  if (!before) return out;

  for (const stage of after.stages) {
    const was = before.stages.find((s) => s.key === stage.key);
    if (was && was.status !== "done" && stage.status === "done") {
      out.push({
        at,
        kind: "stage_complete",
        what: `"${stage.name}" is done. ${stage.definitionOfDone}`,
        notify: true,
      });
    }
    if (was && was.status === "done" && stage.status !== "done") {
      out.push({
        at,
        kind: "regression",
        what: `"${stage.name}" was finished and is not any more. Something changed on the site.`,
        notify: true,
      });
    }
  }
  return out;
}
