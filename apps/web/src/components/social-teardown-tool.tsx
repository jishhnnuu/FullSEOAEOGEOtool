"use client";

import { useState } from "react";

import {
  OUTLIER_AT,
  POST_FLOOR,
  readAccount,
  shareOfVoice,
  whatWorked,
  type AccountProfile,
  type AccountRead,
} from "@/engine/social";
import { capability, readableForCompetitors } from "@/lib/social-platforms";

/*
 * The competitor teardown, standalone and public.
 *
 * It was buried three clicks inside a workspace that needed a site created
 * first, which made the most capable thing on this platform invisible to
 * anyone deciding whether to use it. It holds no workspace state so it can run
 * anywhere: on a free tool page, on the marketing site, inside the app.
 *
 * YouTube with no key is the default, because it is the only competitor read
 * on any network that genuinely needs nothing: the public channel feed carries
 * views and likes for the fifteen most recent uploads. Reddit was the default
 * first, until the deployed Worker got a 403 from it: Reddit refuses
 * data-centre traffic outright, so the demo meant to prove the product works
 * proved the opposite. The note under the platform picker says so now.
 */

const KEY = "thymesnow.social.credentials.v1";

type Credentials = { youtubeApiKey?: string; igUserId?: string; igAccessToken?: string };

function loadCredentials(): Credentials {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Credentials) : {};
  } catch {
    return {};
  }
}

function saveCredentials(value: Credentials) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* A private window is not an error state. The tool still runs. */
  }
}

async function fetchProfile(
  platform: string, handle: string, credentials: Credentials, limit = 40,
): Promise<AccountProfile> {
  const response = await fetch("/api/social/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform, handle, limit, credentials }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    return {
      handle, platform, followers: null, posts: [],
      unreadable: body.message ?? `The read failed with ${response.status}.`,
    };
  }
  return (await response.json()) as AccountProfile;
}

