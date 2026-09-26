"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { AUTONOMY_LEVELS, id, logActivity, update, type Autonomy, type SiteRecord } from "@/lib/store";
import { startRun } from "@/lib/runner";
import { useWorkspace } from "@/lib/useWorkspace";
import type { RunProgress } from "@/engine/run";
import { Card, Notice, PageHeader } from "@/components/ui";
import { AuditScope } from "@/components/audit-scope";

const BUSINESS_TYPES: { key: SiteRecord["businessType"]; label: string; hint: string }[] = [
  { key: "local", label: "Local business", hint: "Serves customers in named places. Maps and the profile matter more than anything." },
  { key: "ecommerce", label: "Ecommerce", hint: "Sells products online. Product markup, faceted navigation and category copy." },
  { key: "saas", label: "SaaS or software", hint: "Comparison and alternative queries carry most of the commercial intent." },
  { key: "services", label: "Services", hint: "Sells expertise. Trust signals and credentials do the work." },
  { key: "b2b", label: "B2B", hint: "Long cycle, several readers per deal, research-heavy queries." },
  { key: "publisher", label: "Publisher or media", hint: "Volume, freshness, author authority and article markup." },
];

const CMS_OPTIONS = [
  "WordPress", "Shopify", "Webflow", "Wix", "Squarespace", "Ghost", "Drupal", "Joomla",
  "HubSpot", "Next.js", "Nuxt", "Framer", "BigCommerce", "Magento", "Custom or static", "Not sure",
];

const HOSTING_OPTIONS = [
  "Cloudflare", "Vercel", "Netlify", "AWS", "Google Cloud", "Azure", "WP Engine", "Kinsta",
  "SiteGround", "GoDaddy", "Hostinger", "Shopify hosting", "Wix hosting", "Other", "Not sure",
];

export default function NewSitePage() {
  return (
    <Suspense fallback={<div className="auth-shell"><span className="spinner" /></div>}>
      <NewSite />
    </Suspense>
  );
}

