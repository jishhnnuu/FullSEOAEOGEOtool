"use client";

import Link from "next/link";
import { useState } from "react";

import {
  OUTLIER_AT,
  POST_FLOOR,
  readAccount,
  shareOfVoice,
  strongestPlatform,
  whatWorked,
  type AccountProfile,
  type AccountRead,
} from "@/engine/social";
import { capability, readableForCompetitors } from "@/lib/social-platforms";
import { useSite } from "@/lib/site-hooks";
import type { SocialCredentials } from "@/lib/store";
import { Badge, Card, Notice, formatNumber } from "@/components/ui";

/*
 * The social research desk, running in the browser.
 *
 * Everything on screen is computed from public posts the platform itself
 * returns. Nothing is estimated, and the one number every rival tool shows
 * here, a competitor's reach, is absent because it does not exist outside the
 * account owner's own dashboard.
 */

async function fetchProfile(
  platform: string,
  handle: string,
  credentials: SocialCredentials,
  limit = 40,
): Promise<AccountProfile> {
  const response = await fetch("/api/social/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      platform,
      handle,
      limit,
      credentials: {
        youtubeApiKey: credentials.youtubeApiKey,
        igUserId: credentials.igUserId,
        igAccessToken: credentials.igAccessToken,
      },
    }),
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

function Credentials({
  credentials,
  onChange,
}: {
  credentials: SocialCredentials;
  onChange: (next: SocialCredentials) => void;
}) {
  return (
    <Card title="Your own platform credentials">
      <p className="small muted" style={{ marginTop: 0 }}>
        This platform holds no API key of its own for any social network, which is what keeps a
        deployment of it standalone. You supply yours, this browser keeps them, and the read route
        uses them once without writing them down. Reddit needs nothing.
      </p>
      <div className="stack-sm">
        <label>
          <span className="small">YouTube Data API key</span>
          <input
            id="social-yt-key"
            value={credentials.youtubeApiKey ?? ""}
            onChange={(e) => onChange({ ...credentials, youtubeApiKey: e.target.value })}
            placeholder="Free to create in Google Cloud. Read-only."
          />
        </label>
        <label>
          <span className="small">Instagram Business account id</span>
          <input
            id="social-ig-id"
            value={credentials.igUserId ?? ""}
            onChange={(e) => onChange({ ...credentials, igUserId: e.target.value })}
            placeholder="Your own account, which competitor reads are made through"
          />
        </label>
        <label>
          <span className="small">Meta access token</span>
          <input
            id="social-ig-token"
            type="password"
            value={credentials.igAccessToken ?? ""}
            onChange={(e) => onChange({ ...credentials, igAccessToken: e.target.value })}
            placeholder="Needs instagram_basic on that account"
          />
        </label>
      </div>
      <p className="tiny faint" style={{ marginTop: "0.7rem", marginBottom: 0 }}>
        Instagram competitor reads go through Business Discovery, which only returns accounts that
        are themselves Business or Creator. A personal account cannot be read at all, by anyone.
      </p>
    </Card>
  );
}

