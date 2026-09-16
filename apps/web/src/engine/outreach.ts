/**
 * Outreach that needs no model, and lands in the sender's own mail client.
 *
 * Two problems solved here, and the second one is the interesting one.
 *
 * The first is that outreach written by a language model reads like outreach
 * written by a language model, and journalists and editors have learned the
 * shape. The thing that actually earns a reply is not fluency, it is proof
 * that a person read the page. That proof is a fact, and facts come from the
 * crawl, not from a model. So this is deterministic: it cannot produce an
 * email at all unless it has a specific, checkable detail from the target page
 * to open with. No key, no cost, no generic filler, and no chance of the model
 * inventing a compliment about an article it never read.
 *
 * The second is delivery. The obvious answer is the Gmail API, and it is the
 * wrong one: `gmail.compose` is a restricted scope, which means Google
 * verification plus an annual CASA security assessment, and storing or
 * transmitting restricted-scope data on a server pushes that into the tier
 * that costs real money. A new product cannot start there.
 *
 * It does not have to. Gmail, Outlook and every mail client accept a compose
 * URL with the recipient, subject and body pre-filled. Open it and the draft
 * is sitting in the user's own mailbox, in their own session, ready to send.
 * No API, no scope, no verification, no assessment, and the user's mail never
 * touches our server. One click instead of three copy-pastes, and it works on
 * day one for everybody.
 */

export type Tactic =
  | "unlinked_mention"
  | "broken_replacement"
  | "broken_inbound"
  | "resource_page"
  | "relationship"
  | "journalist"
  | "podcast";

/**
 * The fact that proves a person read the page.
 *
 * Every draft requires one. This is the whole quality bar: an email that opens
 * with something only a reader could know gets replies, and one that opens
 * with "I came across your website" does not.
 */
export type Proof = {
  /** What was observed on their page. */
  fact: string;
  /** Where it was observed, so the sender can check before pressing send. */
  sourceUrl: string;
  /** The page's own title, used in the subject line. */
  pageTitle: string;
};

export type Sender = {
  name: string;
  role: string;
  company: string;
  /** The page being pitched. */
  url: string;
  /** What it covers, in the sender's own words. */
  covers: string;
};

export type Draft = {
  to: string | null;
  subject: string;
  body: string;
  tactic: Tactic;
  /** The proof used, surfaced so a person can sanity check it before sending. */
  proof: Proof;
  /** Word count. Kept short on purpose. */
  words: number;
  /** Why this draft is shaped the way it is, for the person deciding to send. */
  rationale: string;
};

/* --------------------------------------------------------------- writing */

/**
 * Subject lines that get opened.
 *
 * Specific, lowercase where a person would write lowercase, and never a pitch.
 * The test is whether it could plausibly be from someone the recipient knows.
 * "Quick question about your article" is a cold email. "The dead Moz link in
 * your 2024 guide" is a person being useful.
 */