function NewSite() {
  const router = useRouter();
  const params = useSearchParams();
  const [workspace] = useWorkspace();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [form, setForm] = useState({
    url: "",
    name: "",
    businessType: "services" as SiteRecord["businessType"],
    industry: "",
    cms: "Not sure",
    hosting: "Not sure",
    locations: "",
    competitors: "",
    targetKeywords: "",
    autonomy: "propose" as Autonomy,
    maxPages: 40,
  });

  useEffect(() => {
    const prefill = params.get("url");
    if (prefill) setForm((f) => (f.url ? f : { ...f, url: prefill }));
  }, [params]);


  const set = <K extends keyof typeof form>(key: K) => (value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const domain = useMemo(() => {
    const raw = form.url.trim();
    if (!raw) return "";
    try {
      return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).host.replace(/^www\./, "");
    } catch {
      return raw.replace(/^https?:\/\//i, "").split("/")[0];
    }
  }, [form.url]);

  async function begin() {
    if (!domain) {
      setError("Enter a website address first.");
      return;
    }
    setError(null);
    setStep(3);

    const baseUrl = `https://${domain}`;
    const site: SiteRecord = {
      id: id("site"),
      name: form.name.trim() || domain.split(".")[0].replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      domain,
      baseUrl,
      businessType: form.businessType,
      industry: form.industry.trim(),
      cms: form.cms,
      hosting: form.hosting,
      locations: splitList(form.locations),
      competitors: splitList(form.competitors),
      targetKeywords: splitList(form.targetKeywords),
      autonomy: form.autonomy,
      goals: [],
      maxPages: form.maxPages,
      createdAt: new Date().toISOString(),
      integrations: [],
      schedule: [
        { mission: "weekly_growth_cycle", cadence: "weekly", enabled: true },
        { mission: "content_production", cadence: "weekly", enabled: false },
        { mission: "aeo_tracking", cadence: "weekly", enabled: true },
        { mission: "local_cycle", cadence: "weekly", enabled: form.businessType === "local" },
        { mission: "link_building", cadence: "weekly", enabled: false },
        { mission: "monthly_audit", cadence: "monthly", enabled: true },
      ],
      lastRunId: null,
    };

    update((w) => {
      if (!w.account) {
        // A first audit does not need a sign-up screen in front of it. The
        // account is created from what they have already told us.
        w.account = {
          email: "",
          name: "",
          company: site.name,
          plan: "trial",
          createdAt: new Date().toISOString(),
        };
      }
      w.sites.push(site);
      logActivity(w, { siteId: site.id, actor: "you", action: "Site added", detail: domain });
    });

    const handle = startRun(site, setProgress);
    stopRef.current = handle.stop;
    try {
      await handle.promise;
      router.push(`/app/sites/${site.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run could not finish.");
    }
  }

  /*
   * Arriving from the homepage URL box means the visitor has already said
   * what they want. Making them confirm it on a second form and then choose a
   * business type on a third added three clicks between "paste" and "watch",
   * which is exactly where people leave. So `go=1` starts the run as soon as
   * the address is in. Every setting it skips has a sensible default and can
   * be changed afterwards in the site's settings.
   */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (params.get("go") !== "1" || step !== 1 || !domain) return;
    autoStarted.current = true;
    void begin();
    // begin is recreated every render; the ref makes this fire exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, domain, step]);

  if (step === 3) {
    return <RunningView progress={progress} error={error} domain={domain} onStop={() => stopRef.current?.()} />;
  }

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "2.5rem 1.25rem 4rem" }}>
      <Link href={workspace.sites.length ? "/app" : "/"} className="small muted">
        {workspace.sites.length ? "Back to your sites" : "Back to the site"}
      </Link>

      <PageHeader
        title={step === 1 ? "Check the SEO of any website" : "Sharpen the run"}
        description={
          step === 1
            ? "Yours or a competitor's. We read the pages and write the fixes. Nothing gets connected, charged or published."
            : "All of this is optional. Each answer makes the keyword model, the gap analysis and the local checks more specific."
        }
      />

      {step === 1 ? <AuditScope /> : null}

      {step === 1 ? (
        <Card>
          <div className="field">
            <label htmlFor="url">Website address</label>
            <input
              id="url"
              value={form.url}
              onChange={(e) => set("url")(e.target.value)}
              placeholder="anywebsite.com"
              autoFocus
            />
            <div className="help">Any website&rsquo;s homepage. Http or https, with or without www.</div>
          </div>

          <div className="field">
            <label htmlFor="name">Business name</label>
            <input
              id="name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder={domain ? domain.split(".")[0] : "Acme Dental"}
            />
            <div className="help">Used in the schema, the titles and the entity checks. Left blank, it is read from the site.</div>
          </div>

          <div className="field">
            <label>What kind of business is it?</label>
            <div className="chip-row">
              {BUSINESS_TYPES.map((type) => (
                <button
                  type="button"
                  key={type.key}
                  className="chip"
                  aria-pressed={form.businessType === type.key}
                  onClick={() => set("businessType")(type.key)}
                >
                  {type.label}
                </button>
              ))}
            </div>
            <div className="help">{BUSINESS_TYPES.find((t) => t.key === form.businessType)?.hint}</div>
          </div>

          {error && <Notice kind="bad">{error}</Notice>}

          <div className="button-row" style={{ marginTop: "1rem" }}>
            {/* The fast path is the primary action: the details below sharpen
                the run, but nobody should have to answer them to see results. */}
            <button className="primary" onClick={() => (domain ? void begin() : setError("Pop your website address in first."))}>
              Run my audit &rarr;
            </button>
            <button onClick={() => (domain ? setStep(2) : setError("Pop your website address in first."))}>
              Add more detail first
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="field">
            <label htmlFor="industry">Industry or main service</label>
            <input
              id="industry"
              value={form.industry}
              onChange={(e) => set("industry")(e.target.value)}
              placeholder="Emergency plumbing"
            />
            <div className="help">Used to name location pages and to sanity check the topic model.</div>
          </div>

          <div className="field">
            <label htmlFor="locations">Locations you serve</label>
            <input
              id="locations"
              value={form.locations}
              onChange={(e) => set("locations")(e.target.value)}
              placeholder="Manchester, Salford, Stockport"
            />
            <div className="help">Comma separated. Each one without a page becomes a finding and a brief.</div>
          </div>

          <div className="field">
            <label htmlFor="competitors">Competitors</label>
            <input
              id="competitors"
              value={form.competitors}
              onChange={(e) => set("competitors")(e.target.value)}
              placeholder="competitor.com, another.co.uk"
            />
            <div className="help">Used for comparison briefs and link prospecting.</div>
          </div>

          <div className="field">
            <label htmlFor="keywords">Terms you want to win</label>
            <input
              id="keywords"
              value={form.targetKeywords}
              onChange={(e) => set("targetKeywords")(e.target.value)}
              placeholder="boiler repair manchester, emergency plumber"
            />
            <div className="help">Anything here that your site never mentions is reported as a gap with a brief attached.</div>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="cms">Where the site is built</label>
              <select id="cms" value={form.cms} onChange={(e) => set("cms")(e.target.value)}>
                {CMS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
              <div className="help">Decides how approved changes can be applied later.</div>
            </div>
            <div className="field">
              <label htmlFor="hosting">Where it is hosted</label>
              <select id="hosting" value={form.hosting} onChange={(e) => set("hosting")(e.target.value)}>
                {HOSTING_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
              <div className="help">Decides where redirects and headers are set.</div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="pages">Pages to crawl</label>
            <select id="pages" value={form.maxPages} onChange={(e) => set("maxPages")(Number(e.target.value))}>
              <option value={20}>20, a quick look</option>
              <option value={40}>40, the usual first run</option>
              <option value={80}>80</option>
              <option value={150}>150, a thorough pass</option>
              <option value={250}>250, the maximum here</option>
            </select>
            <div className="help">Larger crawls take longer. A self-hosted installation has no cap.</div>
          </div>

          <div className="field">
            <label htmlFor="autonomy">How much should it do without asking?</label>
            <select id="autonomy" value={form.autonomy} onChange={(e) => set("autonomy")(e.target.value as Autonomy)}>
              {AUTONOMY_LEVELS.map((level) => (
                <option key={level.key} value={level.key}>{level.label}</option>
              ))}
            </select>
            <div className="help">{AUTONOMY_LEVELS.find((l) => l.key === form.autonomy)?.description}</div>
          </div>

          {error && <Notice kind="bad">{error}</Notice>}

          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button className="primary" onClick={begin}>Start the run</button>
            <button className="ghost" onClick={() => setStep(1)}>Back</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function RunningView({
  progress,
  error,
  domain,
  onStop,
}: {
  progress: RunProgress | null;
  error: string | null;
  domain: string;
  onStop: () => void;
}) {
  const percent = progress && progress.target > 0
    ? Math.min(100, Math.round((progress.fetched / progress.target) * 100))
    : 4;

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 1.25rem 4rem" }}>
      <PageHeader
        title={error ? "The run stopped" : `Auditing ${domain}`}
        description={error ?? progress?.message ?? "Reading robots.txt, the sitemaps and the homepage"}
      />

      {!error ? <AuditScope compact /> : null}

      {!error && (
        <Card>
          <div className="progress" style={{ marginBottom: "1rem" }}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <div className="steps">
            {(progress?.steps ?? []).map((step) => (
              <div className={`step step-${step.status}`} key={step.key}>
                <span className="step-dot" />
                <div style={{ minWidth: 0 }}>
                  <div className="small">
                    {step.label}
                    <span className="faint mono tiny"> {step.agent}</span>
                  </div>
                  {step.detail && <div className="tiny muted">{step.detail}</div>}
                  {step.blockedBy && <div className="tiny" style={{ color: "var(--warn)" }}>{step.blockedBy}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="button-row" style={{ marginTop: "1.2rem" }}>
            <button className="small ghost" onClick={onStop}>Stop the run</button>
            <span className="tiny faint">
              The crawl is happening now, against the live site. Nothing is being changed.
            </span>
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <Notice kind="bad">{error}</Notice>
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <Link href="/app/new" className="button primary">Try another address</Link>
            <Link href="/app" className="button">Your sites</Link>
          </div>
          {/*
            Only guess when the server did not already say. The reason above
            comes from the route that refused, and appending a paragraph of
            other possible causes underneath a precise diagnosis sends people
            to check the wrong thing.
          */}
          {!/address|loopback|private|robots|HTTP \d|ceiling/i.test(error) && (
            <p className="small muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
              Common causes: the site blocks automated requests, the address has a typo, or the server is behind
              a challenge page that returns a 403 to anything without a browser fingerprint.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}
