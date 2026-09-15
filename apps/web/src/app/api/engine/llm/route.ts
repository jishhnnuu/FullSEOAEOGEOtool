/**
 * The writer's model call, using the tenant's own key.
 *
 * This is a relay, not a provider. The key arrives on the request from the
 * browser that holds it, is used once, and is never written down: not to a
 * log line, not to a cache, not to storage. The platform has no key of its
 * own and no account with any model vendor, which is the property that makes
 * a deployment of this standalone.
 *
 * Everything the platform does without a key still works: the audit, the
 * fixes, the schema, the briefs, the link plan. A key buys long-form drafting
 * and nothing else.
 */

import { NextRequest } from "next/server";

import { DEFAULT_MODEL_NAMES } from "@/lib/models";

export const dynamic = "force-dynamic";

type Body = {
  provider?: string;
  apiKey?: string;
  model?: string;
  system?: string;
  prompt?: string;
  maxTokens?: number;
  baseUrl?: string;
};

const PROVIDERS = ["anthropic", "openai", "google", "openai-compatible"] as const;
type Provider = (typeof PROVIDERS)[number];

const DEFAULT_MODELS: Record<Provider, string> = DEFAULT_MODEL_NAMES as Record<Provider, string>;

function bad(message: string, status = 400) {
  return Response.json({ message }, { status });
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad("Send a JSON body.");
  }

  const provider = (body.provider ?? "") as Provider;
  if (!PROVIDERS.includes(provider)) {
    return bad(`Unknown provider. Pick one of: ${PROVIDERS.join(", ")}.`);
  }
  const apiKey = (body.apiKey ?? "").trim();
  if (!apiKey) {
    return bad("No API key was sent. Add your own key in Settings; the platform does not hold one.");
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return bad("Nothing to write.");

  const model = (body.model ?? "").trim() || DEFAULT_MODELS[provider];
  if (!model) return bad("Name the model to use.");
  const maxTokens = Math.max(256, Math.min(body.maxTokens ?? 4000, 16000));

  try {
    const text = await call(provider, { apiKey, model, prompt, system: body.system ?? "", maxTokens, baseUrl: body.baseUrl });
    return Response.json({ text, model, provider }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The model provider refused the request.";
    // Never echo the key back, even inside an upstream error body.
    return Response.json({ message: message.replace(apiKey, "[redacted]") }, { status: 502 });
  }
}

type CallArgs = {
  apiKey: string;
  model: string;
  prompt: string;
  system: string;
  maxTokens: number;
  baseUrl?: string;
};

async function call(provider: Provider, args: CallArgs): Promise<string> {
  switch (provider) {
    case "anthropic": return anthropic(args);
    case "openai": return openaiCompatible(args, "https://api.openai.com/v1");
    case "google": return google(args);
    case "openai-compatible": {
      const base = (args.baseUrl ?? "").replace(/\/$/, "");
      if (!/^https:\/\//i.test(base)) throw new Error("An OpenAI-compatible endpoint needs an https base URL.");
      return openaiCompatible(args, base);
    }
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message ?? parsed?.message ?? text.slice(0, 400);
  } catch {
    return text.slice(0, 400) || `HTTP ${response.status}`;
  }
}

async function anthropic({ apiKey, model, prompt, system, maxTokens }: CallArgs): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { content?: { type?: string; text?: string }[] };
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").join("");
}

async function openaiCompatible({ apiKey, model, prompt, system, maxTokens }: CallArgs, base: string): Promise<string> {
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data?.choices?.[0]?.message?.content ?? "";
}

async function google({ apiKey, model, prompt, system, maxTokens }: CallArgs): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}