function subjectFor(tactic: Tactic, proof: Proof, sender: Sender): string {
  const page = proof.pageTitle.replace(/\s*[|\-–—]\s*.*$/, "").trim().slice(0, 60);
  switch (tactic) {
    case "unlinked_mention":
      return `The ${sender.company} mention in "${page}"`;
    case "broken_replacement":
      return `Dead link in "${page}"`;
    case "broken_inbound":
      return `Your link to ${sender.company} is 404ing`;
    case "resource_page":
      return `A suggestion for "${page}"`;
    case "relationship":
      return `${sender.company} and ${hostOf(proof.sourceUrl)}`;
    case "journalist":
      return `Re: your request, from ${sender.company}`;
    case "podcast":
      return `Guest idea for ${page}`;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The body.
 *
 * Under a hundred words, always. Three movements: the proof, the ask, the
 * exit. The exit matters more than people think: giving the recipient an easy
 * no is what makes the yes feel like a decision rather than a capitulation,
 * and it is why these get replies rather than silence.
 */
function bodyFor(tactic: Tactic, proof: Proof, sender: Sender, recipientName: string | null): string {
  const hello = recipientName ? `Hi ${recipientName},` : "Hi,";
  const sign = `${sender.name}\n${sender.role}, ${sender.company}`;

  const movements: Record<Tactic, { proof: string; ask: string; exit: string }> = {
    unlinked_mention: {
      proof: `${proof.fact} Thank you for the mention.`,
      ask: `Would you be open to linking it to ${sender.url}? It is where the detail behind that sits, and it would save anyone reading a search.`,
      exit: "If you would rather not, no problem at all.",
    },
    broken_replacement: {
      proof: `${proof.fact}`,
      ask: `We have something covering the same ground at ${sender.url}, if it is useful as a replacement. ${sender.covers}`,
      exit: "Either way the dead one is probably worth pulling.",
    },
    broken_inbound: {
      proof: `${proof.fact}`,
      ask: `The page moved. ${sender.url} is the current one, if you want to update it.`,
      exit: "No reply needed, just thought you would want to know.",
    },
    resource_page: {
      proof: `${proof.fact}`,
      ask: `If it fits, ${sender.url} covers ${sender.covers}.`,
      exit: "No worries if it is not right for the page.",
    },
    relationship: {
      proof: `${proof.fact}`,
      ask: `Would a link to ${sender.url} make sense from your side? Happy to do the same wherever it fits for you.`,
      exit: "Only if it is useful to you.",
    },
    journalist: {
      proof: `${proof.fact}`,
      ask: `Happy to give you a usable quote on that. ${sender.covers} More at ${sender.url} if the background helps.`,
      exit: "Tell me your deadline and I will work to it.",
    },
    podcast: {
      proof: `${proof.fact}`,
      ask: `If you are taking guests, ${sender.name} could talk about ${sender.covers}`,
      exit: "Understood if the schedule is full.",
    },
  };

  const m = movements[tactic];
  return [hello, "", m.proof, "", m.ask, "", m.exit, "", sign].join("\n");
}

const RATIONALE: Record<Tactic, string> = {
  unlinked_mention:
    "The cheapest link there is. The editorial decision is already made, so this is a correction rather than a favour, and it converts far better than anything cold.",
  broken_replacement:
    "You are doing them a favour first. The dead link is a real problem on their page, and the replacement is the second sentence rather than the first.",
  broken_inbound:
    "Not really outreach. They already linked to you and it broke. This is a courtesy that happens to recover the link.",
  resource_page:
    "The page exists to list useful things. The only question is whether yours is one, so the pitch is short and the exit is generous.",
  relationship:
    "You already cite them. This is the easiest conversation in link building and most programmes never have it.",
  journalist:
    "Speed beats polish here. A usable quote in the first reply, inside the hour, is what wins these.",
  podcast:
    "Show notes carry a followed link and the episode keeps earning. Pitch the topic, not yourself.",
};

/**
 * Write one draft, or refuse.
 *
 * Refusing is a feature. A draft without a specific fact from the target page
 * is a template, and a template is worse than nothing because it burns the
 * domain. The caller gets null and a reason rather than filler.
 */
export function draft(input: {
  tactic: Tactic;
  proof: Proof;
  sender: Sender;
  recipientName?: string | null;
  to?: string | null;
}): Draft | null {
  const fact = input.proof.fact?.trim() ?? "";
  // A fact shorter than this is not a fact, it is a greeting.
  if (fact.length < 25) return null;
  if (!input.sender.url || !input.sender.company) return null;

  const body = bodyFor(input.tactic, input.proof, input.sender, input.recipientName ?? null);
  return {
    to: input.to ?? null,
    subject: subjectFor(input.tactic, input.proof, input.sender),
    body,
    tactic: input.tactic,
    proof: input.proof,
    words: body.split(/\s+/).filter(Boolean).length,
    rationale: RATIONALE[input.tactic],
  };
}

/* -------------------------------------------------------------- delivery */

export type MailClient = "gmail" | "outlook" | "default";

/**
 * A URL that opens the draft, filled in, in the sender's own mail client.
 *
 * This is the whole delivery mechanism, and it is worth stating why it beats
 * the API it replaces. `gmail.compose` is a restricted scope: Google
 * verification, a CASA security assessment, annual re-certification, and the
 * moment restricted-scope data touches a server the assessment tier climbs.
 * A compose URL needs none of it, works on day one, and the user's mail never
 * reaches us at all. The only cost is that the draft opens rather than saving
 * itself, which is one click.
 */
export function composeUrl(draft: Draft, client: MailClient = "gmail"): string {
  const to = draft.to ?? "";
  const su = encodeURIComponent(draft.subject);
  const body = encodeURIComponent(draft.body);

  switch (client) {
    case "gmail":
      // `view=cm&fs=1` opens the full compose window rather than a reply box.
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${su}&body=${body}`;
    case "outlook":
      return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${su}&body=${body}`;
    default:
      return `mailto:${encodeURIComponent(to)}?subject=${su}&body=${body}`;
  }
}

/**
 * Whether a compose URL will survive the trip.
 *
 * Browsers and mail clients cap URL length. Outreach that is short enough to
 * get a reply is comfortably inside every limit, so this is a guard against a
 * bug rather than a real constraint, but a silently truncated email is a bad
 * way to find out.
 */
export function composeUrlFits(draft: Draft, client: MailClient = "gmail"): boolean {
  return composeUrl(draft, client).length < 6000;
}

/* --------------------------------------------------- proofs from the crawl */

/**
 * Turn what the crawl found into the fact an email opens with.
 *
 * Each of these is something only a reader of the page would know, which is
 * exactly the bar. None of them needs a model.
 */
export function proofFromMention(mention: { url: string; context: string }, pageTitle: string): Proof | null {
  const context = mention.context.trim();
  if (context.length < 25) return null;
  return {
    fact: `You wrote: "${context.slice(0, 180)}"`,
    sourceUrl: mention.url,
    pageTitle,
  };
}

export function proofFromBrokenLink(input: {
  pageUrl: string;
  pageTitle: string;
  deadUrl: string;
  anchorText: string;
}): Proof {
  return {
    fact: input.anchorText
      ? `The link on "${input.anchorText}" points at ${input.deadUrl}, which is returning an error.`
      : `One of the links on that page points at ${input.deadUrl}, which is returning an error.`,
    sourceUrl: input.pageUrl,
    pageTitle: input.pageTitle,
  };
}

export function proofFromOutboundLink(input: { pageUrl: string; pageTitle: string; ourPages: string[] }): Proof | null {
  if (input.ourPages.length === 0) return null;
  return {
    fact: `We link to you from ${input.ourPages.slice(0, 2).join(" and ")}, and have done for a while.`,
    sourceUrl: input.pageUrl,
    pageTitle: input.pageTitle,
  };
}

export function proofFromResourcePage(input: { pageUrl: string; pageTitle: string; listedCount: number }): Proof | null {
  if (input.listedCount < 3) return null;
  return {
    fact: `"${input.pageTitle}" lists ${input.listedCount} resources, and it is the page people get sent to when they ask.`,
    sourceUrl: input.pageUrl,
    pageTitle: input.pageTitle,
  };
}

/* ------------------------------------------------------------ the rules */

/**
 * What the programme will not do, enforced in code rather than in a policy
 * document, because a policy in a document is one the software can break.
 */
export const RULES = {
  /** Nothing sends itself. A compose window opens; a person presses send. */
  neverSends: true,
  maxApproachesPerDomain: 2,
  maxFollowUps: 1,
  stopOnReply: true,
  neverOffersPayment: true,
  /** A generic mailbox reaches nobody and marks the sender as bulk. */
  roleAddressPrefixes: ["info@", "admin@", "sales@", "support@", "contact@", "hello@", "enquiries@", "office@", "team@"],
} as const;

export function isRoleAddress(email: string): boolean {
  const lower = email.toLowerCase();
  return RULES.roleAddressPrefixes.some((prefix) => lower.startsWith(prefix));
}

/**
 * Whether this domain can be approached again.
 *
 * Two in a month is the ceiling. Past that it reads as pressure, and the
 * relationship is worth more than the link.
 */
export function canApproach(history: { domain: string; at: string }[], domain: string, now = new Date()): boolean {
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const recent = history.filter((h) => h.domain === domain && h.at > monthAgo);
  return recent.length < RULES.maxApproachesPerDomain;
}
