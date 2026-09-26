"use client";

import Link from "next/link";
import { useState } from "react";

import {
  SMART_BIDDING_MONTHLY,
  budgetViable,
  expectedOutcome,
  platformCountFor,
  type Measured,
} from "@/engine/ads";
import { requiredRenders } from "@/engine/ad-specs";
import { AD_PLATFORMS } from "@/engine/ads.generated";

/*
 * The refusal, as something a stranger can run in ten seconds.
 *
 * Of everything the paid desk does, this is the piece worth putting on a
 * public URL, because it is the one an agency will not do. Automated bidding
 * needs roughly thirty conversions a month per platform to fit a model, so a
 * small budget spread across several networks fails everywhere at once for
 * reasons that have nothing to do with the creative. An agency takes that
 * budget because its fee is a percentage of it.
 *
 * Runs entirely in the browser. No account, no card, no connected platform,
 * and nothing about the numbers typed here reaches a server.
 */

const OBJECTIVES = [
  { key: "lead_gen", label: "Leads or enquiries" },
  { key: "ecommerce", label: "Online sales" },
] as const;

type ObjectiveKey = (typeof OBJECTIVES)[number]["key"];

function money(n: number): string {
  return n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

export function AdBudgetTool() {
  const [budget, setBudget] = useState("2000");
  const [target, setTarget] = useState("60");
  const [platforms, setPlatforms] = useState("3");
  const [objective, setObjective] = useState<ObjectiveKey>("lead_gen");
  const [cpc, setCpc] = useState("");
  const [cvr, setCvr] = useState("");
  const [ran, setRan] = useState(false);

  const b = Number(budget) || 0;
  const t = Number(target) || 0;
  const p = Math.max(1, Math.min(9, Number(platforms) || 1));

  const check = budgetViable(b, t, p);
  const affordable = platformCountFor(b, t);
  const cpcNum = Number(cpc);
  const cvrNum = Number(cvr);
  const forecast = expectedOutcome(
    b,
    { value: cpc && cpcNum > 0 ? cpcNum : null, measured: Boolean(cpc && cpcNum > 0), note: "" } as Measured,
    { value: cvr && cvrNum > 0 ? cvrNum / 100 : null, measured: Boolean(cvr && cvrNum > 0), note: "" } as Measured,
  );

  const suited = AD_PLATFORMS.filter((x) => x.objectives.includes(objective));
  const renders = requiredRenders(suited.slice(0, affordable).map((x) => x.key));

  return (
    <div>
      <div className="tool-form" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 150px" }}>
          <span className="small">Monthly budget</span>
          <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="2000" />
        </label>
        <label style={{ flex: "1 1 190px" }}>
          <span className="small">
            {objective === "ecommerce" ? "What one sale is worth paying for" : "What one lead is worth paying for"}
          </span>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="60" />
        </label>
        <label style={{ flex: "0 0 130px" }}>
          <span className="small">Platforms</span>
          <input inputMode="numeric" value={platforms} onChange={(e) => setPlatforms(e.target.value)} placeholder="3" />
        </label>
        <label style={{ flex: "0 0 180px" }}>
          <span className="small">Selling</span>
          <select value={objective} onChange={(e) => setObjective(e.target.value as ObjectiveKey)}>
            {OBJECTIVES.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="button primary" onClick={() => setRan(true)} disabled={b <= 0 || t <= 0}>
          Check it
        </button>
      </div>

      <details style={{ marginBottom: "1rem" }}>
        <summary className="small">
          Know your click cost and conversion rate? Add them for a forecast instead of a refusal to give one.
        </summary>
        <div className="tool-form" style={{ marginTop: "0.7rem" }}>
          <label style={{ flex: "1 1 180px" }}>
            <span className="small">Measured cost per click</span>
            <input inputMode="decimal" value={cpc} onChange={(e) => setCpc(e.target.value)} placeholder="1.40" />
          </label>
          <label style={{ flex: "1 1 200px" }}>
            <span className="small">Measured conversion rate, per cent</span>
            <input inputMode="decimal" value={cvr} onChange={(e) => setCvr(e.target.value)} placeholder="2.1" />
          </label>
        </div>
        <p className="tiny faint" style={{ margin: 0 }}>
          Measured means from your own analytics, not from a platform&rsquo;s estimate. Leave them blank and
          this refuses to forecast, which is the correct answer rather than a limitation.
        </p>
      </details>

      {ran && b > 0 && t > 0 && (
        <>
          <div className={check.viable ? "notice notice-ok" : "notice notice-warn"}>
            <strong>{check.viable ? "This budget can work." : "This budget cannot work as split."}</strong>{" "}
            {check.reason}
          </div>

          <div className="tool-stats">
            <div className="tool-stat">
              <span className="tool-stat-value">{check.impliedMonthly.value ?? "—"}</span>
              <span className="tool-stat-label">conversions a month, per platform</span>
            </div>
            <div className="tool-stat">
              <span className="tool-stat-value">{SMART_BIDDING_MONTHLY}</span>
              <span className="tool-stat-label">the floor automated bidding needs</span>
            </div>
            <div className="tool-stat">
              <span className="tool-stat-value">{affordable}</span>
              <span className="tool-stat-label">platforms this budget actually feeds</span>
            </div>
            <div className="tool-stat">
              <span className="tool-stat-value">{money(SMART_BIDDING_MONTHLY * t * p)}</span>
              <span className="tool-stat-label">what {p} platform{p === 1 ? "" : "s"} would need</span>
            </div>
          </div>

          {!check.viable && (
            <>
              <h3 className="section-title small-title" style={{ marginTop: "1.6rem" }}>
                What would fix it, in the order worth trying
              </h3>
              <ol className="prose-list">
                {check.remedies.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </>
          )}

          <h3 className="section-title small-title" style={{ marginTop: "1.6rem" }}>
            The forecast
          </h3>
          {forecast.measured ? (
            <p>
              <strong>{forecast.note}</strong>
            </p>
          ) : (
            <div className="notice">{forecast.note}</div>
          )}

          <h3 className="section-title small-title" style={{ marginTop: "1.6rem" }}>
            Where this budget belongs
          </h3>
          <div className="check-list">
            {suited.slice(0, Math.max(affordable, 1)).map((x) => (
              <div className="check-row" key={x.key}>
                <span className="badge badge-ok">run</span>
                <span className="check-title">
                  <strong>{x.name}</strong>
                  <span className="tiny faint">{x.worthIt}</span>
                </span>
                <span className="check-fix mono tiny">{money(b / Math.max(affordable, 1))}/mo</span>
              </div>
            ))}
            {suited.slice(Math.max(affordable, 1)).map((x) => (
              <div className="check-row" key={x.key}>
                <span className="badge badge-neutral">later</span>
                <span className="check-title">
                  <strong>{x.name}</strong>
                  <span className="tiny faint">
                    Adding this would put every platform below the learning floor. Worth it at about{" "}
                    {money(SMART_BIDDING_MONTHLY * t * (suited.indexOf(x) + 1))} a month.
                  </span>
                </span>
                <span className="check-fix tiny faint">not yet</span>
              </div>
            ))}
          </div>

          <h3 className="section-title small-title" style={{ marginTop: "1.6rem" }}>
            What you would need to supply
          </h3>
          <p className="small muted">
            {renders.length} distinct images cover those platforms, because one render serves several
            placements. Each is cropped to the exact size with the platform&rsquo;s own interface drawn on top,
            so nothing important ends up behind a caption.
          </p>
          <div className="check-list">
            {renders.slice(0, 6).map((r) => (
              <div className="check-row" key={r.key}>
                <span className="badge badge-neutral">{r.width}&times;{r.height}</span>
                <span className="check-title">
                  <strong>{r.name}</strong>
                  {r.safeTop + r.safeBottom > 0 && (
                    <span className="tiny faint">
                      {Math.round((r.safeTop + r.safeBottom) * 100)} per cent of this frame is covered by the
                      platform&rsquo;s own interface.
                    </span>
                  )}
                </span>
                <span className="check-fix tiny faint">{r.formats.join(", ")}</span>
              </div>
            ))}
          </div>

          <p className="tool-note" style={{ marginTop: "1.2rem" }}>
            Everything above ran in your browser and nothing was sent anywhere. The thirty-conversion floor is
            not our rule: it is roughly what every platform&rsquo;s automated bidding needs before its model
            fits, and it is the reason a budget spread thin fails on every platform at once.{" "}
            <Link href="/paid">Our paid ads page</Link> explains what happens after this.
          </p>
        </>
      )}

      {!ran && (
        <p className="tool-note">
          Answers one question an agency will not: can this budget actually buy what you want it to buy. The
          numbers stay in your browser.
        </p>
      )}
    </div>
  );
}
