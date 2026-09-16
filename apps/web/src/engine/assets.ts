/**
 * What to publish so that people link to you without being asked.
 *
 * This is the part of an agency's work that actually justifies the fee, and
 * almost no software attempts it. Most link building fails for a reason no
 * amount of outreach fixes: the site has nothing worth citing. You can send
 * four hundred emails about a services page and earn nothing, because there is
 * no reason for anyone to reference it.
 *
 * The usual answer is a brainstorm. This derives it instead, from two things
 * the product already measures.
 *
 * The first is the set of questions the answer engines were asked and did not
 * name us in. Every lost prompt is a question our category is being asked
 * where somebody else is the source. That is not a content gap in the usual
 * sense; it is a citation gap, and it names the asset precisely.
 *
 * The second is who the engines cited instead. Those domains are proof of what
 * gets quoted in this category, and the format they used is the format that
 * earns the citation.
 *
 * What comes out is a small number of specific things to publish, each with
 * the reason it would earn links and the evidence that the demand exists.
 * Nothing invented: every brief traces to a prompt that was actually asked and
 * an answer that was actually read.
 */

import type { AuditResult } from "./types";

export type AssetFormat =
  | "original_data"
  | "definitive_guide"
  | "comparison"
  | "calculator"
  | "free_tool"
  | "annual_report"
  | "template"
  | "glossary";

export type AssetIdea = {
  id: string;
  format: AssetFormat;
  title: string;
  /** The question this exists to answer. */
  question: string;
  /** Why this would earn citations rather than just traffic. */
  whyItEarnsLinks: string;
  /** The evidence that demand exists, from our own measurements. */
  evidence: string;
  /** Who would link to it, derived from who the engines cite today. */
  wouldLink: string[];
  /** What it takes to make. Honest, because most of these are real work. */
  effort: "a day" | "a week" | "a month" | "ongoing";
  /** How much of the work this product can do. */
  weCanDo: string;
  /** What only a person can supply. */
  youMustSupply: string;
  priority: number;
};

/** The formats that earn citations, and what each one needs to be true. */
const FORMAT_RULES: Record<AssetFormat, { earns: string; needs: string }> = {
  original_data: {
    earns: "A number nobody else has is the only asset with no ceiling. Journalists cite statistics, and a statistic has exactly one source.",
    needs: "Data you already hold, or a survey of people you can reach. Fifty responses is enough to be quotable if the group is specific.",
  },
  definitive_guide: {
    earns: "The page people send to someone who asked. Earns links slowly and forever, and answer engines quote it because it states things plainly.",
    needs: "Genuine depth and a willingness to answer the question fully rather than gate the useful half.",
  },
  comparison: {
    earns: "Comparison pages earn links from forums, communities and people settling arguments. They also get quoted verbatim by answer engines.",
    needs: "Honesty about where you lose. A comparison that says you win everything earns nothing.",
  },
  calculator: {
    earns: "A tool gets bookmarked, embedded and linked from resource pages. It keeps earning with no further work.",
    needs: "One calculation people actually do by hand today.",
    },
  free_tool: {
    earns: "The strongest link magnet available to a software company, because a useful free thing is the easiest recommendation anyone makes.",
    needs: "Something small and genuinely useful that runs without an account.",
  },
  annual_report: {
    earns: "A recurring citation. Publish it yearly and it becomes the reference point for your category.",
    needs: "A dataset you can repeat. The second edition is worth more than the first.",
  },
  template: {
    earns: "Templates get shared, and sharing carries a link. Low effort, steady yield.",
    needs: "A document your customers currently build from nothing.",
  },
  glossary: {
    earns: "Definition pages are what answer engines quote when someone asks what a term means, and they attract links from anyone explaining the field.",
    needs: "Terms your customers actually use, defined better than the top result defines them.",
  },
};

export type LostPrompt = {
  prompt: string;
  kind: string;
  /** Who was named instead. */
  wonBy: string[];
};

