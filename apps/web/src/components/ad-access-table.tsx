"use client";

import { useState } from "react";

import { AD_PLATFORMS } from "@/engine/ads.generated";

/*
 * The honest state of every advertising platform, on screen.
 *
 * This exists because "we can run your ads anywhere" is the easiest sentence
 * in this category to say and the hardest to keep. Every network gates
 * ad-writing behind a review of the software doing the writing, because the
 * API spends other people's money, and none of those reviews is instant.
 *
 * So the table shows both halves separately. What the advertiser does is
 * always the same one button. What we have to clear is different per platform
 * and is the actual reason a platform is not yet live. Publishing our own
 * queue position is uncomfortable and is the whole point: a client who is told
 * the truth about a six-week Meta review does not later discover it.
 */

const STATUS_LABEL: Record<string, string> = {
  live: "Connect now",
  pending_review: "In review",
  planned: "Not yet open",
};

export function AdAccessTable() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <div className="access-grid">
        {AD_PLATFORMS.map((p) => {
          const showing = open === p.key;
          return (
            <div key={p.key} className={showing ? "access-row on" : "access-row"}>
              <button
                type="button"
                className="access-head"
                aria-expanded={showing}
                onClick={() => setOpen(showing ? null : p.key)}
              >
                <span className="access-name">{p.name}</span>
                <span className={p.status === "live" ? "badge badge-ok" : "badge badge-neutral"}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                <span className="access-worth">{p.worthIt}</span>
              </button>

              {showing && (
                <div className="access-body">
                  <h4>What you do</h4>
                  <p className="small">{p.userAction}</p>
                  <ul className="prose-list small">
                    {p.scopeReasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                  <p className="tiny faint">
                    You never type a key. The login happens on their own site, and you can withdraw it from
                    your own account settings at any time, without telling us.
                  </p>

                  <h4>What we have to clear first</h4>
                  <ul className="prose-list small">
                    {p.appRequirements.map((req, i) => (
                      <li key={i}>{req}</li>
                    ))}
                  </ul>
                  <p className="tiny faint">
                    {p.reviewTime}
                    {p.sandbox ? ` Testing meanwhile: ${p.sandbox.charAt(0).toLowerCase()}${p.sandbox.slice(1)}` : ""}
                  </p>

                  <h4>What the API will actually do</h4>
                  <ul className="prose-list small">
                    {p.writes.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>

                  <h4>What it will not</h4>
                  <ul className="prose-list small">
                    {p.cannot.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="tool-note" style={{ marginTop: "1.1rem" }}>
        Nothing above is a technical limit. Every one of these platforms has a complete write API, and what
        stands between a row and a live campaign is our own application to that platform rather than anything
        in the code. Where a row says in review, that is us in a queue, and it is published here rather than
        described as coming soon.
      </p>
    </div>
  );
}
