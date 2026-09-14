"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AUTONOMY_LEVELS, type Autonomy, type SiteRecord } from "@/lib/store";
import { useSite } from "@/lib/site-hooks";
import { Card, Notice, PageHeader } from "@/components/ui";

const MISSION_LABEL: Record<string, string> = {
  weekly_growth_cycle: "Weekly growth cycle: re-crawl, close what was fixed, catch what is new",
  content_production: "Content production: brief, draft, gate, route to review",
  aeo_tracking: "AI answer tracking: crawler access, extractability, citable passages",
  local_cycle: "Local cycle: profile, posts, review replies, citations",
  link_building: "Link building: prospect, qualify, draft, send under a cap",
  monthly_audit: "Monthly audit: the full catalogue and the narrative report",
};

export default function SiteSettingsPage() {
  const router = useRouter();
  const { site, mutate } = useSite();
  const [saved, setSaved] = useState(false);

  if (!site) return null;

  const patch = (fn: (record: SiteRecord) => void) => {
    mutate((w) => {
      const record = w.sites.find((s) => s.id === site.id);
      if (record) fn(record);
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <PageHeader title="Settings" description={site.domain} />

      {saved && <Notice kind="ok">Saved.</Notice>}

      <Card title="About this site">
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="name">Business name</label>
            <input id="name" defaultValue={site.name} onBlur={(e) => patch((s) => { s.name = e.target.value; })} />
            <div className="help">Used in schema, titles and the entity checks.</div>
          </div>
          <div className="field">
            <label htmlFor="industry">Industry or main service</label>
            <input id="industry" defaultValue={site.industry} onBlur={(e) => patch((s) => { s.industry = e.target.value; })} />
          </div>
          <div className="field">
            <label htmlFor="type">Business type</label>
            <select id="type" defaultValue={site.businessType} onChange={(e) => patch((s) => { s.businessType = e.target.value as SiteRecord["businessType"]; })}>
              <option value="local">Local business</option>
              <option value="ecommerce">Ecommerce</option>
              <option value="saas">SaaS or software</option>
              <option value="services">Services</option>
              <option value="b2b">B2B</option>
              <option value="publisher">Publisher or media</option>
            </select>
            <div className="help">Switches the local, ecommerce and intent checks on or off.</div>
          </div>
          <div className="field">
            <label htmlFor="cms">Where the site is built</label>
            <input id="cms" defaultValue={site.cms} onBlur={(e) => patch((s) => { s.cms = e.target.value; })} />
          </div>
          <div className="field">
            <label htmlFor="hosting">Hosting</label>
            <input id="hosting" defaultValue={site.hosting} onBlur={(e) => patch((s) => { s.hosting = e.target.value; })} />
            <div className="help">Decides where redirects and headers are set.</div>
          </div>
          <div className="field">
            <label htmlFor="pages">Pages per crawl</label>
            <select id="pages" defaultValue={site.maxPages} onChange={(e) => patch((s) => { s.maxPages = Number(e.target.value); })}>
              {[20, 40, 80, 150, 250].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="locations">Locations served</label>
          <input
            id="locations"
            defaultValue={site.locations.join(", ")}
            onBlur={(e) => patch((s) => { s.locations = splitList(e.target.value); })}
          />
          <div className="help">Comma separated. Each one without a page becomes a finding and a brief.</div>
        </div>
        <div className="field">
          <label htmlFor="competitors">Competitors</label>
          <input
            id="competitors"
            defaultValue={site.competitors.join(", ")}
            onBlur={(e) => patch((s) => { s.competitors = splitList(e.target.value); })}
          />
        </div>
        <div className="field">
          <label htmlFor="keywords">Terms you want to win</label>
          <input
            id="keywords"
            defaultValue={site.targetKeywords.join(", ")}
            onBlur={(e) => patch((s) => { s.targetKeywords = splitList(e.target.value); })}
          />
          <div className="help">Anything the site never mentions is reported as a gap with a brief attached.</div>
        </div>
      </Card>

      <Card title="Autonomy">
        <div className="field">
          <label htmlFor="autonomy">How much should it do without asking?</label>
          <select id="autonomy" defaultValue={site.autonomy} onChange={(e) => patch((s) => { s.autonomy = e.target.value as Autonomy; })}>
            {AUTONOMY_LEVELS.map((level) => <option key={level.key} value={level.key}>{level.label}</option>)}
          </select>
          <div className="help">{AUTONOMY_LEVELS.find((l) => l.key === site.autonomy)?.description}</div>
        </div>
        <Notice kind="warn">
          No level auto-approves content written in your voice, outreach sent from your domain, or anything
          site-wide and irreversible. That is not configurable, and it is the reason the higher levels are safe to
          use at all.
        </Notice>
      </Card>

      <Card title="Schedule">
        <p className="small muted">
          On this hosted deployment, missions run when you open the dashboard and press run: an edge runtime has no
          background worker. A self-hosted installation runs them on the schedule below without anyone present.
        </p>
        <div className="stack-sm">
          {site.schedule.map((entry) => (
            <label className="checkline" key={entry.mission}>
              <input
                type="checkbox"
                defaultChecked={entry.enabled}
                onChange={(e) => patch((s) => {
                  const item = s.schedule.find((x) => x.mission === entry.mission);
                  if (item) item.enabled = e.target.checked;
                })}
              />
              <span>
                {MISSION_LABEL[entry.mission] ?? entry.mission}
                <span className="faint small"> {entry.cadence}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card title="Remove this site">
        <p className="small muted">
          Deletes the site, its runs, its findings, its approvals and its drafts from this browser. It cannot be
          undone and nothing on the live site is touched.
        </p>
        <button
          className="danger"
          onClick={() => {
            if (!confirm(`Delete ${site.domain} and everything recorded against it?`)) return;
            mutate((w) => {
              w.sites = w.sites.filter((s) => s.id !== site.id);
              w.runs = w.runs.filter((r) => r.siteId !== site.id);
              w.approvals = w.approvals.filter((a) => a.siteId !== site.id);
              w.content = w.content.filter((c) => c.siteId !== site.id);
              w.activity = w.activity.filter((a) => a.siteId !== site.id);
            });
            router.push("/app");
          }}
        >
          Delete this site
        </button>
      </Card>
    </>
  );
}

function splitList(value: string): string[] {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}
