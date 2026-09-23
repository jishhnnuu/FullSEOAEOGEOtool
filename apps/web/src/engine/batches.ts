/**
 * Turning a queue of findings into a handful of decisions.
 *
 * A real site produces 150 findings. The queue asks for 150 decisions. Founders
 * make three and close the tab, which is the single most reliable way this
 * product fails in the field, and it was named as such in `docs/opinion/001`.
 *
 * The obvious fix is wrong. Collapsing everything into one "apply all" button
 * turns an approval gate into a rubber stamp, and the gate is the thing that
 * stops a tool damaging a site it was trusted with. So the grouping is by
 * **decision character**: what kind of judgement the change actually needs, not
 * what check produced it.
 *
 * Four rules decide the partition, and they are the interesting part:
 *
 * 1. **A batch is only a batch if every item in it deserves the same answer.**
 *    Thirty-eight missing meta descriptions are one decision because the
 *    reasoning is identical for all thirty-eight. A redirect and an alt
 *    attribute are two decisions however similar their severity looks.
 *
 * 2. **Site-wide and irreversible changes are never batched.** robots.txt, mass
 *    redirects, bulk noindex: each is its own decision at every autonomy level,
 *    which is the same rule the policy engine enforces server side. A batch
 *    containing one of these would let a careless click take a site out of the
 *    index.
 *
 * 3. **Anything that writes prose is read, not approved.** A generated
 *    paragraph can be wrong about the business in a way no severity score
 *    captures. These are counted and surfaced, never bundled.
 *
 * 4. **Low confidence never joins a batch.** A check the catalogue is unsure
 *    about is exactly the one a person should look at, and burying it in a
 *    count of thirty-eight is how a false positive gets applied at scale.
 */

import { CATALOG } from "./catalog";
import type { Finding, Fix } from "./types";

export type BatchKind =
  /** Mechanical, reversible, identical reasoning across every item. */
  | "mechanical"
  /** A single file published at the site root. One decision each. */
  | "root_file"
  /** Writes or rewrites prose. Needs reading. */
  | "editorial"
  /** Site-wide or hard to reverse. Never grouped, never auto-approved. */
  | "structural"
  /** Nothing to apply: a diagnosis, or something only a person can do. */
  | "manual";

export type Batch = {
  id: string;
  kind: BatchKind;
  /** The decision, phrased as the thing that will happen. */
  title: string;
  /** Why it is safe to decide these together, or why it is not. */
  rationale: string;
  findings: Finding[];
  /** Pages touched, which is the number that tells someone the blast radius. */
  pages: number;
  /** True when one click can reasonably answer the whole batch. */
  batchable: boolean;
  /** Ordering. Highest first. */
  priority: number;
};

/**
 * Whether a fix is structural: site-wide, or hard to undo.
 *
 * Read from the fix itself rather than from a list of check codes. The fix
 * generator already decides `risk` and `reversible` when it builds the
 * artefact, and it knows things a code name cannot: a redirect for one retired
 * page and a redirect map across a migration share a code and are not the same
 * decision. A hardcoded list would also drift the first time a new fix
 * strategy was added, and drift here means a site-wide change quietly becoming
 * batchable.
 *
 * This is the same judgement `agents/policy.py` applies server side, reading
 * the same two properties.
 */
function isStructural(fix: Fix): boolean {
  return !fix.reversible || fix.risk === "critical" || fix.risk === "high";
}

/** Fixes that publish one file at the origin root. Each is its own decision. */
const ROOT_FILES: Record<string, string> = {
  no_sitemap: "sitemap.xml",
  missing_llms_txt: "llms.txt",
};

/**
 * Fixes that write or rewrite sentences a reader will see.
 *
 * A meta description is deliberately not here: it is a snippet with a known
 * shape, generated from the page's own content, and it is reversible in one
 * click. A direct-answer paragraph is here, because it makes a claim.
 */
const EDITORIAL = new Set([
  "no_direct_answer",
  "no_citable_facts",
  "thin_content",
  "no_meaningful_headings",
  "heading_hierarchy_broken",
  "missing_location_page",
  "nap_missing",
  "no_clear_cta",
  "intent_mismatch",
  "unsubstantiated_claim",
  "ymyl_no_credentials",
]);

/**
 * How confident the catalogue has to be before a finding may join a batch.
 *
 * 0.8 is the catalogue's own default. Anything below it is a check that was
 * written knowing it would sometimes be wrong, and those are the ones a person
 * should see individually.
 */
const BATCH_CONFIDENCE_FLOOR = 0.8;

/** A stable, readable label for a group of mechanical fixes. */
const MECHANICAL_LABELS: Record<string, { verb: string; noun: string }> = {
  meta: { verb: "Update", noun: "page title and description" },
  jsonld: { verb: "Add", noun: "structured data block" },
  html: { verb: "Apply", noun: "on-page change" },
  copy: { verb: "Apply", noun: "text change" },
  link_plan: { verb: "Add", noun: "internal link" },
  redirect: { verb: "Add", noun: "redirect" },
  file: { verb: "Publish", noun: "file" },
};

function plural(count: number, noun: string): string {
  if (count === 1) return `1 ${noun}`;
  // Only the nouns this file actually uses, pluralised the boring way.
  return `${count} ${noun.endsWith("s") ? noun : `${noun}s`}`;
}

