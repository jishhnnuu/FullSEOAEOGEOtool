"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { api, fetcher, type Site } from "@/lib/api";
import { Badge, Card, ErrorNote, Loading, PageHeader, timeAgo } from "@/components/ui";

type Schedule = {
  id: string; mission_key: string; cron: string; enabled: boolean;
  last_run_at: string | null; last_status: string | null;
  next_run_at: string | null; consecutive_failures: number;
};

const AUTONOMY = [
  ["observe", "Observe only", "We analyse and report. Nothing on your site changes."],
  ["propose", "Propose everything", "We draft every change and you approve each one."],
  ["assisted", "Apply safe fixes", "Reversible technical fixes ship on their own. All content comes to you."],
  ["managed", "Publish pre-approved types", "Content types you nominate publish without asking. Everything else comes to you."],
  ["autopilot", "Autopilot", "Everything inside your policy ships. You get a digest."],
];

export default function SettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const { data: site, error, mutate } = useSWR<Site>(`/sites/${siteId}`, fetcher);
  const { data: schedules, mutate: reloadSchedules } =
    useSWR<Schedule[]>(`/sites/${siteId}/schedules`, fetcher);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (error) return <ErrorNote error={error} />;
  if (!site) return <Loading />;

  async function update(patch: Record<string, unknown>) {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch(`/sites/${siteId}`, patch);
      await mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const policy = (site as any).policy ?? {};

  return (
    <>
      <PageHeader
        title="Settings"
        description="How much the platform does without asking, and what it must never touch."
      />

      <Card title="Autonomy">
        <p className="muted small">
          Site-wide and irreversible changes always come to you, at every level.
          Nothing here can authorise a tactic that risks a penalty.
        </p>
        <div className="stack" style={{ gap: "0.4rem" }}>
          {AUTONOMY.map(([value, label, description]) => (
            <label key={value} style={{
              display: "flex", gap: "0.6rem", alignItems: "flex-start",
              border: "1px solid var(--border)", borderRadius: 6, padding: "0.6rem 0.7rem",
              cursor: "pointer",
              background: site.autonomy === value ? "var(--accent-soft)" : "transparent",
              borderColor: site.autonomy === value ? "var(--accent)" : "var(--border)",
              fontWeight: 400,
            }}>
              <input type="radio" name="autonomy" value={value} checked={site.autonomy === value}
                     onChange={() => update({ autonomy: value })} style={{ width: "auto", marginTop: "0.25rem" }} />
              <span>
                <strong>{label}</strong>
                <div className="muted small">{description}</div>
              </span>
            </label>
          ))}
        </div>
        {saved && <div className="notice notice-ok small" style={{ marginTop: "0.8rem" }}>Saved.</div>}
      </Card>

      <Card title="Guardrails">
        <div className="field">
          <label htmlFor="never">Paths we must never touch</label>
          <input id="never" defaultValue={(policy.never_touch_paths ?? []).join(", ")}
                 placeholder="/legal, /careers, /investors"
                 onBlur={(e) => update({
                   policy: { ...policy, never_touch_paths: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) },
                 })} />
          <div className="help">Any change to these comes to you, whatever the autonomy level.</div>
        </div>
        <div className="field">
          <label htmlFor="autopub">Content types that may publish without approval</label>
          <input id="autopub" defaultValue={(policy.auto_publish_types ?? []).join(", ")}
                 placeholder="article, glossary"
                 onBlur={(e) => update({
                   policy: { ...policy, auto_publish_types: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) },
                 })} />
          <div className="help">Only applies at "managed" autonomy and above.</div>
        </div>
        <div className="field">
          <label htmlFor="autoapprove">Auto-approve low-risk items after (hours)</label>
          <input id="autoapprove" type="number" min={0} defaultValue={policy.auto_approve_after_hours ?? ""}
                 placeholder="leave blank to require a decision"
                 onBlur={(e) => update({
                   policy: { ...policy, auto_approve_after_hours: e.target.value ? Number(e.target.value) : null },
                 })} />
          <div className="help">
            So a busy week does not stall the programme. Only low-risk, reversible items.
          </div>
        </div>
        <div className="field">
          <label htmlFor="outreach">Outreach sending</label>
          <select id="outreach" defaultValue={policy.outreach_sending ?? "draft_only"}
                  onChange={(e) => update({ policy: { ...policy, outreach_sending: e.target.value } })}>
            <option value="draft_only">Draft only, I send them myself</option>
            <option value="approved">Send after I approve each one</option>
            <option value="autonomous">Send without asking (autopilot only)</option>
          </select>
          <div className="help">Outreach always leaves from your own domain, never ours.</div>
        </div>
      </Card>

      <Card title="Schedule">
        {!schedules?.length ? (
          <p className="muted small">No recurring missions yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Mission</th><th>Cadence</th><th>Last run</th><th>Next</th><th></th></tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id}>
                  <td>{s.mission_key.replace(/_/g, " ")}</td>
                  <td className="mono small">{s.cron}</td>
                  <td className="small muted">
                    {s.last_run_at ? timeAgo(s.last_run_at) : "never"}
                    {s.last_status && <> · <Badge kind={s.last_status === "succeeded" ? "ok" : "medium"}>{s.last_status}</Badge></>}
                    {s.consecutive_failures > 2 && <Badge kind="high">{s.consecutive_failures} failures</Badge>}
                  </td>
                  <td className="small muted">{s.enabled ? timeAgo(s.next_run_at) : "paused"}</td>
                  <td>
                    <button className="small" onClick={async () => {
                      await api.put(`/sites/${siteId}/schedules`, {
                        mission_key: s.mission_key, cron: s.cron, enabled: !s.enabled,
                      });
                      reloadSchedules();
                    }}>{s.enabled ? "Pause" : "Resume"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Site">
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" defaultValue={site.name} onBlur={(e) => update({ name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="industry">Industry</label>
            <input id="industry" defaultValue={site.industry ?? ""}
                   onBlur={(e) => update({ industry: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="cms">Where the site lives</label>
            <select id="cms" defaultValue={site.cms_platform}
                    onChange={(e) => update({ cms_platform: e.target.value })}>
              {["unknown", "wordpress", "shopify", "webflow", "ghost", "contentful",
                "sanity", "strapi", "github", "custom_http"].map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="type">Business type</label>
            <select id="type" defaultValue={site.business_type}
                    onChange={(e) => update({ business_type: e.target.value })}>
              {["unknown", "local", "ecommerce", "saas", "b2b_services", "publisher",
                "marketplace", "agency", "nonprofit"].map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="faint small" style={{ marginBottom: 0 }}>
          {site.domain} · added {timeAgo((site as any).created_at)}
          {saving && " · saving…"}
        </p>
      </Card>
    </>
  );
}
