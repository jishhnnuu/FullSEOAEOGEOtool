"use client";

/**
 * The outreach desk.
 *
 * The point of this screen is that the founder's job is reading and pressing
 * send, and nothing else. Every draft below was written from a fact the crawl
 * found on the target page, with no model involved and no key required, and
 * the button opens it in their own mail client with the address, subject and
 * body already filled in.
 *
 * Nothing here sends anything. That is deliberate and it is enforced in the
 * engine, not just in this component: an automated sender turns a relationship
 * programme into spam, and it is the founder's domain reputation at stake.
 */

import { useEffect, useMemo, useState } from "react";

import { Badge, Card, CopyButton, Notice } from "@/components/ui";
import { loadLinks, saveLinks, type PipelineEntry } from "@/lib/links";
import { id, type SiteRecord } from "@/lib/store";
import type { LinkProspect } from "@/engine/types";
import type { Mention } from "@/engine/mentions";
import {
  RULES,
  canApproach,
  composeUrl,
  composeUrlFits,
  draft,
  isRoleAddress,
  proofFromBrokenLink,
  proofFromMention,
  proofFromOutboundLink,
  proofFromResourcePage,
  type Draft,
  type MailClient,
  type Sender,
  type Tactic,
} from "@/engine/outreach";

const SENDER_KEY = "seoos.sender.v1";

type SenderForm = Sender & { client: MailClient };