function AccountSummary({ read }: { read: AccountRead }) {
  if (!read.measured) {
    return (
      <Notice kind="warn" title={`${read.handle} could not be measured`}>
        {read.reason}
      </Notice>
    );
  }
  const worked = whatWorked(read);
  return (
    <>
      <Card
        title={`${read.handle} on ${read.platform}`}
        action={<span className="tiny faint">{read.postsRead} posts read</span>}
      >
        <div className="grid grid-4">
          <div>
            <div className="score value" style={{ fontSize: "1.5rem" }}>
              {formatNumber(read.medianEngagement)}
            </div>
            <div className="tiny faint">median engagement per post</div>
          </div>
          <div>
            <div className="score value" style={{ fontSize: "1.5rem" }}>
              {read.engagementRate.measured
                ? `${read.engagementRate.value?.toFixed(2)}%`
                : "not measured"}
            </div>
            <div className="tiny faint">
              {read.engagementRate.measured ? "engagement rate" : read.engagementRate.note}
            </div>
          </div>
          <div>
            <div className="score value" style={{ fontSize: "1.5rem" }}>{read.winners.length}</div>
            <div className="tiny faint">posts above {OUTLIER_AT}x their own median</div>
          </div>
          <div>
            <div className="score value" style={{ fontSize: "1.5rem" }}>
              {read.postsPerWeek.measured ? read.postsPerWeek.value?.toFixed(1) : "—"}
            </div>
            <div className="tiny faint">posts per week</div>
          </div>
        </div>
        {read.notes.map((note, i) => (
          <p className="small muted" key={i} style={{ marginTop: "0.8rem", marginBottom: 0 }}>{note}</p>
        ))}
      </Card>

      <Card title="What worked, and what the winners had in common">
        {worked.measured ? (
          <>
            <p className="small" style={{ marginTop: 0 }}>
              <strong>{worked.winnerCount} posts cleared {worked.threshold}.</strong>
            </p>
            {worked.traits.length === 0 ? (
              <p className="small muted" style={{ marginBottom: 0 }}>
                The winners share nothing past the threshold. That is a finding: there is no single
                format or opening to copy here.
              </p>
            ) : (
              <div className="stack-sm">
                {worked.traits.map((t) => (
                  <div key={t.trait} className="small">
                    <strong>{t.trait}: {t.value}</strong>
                    <div className="tiny muted">{t.evidence}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <Notice kind="warn" title="No pattern called">{worked.reason}</Notice>
        )}
      </Card>

      {read.winners.length > 0 && (
        <Card title="The posts that beat their own median">
          <div className="queue">
            {read.winners.map((w) => (
              <div className="qrow" key={w.url}>
                <span className="badge badge-ok">{w.multiple}x</span>
                <span className="qtitle">
                  <strong>{w.hook || "(no caption)"}</strong>
                  <span className="tiny faint">
                    {w.format} · {w.hookType} hook · {formatNumber(w.likes)} likes,{" "}
                    {formatNumber(w.comments)} comments
                    {w.views !== null ? `, ${formatNumber(w.views)} views` : ""}
                  </span>
                </span>
                <span className="qfix">
                  <a href={w.url} target="_blank" rel="noopener noreferrer" className="tiny">open</a>
                </span>
              </div>
            ))}
          </div>
          <p className="tiny faint" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
            No impressions or reach appear above because no platform publishes them for an account
            you do not own. The multiple is engagement against this account&rsquo;s own median, which
            is the comparable that survives a difference in follower count.
          </p>
        </Card>
      )}

      {read.formats.length > 0 && (
        <Card title="By format">
          <div className="stack-sm">
            {read.formats.map((f) => (
              <div key={f.format} className="between small">
                <span>{f.format} <span className="tiny faint">· {f.posts} posts</span></span>
                <span className="mono">
                  {f.measured
                    ? `${f.multiple}x their median`
                    : <span className="faint">{f.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/** One competitor, torn down. */
export function Teardown() {
  const { workspace, mutate } = useSite();
  const credentials = workspace.social ?? {};
  const [platform, setPlatform] = useState("youtube");
  const [handle, setHandle] = useState("");
  const [read, setRead] = useState<AccountRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function saveCredentials(next: SocialCredentials) {
    mutate((w) => { w.social = next; });
  }

  async function run() {
    if (!handle.trim()) return;
    setBusy(true);
    setError(null);
    setRead(null);
    try {
      const profile = await fetchProfile(platform, handle.trim(), credentials);
      setRead(readAccount(profile));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The read failed.");
    } finally {
      setBusy(false);
    }
  }

  const cap = capability(platform);

  return (
    <>
      <Card title="Read a competitor">
        <div className="row" style={{ gap: "0.6rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "0 0 160px" }}>
            <span className="small">Platform</span>
            <select id="social-platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {readableForCompetitors().map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </label>
          <label style={{ flex: "1 1 220px" }}>
            <span className="small">Their handle</span>
            <input
              id="social-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder={platform === "reddit" ? "username" : "@theirhandle"}
            />
          </label>
          <button className="primary" onClick={() => void run()} disabled={busy || !handle.trim()}>
            {busy ? "Reading" : "Tear it down"}
          </button>
        </div>
        {cap?.limitation && (
          <p className="tiny faint" style={{ marginTop: "0.7rem", marginBottom: 0 }}>{cap.limitation}</p>
        )}
      </Card>

      {error && <Notice kind="bad">{error}</Notice>}
      {read && <AccountSummary read={read} />}
      {!read && !busy && (
        <Notice kind="warn" title="What this will and will not return">
          It returns their median engagement, the posts that cleared {OUTLIER_AT}x it, and the traits
          those winners share. It returns no impressions, reach or saves, because those are
          owner-only on every platform.{" "}
          <Link href="platforms">The full capability map</Link>. Under {POST_FLOOR} readable posts it
          reports the floor rather than a number.
        </Notice>
      )}

      <Credentials credentials={credentials} onChange={saveCredentials} />
    </>
  );
}

/** Up to five brands on one platform. */
export function CompareBrands() {
  const { workspace, mutate } = useSite();
  const credentials = workspace.social ?? {};
  const [platform, setPlatform] = useState("youtube");
  const [handles, setHandles] = useState("");
  const [reads, setReads] = useState<AccountRead[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run() {
    const list = handles.split(/[,\n]/).map((h) => h.trim()).filter(Boolean).slice(0, 5);
    if (list.length < 2) return;
    setReads(null);
    const out: AccountRead[] = [];
    for (const h of list) {
      setBusy(h);
      out.push(readAccount(await fetchProfile(platform, h, credentials)));
    }
    setBusy(null);
    setReads(out);
  }

  const sov = reads ? shareOfVoice(reads) : null;
  const fit = reads
    ? strongestPlatform(Object.fromEntries(reads.filter((r) => r.measured).map((r) => [r.handle, r])))
    : null;

  return (
    <>
      <Card title="Compare up to five brands">
        <div className="stack-sm">
          <label>
            <span className="small">Platform</span>
            <select id="cmp-platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {readableForCompetitors().map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="small">Handles, one per line. Yours first.</span>
            <textarea
              id="cmp-handles"
              rows={4}
              value={handles}
              onChange={(e) => setHandles(e.target.value)}
              placeholder={"yourbrand\nrivalone\nrivaltwo"}
            />
          </label>
          <div>
            <button className="primary" onClick={() => void run()} disabled={!!busy}>
              {busy ? `Reading ${busy}` : "Compare"}
            </button>
          </div>
        </div>
      </Card>

      {sov && (
        sov.measured ? (
          <Card title="Share of voice" action={<span className="tiny faint">{sov.sample}</span>}>
            <div className="queue">
              {sov.brands.map((b) => (
                <div className="qrow" key={b.handle}>
                  <span className={b.efficiency >= 0 ? "badge badge-ok" : "badge badge-medium"}>
                    {b.efficiency >= 0 ? "efficient" : "loud"}
                  </span>
                  <span className="qtitle">
                    <strong>{b.handle}</strong>
                    <span className="tiny faint">
                      {(b.shareOfPosts * 100).toFixed(0)}% of posts ·{" "}
                      {(b.shareOfEngagement * 100).toFixed(0)}% of engagement ·{" "}
                      {b.engagementRate.measured
                        ? `${b.engagementRate.value?.toFixed(2)}% rate`
                        : "no follower count"}
                    </span>
                  </span>
                  <span className="qfix mono tiny">
                    {b.efficiency > 0 ? "+" : ""}{(b.efficiency * 100).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
            <div className="stack-sm" style={{ marginTop: "0.9rem" }}>
              {(sov.verdict ?? []).map((line, i) => (
                <p className="small" key={i} style={{ margin: 0 }}>{line}</p>
              ))}
            </div>
            <p className="tiny faint" style={{ marginTop: "0.8rem", marginBottom: 0 }}>{sov.caveat}</p>
          </Card>
        ) : (
          <Notice kind="warn" title="No share calculated">{sov.reason}</Notice>
        )
      )}

      {fit?.measured && (
        <Card title="Which of them is actually strongest">
          <div className="stack-sm">
            {(fit.why ?? []).map((line, i) => (
              <p className="small" key={i} style={{ margin: 0 }}>{line}</p>
            ))}
          </div>
          <p className="tiny faint" style={{ marginTop: "0.8rem", marginBottom: 0 }}>{fit.caveat}</p>
        </Card>
      )}

      {reads?.some((r) => !r.measured) && (
        <Card title="Accounts that could not be read">
          <div className="stack-sm">
            {reads.filter((r) => !r.measured).map((r) => (
              <div key={r.handle} className="small">
                <Badge kind="warn">unreadable</Badge> <strong>{r.handle}</strong>
                <div className="tiny muted">{r.reason}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
