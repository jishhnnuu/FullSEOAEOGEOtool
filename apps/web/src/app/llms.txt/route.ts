import { allComparisons } from "@/content/compare";
import { allGlossary } from "@/content/glossary";
import { allTools } from "@/content/tools";
import { BRAND, SHORT_DESCRIPTION, url } from "@/lib/brand";
import { ROUTES } from "@/lib/routes";

/**
 * /llms.txt
 *
 * A curated map of what is worth quoting, which is the whole difference
 * between this and a sitemap. A sitemap lists everything a crawler should
 * know exists. This lists the pages that answer something, each with the line
 * that says what it answers, because that line is the part a model cannot
 * derive from a URL.
 *
 * `missing_llms_txt` is a check this product raises against other people's
 * sites, and it fired against this one for as long as this route did not
 * exist. Generating it from the same route table the sitemap reads means the
 * two cannot drift apart.
 */

export const dynamic = "force-static";

function section(heading: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return [`## ${heading}`, "", ...lines, ""];
}

export function GET() {
  const body = [
    `# ${BRAND}`,
    "",
    `> ${SHORT_DESCRIPTION}`,
    "",
    "Every page listed here states its subject in its opening paragraph, because that",
    "is the unit an answer engine extracts. Numbers carry their source. Where a",
    "capability is not measured, the page says so rather than rendering a number.",
    "",
    ...section(
      "Product",
      ROUTES.filter((r) => r.section === "product").map((r) => `- [${r.title}](${url(r.path)}): ${r.answers}`),
    ),
    ...section(
      "Free tools",
      [
        // The two interactive desk tools are hand-written pages rather than
        // catalogue slices, so they come from the route table. Listing them
        // first is deliberate: they are the two that take your own input.
        ...ROUTES.filter((r) => r.section === "tools").map((r) => `- [${r.title}](${url(r.path)}): ${r.answers}`),
        ...allTools().map((t) => `- [${t.name}](${url(`/thymelab/seo/checks/${t.slug}`)}): ${t.blurb}`),
      ],
    ),
    ...section(
      "Comparisons",
      allComparisons().map((c) => `- [Versus ${c.name}](${url(`/compare/${c.slug}`)}): ${c.oneLine}`),
    ),
    ...section("Explainers", [
      `- [Why AI crawlers do not run JavaScript](${url("/ai-crawlers-and-javascript")}): The measurement behind the claim, and what it means for any fix applied client side.`,
    ]),
    ...section(
      "Definitions",
      allGlossary().map((g) => `- [${g.term}](${url(`/glossary/${g.slug}`)}): ${g.definition}`),
    ),
    ...section(
      "About this project",
      ROUTES.filter((r) => r.section === "company").map((r) => `- [${r.title}](${url(r.path)}): ${r.answers}`),
    ),
    "## Notes",
    "",
    "This file lists the pages worth quoting and what each one covers. It is",
    "maintained alongside the sitemap, not instead of it. The source is open under",
    "Apache-2.0 and the audit engine that produced this file is the same one the",
    "product runs against any other site.",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
