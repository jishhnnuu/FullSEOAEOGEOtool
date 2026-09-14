"use client";

import { use, useRef, useState } from "react";
import useSWR from "swr";
import { api, fetcher, type BrandAssetOut } from "@/lib/api";
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader, timeAgo } from "@/components/ui";

type Profile = {
  id: string; version: number; one_liner: string | null;
  tone_attributes: string[]; vocabulary_prefer: string[]; vocabulary_avoid: string[];
  banned_phrases: string[]; value_props: string[]; differentiators: string[];
  proof_points: string[]; audiences: any[]; person: string | null;
  reading_level: string | null; required_disclaimers: string[];
  cta_patterns: string[]; example_passages: string[]; approved_at: string | null;
};

type Fact = {
  id: string; statement: string; category: string; source: string;
  status: string; expired: boolean; used: number;
};

const ASSET_KINDS = [
  "style_guide", "brand_book", "tone_of_voice", "case_study", "product_sheet",
  "price_list", "whitepaper", "pitch_deck", "faq", "persona_doc", "other",
];

export default function BrandPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const { data: profile, error, mutate: reloadProfile } =
    useSWR<Profile | null>(`/sites/${siteId}/brand/profile`, fetcher);
  const { data: assets, mutate: reloadAssets } =
    useSWR<BrandAssetOut[]>(`/sites/${siteId}/brand/assets`, fetcher);
  const { data: facts, mutate: reloadFacts } =
    useSWR<{ facts: Fact[]; note: string }>(`/sites/${siteId}/brand/facts`, fetcher);

  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("style_guide");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newFact, setNewFact] = useState({ statement: "", source_ref: "", category: "general" });

  if (error) return <ErrorNote error={error} />;

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      await api.upload(`/sites/${siteId}/brand/assets`, form);
      if (fileRef.current) fileRef.current.value = "";
      reloadAssets();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function addFact(e: React.FormEvent) {
    e.preventDefault();
    await api.post(`/sites/${siteId}/brand/facts`, { ...newFact, source_type: "client_stated" });
    setNewFact({ statement: "", source_ref: "", category: "general" });
    reloadFacts();
  }

  return (
    <>
      <PageHeader
        title="Brand"
        description="What your company sounds like and what it is willing to claim. Writers work from this, and nothing outside the fact ledger gets published."
      />

      <Card title="Upload brand material">
        <p className="muted small">
          Style guides, case studies, price lists, pitch decks. Text is extracted and
          indexed immediately, so the next draft can use it.
        </p>
        <form onSubmit={upload} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
            <label htmlFor="file">File</label>
            <input id="file" type="file" ref={fileRef}
                   accept=".pdf,.txt,.md,.docx,.doc,.pptx,.csv,.png,.jpg,.jpeg,.svg" />
          </div>
          <div className="field" style={{ flex: "0 1 200px", marginBottom: 0 }}>
            <label htmlFor="kind">What is it?</label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {ASSET_KINDS.map((k) => (
                <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <button className="primary" type="submit" disabled={uploading}>
            {uploading ? "Reading…" : "Upload"}
          </button>
        </form>
        {uploadError && <div className="notice notice-bad small" style={{ marginTop: "0.7rem" }}>{uploadError}</div>}

        {assets && assets.length > 0 && (
          <table style={{ marginTop: "1rem" }}>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div>{a.title ?? a.filename}</div>
                    <div className="faint small">{a.kind.replace(/_/g, " ")} · {timeAgo(a.created_at)}</div>
                  </td>
                  <td>
                    <Badge kind={a.status === "indexed" ? "ok" : a.status === "failed" ? "high" : "neutral"}>
                      {a.status}
                    </Badge>
                    {a.error && <div className="faint small">{a.error}</div>}
                  </td>
                  <td className="num faint small">
                    {a.size_bytes ? `${Math.round(a.size_bytes / 1024)} kB` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={profile ? `Voice profile v${profile.version}` : "Voice profile"}>
        {!profile ? (
          <Empty title="No profile yet">
            <span className="small">
              Built during onboarding from your own pages, then improved by anything
              you upload above.
            </span>
          </Empty>
        ) : (
          <div className="stack">
            {profile.one_liner && (
              <div>
                <div className="faint small">What you do</div>
                <p style={{ margin: "0.2rem 0 0" }}>{profile.one_liner}</p>
              </div>
            )}
            <div className="grid grid-2">
              <ListBlock label="Tone" items={profile.tone_attributes} />
              <ListBlock label="Words you use" items={profile.vocabulary_prefer} />
              <ListBlock label="Words you avoid" items={profile.vocabulary_avoid} />
              <ListBlock label="Never say" items={profile.banned_phrases} />
              <ListBlock label="Value propositions" items={profile.value_props} />
              <ListBlock label="Proof points" items={profile.proof_points} />
              <ListBlock label="Required disclaimers" items={profile.required_disclaimers} />
              <ListBlock label="How you ask" items={profile.cta_patterns} />
            </div>
            {profile.example_passages?.length > 0 && (
              <details>
                <summary className="small muted">Writing samples used as the reference</summary>
                {profile.example_passages.map((p, i) => (
                  <blockquote key={i} className="small" style={{
                    borderLeft: "3px solid var(--border-strong)",
                    margin: "0.6rem 0 0", padding: "0 0 0 0.8rem", color: "var(--text-muted)",
                  }}>{p}</blockquote>
                ))}
              </details>
            )}
          </div>
        )}
      </Card>

      <Card title="Fact ledger">
        <p className="muted small">{facts?.note}</p>
        <form onSubmit={addFact} className="row" style={{ alignItems: "flex-end", marginBottom: "1rem" }}>
          <div className="field" style={{ flex: "2 1 280px", marginBottom: 0 }}>
            <label htmlFor="statement">A fact we may state publicly</label>
            <input id="statement" required value={newFact.statement}
                   placeholder="We have treated over 12,000 patients since 2009"
                   onChange={(e) => setNewFact({ ...newFact, statement: e.target.value })} />
          </div>
          <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
            <label htmlFor="source">Where it comes from</label>
            <input id="source" required value={newFact.source_ref}
                   placeholder="Practice records, Jan 2026"
                   onChange={(e) => setNewFact({ ...newFact, source_ref: e.target.value })} />
          </div>
          <button className="primary" type="submit">Add</button>
        </form>

        {!facts?.facts.length ? (
          <Empty title="No facts recorded yet">
            <span className="small">Until there are, writers can only cite external sources.</span>
          </Empty>
        ) : (
          <table>
            <thead>
              <tr><th>Statement</th><th>Category</th><th>Source</th><th className="num">Used</th><th></th></tr>
            </thead>
            <tbody>
              {facts.facts.map((f) => (
                <tr key={f.id} style={{ opacity: f.status === "retracted" ? 0.5 : 1 }}>
                  <td>{f.statement}</td>
                  <td className="small muted">{f.category}</td>
                  <td className="small muted truncate" style={{ maxWidth: 200 }}>{f.source}</td>
                  <td className="num">{f.used}</td>
                  <td>
                    {f.expired && <Badge kind="medium">expired</Badge>}
                    {f.status === "active" && (
                      <button className="small danger"
                              onClick={async () => {
                                await api.del(`/sites/${siteId}/brand/facts/${f.id}`);
                                reloadFacts();
                              }}>Retract</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="faint small">{label}</div>
      <div className="row" style={{ gap: "0.3rem", marginTop: "0.25rem" }}>
        {items.slice(0, 14).map((item, i) => <Badge key={i} kind="neutral">{item}</Badge>)}
      </div>
    </div>
  );
}