function loadSender(site: SiteRecord, accountName: string): SenderForm {
  const fallback: SenderForm = {
    name: accountName || "",
    role: "",
    company: site.name,
    url: site.baseUrl,
    covers: "",
    client: "gmail",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${SENDER_KEY}.${site.id}`);
    return raw ? { ...fallback, ...(JSON.parse(raw) as SenderForm) } : fallback;
  } catch {
    return fallback;
  }
}

export function OutreachDesk({
  site,
  prospects,
  mentions,
  accountName,
}: {
  site: SiteRecord;
  prospects: LinkProspect[];
  mentions: Mention[];
  accountName: string;
}) {
  const [sender, setSender] = useState<SenderForm | null>(null);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [pipeline, setPipeline] = useState<PipelineEntry[]>([]);

  useEffect(() => {
    setSender(loadSender(site, accountName));
    setPipeline(loadLinks(site.id).pipeline);
  }, [site, accountName]);

  function persistSender(next: SenderForm) {
    setSender(next);
    try {
      window.localStorage.setItem(`${SENDER_KEY}.${site.id}`, JSON.stringify(next));
    } catch {
      // A browser with storage blocked still drafts, it just forgets the form.
    }
  }

  const candidates = useMemo(() => buildCandidates(prospects, mentions), [prospects, mentions]);

  const drafts = useMemo(() => {
    if (!sender) return [];
    return candidates
      .map((candidate) => {
        const written = draft({
          tactic: candidate.tactic,
          proof: candidate.proof,
          sender,
          to: contacts[candidate.key] ?? null,
        });
        return written ? { ...candidate, draft: written } : null;
      })
      .filter((item): item is (typeof candidates)[number] & { draft: Draft } => item !== null);
  }, [candidates, sender, contacts]);

  const ready = Boolean(sender?.name && sender?.company && sender?.url && sender?.covers);

  function recordApproach(domain: string, targetUrl: string, tactic: string, contact: string | null) {
    const state = loadLinks(site.id);
    const existing = state.pipeline.find((entry) => entry.domain === domain);
    const now = new Date().toISOString();
    const next: PipelineEntry[] = existing
      ? state.pipeline.map((entry) =>
          entry.domain === domain
            ? { ...entry, stage: "sent", approaches: entry.approaches + 1, updatedAt: now, contact: contact ?? entry.contact }
            : entry,
        )
      : [
          ...state.pipeline,
          {
            id: id("pip"),
            domain,
            targetUrl,
            tactic,
            stage: "sent" as const,
            verifiedLinkUrl: null,
            contact,
            note: "",
            createdAt: now,
            updatedAt: now,
            approaches: 1,
          },
        ];
    saveLinks({ ...state, pipeline: next });
    setPipeline(next);
  }

  if (!sender) return null;

  return (
    <>
      <Card title="Who the email is from">
        <p className="small muted">
          Five fields, filled in once. They never leave this browser, and they are what turns a list of prospects into
          drafts you can send without editing.
        </p>
        <div className="grid grid-2">
          <label className="field">
            <span className="rule-label">Your name</span>
            <input value={sender.name} onChange={(e) => persistSender({ ...sender, name: e.target.value })} placeholder="Jane Okafor" />
          </label>
          <label className="field">
            <span className="rule-label">Your role</span>
            <input value={sender.role} onChange={(e) => persistSender({ ...sender, role: e.target.value })} placeholder="Founder" />
          </label>
          <label className="field">
            <span className="rule-label">Company</span>
            <input value={sender.company} onChange={(e) => persistSender({ ...sender, company: e.target.value })} />
          </label>
          <label className="field">
            <span className="rule-label">The page you are pitching</span>
            <input value={sender.url} onChange={(e) => persistSender({ ...sender, url: e.target.value })} />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="rule-label">What that page covers, in your words</span>
            <input
              value={sender.covers}
              onChange={(e) => persistSender({ ...sender, covers: e.target.value })}
              placeholder="how much commercial solar actually costs in New South Wales, with the 2026 rebate figures"
            />
          </label>
          <label className="field">
            <span className="rule-label">Open drafts in</span>
            <select value={sender.client} onChange={(e) => persistSender({ ...sender, client: e.target.value as MailClient })}>
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook on the web</option>
              <option value="default">Whatever this device uses</option>
            </select>
          </label>
        </div>
      </Card>

      {!ready ? (
        <Notice kind="warn">
          Fill in the name, company, page and what it covers. Without them a draft would be a template, and this refuses
          to write templates: an email that opens with something only a reader could know gets replies, and one that
          opens with &ldquo;I came across your website&rdquo; does not.
        </Notice>
      ) : null}

      <Card title={`Drafts ready to send · ${drafts.length}`}>
        <p className="small muted">
          Each one quotes something from the target page. No model wrote these and no key is needed; they come from the
          crawl. Read it, change anything you want, press send.
        </p>

        {drafts.length === 0 ? (
          <p className="small muted" style={{ marginBottom: 0 }}>
            {ready
              ? "Nothing to write yet. Drafts come from unlinked mentions, dead links pointing at you, pages that already cite you, and resource pages, so run the mention sweep or connect a link source first."
              : "Complete the form above and the drafts appear."}
          </p>
        ) : (
          <div>
            {drafts.map((item) => {
              const allowed = canApproach(
                pipeline.map((entry) => ({ domain: entry.domain, at: entry.updatedAt })),
                item.domain,
              );
              const contact = contacts[item.key] ?? "";
              const role = contact.length > 0 && isRoleAddress(contact);
              const fits = composeUrlFits(item.draft, sender.client);
              return (
                <div className="draft" key={item.key}>
                  <div className="between">
                    <strong className="small">{item.domain}</strong>
                    <Badge kind="info">{item.tactic.replace(/_/g, " ")}</Badge>
                  </div>

                  <p className="draft-proof" style={{ marginTop: "0.5rem" }}>
                    {item.draft.proof.fact}{" "}
                    <a href={item.draft.proof.sourceUrl} target="_blank" rel="noopener noreferrer" className="tiny">
                      check it
                    </a>
                  </p>

                  <p className="tiny faint">{item.draft.rationale}</p>

                  <label className="field">
                    <span className="rule-label">Send to</span>
                    <input
                      value={contact}
                      placeholder="A person's address, not a shared mailbox"
                      onChange={(e) => setContacts({ ...contacts, [item.key]: e.target.value })}
                    />
                  </label>
                  {role ? (
                    <p className="tiny" style={{ color: "var(--warn)" }}>
                      That is a shared mailbox. They are read by whoever is on rota and they are where outreach goes to
                      die. {item.contactPath}
                    </p>
                  ) : null}

                  <div className="small"><strong>{item.draft.subject}</strong></div>
                  <pre>{item.draft.body}</pre>

                  <div className="button-row">
                    <a
                      className={`button small primary${!allowed || !fits ? " disabled" : ""}`}
                      href={allowed && fits ? composeUrl({ ...item.draft, to: contact || null }, sender.client) : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (allowed && fits) recordApproach(item.domain, item.targetUrl, item.tactic, contact || null);
                      }}
                    >
                      Open in {sender.client === "outlook" ? "Outlook" : sender.client === "gmail" ? "Gmail" : "your mail app"}
                    </a>
                    <CopyButton text={`${item.draft.subject}\n\n${item.draft.body}`} label="Copy" />
                    <span className="tiny faint">{item.draft.words} words</span>
                  </div>

                  {!allowed ? (
                    <p className="tiny" style={{ color: "var(--warn)", marginTop: "0.4rem" }}>
                      This domain has already been approached {RULES.maxApproachesPerDomain} times this month. Past that
                      it reads as pressure, and the relationship is worth more than the link.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="What this will not do">
        <ul className="small stack-sm" style={{ paddingLeft: "1.1rem" }}>
          <li>Send anything by itself. A compose window opens and a person presses send, every time.</li>
          <li>Approach a domain more than {RULES.maxApproachesPerDomain} times in a month, or follow up more than {RULES.maxFollowUps} time.</li>
          <li>Keep going once someone replies. A reply ends the sequence and the conversation is yours.</li>
          <li>Offer money, a link swap, or anything else Google treats as a link scheme.</li>
          <li>Write a draft without a fact from the target page. It returns nothing rather than filler.</li>
        </ul>
        <p className="tiny faint" style={{ marginBottom: 0 }}>
          Your mail never passes through this platform. The compose link is built in your browser and opens in your own
          account, which is also why there is no inbox here to check: reading your mail would need a Google restricted
          scope, an annual security assessment, and a copy of your correspondence on a server. Not worth it for a
          feature that saves one click.
        </p>
      </Card>
    </>
  );
}

type Candidate = {
  key: string;
  domain: string;
  targetUrl: string;
  tactic: Tactic;
  proof: NonNullable<ReturnType<typeof proofFromMention>>;
  contactPath: string;
};

/** Every prospect the crawl can prove something about, turned into a draftable candidate. */
function buildCandidates(prospects: LinkProspect[], mentions: Mention[]): Candidate[] {
  const out: Candidate[] = [];

  for (const mention of mentions) {
    if (mention.kind !== "unlinked") continue;
    const proof = proofFromMention({ url: mention.url, context: mention.context }, mention.domain);
    if (!proof) continue;
    out.push({
      key: `mention:${mention.url}`,
      domain: mention.domain,
      targetUrl: mention.url,
      tactic: "unlinked_mention",
      proof,
      contactPath: "Look for the author's byline on the page.",
    });
  }

  for (const prospect of prospects) {
    const title = prospect.domain;
    let proof: Candidate["proof"] | null = null;
    let tactic: Tactic | null = null;

    switch (prospect.kind) {
      case "broken_inbound":
        proof = proofFromBrokenLink({
          pageUrl: prospect.url,
          pageTitle: title,
          deadUrl: prospect.why.match(/https?:\/\/\S+/)?.[0] ?? prospect.url,
          anchorText: "",
        });
        tactic = "broken_inbound";
        break;
      case "broken_replacement":
        proof = proofFromBrokenLink({
          pageUrl: prospect.url,
          pageTitle: title,
          deadUrl: prospect.why.match(/https?:\/\/\S+/)?.[0] ?? prospect.url,
          anchorText: "",
        });
        tactic = "broken_replacement";
        break;
      case "relationship":
      case "partner":
        proof = proofFromOutboundLink({ pageUrl: prospect.url, pageTitle: title, ourPages: [prospect.why] });
        tactic = "relationship";
        break;
      case "resource_page":
      case "directory":
        proof = proofFromResourcePage({ pageUrl: prospect.url, pageTitle: title, listedCount: 3 });
        tactic = "resource_page";
        break;
      case "journalist":
        proof = { fact: prospect.why, sourceUrl: prospect.url, pageTitle: title };
        tactic = "journalist";
        break;
      case "podcast":
        proof = { fact: prospect.why, sourceUrl: prospect.url, pageTitle: title };
        tactic = "podcast";
        break;
      default:
        break;
    }

    if (!proof || !tactic) continue;
    out.push({
      key: `prospect:${prospect.url}`,
      domain: prospect.domain,
      targetUrl: prospect.url,
      tactic,
      proof,
      contactPath: prospect.contactPath,
    });
  }

  return out.slice(0, 60);
}
