"use client";

import { useMemo, useState } from "react";

import { checkCopy, placement, requiredRenders, safeBox } from "@/engine/ad-specs";
import { review } from "@/engine/ad-policy";
import { AD_PLATFORMS } from "@/engine/ads.generated";
import { useSite } from "@/lib/site-hooks";
import { Card, Notice, PageHeader } from "@/components/ui";

/*
 * Sizes, safe zones and a policy check, before anything is made.
 *
 * The safe box is the point of this page. Nearly half a Reels frame is
 * caption, profile and buttons, and every ad manager preview shows the frame
 * without any of that on top, which is why so many adverts have their price
 * hidden. Drawing it before the asset is commissioned costs nothing; finding
 * out afterwards costs the whole flight.
 */

const DEFAULT_PLATFORMS = ["google_ads", "meta_ads"];

export default function PaidCreative() {
  const { site } = useSite();
  const [chosen, setChosen] = useState<string[]>(DEFAULT_PLATFORMS);
  const [headline, setHeadline] = useState("");
  const [primary, setPrimary] = useState("");

  const renders = useMemo(() => requiredRenders(chosen), [chosen]);
  const policy = useMemo(
    () => review({ headline, primary_text: primary }, chosen[0]),
    [headline, primary, chosen],
  );
  const rsa = placement("google_rsa");
  const copyProblems = rsa ? checkCopy(rsa, { headline, description: primary }) : [];

  if (!site) return null;

  function toggle(key: string) {
    setChosen((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  }

  return (
    <>
      <PageHeader
        title="Creative and sizes"
        description="Every distinct image a campaign needs, with the part of the frame the platform covers drawn on it."
      />

      <Card title="Which platforms">
        <div className="button-row" style={{ flexWrap: "wrap" }}>
          {AD_PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={chosen.includes(p.key) ? "button primary small" : "button small"}
              onClick={() => toggle(p.key)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      <Card title={`${renders.length} distinct renders cover those platforms`}>
        <p className="small" style={{ marginTop: 0 }}>
          Distinct means distinct dimensions. One 1080 by 1920 serves Meta Stories, TikTok and
          YouTube Shorts, so it is produced once and takes the tightest safe zone of the three.
        </p>
        <div className="check-list">
          {renders.map((r) => {
            const box = safeBox(r);
            return (
              <div className="check-row" key={r.key}>
                <span className="badge badge-neutral">{r.width}&times;{r.height}</span>
                <span className="check-title">
                  <strong>{r.name}</strong>
                  <span className="tiny faint">
                    {box.coveredFraction > 0
                      ? `${Math.round(box.coveredFraction * 100)} per cent of this frame is covered by the platform's own interface. Keep the product, the price and the logo inside ${box.width}×${box.height} starting ${box.y}px from the top.`
                      : "No platform interface covers this placement."}
                  </span>
                </span>
                <span className="check-fix tiny faint">{r.formats.join(", ")} · max {r.maxMb}MB</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Check the copy before it is written into anything">
        <label style={{ display: "block", marginBottom: "0.8rem" }}>
          <span className="small">Headline</span>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Thirty characters on search" />
        </label>
        <label style={{ display: "block", marginBottom: "0.8rem" }}>
          <span className="small">Body or description</span>
          <textarea rows={3} value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="What is actually being offered" />
        </label>

        {(headline || primary) && (
          <>
            {copyProblems.length > 0 && (
              <Notice kind="warn" title="Character limits">
                <ul className="prose-list small" style={{ marginBottom: 0 }}>
                  {copyProblems.map((p, i) => (
                    <li key={i}><strong>{p.field}:</strong> {p.problem} {p.fix}</li>
                  ))}
                </ul>
              </Notice>
            )}

            {policy.blocks.length > 0 ? (
              <Notice kind="bad" title="This would be rejected, and repeated rejections restrict the ad account">
                <ul className="prose-list small" style={{ marginBottom: 0 }}>
                  {policy.blocks.map((b, i) => (
                    <li key={i}>
                      <strong>&ldquo;{b.matched}&rdquo;</strong> {b.why} <em>{b.fix}</em>
                    </li>
                  ))}
                </ul>
              </Notice>
            ) : (
              <Notice kind="ok" title="Nothing known was tripped">{policy.note}</Notice>
            )}

            {policy.warnings.length > 0 && (
              <Card title="Would not block, but often draws a manual review">
                <ul className="prose-list small" style={{ marginBottom: 0 }}>
                  {policy.warnings.map((w, i) => (
                    <li key={i}><strong>&ldquo;{w.matched}&rdquo;</strong> {w.why} <em>{w.fix}</em></li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </Card>
    </>
  );
}
