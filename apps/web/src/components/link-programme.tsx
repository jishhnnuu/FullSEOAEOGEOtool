"use client";

import { useEffect, useMemo, useState } from "react";

import { assessProfile, buildDisavowFile, type ProfileRisk } from "@/engine/link-risk";
import { measureImpact, profileMentions, targetsFromAnswers, type Mention } from "@/engine/mentions";
import { assetIdeas, type AssetIdea, type LostPrompt } from "@/engine/assets";
import { assessPortfolio } from "@/engine/backlinks";
import type { AnswerVisibility } from "@/engine/answers";
import {
  applyVerdicts, loadCredential, loadLinks, portfolioFrom, pullLinkData, reviewableFrom,
  saveCredential, saveLinks, verifyBatch, type LinkState,
} from "@/lib/links";
import { useWorkspace } from "@/lib/useWorkspace";
import type { SiteRecord } from "@/lib/store";
import { Badge, Card, CopyButton, Notice, formatNumber } from "@/components/ui";

/**
 * The link programme: data, risk, mentions, and what to publish.
 *
 * Organised around mentions rather than around followed links, because that
 * is what the evidence supports. Ahrefs measured 75,000 brands in 2026: brand
 * mentions correlate with AI Overview visibility at 0.664 and backlinks at
 * 0.218. Being named is now worth roughly three times being linked, for the
 * half of search that happens inside an answer.
 */
