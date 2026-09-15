"use client";

/**
 * Asking the answer engines whether they know you exist.
 *
 * This drives `engine/answers.ts` from the browser, using the tenant's own
 * model key through the same relay the writer uses. The cost model is the
 * point: the platforms that sell this charge between 29 and 500 a month and
 * spend a fraction of it on the model calls. Here the calls are the tenant's
 * own, at their own provider, at cost, and no key of ours is involved.
 *
 * It is deliberately slow and deliberately serial. A visibility check is not
 * a page load, and firing a dozen parallel requests at a provider is how a
 * tenant gets rate limited on their own key for no benefit.
 */

import {
  buildPrompts,
  readAnswer,
  summarise,
  type AnswerPrompt,
  type AnswerRun,
  type AnswerVisibility,
} from "@/engine/answers";
import type { AuditResult } from "@/engine/types";
import type { ModelConfig, SiteRecord } from "./store";

export type Progress = { done: number; total: number; asking: string };

/**
 * A neutral instruction.
 *
 * The system prompt must not mention the brand, because a model told to
 * consider a brand will mention it, and a measurement that changes the thing
 * it measures is not a measurement. It asks for the answer the model would
 * give anyone, and for sources, because whether a source is offered at all is
 * part of what is being tested.
 */
const SYSTEM = [
  "You are answering as a general assistant would for a member of the public.",
  "Give the answer you would normally give: specific, useful, and naming real companies, products or sources where that is what the question calls for.",
  "If you would normally cite sources or link to websites, do so.",
  "Do not ask clarifying questions. Answer in under 250 words.",
].join(" ");

export type VisibilityOptions = {
  /** How many of the generated prompts to spend a call on. */
  limit?: number;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
};

export class NoModelKey extends Error {
  constructor() {
    super(
      "Asking the answer engines needs a model key, because somebody has to pay the provider for the questions. " +
        "Add your own in Settings. It is used for the call and never stored.",
    );
  }
}

/** Every prompt this site would be measured on, without spending anything. */
export function previewPrompts(result: AuditResult, site: SiteRecord, limit = 12): AnswerPrompt[] {
  return buildPrompts(result, {
    brand: site.name || site.domain,
    competitors: site.competitors,
    locations: site.locations,
    industry: site.industry,
  }, limit);
}

/**
 * Ask, read, and score.
 *
 * Every failed prompt is kept as a note rather than thrown away: a provider
 * that rate-limits halfway through should still produce a result for the half
 * that answered, clearly labelled as partial.
 */
export async function measureVisibility(
  result: AuditResult,
  site: SiteRecord,
  model: ModelConfig | null,
  options: VisibilityOptions = {},
): Promise<AnswerVisibility> {
  if (!model?.apiKey) throw new NoModelKey();

  const prompts = previewPrompts(result, site, options.limit ?? 12);
  const runs: AnswerRun[] = [];
  const failures: string[] = [];

  for (const [index, prompt] of prompts.entries()) {
    if (options.signal?.aborted) break;
    options.onProgress?.({ done: index, total: prompts.length, asking: prompt.text });

    try {
      const response = await fetch("/api/engine/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: options.signal,
        body: JSON.stringify({
          provider: model.provider,
          apiKey: model.apiKey,
          model: model.model,
          baseUrl: model.baseUrl,
          system: SYSTEM,
          prompt: prompt.text,
          maxTokens: 700,
        }),
      });
      const body = (await response.json()) as { text?: string; message?: string; model?: string };
      if (!response.ok) throw new Error(body.message ?? `The provider answered ${response.status}.`);

      const answer = body.text ?? "";
      runs.push({
        promptId: prompt.id,
        prompt: prompt.text,
        kind: prompt.kind,
        provider: model.provider,
        model: body.model ?? model.model,
        askedAt: new Date().toISOString(),
        answer,
        mention: readAnswer(answer, {
          brand: site.name || site.domain,
          domain: site.domain,
          competitors: site.competitors,
        }),
      });
    } catch (error) {
      if (options.signal?.aborted) break;
      failures.push(`${prompt.text}: ${error instanceof Error ? error.message : "no answer"}`);
    }
  }

  options.onProgress?.({ done: prompts.length, total: prompts.length, asking: "" });

  const visibility = summarise(runs);
  if (failures.length > 0) {
    visibility.notes.unshift(
      `${failures.length} of ${prompts.length} prompts did not get an answer, so this run is partial. ` +
        `First failure: ${failures[0]}`,
    );
  }
  return visibility;
}

/* ------------------------------------------------------------------ trend */

export type VisibilityPoint = { at: string; presence: number; citationRate: number; asked: number };

/** The shape kept per site, so movement is visible rather than a single reading. */
export type VisibilityHistory = { siteId: string; points: VisibilityPoint[]; latest: AnswerVisibility | null };

export function appendPoint(history: VisibilityHistory | null, siteId: string, latest: AnswerVisibility): VisibilityHistory {
  const point: VisibilityPoint = {
    at: latest.askedAt,
    presence: latest.presence,
    citationRate: latest.citationRate,
    asked: latest.runs.length,
  };
  const points = [...(history?.points ?? []), point].slice(-40);
  return { siteId, points, latest };
}
