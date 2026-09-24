/**
 * Advertising policy, checked before submission rather than after rejection.
 *
 * A disapproved advert is an inconvenience. A pattern of them is an account
 * restriction, and a restricted Meta ad account is sometimes never recovered,
 * which ends a client's advertising permanently through no fault of theirs.
 * That asymmetry is why this runs before every submission and errs toward
 * refusing copy that would probably have been fine.
 *
 * The rules are generated from `analysis/ad_policy.py`. Each carries the
 * platform's own reasoning rather than ours, because an advertiser told "this
 * breaks a rule" argues, and an advertiser told what Meta actually prohibits
 * rewrites the line.
 */

import { POLICY_RULES, SPECIAL_CATEGORIES } from "./ads.generated";

export type PolicyHit = {
  rule: string;
  severity: "block" | "warn";
  matched: string;
  why: string;
  fix: string;
  platforms: string[];
};

export type PolicyVerdict = {
  canSubmit: boolean;
  blocks: PolicyHit[];
  warnings: PolicyHit[];
  category: string | null;
  note: string;
};

/** Run every rule that applies to this platform over one piece of copy. */
export function checkText(text: string, platform?: string): PolicyHit[] {
  const out: PolicyHit[] = [];
  if (!text) return out;
  for (const rule of POLICY_RULES) {
    if (rule.platforms.length && platform && !rule.platforms.includes(platform)) continue;
    const match = new RegExp(rule.pattern, rule.flags).exec(text);
    if (!match) continue;
    out.push({
      rule: rule.key,
      severity: rule.severity,
      matched: match[0],
      why: rule.why,
      fix: rule.fix,
      platforms: rule.platforms.length ? rule.platforms : ["all"],
    });
  }
  return out;
}

/**
 * Which restricted category this offer falls into, if any.
 *
 * Declared on the campaign rather than discovered when it is taken down. A
 * campaign in one of these loses age, postcode and detailed targeting by law
 * in several jurisdictions, so it changes the plan, not just a checkbox.
 */
export function specialCategory(text: string): string | null {
  for (const entry of SPECIAL_CATEGORIES) {
    if (new RegExp(entry.pattern, entry.flags).test(text ?? "")) return entry.name;
  }
  return null;
}

/** Everything in one advert, checked together. */
export function review(copyFields: Record<string, string>, platform?: string): PolicyVerdict {
  const joined = Object.values(copyFields).filter(Boolean).join(" ");
  const seen = new Map<string, PolicyHit>();
  for (const value of Object.values(copyFields)) {
    for (const hit of checkText(value ?? "", platform)) {
      // One rule firing in three fields is one problem, not three.
      if (!seen.has(hit.rule)) seen.set(hit.rule, hit);
    }
  }
  const unique = [...seen.values()];
  const blocks = unique.filter((h) => h.severity === "block");
  const warnings = unique.filter((h) => h.severity === "warn");
  const category = specialCategory(joined);

  let note: string;
  if (blocks.length) {
    note =
      `${blocks.length} thing${blocks.length === 1 ? "" : "s"} here would be rejected, and repeated ` +
      "rejections restrict the ad account rather than just the ad. Nothing is submitted until they are changed.";
  } else if (warnings.length) {
    note =
      `Nothing that blocks submission, and ${warnings.length} thing${warnings.length === 1 ? "" : "s"} ` +
      "that often draws a manual review and delays the launch.";
  } else {
    note =
      "Nothing known was tripped. That is not a guarantee of approval: this checks the rules that cause " +
      "rejections in volume, not the whole of any platform's policy.";
  }
  if (category) {
    note +=
      ` This is a ${category.replace(/_/g, " ")} offer, which is a restricted category. It is declared on ` +
      "the campaign, and the targeting available to it is reduced by law rather than by choice.";
  }

  return { canSubmit: blocks.length === 0, blocks, warnings, category, note };
}