export type CitedDomain = { domain: string; count: number };

/**
 * Derive what to publish.
 *
 * Ordered by how directly each one addresses a question that was actually
 * asked and lost, because that is the strongest evidence of demand available
 * without paid keyword data.
 */
export function assetIdeas(
  input: {
    lost: LostPrompt[];
    citedDomains: CitedDomain[];
    result: Pick<AuditResult, "keywords" | "gaps"> | null;
    brand: string;
    industry?: string;
  },
): AssetIdea[] {
  const ideas: AssetIdea[] = [];
  const wouldLink = input.citedDomains.slice(0, 6).map((d) => d.domain);
  let n = 0;
  const add = (idea: Omit<AssetIdea, "id">) => {
    n += 1;
    ideas.push({ ...idea, id: `asset${n}` });
  };

  /*
   * A lost category prompt is the highest-value signal in the product. It
   * means the question is being asked, an answer exists, and it is not us.
   */
  for (const lost of input.lost.slice(0, 4)) {
    const format: AssetFormat = /\bcompares?\b|\bvs\.?\b|versus|better than|worse than|cheaper than|alternative to/i.test(lost.prompt)
      ? "comparison"
      : /how (much|many|long|do|to)|what (is|are)|cost|price/i.test(lost.prompt)
        ? "definitive_guide"
        : "original_data";
    const rules = FORMAT_RULES[format];
    add({
      format,
      title: titleFor(format, lost.prompt, input.brand),
      question: lost.prompt,
      whyItEarnsLinks: rules.earns,
      evidence: lost.wonBy.length
        ? `This exact question was put to an answer engine and it named ${lost.wonBy.join(", ")} rather than you. The demand is measured, not assumed.`
        : "This question was put to an answer engine and nobody was named clearly, which means the category has no accepted source yet. That is the cheapest position to take.",
      wouldLink,
      effort: format === "original_data" ? "a month" : format === "comparison" ? "a week" : "a week",
      weCanDo:
        "The brief, the outline, the answer block, the FAQ structure, the schema and the internal link plan, all from the crawl. With your model key, the full draft.",
      youMustSupply: rules.needs,
      priority: 0.95 - n * 0.05,
    });
  }

  /*
   * A category with no accepted source is worth an annual report. The tell is
   * that the engines cite many different domains rather than a few, which
   * means no one reference exists.
   */
  const spread = input.citedDomains.length;
  const concentrated = input.citedDomains.slice(0, 3).reduce((sum, d) => sum + d.count, 0);
  const totalCitations = input.citedDomains.reduce((sum, d) => sum + d.count, 0) || 1;
  if (spread >= 6 && concentrated / totalCitations < 0.5) {
    add({
      format: "annual_report",
      title: `The ${new Date().getFullYear()} ${input.industry || "industry"} report`,
      question: "What is actually happening in this category, with numbers?",
      whyItEarnsLinks: FORMAT_RULES.annual_report.earns,
      evidence: `Answer engines cited ${spread} different domains across the questions asked, with no single source dominating. A category with no accepted reference is a category where one can be taken.`,
      wouldLink,
      effort: "a month",
      weCanDo: "The structure, the questions to ask, and the write-up once the data exists.",
      youMustSupply: FORMAT_RULES.annual_report.needs,
      priority: 0.8,
    });
  }

  // A software or services company with no free tool is leaving the easiest
  // link magnet there is on the table.
  add({
    format: "free_tool",
    title: "One small free tool",
    question: "What do people in this category do by hand that software could do in a second?",
    whyItEarnsLinks: FORMAT_RULES.free_tool.earns,
    evidence:
      "Not derived from a lost prompt. Included because it is the highest-yield asset available to anyone who can ship software, and because resource pages link to tools far more readily than to articles.",
    wouldLink,
    effort: "a week",
    weCanDo: "Identify the calculation from your own content, write the brief, and draft the page around it.",
    youMustSupply: FORMAT_RULES.free_tool.needs,
    priority: 0.7,
  });

  return ideas.sort((a, b) => b.priority - a.priority);
}

