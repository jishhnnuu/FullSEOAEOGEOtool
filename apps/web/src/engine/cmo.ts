/**
 * The chief marketing officer: one point of contact, and what it can answer
 * with nobody's model key.
 *
 * The product's central claim is that a client talks to one person and the
 * desks organise themselves behind them. Until this file existed that claim
 * was made on a marketing page and nowhere else: the workspace had nineteen
 * screens and no way to ask a question.
 *
 * Two constraints shaped it.
 *
 * **It has to work without a key.** Drafting relays the tenant's own model
 * key and this product holds none, so a conversational surface that needs one
 * would be dead for most people on most days. So this is a deterministic
 * router first: it reads the intent, answers from what the workspace actually
 * measured, and names the next action. A key makes the replies conversational.
 * It does not make them possible.
 *
 * **It must never invent.** Every number a reply contains is read from the
 * audit result. Where the answer is not known, the reply says what would make
 * it knowable, which is the same rule every other screen here follows. A
 * confident wrong answer from something that calls itself your CMO is worse
 * than no answer at all, because people act on it.
 */

import type { AuditResult } from "./types";

/* ------------------------------------------------------------ the intents */

export type Intent =
  | "greeting"
  | "status"
  | "problems"
  | "priority"
  | "cost"
  | "timing"
  | "desk_search"
  | "desk_content"
  | "desk_social"
  | "desk_paid"
  | "capability"
  | "approval"
  | "frustration"
  | "handover"
  | "unknown";

type Rule = { intent: Intent; re: RegExp };

/*
 * Ordered, and the order is the judgement. A message containing both a
 * complaint and a question is a complaint first, because answering the
 * question while ignoring the tone is how an account manager loses a client.
 */
const RULES: Rule[] = [
  { intent: "frustration", re: /\b(not working|no results|nothing.{0,12}happen|disappoint|frustrat|waste|angry|unhappy|cancel|refund|useless|rubbish)\b/i },
  { intent: "handover", re: /\b(speak to (a|someone)|real person|human|call me|phone|talk to (a|someone))\b/i },
  { intent: "approval", re: /\b(approve|approval|sign ?off|go ahead|permission|authoris|authoriz)\b/i },
  { intent: "cost", re: /\b(cost|price|pricing|how much|budget|charge|fee|pay|plan|subscription|invoice)\b/i },
  { intent: "timing", re: /\b(how long|when will|timeline|how soon|by when|deadline|takes?\s+long)\b/i },
  { intent: "desk_paid", re: /\b(paid|ads?|advert|adwords|ppc|google ads|meta ads|facebook ads|campaign|spend|cpc|roas)\b/i },
  { intent: "desk_social", re: /\b(social|instagram|tiktok|linkedin|youtube|reels?|posts?|followers?)\b/i },
  { intent: "desk_content", re: /\b(content|blog|article|writ(e|ing)|copy|tone of voice|brief|draft)\b/i },
  { intent: "desk_search", re: /\b(seo|search|rank|ranking|google|keywords?|traffic|serp|index)\b/i },
  { intent: "priority", re: /\b(what should|what do i|first|priorit|most important|focus|next|start with)\b/i },
  { intent: "problems", re: /\b(wrong|broken|issues?|problems?|errors?|findings?|fix|bad)\b/i },
  { intent: "status", re: /\b(how are we|how.{0,12}going|update|progress|status|where are we|doing)\b/i },
  { intent: "capability", re: /\b(can you|are you able|do you (do|handle|support)|is it possible|could you)\b/i },
  { intent: "greeting", re: /^\s*(hi|hey|hello|good (morning|afternoon|evening)|yo|thanks|thank you|cheers)\b/i },
];

export function classify(message: string): Intent {
  const text = (message ?? "").trim();
  if (!text) return "unknown";
  for (const rule of RULES) if (rule.re.test(text)) return rule.intent;
  return "unknown";
}

/* ------------------------------------------------------------- the reply */

