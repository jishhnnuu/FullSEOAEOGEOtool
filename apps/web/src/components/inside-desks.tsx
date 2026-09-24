"use client";

import Link from "next/link";
import { useState } from "react";

import { InsideAccount } from "@/components/inside-account";
import { SocialTeardownTool } from "@/components/social-teardown-tool";
import { VoiceTool } from "@/components/voice-tool";
import { SITE_URL } from "@/lib/brand";
import { MANAGERS } from "@/lib/org";

/*
 * Three desks, three live tools, one page.
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

type DeskKey = "search" | "content" | "social";

const TABS: { key: DeskKey; label: string; claim: string }[] = [
  { key: "search", label: "Search", claim: "A real crawl, 90 checks, and the fixes already written" },
  { key: "content", label: "Content", claim: "Your writing measured against the pages you compete with" },
  { key: "social", label: "Social", claim: "A competitor's posts, and what actually worked for them" },
];

export function InsideDesks() {
  const [tab, setTab] = useState<DeskKey>("search");
  const manager = MANAGERS.find((m) => m.key === tab);

  return (
    <div>
      <div className="desk-tabs" role="tablist">
        {TABS.map((t) => {
          const m = MANAGERS.find((x) => x.key === t.key);
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? "desk-tab on" : "desk-tab"}
              onClick={() => setTab(t.key)}
            >
              <span className="dt-name">{t.label}</span>
              <span className="dt-count">{m ? `${m.team.length} specialists` : ""}</span>
              <span className="dt-claim">{t.claim}</span>
            </button>
          );
        })}
      </div>

      {manager && (
        <p className="small muted" style={{ marginTop: "0.9rem" }}>
          <strong>{manager.name}.</strong> {manager.remit}
        </p>
      )}

      {tab === "search" && (
        <div style={{ marginTop: "1.1rem" }}>
          <h3 className="section-title small-title">Our own site, crawled right now</h3>
          <p className="small muted">
            Not a screenshot and not a cached result. This fetches our pages, parses them, runs the
            catalogue and generates the fixes while you watch, which is why it takes a moment and
            why it looks different next week.
          </p>
          <InsideAccount />
          <div className="try-band">
            <div>
              <strong>Now run it on yours</strong>
              <p className="small muted" style={{ margin: "0.2rem 0 0" }}>
                The same engine and the same 90 checks, about four minutes, in your browser. No
                account and no card.
              </p>
            </div>
            <Link href="/app/new" className="button primary">See what we would fix</Link>
          </div>
        </div>
      )}

      {tab === "content" && (
        <div style={{ marginTop: "1.1rem" }}>
          <h3 className="section-title small-title">Measure a page against the field</h3>
          <p className="small muted">
            Counting rather than judgement: rhythm, hedging, marketing filler, specifics, reading
            grade and who the page talks about. No model reads it and no key is needed. Our own page
            is in the box to start with, so you can run it before typing anything.
          </p>
          <VoiceTool defaultMine={SITE_URL} />
          <div className="try-band">
            <div>
              <strong>This is one of fourteen things the content desk does</strong>
              <p className="small muted" style={{ margin: "0.2rem 0 0" }}>
                The rest, the point of view, the briefs, the drafting and the three edit gates, run
                inside an account because they work against your own approved argument.
              </p>
            </div>
            <Link href="/content" className="button">Read the content desk</Link>
          </div>
        </div>
      )}

      {tab === "social" && (
        <div style={{ marginTop: "1.1rem" }}>
          <h3 className="section-title small-title">Tear down a competitor</h3>
          <p className="small muted">
            Type any public YouTube handle and this runs immediately, with no key and no account,
            from the channel&rsquo;s own public feed. It reads the fifteen most recent uploads and
            says so above the numbers. A free key of your own reads a hundred.
          </p>
          <SocialTeardownTool />
          <div className="try-band">
            <div>
              <strong>No impressions appear anywhere in that output</strong>
              <p className="small muted" style={{ margin: "0.2rem 0 0" }}>
                They cannot. Impressions and reach are computed by a platform for the account owner
                and exposed only through that owner&rsquo;s own token, so every competitor reach
                figure you have been shown by anyone was estimated from follower count.
              </p>
            </div>
            <Link href="/social" className="button">What each platform allows</Link>
          </div>
        </div>
      )}
    </div>
  );
}
