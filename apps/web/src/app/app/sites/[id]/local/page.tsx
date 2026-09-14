"use client";

import Link from "next/link";

import { useSite } from "@/lib/site-hooks";
import { Badge, Card, CopyButton, Empty, Notice, PageHeader, shortUrl } from "@/components/ui";

export default function LocalPage() {
  const { site, result } = useSite();

  if (!site) return null;
  if (!result) {
    return (
      <>
        <PageHeader title="Local" />
        <Empty title="No run yet">
          <p className="small"><Link href={`/app/sites/${site.id}`}>Run the audit</Link> first.</p>
        </Empty>
      </>
    );
  }

  const local = result.local;
  const localFindings = result.findings.filter((f) => f.category === "local");
  const napFix = result.findings.find((f) => f.code === "nap_missing")?.fix;
  const schemaFix = result.findings.find((f) => f.code === "no_local_schema" || f.code === "no_organization_schema")?.fix;
  const gbpConnected = site.integrations.some((i) => i.provider === "gbp" && i.status === "connected");

  if (!local.applicable) {
    return (
      <>
        <PageHeader title="Local" description="Not a local business, so this side is switched off." />
        <Notice>
          This site is set to <strong>{site.businessType}</strong> with no locations. If it does serve named
          places, add them in <Link href={`/app/sites/${site.id}/settings`}>settings</Link> and the local checks,
          location page briefs and profile work all switch on.
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Local and maps"
        description="The signals that decide whether you appear in the map pack, and the work that fixes them."
      />

      <div className="grid grid-3">
        <div className="card score">
          <div className="label">Contact details found</div>
          <div className={`value ${local.napFound.phone && local.napFound.address ? "score-good" : "score-bad"}`}>
            {[local.napFound.name, local.napFound.address, local.napFound.phone].filter(Boolean).length}/3
          </div>
          <div className="hint">Name, address and phone, across {local.napFound.pages} pages</div>
        </div>
        <div className="card score">
          <div className="label">LocalBusiness markup</div>
          <div className={`value ${local.hasLocalBusinessSchema ? "score-good" : "score-bad"}`}>
            {local.hasLocalBusinessSchema ? "Yes" : "No"}
          </div>
          <div className="hint">Carries hours, address and geo to map surfaces</div>
        </div>
        <div className="card score">
          <div className="label">Location pages</div>
          <div className={`value ${local.locationPages.length ? "score-good" : "score-bad"}`}>{local.locationPages.length}</div>
          <div className="hint">of {site.locations.length} location{site.locations.length === 1 ? "" : "s"} you serve</div>
        </div>
      </div>

      {local.consistency.length > 0 && (
        <Notice kind="bad">
          <strong>Your contact details are not consistent across the site.</strong> Conflicting name, address or
          phone data undermines the confidence that drives map pack ranking, and it is the single most common
          reason a local business is outranked by a worse one.
          <ul className="small" style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
            {local.consistency.map((item) => (
              <li key={item.field}><strong>{item.field}:</strong> {item.variants.join("  |  ")}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Card title="What the crawl found">
        <dl className="kv">
          <dt>Business name</dt><dd>{local.napFound.name ?? "not found"}</dd>
          <dt>Address</dt><dd>{local.napFound.address ?? <span className="faint">not found on any crawled page</span>}</dd>
          <dt>Phone</dt><dd>{local.napFound.phone ?? <span className="faint">not found on any crawled page</span>}</dd>
          <dt>Opening hours</dt><dd>{local.openingHours ? "Published as text" : <span className="faint">not found as text</span>}</dd>
          <dt>Map embeds</dt><dd>{local.mapEmbeds || "none"}</dd>
          <dt>Location pages</dt>
          <dd>
            {local.locationPages.length
              ? local.locationPages.map((url) => (
                  <div key={url}><a href={url} target="_blank" rel="noopener noreferrer">{shortUrl(url, 60)}</a></div>
                ))
              : <span className="faint">none</span>}
          </dd>
        </dl>
      </Card>

      {(napFix || schemaFix) && (
        <Card title="Ready to paste">
          {napFix && (
            <details className="reveal">
              <summary className="small">{napFix.label}</summary>
              <pre className="codeblock after">{napFix.after}</pre>
              <div className="button-row" style={{ marginTop: "0.5rem" }}>
                <CopyButton text={napFix.after} />
              </div>
              <p className="tiny muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>{napFix.instructions}</p>
            </details>
          )}
          {schemaFix && (
            <details className="reveal">
              <summary className="small">{schemaFix.label}</summary>
              <pre className="codeblock after">{schemaFix.after}</pre>
              <div className="button-row" style={{ marginTop: "0.5rem" }}>
                <CopyButton text={schemaFix.after} />
              </div>
              <p className="tiny muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>{schemaFix.instructions}</p>
            </details>
          )}
        </Card>
      )}

      <Card title="The work queue">
        <div className="stack-sm">
          {local.recommendations.map((item, i) => (
            <div key={i} className="row small" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
              <Badge kind="medium">{i + 1}</Badge>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Card>

      {localFindings.length > 0 && (
        <Card title="Local findings">
          <div className="table-scroll">
            <table>
              <thead><tr><th>Finding</th><th>Severity</th><th>Detail</th></tr></thead>
              <tbody>
                {localFindings.map((finding) => (
                  <tr key={finding.id}>
                    <td>{finding.title}</td>
                    <td><Badge kind={finding.severity}>{finding.severity}</Badge></td>
                    <td className="small muted">{finding.detail || finding.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!gbpConnected && (
        <Notice kind="warn">
          The Business Profile is not connected, so posts, review replies, hours and the geo grid cannot run on a
          schedule. Everything above is what the crawl can see from the website alone.{" "}
          <Link href={`/app/sites/${site.id}/integrations`}>Connect it</Link>.
        </Notice>
      )}
    </>
  );
}