export type Reply = {
  intent: Intent;
  /** What the CMO says. Short. Nobody reads a wall of text from software. */
  says: string[];
  /** Where to go next, if anywhere. Never more than three. */
  actions: { label: string; href: string }[];
  /** Which desk picked this up, so the client can see the machine working. */
  desk: string | null;
  /** True where the answer needed something the workspace does not have. */
  blocked: boolean;
};

type Context = {
  siteId: string;
  domain: string;
  result: AuditResult | null;
  /** Desks the plan actually includes, so nothing is offered that is gated. */
  desks: { search: boolean; content: boolean; social: boolean; paid: boolean };
  planName: string;
  firstName?: string | null;
};

const nf = (n: number) => n.toLocaleString("en-GB");

function counts(result: AuditResult | null) {
  const findings = result?.findings ?? [];
  const withFix = findings.filter((f) => f.fix).length;
  const serious = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;

  /*
   * One problem on twenty-nine pages is not twenty-nine problems.
   *
   * Our own deployment surfaced this: noindex is set deliberately before
   * launch, so every page carries the same critical finding and the reply
   * read "29 critical items should be cleared". True, and alarming in a way
   * the situation does not deserve, which is the definition of a false
   * positive at the message level rather than the check level.
   *
   * So where one code accounts for most of the serious findings, the reply
   * names the code instead of the count.
   */
  const byCode = new Map<string, number>();
  for (const f of serious) {
    const code = (f as { code?: string }).code ?? "";
    if (code) byCode.set(code, (byCode.get(code) ?? 0) + 1);
  }
  let dominant: { code: string; count: number; title: string } | null = null;
  for (const [code, count] of byCode) {
    if (serious.length >= 4 && count / serious.length >= 0.5) {
      const example = serious.find((f) => (f as { code?: string }).code === code) as
        | { title?: string }
        | undefined;
      dominant = { code, count, title: example?.title ?? code };
    }
  }

  return {
    pages: result?.crawl?.pages?.length ?? 0,
    findings: findings.length,
    withFix,
    critical,
    high,
    serious: serious.length,
    dominant,
    quickWins: result?.quickWins?.length ?? 0,
    briefs: result?.briefs?.length ?? 0,
    hours: Math.round(result?.estimatedAgencyHours ?? 0),
  };
}

/** "29 critical" or "one problem, on 29 pages", whichever is true. */
function seriousPhrase(c: ReturnType<typeof counts>): string {
  if (c.serious === 0) return "";
  if (c.dominant) {
    return (
      `${c.dominant.count} of those are the same problem on ${c.dominant.count} pages, not ` +
      `${c.dominant.count} separate ones: ${c.dominant.title.toLowerCase()}. Fixing it once fixes all of them.`
    );
  }
  return `${nf(c.serious)} of them are serious enough that I would deal with them before anything else.`;
}

/**
 * Compose a reply. Deterministic, and every number in it was measured.
 *
 * This is the version that runs with no model key, which is most of the time.
 * It is written to be genuinely useful rather than to be a placeholder for
 * the version with one: a router that reads real state and names a real next
 * step answers most of what a client actually asks in a week.
 */
function clean(r: Reply): Reply {
  // A conditional line that did not apply becomes an empty string above.
  // Dropping them here means no reply can render a blank paragraph, and no
  // call site has to remember.
  return { ...r, says: r.says.filter((line) => line.trim().length > 0) };
}

