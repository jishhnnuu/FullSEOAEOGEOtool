"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type Site } from "@/lib/api";
import { Card, PageHeader } from "@/components/ui";

const BUSINESS_TYPES = [
  ["local", "Local business with premises"],
  ["ecommerce", "Online store"],
  ["saas", "Software or SaaS"],
  ["b2b_services", "B2B services"],
  ["publisher", "Publisher or media"],
  ["marketplace", "Marketplace"],
  ["agency", "Agency"],
  ["nonprofit", "Nonprofit"],
  ["unknown", "Something else"],
];

export default function Onboarding() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", base_url: "", business_type: "unknown", industry: "",
    autonomy: "assisted",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const site = await api.post<Site>("/sites", {
        ...form,
        name: form.name || form.base_url,
        industry: form.industry || null,
      });
      // The audit needs nothing connected, so it starts immediately. The
      // client sees real findings about their own site before they are
      // asked for a single credential.
      await api.post(`/sites/${site.id}/run`, { mission_key: "onboard_site" }).catch(() => {});
      router.replace(`/sites/${site.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that site");
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div style={{ width: "100%", maxWidth: 540 }}>
        <PageHeader
          title="Add your website"
          description="We crawl it and produce a full audit before asking you to connect anything."
        />
        <Card>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="url">Website address</label>
              <input id="url" value={form.base_url} required placeholder="example.com"
                     onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="name">Business name</label>
              <input id="name" value={form.name} placeholder="Acme Dental"
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="type">What kind of business is it?</label>
              <select id="type" value={form.business_type}
                      onChange={(e) => setForm({ ...form, business_type: e.target.value })}>
                {BUSINESS_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div className="help">This decides which playbook runs. You can change it later.</div>
            </div>
            <div className="field">
              <label htmlFor="industry">Industry</label>
              <input id="industry" value={form.industry} placeholder="Dentistry"
                     onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="autonomy">How much should we do without asking?</label>
              <select id="autonomy" value={form.autonomy}
                      onChange={(e) => setForm({ ...form, autonomy: e.target.value })}>
                <option value="observe">Observe only, change nothing</option>
                <option value="propose">Propose everything, I approve each item</option>
                <option value="assisted">Apply safe technical fixes, I approve all content</option>
                <option value="managed">Also publish content types I pre-approve</option>
                <option value="autopilot">Everything inside policy, send me a digest</option>
              </select>
              <div className="help">
                You can raise this later. Site-wide and irreversible changes always
                come to you, at every level.
              </div>
            </div>

            {error && <div className="notice notice-bad" style={{ marginBottom: "0.85rem" }}>{error}</div>}
            <button className="primary" type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Starting the audit…" : "Add site and run the first audit"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
