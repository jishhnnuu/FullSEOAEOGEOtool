/**
 * Drafting.
 *
 * Two modes, and the difference is honest on screen. Without a model key the
 * platform produces the skeleton: the brief, the outline, the answer block,
 * the FAQ shell, the schema and the meta. With the tenant's own key it writes
 * the prose into that skeleton. Neither mode publishes anything: a draft goes
 * to the approval queue and waits for a person.
 *
 * The house rules below are the same ones this repository holds itself to,
 * because the fastest way to be ignored by a reader and by an answer engine
 * is to sound like everything else.
 */

import { clamp, titleCase } from "./text";
import type { ContentBrief } from "./types";

export type ModelSettings = {
  provider: "anthropic" | "openai" | "google" | "openai-compatible";
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type BrandVoice = {
  brand: string;
  domain: string;
  audience: string;
  tone: string;
  /** Claims the brand is willing to make in public, with their source. */
  facts: { claim: string; source: string }[];
  banned: string[];
  location: string | null;
};

const HOUSE_RULES = `Write like a person who has done this work, not like a content tool.

Hard rules:
- No em dashes or en dashes as punctuation. Use a comma, a colon or a full stop.
- Never use: delve, leverage as a verb, seamless, robust, unlock, elevate, "in today's fast-paced world", "it's important to note", "in conclusion".
- Vary sentence length. Uniform sentence rhythm is the most reliable sign of machine writing there is.
- No closing paragraph that restates the article.
- Do not open with a definition of the industry. Open with the answer.
- Say what a thing costs and where it falls short. A page that only sells is a page nobody cites.
- Every number must come from the supplied facts or be marked [UNVERIFIED: what to check].
- Do not invent customers, statistics, awards, dates or quotes. If you need one, write [UNVERIFIED: ...].`;

export function buildPrompt(brief: ContentBrief, voice: BrandVoice): { system: string; prompt: string } {
  const factLines = voice.facts.length
    ? voice.facts.map((f) => `- ${f.claim} (source: ${f.source})`).join("\n")
    : "- none supplied, so every specific number must be marked [UNVERIFIED: ...]";

  const system = [
    `You write for ${voice.brand} (${voice.domain}).`,
    voice.location ? `They operate in ${voice.location}.` : "",
    `Audience: ${voice.audience}`,
    `Tone: ${voice.tone}`,
    "",
    HOUSE_RULES,
    voice.banned.length ? `\nNever use these words or phrases: ${voice.banned.join(", ")}.` : "",
  ].filter(Boolean).join("\n");

  const outline = brief.outline
    .map((section) => `${"#".repeat(section.level)} ${section.heading}\n(${section.guidance})`)
    .join("\n\n");

  const prompt = [
    `Write the page below as markdown. Return only the markdown, starting with the H1.`,
    ``,
    `Title: ${brief.title}`,
    `Primary keyword: ${brief.targetKeyword}`,
    `Supporting keywords (use naturally, do not force): ${brief.supportingKeywords.join(", ") || "none"}`,
    `Search intent: ${brief.intent}`,
    `Audience: ${brief.audience}`,
    `Target length: about ${brief.wordTarget} words`,
    ``,
    `Open with a direct answer block: ${brief.answerBlock}`,
    ``,
    `Outline to follow:`,
    outline,
    ``,
    `Finish with an FAQ section containing these questions, each answered in 60 words or fewer:`,
    brief.faq.map((f) => `- ${f.q}`).join("\n"),
    ``,
    `Facts you may state as true:`,
    factLines,
    ``,
    `Anything else that needs a number, a date, a name or a claim: write [UNVERIFIED: what a human must check] inline. Do not guess.`,
  ].join("\n");

  return { system, prompt };
}

export type Draft = {
  markdown: string;
  wordCount: number;
  unverified: string[];
  generatedBy: "model" | "skeleton";
  model: string | null;
  gates: GateResult[];
  passesAll: boolean;
};

export type GateResult = { gate: string; passed: boolean; detail: string };

export async function writeDraft(
  brief: ContentBrief,
  voice: BrandVoice,
  settings: ModelSettings | null,
): Promise<Draft> {
  if (!settings?.apiKey) {
    const markdown = skeleton(brief, voice);
    return finish(markdown, "skeleton", null, brief);
  }

  const { system, prompt } = buildPrompt(brief, voice);
  const response = await fetch("/api/engine/llm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
      baseUrl: settings.baseUrl,
      system,
      prompt,
      maxTokens: Math.min(16000, Math.round(brief.wordTarget * 2.2)),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string }).message ?? "The model provider refused the request.");
  }
  const markdown = ((data as { text?: string }).text ?? "").trim();
  if (!markdown) throw new Error("The model returned nothing.");
  return finish(markdown, "model", (data as { model?: string }).model ?? settings.model, brief);
}