export function reply(message: string, ctx: Context): Reply {
  const intent = classify(message);
  const base = `/app/sites/${ctx.siteId}`;
  const c = counts(ctx.result);
  const hasRun = c.pages > 0;
  const who = ctx.firstName ? `${ctx.firstName}, ` : "";

  const noRun: Reply = clean({
    intent,
    says: [
      `${who ? who.charAt(0).toUpperCase() + who.slice(1) : ""}nothing has been crawled for ${ctx.domain} yet, so anything I said about it would be invention.`,
      "Give me about four minutes and I will have read the site, scored it, and written the fixes. Then ask me again and every number I give you will have come from your own pages.",
    ],
    actions: [{ label: "Run the first audit", href: base }],
    desk: null,
    blocked: true,
  });

  switch (intent) {
    case "greeting":
      return clean({
        intent,
        says: [
          `Hello. I am your CMO here, which means you talk to me and I deal with the desks.`,
          hasRun
            ? `I have read ${nf(c.pages)} of your pages and there are ${nf(c.findings)} things worth doing, ${nf(c.withFix)} of which already have the change written. Ask me what to do first and I will tell you.`
            : `Nothing has been crawled yet. Point me at the site and I will come back with something specific.`,
        ],
        actions: hasRun
          ? [{ label: "What should I do first", href: `${base}/findings` }, { label: "The week's brief", href: base }]
          : [{ label: "Run the first audit", href: base }],
        desk: null,
        blocked: false,
      });

    case "status":
      if (!hasRun) return noRun;
      return clean({
        intent,
        says: [
          `Straight answer: ${nf(c.findings)} open items across ${nf(c.pages)} pages, and ${nf(c.withFix)} of them already have the fix written and waiting for you.`,
          c.serious > 0
            ? seriousPhrase(c)
            : `Nothing critical is open, which is a genuinely good position and not something I say often.`,
          `An agency would bill roughly ${nf(c.hours)} hours for the work sitting in that queue.`,
        ],
        actions: [
          { label: "See the queue", href: `${base}/approvals` },
          { label: "The full list", href: `${base}/findings` },
        ],
        desk: "Account Director",
        blocked: false,
      });

    case "priority":
      if (!hasRun) return noRun;
      return clean({
        intent,
        says: [
          c.quickWins > 0
            ? `Start with the ${nf(c.quickWins)} quick wins. They are the items where the effort is small and the change is already written, so the whole lot is an afternoon of approvals rather than a project.`
            : `There are no quick wins left, which means the easy work is done. What is left is real work, so pick by value rather than by effort.`,
          c.serious > 0
            ? `Before any of that: ${seriousPhrase(c)}`
            : `Nothing is critical, so nothing needs doing today rather than this week.`,
        ],
        actions: [
          { label: "Quick wins", href: `${base}/findings` },
          { label: "Approve the batch", href: `${base}/approvals` },
        ],
        desk: "Account Director",
        blocked: false,
      });

    case "problems":
      if (!hasRun) return noRun;
      return clean({
        intent,
        says: [
          `${nf(c.findings)} things, and I will not pretend they are all urgent. ${nf(c.critical)} critical, ${nf(c.high)} high, the rest below that.`,
          c.dominant ? seriousPhrase(c) : "",
          `The part that matters: ${nf(c.withFix)} of them have the corrected title, meta, schema or markup already written. You approve, we ship. You are not being handed a to-do list.`,
        ],
        actions: [
          { label: "Read the findings", href: `${base}/findings` },
          { label: "What is queued", href: `${base}/approvals` },
        ],
        desk: "Head of search",
        blocked: false,
      });

    case "desk_search":
      if (!hasRun) return noRun;
      return clean({
        intent,
        says: [
          `Search is the desk with the most people on it, and it has read ${nf(c.pages)} of your pages.`,
          `${nf(c.findings)} findings, ${nf(c.withFix)} with the fix written. Rankings themselves need Search Console: without it I can tell you what is wrong with the site, but not which queries you actually win, and I will not guess at that.`,
        ],
        actions: [
          { label: "Findings", href: `${base}/findings` },
          { label: "Connect Search Console", href: `${base}/integrations` },
        ],
        desk: "Head of search",
        blocked: false,
      });

    case "desk_content":
      return clean({
        intent,
        says: [
          ctx.desks.content
            ? `The content desk is on your plan. It starts by deciding the one thing your company is arguing, because everything else ladders to that, and it will not commission a brief before you have approved it.`
            : `The content desk is not on your plan yet. It writes the argument, the briefs and the drafts, and passes each one through three edit gates before you see it.`,
          hasRun && c.briefs > 0
            ? `From your crawl there are already ${nf(c.briefs)} briefs waiting, built from gaps found in your own pages rather than from a keyword tool.`
            : `Nothing is drafted until the point of view is agreed. That order is deliberate: content written without one reads like everybody else's.`,
        ],
        actions: ctx.desks.content
          ? [{ label: "Point of view", href: `${base}/content/strategy` }, { label: "Briefs and drafts", href: `${base}/content` }]
          : [{ label: "What the content desk does", href: "/content" }, { label: "Plans", href: "/pricing" }],
        desk: "Head of content marketing",
        blocked: !ctx.desks.content,
      });

    case "desk_social":
      return clean({
        intent,
        says: [
          ctx.desks.social
            ? `Social is on your plan. Before anything is posted it reads the field: what actually worked for your competitors, measured against each account's own median rather than against follower counts.`
            : `Social is not on your plan yet. It reads competitors, decides which platforms are worth your effort, and drafts everything for you to approve.`,
          `One thing worth knowing whatever you decide: nobody can see a competitor's impressions or reach. Those are private on every platform. Anyone who has shown you a rival's reach was estimating it.`,
        ],
        actions: ctx.desks.social
          ? [{ label: "Tear down a competitor", href: `${base}/social/teardown` }, { label: "What each platform allows", href: `${base}/social/platforms` }]
          : [{ label: "Try the teardown free", href: "/thymelab/social/teardown" }, { label: "Plans", href: "/pricing" }],
        desk: "Head of social",
        blocked: !ctx.desks.social,
      });

    case "desk_paid":
      return clean({
        intent,
        says: [
          ctx.desks.paid
            ? `Paid is on your plan, and it has one rule I should say before you ask me to spend anything: it will not run ads on an account whose conversions cannot be counted.`
            : `Paid is not on your plan yet. It builds and runs the campaigns, and it refuses two things: spending on an account it cannot measure, and taking a budget too small for the bidding to work.`,
          `A platform optimising toward a conversion it cannot see does worse than one given no target at all, which is why that is a gate rather than a recommendation.`,
        ],
        actions: ctx.desks.paid
          ? [{ label: "Can we spend yet", href: `${base}/paid/readiness` }, { label: "The budget arithmetic", href: `${base}/paid/plan` }]
          : [{ label: "Check a budget free", href: "/thymelab/ads/budget" }, { label: "Plans", href: "/pricing" }],
        desk: "Head of paid media",
        blocked: !ctx.desks.paid,
      });

    case "cost":
      return clean({
        intent,
        says: [
          `You are on ${ctx.planName}. Every price is published and none of them moves with your spend, which is the opposite of how an agency charges.`,
          `The audit, the fixes and the free tools cost nothing and always will. What you pay for is the work being shipped and the desks beyond search.`,
        ],
        actions: [{ label: "The prices", href: "/pricing" }, { label: "Your plan", href: "/app/settings" }],
        desk: "Account Director",
        blocked: false,
      });

    case "timing":
      if (!hasRun) return noRun;
      return clean({
        intent,
        says: [
          `An audit takes about four minutes. Approving a batch of fixes takes about ten. Those are the only two things that need you.`,
          `Results are slower and I will not pretend otherwise. Technical fixes show up in weeks, content in months, and anyone promising you a date is guessing.`,
        ],
        actions: [{ label: "Where the programme is", href: `${base}/progress` }],
        desk: "Account Director",
        blocked: false,
      });

    case "approval":
      return clean({
        intent,
        says: [
          `Nothing reaches your site without you. Every change is batched by risk, each one saying what it changes and whether it can be undone.`,
          `Anything that could damage the site, and anything that spends money, needs a person whatever your autonomy setting says. There is no configuration that turns that off.`,
        ],
        actions: [{ label: "The approval queue", href: `${base}/approvals` }],
        desk: "Account Director",
        blocked: false,
      });

    case "capability":
      return clean({
        intent,
        says: [
          `Probably, and I would rather tell you plainly where the answer is no.`,
          `There are four desks: search, content, social and paid. What none of them will do is report a change as applied when it was not, show you a modelled number as a measured one, or spend money that cannot be measured.`,
          `Tell me the specific thing and I will say yes, no, or what it would need.`,
        ],
        actions: [{ label: "Every capability", href: "/platform" }, { label: "The full roster", href: "/the-firm" }],
        desk: "Account Director",
        blocked: false,
      });

    case "frustration":
      return clean({
        intent,
        says: [
          `That is fair, and I would rather hear it now than read it in a cancellation.`,
          hasRun
            ? `Here is where things actually stand, without the spin: ${nf(c.findings)} open items, ${nf(c.withFix)} with the change already written, and ${nf(c.serious)} that matter more than the rest. If the work is being done and the results are not moving, that is a different problem from the work not being done, and the reports page separates the two.`
            : `Nothing has run yet, which may be the whole problem. Four minutes fixes that.`,
          `If something specific went wrong, tell me what it was. I would rather fix the thing than manage the feeling.`,
        ],
        actions: hasRun
          ? [{ label: "What actually happened", href: `${base}/runs` }, { label: "The reports", href: `${base}/reports` }]
          : [{ label: "Run the audit", href: base }],
        desk: "Account Director",
        blocked: false,
      });

    case "handover":
      return clean({
        intent,
        says: [
          `There is no call centre behind me and I am not going to pretend there is.`,
          `What there is: every decision this platform made is written down with the reasoning, so you can check the work rather than take my word for it. If something needs a human, the honest answer is that it needs the human who runs your business, and I will tell you exactly what they need to decide.`,
        ],
        actions: [{ label: "Every run, every decision", href: `${base}/runs` }],
        desk: "Account Director",
        blocked: false,
      });

    default:
      return clean({
        intent: "unknown",
        says: [
          `I did not follow that well enough to answer it properly, and guessing would waste your time.`,
          `Try me on: what should I do first, what is wrong with the site, what does this cost, or anything about search, content, social or paid.`,
        ],
        actions: hasRun
          ? [{ label: "What should I do first", href: `${base}/findings` }, { label: "The week's brief", href: base }]
          : [{ label: "Run the first audit", href: base }],
        desk: null,
        blocked: false,
      });
  }
}