export function LinkProgramme({ site, visibility }: { site: SiteRecord; visibility: AnswerVisibility | null }) {
  const [workspace] = useWorkspace();
  const [state, setState] = useState<LinkState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [gap, setGap] = useState<{ domain: string; score: number | null; linksTo: string[] }[] | null>(null);
  const [manualAction, setManualAction] = useState(false);

  useEffect(() => {
    setState(loadLinks(site.id));
  }, [site.id]);

  const credential = loadCredential();

  function update(next: LinkState) {
    setState(next);
    saveLinks(next);
  }

  /* ---------------------------------------------------------- data pulls */

  async function pull(report: "referring_domains" | "broken" | "competitors") {
    if (!state) return;
    setBusy(report);
    setError(null);
    try {
      const data = await pullLinkData(report, site.domain, {
        competitors: site.competitors,
        limit: 1000,
      });
      setCost(data.cost);
      if (report === "competitors") {
        setGap((data.summary?.gap as { domain: string; score: number | null; linksTo: string[] }[]) ?? []);
      } else {
        const found = portfolioFrom(data.rows, "connector");
        const known = new Map(state.portfolio.map((l) => [l.sourceUrl, l]));
        for (const link of found) if (!known.has(link.sourceUrl)) known.set(link.sourceUrl, link);
        update({ ...state, portfolio: [...known.values()], lastDataPullAt: new Date().toISOString() });
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That pull did not run.");
    } finally {
      setBusy(null);
    }
  }

  /* -------------------------------------------------------- verification */

  async function verifyAll() {
    if (!state || state.portfolio.length === 0) return;
    setBusy("verify");
    setError(null);
    try {
      // Newest and unverified first, because those are the ones a report is
      // most likely to be wrong about.
      const queue = [...state.portfolio]
        .sort((a, b) => (a.lastVerified ?? "").localeCompare(b.lastVerified ?? ""))
        .slice(0, 60)
        .map((l) => l.sourceUrl);
      const verdicts = await verifyBatch(queue, site.domain, (done, total) => setBusy(`verify ${done}/${total}`));
      update({
        ...state,
        portfolio: applyVerdicts(state.portfolio, verdicts),
        lastVerifiedAt: new Date().toISOString(),
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Verification did not finish.");
    } finally {
      setBusy(null);
    }
  }

  /* ------------------------------------------------------------ analysis */

  const health = useMemo(
    () => (state ? assessPortfolio(state.portfolio, { brand: site.name || site.domain, targetTerms: site.targetKeywords }) : null),
    [state, site],
  );

  const risk: ProfileRisk | null = useMemo(() => {
    if (!state) return null;
    return assessProfile(reviewableFrom(state.portfolio, site.industry || site.name), {
      brand: site.name || site.domain,
      targetTerms: site.targetKeywords,
      manualActionPresent: manualAction,
      monthlyGains: health?.velocity,
    });
  }, [state, site, manualAction, health]);

  const mentionProfile = useMemo(() => profileMentions(state?.mentions ?? []), [state]);

  const history = workspace.visibility.find((v) => v.siteId === site.id);
  const impact = useMemo(
    () => measureImpact(state?.mentions ?? [], history?.points ?? []),
    [state, history],
  );

  // Domains an answer engine named while answering a question about the
  // category. The best prospect list available, because it is derived from
  // the thing we are trying to influence.
  const citedDomains = useMemo(() => {
    if (!visibility) return [];
    const counts = new Map<string, number>();
    for (const run of visibility.runs) {
      for (const rival of run.mention.rivals) counts.set(rival, (counts.get(rival) ?? 0) + 1);
    }
    return [...counts.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count);
  }, [visibility]);

  const targets = useMemo(
    () => targetsFromAnswers(citedDomains, state?.mentions ?? []),
    [citedDomains, state],
  );

  const ideas: AssetIdea[] = useMemo(() => {
    const lost: LostPrompt[] = (visibility?.losses ?? []).map((l) => ({ prompt: l.prompt, kind: "category", wonBy: l.wonBy }));
    return assetIdeas({ lost, citedDomains, result: null, brand: site.name || site.domain, industry: site.industry });
  }, [visibility, citedDomains, site]);

  if (!state) return null;

  const disavowFile = risk ? buildDisavowFile(risk, "Filed alongside a reconsideration request, not as routine maintenance.") : null;

  return (
    <>
      {/* ----------------------------------------------------- the data */}
      <Card
        title="Link data"
        action={
          credential ? (
            <div className="button-row">
              <button className="small" disabled={busy !== null} onClick={() => void pull("referring_domains")}>
                {busy === "referring_domains" ? "Pulling" : "Pull referring domains"}
              </button>
              <button className="small" disabled={busy !== null} onClick={() => void pull("broken")}>
                Find broken inbound
              </button>
              <button className="small primary" disabled={busy !== null || site.competitors.length === 0} onClick={() => void pull("competitors")}>
                Competitor gap
              </button>
            </div>
          ) : null
        }
      >
        {!credential ? (
          <CredentialForm onSaved={() => setState({ ...state })} />
        ) : (
          <p className="small muted">
            Connected to {credential.provider}, on your own key. A thousand backlinks costs about six cents there,
            against roughly five dollars for the same rows through Ahrefs&apos; API, which is why the competitor gap
            analysis below is affordable at all.
            {cost !== null ? ` Last pull cost $${cost.toFixed(4)}.` : ""}
          </p>
        )}
        {error ? <Notice kind="error" title="That did not run">{error}</Notice> : null}
      </Card>

      {/* ------------------------------------------------- the competitor gap */}
      {gap && gap.length > 0 ? (
        <Card title={`Domains linking to your rivals and not to you (${gap.length})`}>
          <p className="small muted">
            The highest-yield list in link building. A domain that links to more than one competitor has proven its
            editorial appetite twice over, so those are first.
          </p>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Domain</th><th className="num">Authority</th><th>Links to</th></tr></thead>
              <tbody>
                {gap.slice(0, 60).map((row) => (
                  <tr key={row.domain}>
                    <td>{row.domain}</td>
                    <td className="num">{row.score ?? "-"}</td>
                    <td className="small">
                      {row.linksTo.join(", ")}
                      {row.linksTo.length > 1 ? <Badge kind="ok">proven twice</Badge> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- mentions */}
      <Card title="Mentions, which now matter more than links">
        <p className="small muted">
          Ahrefs measured 75,000 brands in 2026: brand mentions correlate with AI Overview visibility at{" "}
          <strong>0.664</strong>, backlinks at <strong>0.218</strong>. A model has no link graph, it has text, so
          being named is what teaches it you exist. BuzzStream found three quarters of digital PR people have been
          asked about this by a client and about one in ten has a process.
        </p>
        <div className="stat-row">
          <div className="stat"><span className="stat-label">Mentions</span><span className="stat-value">{mentionProfile.total}</span></div>
          <div className="stat"><span className="stat-label">Domains naming you</span><span className="stat-value">{mentionProfile.mentioningDomains}</span></div>
          <div className="stat"><span className="stat-label">Unlinked</span><span className="stat-value">{mentionProfile.unlinked}</span></div>
          <div className="stat"><span className="stat-label">On cited domains</span><span className="stat-value">{mentionProfile.citedDomains}</span></div>
        </div>
        {mentionProfile.notes.map((note) => <Notice key={note} kind="info">{note}</Notice>)}

        {impact.correlation !== null || impact.points.length > 0 ? (
          <div style={{ marginTop: "1rem" }}>
            <div className="tiny faint" style={{ marginBottom: "0.4rem" }}>DOES EARNING MENTIONS MOVE YOUR AI VISIBILITY</div>
            <p className="small" style={{ margin: 0 }}>{impact.reading}</p>
          </div>
        ) : null}

        {mentionProfile.reclamation.length > 0 ? (
          <div style={{ marginTop: "1rem" }}>
            <div className="tiny faint" style={{ marginBottom: "0.4rem" }}>
              UNLINKED, WORTH RECLAIMING ({mentionProfile.reclamation.length})
            </div>
            {mentionProfile.reclamation.slice(0, 10).map((mention) => (
              <div key={mention.url} className="connection-row">
                <div className="meta">
                  <div className="row" style={{ gap: "0.4rem" }}>
                    {mention.citedByAi ? <Badge kind="ok">engines cite this domain</Badge> : null}
                    <a href={mention.url} target="_blank" rel="noopener noreferrer" className="small truncate">{mention.domain}</a>
                  </div>
                  <span className="muted small">{mention.context}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {/* ------------------------------------------- where to earn mentions */}
      {targets.length > 0 ? (
        <Card title="Where a mention would put you in the answer">
          <p className="small muted">
            Every domain here was named by an answer engine while answering a question about your category. That is a
            better prospect list than domain authority, because it is derived from the thing you are trying to change.
          </p>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Domain</th><th className="num">Cited in</th><th>Why</th></tr></thead>
              <tbody>
                {targets.slice(0, 20).map((target) => (
                  <tr key={target.domain}>
                    <td>
                      {target.domain}
                      {target.alreadyMentions ? <Badge kind="ok">names you</Badge> : null}
                    </td>
                    <td className="num">{target.citedInAnswers}</td>
                    <td className="small">{target.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------------------------------- verification */}
      <Card
        title="The portfolio"
        action={
          state.portfolio.length > 0 ? (
            <button className="small primary" disabled={busy !== null} onClick={() => void verifyAll()}>
              {busy?.startsWith("verify") ? busy : "Verify every link"}
            </button>
          ) : null
        }
      >
        {state.portfolio.length === 0 ? (
          <p className="small muted">
            Nothing here yet. Pull referring domains above, or paste a Search Console export into the verifier.
          </p>
        ) : health ? (
          <>
            <div className="stat-row">
              <div className="stat"><span className="stat-label">Referring domains</span><span className="stat-value">{health.referringDomains}</span></div>
              <div className="stat"><span className="stat-label">Passing authority</span><span className="stat-value">{health.followedDomains}</span></div>
              <div className="stat"><span className="stat-label">Decayed</span><span className="stat-value">{health.decayed.length}</span></div>
              <div className="stat"><span className="stat-label">Verified</span><span className="stat-value">{formatNumber(state.portfolio.filter((l) => l.lastVerified).length)}</span></div>
            </div>
            <p className="tiny faint" style={{ marginTop: "0.5rem" }}>
              A provider saying a link exists is a claim. Nothing is counted as confirmed until this has fetched the
              page and read the anchor itself.
            </p>
            {health.notes.map((note) => <Notice key={note} kind="warn">{note}</Notice>)}
            {health.anchors.length > 0 ? (
              <div className="table-scroll" style={{ marginTop: "1rem" }}>
                <table>
                  <thead><tr><th>Anchor</th><th>Kind</th><th className="num">Count</th><th className="num">Share</th></tr></thead>
                  <tbody>
                    {health.anchors.slice(0, 15).map((anchor) => (
                      <tr key={anchor.text}>
                        <td className="truncate">{anchor.text}</td>
                        <td><Badge kind={anchor.kind === "exact" ? "warn" : "neutral"}>{anchor.kind.replace("_", " ")}</Badge></td>
                        <td className="num">{anchor.count}</td>
                        <td className="num">{Math.round(anchor.share * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------- risk */}
      {risk && risk.assessed > 0 ? (
        <Card title="Risk, assessed from evidence">
          <p className="small">{risk.headline}</p>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Looks like a scheme</span>
              <span className={`stat-value ${risk.schemeCandidates.length ? "score-bad" : "score-good"}`}>
                {risk.schemeCandidates.length}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Doing nothing</span>
              <span className="stat-value">{risk.wasted.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Profile patterns</span>
              <span className="stat-value">{risk.patterns.length}</span>
            </div>
          </div>
          <p className="tiny faint" style={{ marginTop: "0.5rem" }}>
            Two numbers, not one, because a link that does nothing and a link that could earn a penalty need opposite
            responses and every other tool folds them into a single toxicity score.
          </p>

          {risk.patterns.map((pattern) => (
            <div key={pattern.code} className="card card-flat" style={{ background: "var(--bg-alt)", marginTop: "0.7rem" }}>
              <strong className="small">{pattern.observed}</strong>
              <p className="small muted" style={{ margin: "0.3rem 0" }}>{pattern.why}</p>
              <p className="tiny faint" style={{ margin: 0 }}><strong>Check it yourself.</strong> {pattern.verify}</p>
            </div>
          ))}

          {risk.schemeCandidates.slice(0, 10).map((candidate) => (
            <div key={candidate.sourceUrl} className="card card-flat" style={{ background: "var(--bg-alt)", marginTop: "0.7rem", borderColor: "var(--bad)" }}>
              <div className="row" style={{ gap: "0.4rem" }}>
                <Badge kind="high">scheme evidence</Badge>
                <span className="small truncate">{candidate.sourceUrl}</span>
              </div>
              {candidate.signals.filter((s) => s.actionRisk > 0).map((signal) => (
                <p key={signal.code} className="small muted" style={{ margin: "0.3rem 0 0" }}>
                  <strong>{signal.observed}.</strong> {signal.why} <em>{signal.verify}</em>
                </p>
              ))}
            </div>
          ))}

          <div className="card card-flat" style={{ marginTop: "1rem" }}>
            <label className="checkline">
              <input type="checkbox" checked={manualAction} onChange={(e) => setManualAction(e.target.checked)} />
              Search Console is reporting a manual action against this site
            </label>
            <p className="small muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>{risk.disavow.reason}</p>
            {disavowFile ? (
              <div style={{ marginTop: "0.7rem" }}>
                <pre className="codeblock" style={{ maxHeight: "220px", overflowY: "auto" }}>{disavowFile}</pre>
                <CopyButton text={disavowFile} label="Copy the disavow file" />
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* --------------------------------------------------- what to publish */}
      <Card title="What to publish so people link without being asked">
        <p className="small muted">
          Most link building fails because the site has nothing worth citing, and no amount of outreach fixes that.
          These are derived from the questions the answer engines were asked and did not name you in, so the demand is
          measured rather than brainstormed.
        </p>
        {ideas.map((idea) => (
          <div key={idea.id} className="card card-flat" style={{ background: "var(--bg-alt)", marginTop: "0.7rem" }}>
            <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
              <Badge kind="neutral">{idea.format.replace(/_/g, " ")}</Badge>
              <Badge kind={idea.effort === "a day" ? "ok" : idea.effort === "a week" ? "warn" : "neutral"}>{idea.effort}</Badge>
              <strong className="small">{idea.title}</strong>
            </div>
            <p className="small muted" style={{ margin: "0.4rem 0 0" }}><strong>Why it earns links.</strong> {idea.whyItEarnsLinks}</p>
            <p className="small muted" style={{ margin: "0.3rem 0 0" }}><strong>The evidence.</strong> {idea.evidence}</p>
            <p className="tiny faint" style={{ margin: "0.3rem 0 0" }}>
              <strong>We do:</strong> {idea.weCanDo} <strong>You supply:</strong> {idea.youMustSupply}
            </p>
          </div>
        ))}
      </Card>
    </>
  );
}

/** The provider key, entered here and held in this browser. */
function CredentialForm({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <Notice kind="warn" title="No link data provider connected">
        The crawl can read your site but not the web&apos;s link graph. A DataForSEO key turns on referring domains,
        broken inbound links and the competitor gap. It is pay as you go with no monthly fee: about six cents per
        thousand backlinks, against roughly five dollars for the same rows through Ahrefs&apos; API. The key is held in
        this browser and sent with the one request that uses it.
      </Notice>
      <div className="field">
        <label htmlFor="dfs">DataForSEO login and password</label>
        <input
          id="dfs"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="you@company.com:your-password"
        />
        <span className="muted small">Exactly as DataForSEO gives it, with the colon.</span>
      </div>
      <button
        className="small primary"
        disabled={!value.includes(":")}
        onClick={() => {
          saveCredential({ provider: "dataforseo", credential: value.trim() });
          setValue("");
          onSaved();
        }}
      >
        Save in this browser
      </button>
    </>
  );
}