function finish(markdown: string, by: Draft["generatedBy"], model: string | null, brief: ContentBrief): Draft {
  const unverified = [...markdown.matchAll(/\[UNVERIFIED:([^\]]*)\]/gi)].map((m) => m[1].trim());
  const gates = runGates(markdown, brief, unverified);
  return {
    markdown,
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
    unverified,
    generatedBy: by,
    model,
    gates,
    passesAll: gates.every((g) => g.passed),
  };
}

/* ----------------------------------------------------------------- gates */

const BANNED = ["delve", "leverage", "seamless", "robust", "unlock", "elevate", "in today's fast-paced world", "it's important to note", "in conclusion", "furthermore", "moreover"];

export function runGates(markdown: string, brief: ContentBrief, unverified: string[]): GateResult[] {
  const lower = markdown.toLowerCase();
  const words = markdown.split(/\s+/).filter(Boolean).length;
  const sentences = markdown.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 15);
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1);
  const variance = lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / Math.max(lengths.length, 1);

  const foundBanned = BANNED.filter((word) => lower.includes(word));
  const dashes = (markdown.match(/[–—]/g) ?? []).length;
  const keywordHits = lower.split(brief.targetKeyword.toLowerCase()).length - 1;
  const headings = (markdown.match(/^#{1,3}\s+/gm) ?? []).length;
  const firstParagraph = markdown.split(/\n\s*\n/).find((b) => !b.trim().startsWith("#")) ?? "";

  return [
    {
      gate: "Length",
      passed: words >= brief.wordTarget * 0.55,
      detail: `${words} words against a ${brief.wordTarget} word target`,
    },
    {
      gate: "Machine-writing tells",
      passed: foundBanned.length === 0 && dashes === 0,
      detail: foundBanned.length || dashes
        ? `${[foundBanned.length ? `banned phrases: ${foundBanned.join(", ")}` : "", dashes ? `${dashes} em or en dashes` : ""].filter(Boolean).join("; ")}`
        : "No banned phrasing, no dashes used as punctuation",
    },
    {
      gate: "Sentence rhythm",
      passed: Math.sqrt(variance) >= 4,
      detail: `Standard deviation of sentence length is ${Math.sqrt(variance).toFixed(1)} words. Under 4 reads as machine-written.`,
    },
    {
      gate: "Keyword discipline",
      passed: keywordHits >= 1 && keywordHits <= Math.max(6, words / 250),
      detail: `"${brief.targetKeyword}" appears ${keywordHits} times`,
    },
    {
      gate: "Structure",
      passed: headings >= 3,
      detail: `${headings} headings`,
    },
    {
      gate: "Answer block",
      passed: firstParagraph.length > 80,
      detail: firstParagraph.length > 80
        ? "Opens with a passage an answer engine can quote"
        : "The opening passage is too short to be quoted on its own",
    },
    {
      gate: "Unverified claims",
      passed: unverified.length === 0,
      detail: unverified.length
        ? `${unverified.length} claims need checking before this goes out: ${unverified.slice(0, 3).join("; ")}`
        : "Nothing is asserted that the brief did not supply",
    },
  ];
}

/* -------------------------------------------------------------- skeleton */

function skeleton(brief: ContentBrief, voice: BrandVoice): string {
  const lines: string[] = [`# ${brief.title}`, ""];
  lines.push(
    `**Answer block.** ${brief.answerBlock}`,
    "",
    `_Written without a model key, so this is the structure rather than the prose. Add your own provider key in Settings and the same brief is drafted in full. Nothing here publishes on its own either way._`,
    "",
  );

  for (const section of brief.outline.slice(1)) {
    lines.push(`${"#".repeat(section.level)} ${section.heading}`, "", section.guidance, "");
  }

  lines.push("## Questions", "");
  for (const item of brief.faq) {
    lines.push(`### ${item.q}`, "", item.a, "");
  }

  if (voice.facts.length) {
    lines.push("## Facts available to this page", "");
    for (const fact of voice.facts) lines.push(`- ${fact.claim} (source: ${fact.source})`);
    lines.push("");
  }

  lines.push(
    "## Before publishing",
    "",
    `- Primary keyword: ${brief.targetKeyword}`,
    `- Meta title: ${brief.metaTitle}`,
    `- Meta description: ${brief.metaDescription}`,
    `- Internal links in: ${brief.internalLinks.map((l) => l.url).join(", ") || "none identified yet"}`,
    `- Citations needed: ${brief.citationsNeeded.join("; ")}`,
    "",
  );
  return lines.join("\n");
}

/** A short brand voice from whatever the tenant has told us so far. */
export function defaultVoice(brand: string, domain: string, industry: string | null, location: string | null): BrandVoice {
  return {
    brand,
    domain,
    audience: industry ? `People looking for ${industry}` : "People deciding whether to buy",
    tone: "Direct, specific, no sales language. Written by someone who does the work.",
    facts: [],
    banned: [],
    location,
  };
}

export function titleFromBrief(brief: ContentBrief): string {
  return clamp(titleCase(brief.title), 70);
}