function n(value: number): string {
  // Millions get their own suffix. "27053.1k views" is technically correct and
  // nobody reads it as twenty-seven million.
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function Result({ read }: { read: AccountRead }) {
  if (!read.measured) {
    return (
      <div className="notice notice-warn">
        <strong>{read.handle} could not be measured.</strong> {read.reason}
      </div>
    );
  }
  const worked = whatWorked(read);
  return (
    <>
      {read.notes.length > 0 && (
        // Above the numbers, not under them. A limit read after the conclusion
        // is a footnote, and a footnote is not a disclosure.
        <div className="notice">
          <strong>What this read is.</strong>
          <ul className="prose-list" style={{ marginBottom: 0 }}>
            {read.notes.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
        </div>
      )}
      <div className="tool-stats">
        <div className="tool-stat">
          <span className="tool-stat-value">{n(read.medianEngagement)}</span>
          <span className="tool-stat-label">median engagement</span>
        </div>
        <div className="tool-stat">
          <span className="tool-stat-value">
            {read.engagementRate.measured ? `${read.engagementRate.value?.toFixed(2)}%` : "n/a"}
          </span>
          <span className="tool-stat-label">
            {read.engagementRate.measured ? "engagement rate" : "no public follower count"}
          </span>
        </div>
        <div className="tool-stat">
          <span className="tool-stat-value">{read.winners.length}</span>
          <span className="tool-stat-label">posts above {OUTLIER_AT}x their own median</span>
        </div>
        <div className="tool-stat">
          <span className="tool-stat-value">
            {read.postsPerWeek.measured ? read.postsPerWeek.value?.toFixed(1) : "—"}
          </span>
          <span className="tool-stat-label">posts per week</span>
        </div>
      </div>

      <h3 className="section-title small-title" style={{ marginTop: "1.6rem" }}>
        What worked, and what the winners had in common
      </h3>
      {worked.measured ? (
        worked.traits.length ? (
          <ul className="prose-list">
            {worked.traits.map((t) => (
              <li key={t.trait}>
                <strong>{t.trait}: {t.value}.</strong> {t.evidence}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">
            The winners share nothing past the threshold, which is itself a finding: there is no
            single format or opening to copy from this account.
          </p>
        )
      ) : (
        <div className="notice notice-warn">{worked.reason}</div>
      )}

      {read.winners.length > 0 && (
        <>
          <h3 className="section-title small-title" style={{ marginTop: "1.6rem" }}>
            The posts that beat their own median
          </h3>
          <div className="check-list">
            {read.winners.map((w) => (
              <a
                className="check-row"
                key={w.url}
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="badge badge-ok">{w.multiple}x</span>
                <span className="check-title">
                  <strong>{w.hook || "(no caption)"}</strong>
                  <span className="tiny faint">
                    {w.format} · {w.hookType} hook · {n(w.likes)} likes, {n(w.comments)} comments
                    {w.views !== null ? `, ${n(w.views)} views` : ""}
                  </span>
                </span>
                <span className="check-fix tiny faint">open</span>
              </a>
            ))}
          </div>
        </>
      )}

      {read.formats.some((f) => f.measured) && (
        <>
          <h3 className="section-title small-title" style={{ marginTop: "1.6rem" }}>By format</h3>
          <div className="check-list">
            {read.formats.map((f) => (
              <div className="check-row" key={f.format}>
                <span className="badge badge-neutral">{f.posts}</span>
                <span className="check-title"><strong>{f.format}</strong></span>
                <span className="check-fix tiny">
                  {f.measured ? `${f.multiple}x their median` : <span className="faint">{f.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="tool-note" style={{ marginTop: "1.2rem" }}>
        No impressions or reach appear anywhere above, because no platform publishes them for an
        account you do not own. Every figure here is the platform&rsquo;s own public data, and the
        multiple is engagement against this account&rsquo;s own median, which is the comparison that
        survives a difference in follower count.
      </p>
    </>
  );
}

export function SocialTeardownTool({ compact = false }: { compact?: boolean }) {
  const [platform, setPlatform] = useState("youtube");
  const [handle, setHandle] = useState("");
  const [rivals, setRivals] = useState("");
  const [reads, setReads] = useState<AccountRead[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>({});
  const [loaded, setLoaded] = useState(false);

  if (!loaded && typeof window !== "undefined") {
    setCredentials(loadCredentials());
    setLoaded(true);
  }

  const cap = capability(platform);
  // Instagram cannot be read at all without a credential. YouTube can: the
  // keyless feed is a smaller read, not a failed one, so it is offered as an
  // upgrade rather than raised as a blocker.
  const needsKey = platform === "instagram" && !(credentials.igUserId && credentials.igAccessToken);
  const couldBeBetter = platform === "youtube" && !credentials.youtubeApiKey;

  function updateCredentials(next: Credentials) {
    setCredentials(next);
    saveCredentials(next);
  }

  async function run() {
    const list = [handle, ...rivals.split(/[,\n]/)]
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (!list.length) return;
    setReads(null);
    const out: AccountRead[] = [];
    for (const h of list) {
      setBusy(h);
      out.push(readAccount(await fetchProfile(platform, h, credentials)));
    }
    setBusy(null);
    setReads(out);
  }

  const sov = reads && reads.length > 1 ? shareOfVoice(reads) : null;

  return (
    <div>
      <div className="tool-form" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "0 0 170px" }}>
          <span className="small">Platform</span>
          <select
            id="teardown-platform"
            value={platform}
            onChange={(e) => { setPlatform(e.target.value); setReads(null); }}
          >
            {readableForCompetitors().map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}{p.access === "free" ? "" : ` (${p.access})`}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: "1 1 260px" }}>
          <span className="small">Their handle</span>
          <input
            id="teardown-handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder={
              platform === "reddit" ? "a reddit username"
                : platform === "youtube" ? "@mkbhd, or a UC… channel id"
                  : "@theirhandle"
            }
          />
        </label>
        <button className="button primary" onClick={() => void run()} disabled={!!busy || !handle.trim()}>
          {busy ? `Reading ${busy}` : "Tear it down"}
        </button>
      </div>

      {!compact && (
        <label style={{ display: "block", marginBottom: "0.9rem" }}>
          <span className="small">Up to four more, to compare share of voice. One per line.</span>
          <textarea
            id="teardown-rivals"
            rows={3}
            value={rivals}
            onChange={(e) => setRivals(e.target.value)}
            placeholder={"rivalone\nrivaltwo"}
          />
        </label>
      )}

      {platform === "reddit" && (
        <p className="tool-note">
          Reddit needs no key, but it refuses traffic from data centres, and this runs on one. It
          will often answer 403 and the tool will say so rather than inventing a result. YouTube
          above is the read that works from anywhere.
        </p>
      )}

      {couldBeBetter && (
        <div className="notice">
          <strong>This runs right now with nothing.</strong> The public channel feed carries views
          and likes for the fifteen most recent uploads, which is enough for a median, the winners
          and the hooks they share. A free YouTube Data API key raises it to a hundred uploads with
          comment counts and Shorts separated from long-form.{" "}
          <button className="small ghost" onClick={() => setShowKeys((v) => !v)}>
            {showKeys ? "Hide" : "Add a key"}
          </button>
        </div>
      )}

      {needsKey && (
        <div className="notice notice-warn">
          <strong>{cap?.name} needs your own credential.</strong> {cap?.requires}{" "}
          <button className="small ghost" onClick={() => setShowKeys((v) => !v)}>
            {showKeys ? "Hide" : "Add it"}
          </button>
        </div>
      )}

      {showKeys && (
        <div className="stack-sm" style={{ marginBottom: "1rem" }}>
          <label>
            <span className="small">YouTube Data API key</span>
            <input
              id="teardown-yt"
              value={credentials.youtubeApiKey ?? ""}
              onChange={(e) => updateCredentials({ ...credentials, youtubeApiKey: e.target.value })}
              placeholder="Free to create in Google Cloud"
            />
          </label>
          <label>
            <span className="small">Instagram Business account id</span>
            <input
              id="teardown-igid"
              value={credentials.igUserId ?? ""}
              onChange={(e) => updateCredentials({ ...credentials, igUserId: e.target.value })}
              placeholder="Your own account, which the read is made through"
            />
          </label>
          <label>
            <span className="small">Meta access token</span>
            <input
              id="teardown-igtoken"
              type="password"
              value={credentials.igAccessToken ?? ""}
              onChange={(e) => updateCredentials({ ...credentials, igAccessToken: e.target.value })}
              placeholder="Needs instagram_basic"
            />
          </label>
          <p className="tiny faint" style={{ margin: 0 }}>
            Stored in this browser only. The request uses it once and it is never written down on
            the server: this platform holds no social API key of its own.
          </p>
        </div>
      )}

      {cap?.limitation && !reads && (
        <p className="tool-note">{cap.limitation}</p>
      )}

      {sov?.measured && (
        <>
          <h3 className="section-title small-title" style={{ marginTop: "1.4rem" }}>
            Share of voice
          </h3>
          <div className="check-list">
            {sov.brands.map((b) => (
              <div className="check-row" key={b.handle}>
                <span className={b.efficiency >= 0 ? "badge badge-ok" : "badge badge-medium"}>
                  {b.efficiency >= 0 ? "efficient" : "loud"}
                </span>
                <span className="check-title">
                  <strong>{b.handle}</strong>
                  <span className="tiny faint">
                    {(b.shareOfPosts * 100).toFixed(0)}% of posts ·{" "}
                    {(b.shareOfEngagement * 100).toFixed(0)}% of engagement
                  </span>
                </span>
                <span className="check-fix mono tiny">
                  {b.efficiency > 0 ? "+" : ""}{(b.efficiency * 100).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
          {(sov.verdict ?? []).map((line, i) => (
            <p className="small" key={i} style={{ marginTop: "0.6rem", marginBottom: 0 }}>{line}</p>
          ))}
        </>
      )}
      {sov && !sov.measured && <div className="notice notice-warn">{sov.reason}</div>}

      {reads?.map((read) => (
        <div key={read.handle} style={{ marginTop: "1.6rem" }}>
          {reads.length > 1 && (
            <h3 className="section-title small-title">{read.handle}</h3>
          )}
          <Result read={read} />
        </div>
      ))}

      {!reads && !busy && (
        <p className="tool-note">
          Returns their median engagement, every post that cleared {OUTLIER_AT}x it, and the traits
          those winners share. Under {POST_FLOOR} readable posts it reports the floor rather than a
          number, because a median from nine posts is not a median.
        </p>
      )}
    </div>
  );
}
