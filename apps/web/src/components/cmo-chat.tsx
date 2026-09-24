"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { reply, systemPrompt, type Reply } from "@/engine/cmo";
import type { AuditResult } from "@/engine/types";

/*
 * Talking to the CMO.
 *
 * The product's claim is that a client speaks to one person and the desks
 * organise themselves behind them. Before this, the workspace had nineteen
 * screens and no way to ask a question, which made that claim a sentence on a
 * marketing page.
 *
 * Three decisions worth stating.
 *
 * **It works with no model key.** `engine/cmo.ts` reads the intent and answers
 * from what the workspace measured. A key makes the reply conversational; it
 * is not what makes it possible. Most people will never add one and the thing
 * still has to be useful for them.
 *
 * **The model never sees a blank page.** Where a key exists, the deterministic
 * answer is composed first and handed to the model as ground truth. A model
 * answering from the conversation alone invents a number within three
 * exchanges, and a number invented by something calling itself your CMO is
 * worse than silence, because people act on it.
 *
 * **Voice runs in the browser.** The Web Speech API transcribes locally, needs
 * no key, costs nothing and sends no audio anywhere. Where a browser does not
 * support it the button says so rather than failing quietly.
 */

type Turn = { who: "you" | "cmo"; text: string[]; actions?: Reply["actions"]; desk?: string | null };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function recogniser(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export function CmoChat({
  siteId,
  domain,
  result,
  desks,
  planName,
  firstName,
  model,
}: {
  siteId: string;
  domain: string;
  result: AuditResult | null;
  desks: { search: boolean; content: boolean; social: boolean; paid: boolean };
  planName: string;
  firstName?: string | null;
  /** The tenant's own key, from the workspace. Read here, never stored here. */
  model?: { provider?: string; apiKey?: string; model?: string } | null;
}) {
  const ctx = { siteId, domain, result, desks, planName, firstName };
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const baseDraft = useRef("");

  // The opening line, composed once from real state rather than hard-coded.
  useEffect(() => {
    const opener = reply("hello", ctx);
    setTurns([{ who: "cmo", text: opener.says, actions: opener.actions, desk: opener.desk }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, result]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, thinking]);

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = recogniser();
    if (!rec) {
      setVoiceNote(
        "This browser has no speech recognition. Chrome, Edge and Safari have it; Firefox does not. " +
        "Typing works everywhere.",
      );
      return;
    }
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-GB";
    baseDraft.current = draft ? draft.trimEnd() + " " : "";

    rec.onresult = (event) => {
      let finals = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) finals += text;
        else interim += text;
      }
      // Finals are committed, interim is shown live and replaced next tick, so
      // the box reads like a transcript rather than stuttering.
      if (finals) baseDraft.current = (baseDraft.current + finals).replace(/\s+/g, " ");
      setDraft((baseDraft.current + interim).replace(/\s+/g, " ").trimStart());
    };
    rec.onerror = (e) => {
      setVoiceNote(
        e?.error === "not-allowed"
          ? "Microphone access was refused. Allow it in the address bar, or type instead."
          : "The microphone stopped. Typing works.",
      );
      setListening(false);
    };
    rec.onend = () => setListening(false);

    setVoiceNote(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      setVoiceNote("The microphone could not start. Typing works.");
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;
    if (listening) recRef.current?.stop();
    setDraft("");
    baseDraft.current = "";

    const grounded = reply(text, ctx);
    setTurns((t) => [...t, { who: "you", text: [text] }]);

    // The tenant's own key, from the one place the workspace already keeps it.
    // No key is the normal case here, not a degraded one.
    const key = model?.apiKey ?? "";
    const provider = model?.provider ?? "anthropic";

    if (!key) {
      setTurns((t) => [...t, { who: "cmo", text: grounded.says, actions: grounded.actions, desk: grounded.desk }]);
      return;
    }

    setThinking(true);
    try {
      const response = await fetch("/api/engine/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: key,
          model: model?.model,
          system: systemPrompt(ctx, grounded),
          prompt: text,
          maxTokens: 500,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { text?: string; message?: string };
      const spoken = (body.text ?? "").trim();
      setTurns((t) => [
        ...t,
        spoken
          ? { who: "cmo", text: spoken.split(/\n{2,}/).filter(Boolean), actions: grounded.actions, desk: grounded.desk }
          : { who: "cmo", text: grounded.says, actions: grounded.actions, desk: grounded.desk },
      ]);
    } catch {
      // The grounded answer was always the real one, so a model failure costs
      // the phrasing and nothing else.
      setTurns((t) => [...t, { who: "cmo", text: grounded.says, actions: grounded.actions, desk: grounded.desk }]);
    } finally {
      setThinking(false);
    }
  }

  const suggestions = ["What should I do first?", "What is wrong with the site?", "What does this cost?", "Can you run our ads?"];

  return (
    <div className="cmo">
      <div className="cmo-thread">
        {turns.map((turn, i) => (
          <div key={i} className={turn.who === "you" ? "cmo-turn you" : "cmo-turn cmo-said"}>
            {turn.who === "cmo" && turn.desk && <span className="cmo-desk">{turn.desk}</span>}
            {turn.text.map((line, j) => <p key={j}>{line}</p>)}
            {turn.actions && turn.actions.length > 0 && (
              <div className="cmo-actions">
                {turn.actions.map((a) => (
                  <Link key={a.href + a.label} href={a.href} className="button small">{a.label}</Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {thinking && <div className="cmo-turn cmo-said"><p className="muted">Thinking.</p></div>}
        <div ref={endRef} />
      </div>

      {turns.length <= 1 && (
        <div className="cmo-suggestions">
          {suggestions.map((s) => (
            <button key={s} type="button" className="button small" onClick={() => setDraft(s)}>{s}</button>
          ))}
        </div>
      )}

      {voiceNote && <p className="tiny faint cmo-voicenote">{voiceNote}</p>}

      <form
        className="cmo-compose"
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <button
          type="button"
          onClick={toggleVoice}
          className={listening ? "cmo-mic on" : "cmo-mic"}
          aria-label={listening ? "Stop recording" : "Speak instead of typing"}
          title={listening ? "Stop recording" : "Speak instead of typing"}
        >
          <span aria-hidden="true">{listening ? "■" : "●"}</span>
        </button>
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          placeholder={listening ? "Listening. Speak normally." : "Ask your CMO anything, or press the dot and talk."}
        />
        <button type="submit" className="button primary" disabled={!draft.trim() || thinking}>Send</button>
      </form>
      <p className="tiny faint" style={{ margin: "0.5rem 0 0" }}>
        {listening
          ? "Transcribing in your browser. No audio is sent anywhere."
          : "Every number here comes from your own crawl. Where something is not known, it says so rather than estimating."}
      </p>
    </div>
  );
}