/**
 * Turn a question into a title without producing nonsense.
 *
 * Stripping the leading question word alone leaves the auxiliary behind, which
 * is how a generator emits "Are the best options for small firms: the complete
 * answer". The whole interrogative opening has to go, and when what is left is
 * too short or still reads as a fragment, the question is kept intact instead.
 * A title that is simply the question is always better than a mangled one.
 */
function titleFor(format: AssetFormat, prompt: string, brand: string): string {
  const subject = subjectOf(prompt);
  switch (format) {
    case "comparison": {
      // "How does X compare to Y" reads as nonsense with the auxiliary
      // stripped, so the two named things are pulled out and set against each
      // other, which is how a person would title it anyway.
      const against = subject ?? keepQuestion(prompt).replace(/\?$/, "");
      const pair = /(.+?)\s+(?:compares?|compared)\s+(?:to|with|against)\s+(.+)/i.exec(against)
        ?? /(.+?)\s+(?:vs\.?|versus)\s+(.+)/i.exec(against)
        ?? /^(?:is|are)\s+(.+?)\s+(?:better|worse|cheaper|faster|safer)\s+than\s+(.+)/i.exec(against);
      if (pair) return `${sentenceCase(pair[1].trim())} vs ${pair[2].trim()}: an honest comparison`;
      return subject ? `${sentenceCase(subject)}: an honest comparison` : keepQuestion(prompt);
    }
    case "definitive_guide":
      return subject ? `${sentenceCase(subject)}: the complete answer` : keepQuestion(prompt);
    case "original_data":
      return subject ? `What we found when we measured ${subject}` : `What we found when we measured this`;
    default:
      return subject ? `${brand}: ${subject}` : keepQuestion(prompt);
  }
}

/**
 * The noun phrase a question is about, or null when it cannot be had cleanly.
 *
 * Handles the two shapes that produce most of the damage: a wh-word followed
 * by a copula ("what are the best X"), and a wh-word followed by an auxiliary
 * and a subject ("how does X compare to Y").
 */
function subjectOf(prompt: string): string | null {
  const question = prompt.trim().replace(/\?+$/, "").trim();

  // "How does X compare to Y" and friends: keep everything after the auxiliary.
  const auxiliary = /^(how|why|when|where|what|which|who)\s+(do|does|did|can|could|should|would|will|is|are|was|were)\s+(.+)$/i.exec(question);
  if (auxiliary) {
    const rest = auxiliary[3].trim();
    return rest.length >= 8 ? rest : null;
  }

  // "What is X", "What are the best X": drop the wh-word and the copula.
  const copula = /^(what|which|who)\s+(is|are)\s+(.+)$/i.exec(question);
  if (copula) {
    const rest = copula[3].trim();
    return rest.length >= 8 ? rest : null;
  }

  // "How to X" is already a noun phrase once the how is removed.
  const howTo = /^how to\s+(.+)$/i.exec(question);
  if (howTo && howTo[1].length >= 8) return howTo[1].trim();

  // Anything else: only usable if it does not open with an interrogative.
  if (/^(what|how|why|who|which|when|where|do|does|is|are|can|should)\b/i.test(question)) return null;
  return question.length >= 8 ? question : null;
}

/**
 * The question, kept as a title.
 *
 * With its question mark, because "Is Acme better than Sage" without one is a
 * fragment and with one is a perfectly good headline.
 */
function keepQuestion(prompt: string): string {
  const trimmed = prompt.trim();
  const interrogative = /^(what|how|why|who|which|when|where|do|does|did|is|are|was|were|can|could|should|would|will)\b/i.test(trimmed);
  if (interrogative && !trimmed.endsWith("?")) return `${trimmed}?`;
  return trimmed;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
