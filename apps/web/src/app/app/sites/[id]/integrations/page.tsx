"use client";

import { useState } from "react";

import { CATEGORY_LABEL, CATEGORY_ORDER, CONNECTORS, type ConnectorSpec } from "@/lib/connectors";
import { id, logActivity } from "@/lib/store";
import { useSite } from "@/lib/site-hooks";
import { Badge, Card, Notice, PageHeader, timeAgo } from "@/components/ui";

export default function IntegrationsPage() {
  const { site, mutate } = useSite();
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  if (!site) return null;

  const connected = new Map(site.integrations.map((i) => [i.provider, i]));

  function connect(spec: ConnectorSpec) {
    const missing = spec.fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length) return;
    const reference = values[spec.fields[0].key] ?? spec.name;
    mutate((w) => {
      const record = w.sites.find((s) => s.id === site!.id);
      if (!record) return;
      record.integrations = record.integrations.filter((i) => i.provider !== spec.provider);
      record.integrations.push({
        id: id("int"),
        provider: spec.provider,
        label: spec.name,
        status: "connected",
        accountRef: reference.slice(0, 80),
        detail: spec.unlocks[0],
        capabilities: spec.unlocks,
        connectedAt: new Date().toISOString(),
        lastError: null,
      });
      logActivity(w, {
        siteId: site!.id,
        actor: "you",
        action: "Connection added",
        detail: spec.name,
      });
    });
    setEditing(null);
    setValues({});
  }

  function disconnect(provider: string) {
    mutate((w) => {
      const record = w.sites.find((s) => s.id === site!.id);
      if (!record) return;
      record.integrations = record.integrations.filter((i) => i.provider !== provider);
    });
  }

  return (
    <>
      <PageHeader
        title="Connections"
        description="Nothing here is required. The audit runs on the public site alone. Each connection turns a stated limitation into a capability."
      />

      <Notice>
        <strong>Where credentials go.</strong> On this hosted deployment they are held in this browser&apos;s storage
        and used from here. They are never sent to a server of ours, which also means they are not backed up: export
        your workspace if you want a copy. A self-hosted installation stores them envelope encrypted in your own
        database instead.
      </Notice>

      {CATEGORY_ORDER.filter((category) => CONNECTORS.some((c) => c.category === category)).map((category) => (
        <div key={category} style={{ marginTop: "1.4rem" }}>
          <h2 style={{ marginBottom: "0.7rem" }}>{CATEGORY_LABEL[category]}</h2>
          <div className="stack-sm">
            {CONNECTORS.filter((c) => c.category === category).map((spec) => {
              const live = connected.get(spec.provider);
              const isEditing = editing === spec.provider;
              return (
                <Card key={spec.provider}>
                  <div className="between" style={{ alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: "0.5rem" }}>
                        <strong>{spec.name}</strong>
                        {live && <Badge kind="ok">connected</Badge>}
                        {!live && spec.essential && <Badge kind="medium">recommended</Badge>}
                      </div>
                      <p className="small muted" style={{ margin: "0.3rem 0 0" }}>{spec.summary}</p>
                      {live && (
                        <div className="tiny faint" style={{ marginTop: "0.3rem" }}>
                          {live.accountRef} · connected {timeAgo(live.connectedAt)}
                        </div>
                      )}
                    </div>
                    <div className="button-row">
                      {live ? (
                        <button className="small danger" onClick={() => disconnect(spec.provider)}>Disconnect</button>
                      ) : (
                        <button
                          className="small primary"
                          onClick={() => {
                            setEditing(isEditing ? null : spec.provider);
                            setValues({});
                          }}
                        >
                          {isEditing ? "Cancel" : "Connect"}
                        </button>
                      )}
                    </div>
                  </div>

                  {!live && (
                    <div className="grid grid-2" style={{ marginTop: "0.8rem" }}>
                      <div>
                        <div className="tiny faint" style={{ marginBottom: "0.3rem" }}>WHAT IT UNLOCKS</div>
                        <ul className="small muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                          {spec.unlocks.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                      <div>
                        <div className="tiny faint" style={{ marginBottom: "0.3rem" }}>WITHOUT IT</div>
                        <p className="small muted" style={{ margin: 0 }}>{spec.withoutIt}</p>
                      </div>
                    </div>
                  )}

                  {isEditing && (
                    <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                      {spec.setupNotes && <div className="notice small" style={{ marginBottom: "0.9rem" }}>{spec.setupNotes}</div>}
                      {spec.fields.map((field) => (
                        <div className="field" key={field.key}>
                          <label htmlFor={`${spec.provider}-${field.key}`}>
                            {field.label}{!field.required && <span className="faint"> optional</span>}
                          </label>
                          {field.kind === "textarea" ? (
                            <textarea
                              id={`${spec.provider}-${field.key}`}
                              value={values[field.key] ?? ""}
                              onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                              placeholder={field.placeholder}
                            />
                          ) : (
                            <input
                              id={`${spec.provider}-${field.key}`}
                              type={field.kind === "password" ? "password" : "text"}
                              value={values[field.key] ?? ""}
                              onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                              placeholder={field.placeholder}
                            />
                          )}
                          <div className="help">{field.help}</div>
                        </div>
                      ))}
                      <div className="button-row">
                        <button className="primary small" onClick={() => connect(spec)}>Save the connection</button>
                        {spec.docsUrl && (
                          <a href={spec.docsUrl} target="_blank" rel="noopener noreferrer" className="button small">
                            Provider docs
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