/**
 * Partition an audit's findings into the decisions a person should be asked
 * to make.
 *
 * Returns them ordered by what is worth doing first, which is priority rather
 * than severity: a medium-severity fix on forty pages usually beats a high on
 * one.
 */
export function buildBatches(findings: Finding[]): Batch[] {
  const batches: Batch[] = [];
  const mechanical = new Map<string, Finding[]>();
  const manual: Finding[] = [];
  const editorial: Finding[] = [];

  for (const finding of findings) {
    const def = CATALOG[finding.code];

    // Nothing to apply. Counted so the screen can say how much of the audit is
    // diagnosis rather than pretending everything is actionable.
    if (!finding.fix) {
      manual.push(finding);
      continue;
    }

    if (isStructural(finding.fix)) {
      batches.push({
        id: `structural:${finding.id}`,
        kind: "structural",
        title: def?.title ?? finding.code,
        rationale: `${
          finding.fix.reversible ? "High risk" : "Not reversible"
        }, so it is presented on its own at every autonomy level. Read the before and after before approving.`,
        findings: [finding],
        pages: Math.max(finding.affectedUrls.length, 1),
        batchable: false,
        priority: finding.priority + 100,
      });
      continue;
    }

    const rootFile = ROOT_FILES[finding.code];
    if (rootFile) {
      batches.push({
        id: `root:${finding.code}`,
        kind: "root_file",
        title: `Publish ${rootFile}`,
        rationale: `One file at the root of the site. It is a single decision and it is reversible by deleting the file.`,
        findings: [finding],
        pages: 1,
        batchable: true,
        priority: finding.priority + 50,
      });
      continue;
    }

    if (EDITORIAL.has(finding.code)) {
      editorial.push(finding);
      continue;
    }

    // Low confidence is shown individually, because a check that was written
    // knowing it would sometimes be wrong is the wrong thing to apply forty
    // times on one click.
    if ((finding.confidence ?? def?.confidence ?? 1) < BATCH_CONFIDENCE_FLOOR) {
      batches.push({
        id: `single:${finding.id}`,
        kind: "manual",
        title: def?.title ?? finding.code,
        rationale:
          "This check is right often enough to raise and not often enough to apply in bulk, so it is shown on its own.",
        findings: [finding],
        pages: Math.max(finding.affectedUrls.length, 1),
        batchable: false,
        priority: finding.priority,
      });
      continue;
    }

    // Everything left is mechanical. Grouped by the shape of the change,
    // because that is what makes the reasoning identical across the batch.
    const key = finding.fix.kind;
    const list = mechanical.get(key) ?? [];
    list.push(finding);
    mechanical.set(key, list);
  }

  for (const [kind, items] of mechanical) {
    const label = MECHANICAL_LABELS[kind] ?? { verb: "Apply", noun: "change" };
    const pages = items.reduce((sum, f) => sum + Math.max(f.affectedUrls.length, 1), 0);
    batches.push({
      id: `mechanical:${kind}`,
      kind: "mechanical",
      title: `${label.verb} ${plural(items.length, label.noun)}`,
      rationale:
        `Every item here is the same kind of change, generated from the page's own content, and each one stores ` +
        `the previous value so reversing it runs the same route backwards. The reasoning is identical across all ` +
        `${items.length}, which is what makes it one decision rather than ${items.length}.`,
      findings: items,
      pages,
      batchable: true,
      priority: Math.max(...items.map((f) => f.priority)),
    });
  }

  if (editorial.length) {
    batches.push({
      id: "editorial",
      kind: "editorial",
      title: `${plural(editorial.length, "page")} where something has to be written`,
      rationale:
        "These write sentences a reader will see, and a generated sentence can be wrong about your business in a " +
        "way no severity score catches. Read each one. They are counted here rather than bundled.",
      findings: editorial,
      pages: editorial.reduce((sum, f) => sum + Math.max(f.affectedUrls.length, 1), 0),
      batchable: false,
      priority: Math.max(...editorial.map((f) => f.priority)),
    });
  }

  if (manual.length) {
    batches.push({
      id: "manual",
      kind: "manual",
      title: `${plural(manual.length, "finding")} with no fix to apply`,
      rationale:
        "Diagnosis rather than work: a missing connection, a judgement about the business, or something only a " +
        "person can do. Listed so the audit is not read as more actionable than it is.",
      findings: manual,
      pages: manual.reduce((sum, f) => sum + Math.max(f.affectedUrls.length, 1), 0),
      batchable: false,
      priority: -1,
    });
  }

  return batches.sort((a, b) => b.priority - a.priority);
}

/**
 * The sentence above the queue.
 *
 * Says how many decisions there are and how many findings they cover, because
 * the whole point is that the second number is much larger than the first and
 * the reader should see that immediately.
 */
export function summarise(batches: Batch[]): string {
  const decisions = batches.filter((b) => b.batchable).length;
  const findings = batches.reduce((sum, b) => sum + b.findings.length, 0);
  const needReading = batches.filter((b) => !b.batchable).reduce((sum, b) => sum + b.findings.length, 0);

  if (findings === 0) return "Nothing is waiting on you.";

  const parts = [
    `${plural(findings, "finding")} across ${plural(decisions, "batched decision")}`,
  ];
  if (needReading > 0) {
    parts.push(`${plural(needReading, "item")} that needs reading first`);
  }
  return `${parts.join(", plus ")}.`;
}
