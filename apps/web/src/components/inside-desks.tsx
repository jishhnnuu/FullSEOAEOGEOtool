"use client";

import Link from "next/link";
import { useState } from "react";

import { AdBudgetTool } from "@/components/ad-budget-tool";
import { InsideAccount } from "@/components/inside-account";
import { SocialTeardownTool } from "@/components/social-teardown-tool";
import { VoiceTool } from "@/components/voice-tool";
import { CATALOG_SIZE } from "@/engine/catalog";
import { SITE_URL } from "@/lib/brand";
import { MANAGERS } from "@/lib/org";

/*
 * Four desks, four live tools, one page.
 *
 * The first version of this page ran an SEO crawl of our own site and nothing
 * else, which meant two of the three built desks had nothing a visitor could
 * look at. Worse, the capabilities that did exist for those desks were three
 * clicks inside a workspace that required creating a site first, so the most
 * impressive thing on the platform was invisible to anybody deciding whether
 * to use it.
 *
 * Every tab here runs for real, and every tab takes the visitor's own input.
 * Nothing on this page needs an account, a card or a key, with one exception
 * that says so on screen.
 */

type DeskKey = "search" | "content" | "social" | "paid";

const TABS: { key: DeskKey; label: string; claim: string }[] = [
  { key: "search", label: "Search", claim: "Our site, crawled live, fixes written" },
  { key: "content", label: "Content", claim: "Any page, measured against its rivals" },
  { key: "social", label: "Social", claim: "A rival's posts, and which ones worked" },
  { key: "paid", label: "Paid", claim: "Will your ad budget actually work?" },
];

/** The closing line under each tab: one sentence, one button. */
function TryBand({ title, body, href, label, primary }: { title: string; body: string; href: string; label: string; primary?: boolean }) {
  return (
    <div className="try-band">
      <div>
        <strong>{title}</strong>
        <p className="small muted" style={{ margin: "0.2rem 0 0" }}>{body}</p>
      </div>
      <Link href={href} className={primary ? "big-button primary" : "big-button"}>{label}</Link>
    </div>
  );
}

export function InsideDesks() {
  const [tab, setTab] = useState<DeskKey>("search");

  return (
    <div>
      <div className="desk-tabs four" role="tablist">
        {TABS.map((t) => {
          const m = MANAGERS.find((x) => x.key === t.key);
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              data-desk={t.key}
              aria-selected={tab === t.key}
              className={tab === t.key ? "desk-tab on" : "desk-tab"}
              onClick={() => setTab(t.key)}
            >
              <span className="dt-name">{t.label}</span>
              <span className="dt-claim">{t.claim}</span>
            </button>
          );
        })}
      </div>

      {tab === "search" && (
        <div style={{ marginTop: "1.4rem" }}>
          <p className="small muted">
            Live, not a screenshot. It crawls our own pages right now, so it takes a moment and changes week to week.
          </p>
          <InsideAccount />
          <TryBand
            title="Now do yours"
            body={`Same engine, same ${CATALOG_SIZE} checks, about four minutes. No account.`}
            href="/thymelab/seo/audit"
            label="Check any website's SEO"
            primary
          />
        </div>
      )}

      {tab === "content" && (
        <div style={{ marginTop: "1.4rem" }}>
          <p className="small muted">
            Counts, not opinions: rhythm, filler, specifics and reading level. No AI, no key. Our page is in the box
            already, so just press go.
          </p>
          <VoiceTool defaultMine={SITE_URL} />
          <TryBand
            title="That's one trick of many"
            body="For a client, the AI team also briefs, drafts and edits against your own point of view, and your specialist checks it."
            href="/content"
            label="How our content works"
          />
        </div>
      )}

      {tab === "social" && (
        <div style={{ marginTop: "1.4rem" }}>
          <p className="small muted">
            Type any public YouTube handle. It reads the fifteen latest uploads from the public feed, no key needed.
          </p>
          <SocialTeardownTool />
          <TryBand
            title="Notice: no impressions anywhere"
            body="Only the account owner can see those. Anyone showing you a rival's reach made it up."
            href="/social"
            label="How our social works"
          />
        </div>
      )}

      {tab === "paid" && (
        <div style={{ marginTop: "1.4rem" }}>
          <p className="small muted">
            Three numbers in, a straight answer out. The maths an agency on commission never shows you.
          </p>
          <AdBudgetTool />
          <TryBand
            title="The maths is the easy bit"
            body="For a client, your specialist and the AI team take it from here: tracking checked, ads built paused, results you can trust."
            href="/paid"
            label="How our paid ads work"
          />
        </div>
      )}
    </div>
  );
}