/**
 * The system prompt used when the tenant has supplied a model key.
 *
 * The deterministic reply above still runs first and is handed to the model as
 * ground truth, so a key changes how the answer reads and never what it says.
 * A model left to answer from the conversation alone would invent a number
 * within three exchanges, and a number invented by something calling itself
 * your CMO is worse than silence because people act on it.
 */
export function systemPrompt(ctx: Context, grounded: Reply): string {
  const c = counts(ctx.result);
  return [
    "You are the Chief Marketing Officer of an agency staffed by AI specialists. The person you are",
    "talking to is the client and the owner of the business. You are their single point of contact.",
    "",
    "Tone: warm, direct, a little dry. Professional without being stiff. You are pleased to see them",
    "and you do not waste their time. Short sentences beat long ones. Never more than three short",
    "paragraphs. No bullet lists unless they asked for a list. Never use an exclamation mark.",
    "",
    "Hard rules, in order of importance:",
    "1. Every number you state must appear in the FACTS below. If a number is not there, you do not",
    "   know it, and you say what would make it knowable instead of estimating.",
    "2. Never report work as done that is not in the facts.",
    "3. Lead with the bad news. A director who leads with the good news is one nobody believes twice.",
    "4. If they are unhappy, deal with that before answering the question.",
    "5. End with the one thing worth doing next, or say plainly that nothing needs them.",
    "",
    `FACTS. Site: ${ctx.domain}. Plan: ${ctx.planName}.`,
    `Pages crawled: ${c.pages}. Open findings: ${c.findings}. Findings with the fix already written: ${c.withFix}.`,
    `Critical: ${c.critical}. High: ${c.high}. Quick wins: ${c.quickWins}. Content briefs ready: ${c.briefs}.`,
    c.dominant
      ? `Most of the serious findings are one problem repeated: ${c.dominant.title} on ${c.dominant.count} pages. Say it that way, not as ${c.dominant.count} problems.`
      : "",,
    `Agency hours the queue represents: ${c.hours}.`,
    `Desks on this plan: ${Object.entries(ctx.desks).filter(([, v]) => v).map(([k]) => k).join(", ") || "search only"}.`,
    "",
    "The desks already prepared this answer from real data. Say the same thing in your own voice,",
    "keeping every number exactly as written:",
    grounded.says.map((s) => `- ${s}`).join("\n"),
  ].join("\n");
}
