/**
 * The organisation.
 *
 * One director talks to the client. Under it sit the desks, and under each
 * desk sits a team. This file is the single description of that shape for the
 * interface: the navigation, the brief and the organisation page all read from
 * here, so adding a fifth desk is one entry rather than a search through the
 * app.
 *
 * The people are not written here. They come from `roster.generated.ts`, which
 * `scripts/roster_to_ts.py` builds from the agent specs the server installation
 * runs, so the interface cannot claim a headcount the roster does not have or
 * print a refusal an agent never declared. Cloudflare Workers cannot run
 * Python, which is the only reason a generated copy exists at all.
 *
 * Where an agent's work needs the server installation, `runsInBrowser` is false
 * and every screen showing it says so, rather than implying work is happening
 * in a runtime that cannot do it.
 */

import { ROSTER, ROSTER_COUNT, type RosterAgent } from "./roster.generated";

export type ManagerKey = "search" | "content" | "paid" | "social";
export type Status = "live" | "planned";

export type TeamMember = RosterAgent & { runsInBrowser: boolean };

/*
 * The agents whose work the browser deployment actually performs. Everything
 * here is deterministic: a crawl, a check, a count, a plan, a draft relayed
 * through the tenant's own model key. The rest need the Python runtime, a
 * connector the browser cannot hold, or a search engine that forbids being
 * read automatically.
 */
const IN_BROWSER = new Set([
  "account-director", "strategist", "content-director",
  "tech-auditor", "perf-engineer", "schema-engineer", "indexation-manager",
  "keyword-researcher", "gap-analyst", "competitor-intel", "cluster-architect",
  "aeo-strategist", "entity-architect", "citation-engineer",
  "link-prospector", "link-auditor", "outreach-specialist",
  "analyst", "publisher", "reporter", "onboarding-specialist",
  "content-strategist", "brief-writer", "writer", "humanizer",
  "link-architect", "content-refresher",
  "content-researcher", "rival-reader", "voice-analyst", "angle-finder",
  "distribution-planner", "repurposer",
  // The social desk. The measurement half runs in the browser off public
  // platform APIs; the production half needs the server installation.
  "social-director", "social-analyst", "platform-strategist", "trend-scout",
  "audience-listener", "scheduler",
]);

function agent(key: string): RosterAgent | undefined {
  return ROSTER.find((a) => a.key === key);
}

/** Everyone below a given agent in the reporting tree, in roster order. */
function subtree(rootKey: string): TeamMember[] {
  const out: TeamMember[] = [];
  const seen = new Set<string>([rootKey]);
  let frontier = [rootKey];
  while (frontier.length) {
    const next: string[] = [];
    for (const a of ROSTER) {
      if (!frontier.includes(a.reportsTo) || seen.has(a.key)) continue;
      seen.add(a.key);
      out.push({ ...a, runsInBrowser: IN_BROWSER.has(a.key) });
      next.push(a.key);
    }
    frontier = next;
  }
  return out;
}

export type Manager = {
  key: ManagerKey;
  /** The manager agent's key in the roster. */
  agent: string;
  name: string;
  title: string;
  status: Status;
  /**
   * What this desk can carry end to end today, and where it stops.
   *
   * A binary live-or-planned was too coarse the moment four desks existed.
   * Search publishes to a CMS; paid can plan a campaign and cannot launch one
   * until each network approves this software. Both were rendering as "built
   * and running", which is the class of claim this product exists not to
   * make. One honest sentence per desk, shown wherever the desk is offered.
   */
  delivers: string;
  /** When a planned desk opens. Null for the live ones. */
  opens: string | null;
  /** One sentence the director would use for this desk's remit. */
  remit: string;
  /** The order this desk enforces on its own team. */
  method: string[];
  /** Nav entries, relative to /app/sites/[id]. */
  nav: { href: string; label: string; badge?: "approvals" }[];
  team: TeamMember[];
  /** What the desk refuses, whatever the client asks. */
  refusals: string[];
  /** How this desk overlaps another, and who wins. Empty when it does not. */
  overlap: string | null;
};

const directorAgent = agent("account-director");

export const DIRECTOR = {
  agent: "account-director",
  name: directorAgent?.name ?? "Account Director",
  title: "The AI you can ask, any time",
  remit:
    "Plans across every service for your specialist, decides what is worth your attention, batches approvals, and answers your questions in the dashboard from your real numbers. It delivers a bad month first and plainly, never after the explanation of it.",
  never: directorAgent?.never ?? "Reports activity as a result.",
};

export const MANAGERS: Manager[] = [
  {
    key: "search",
    agent: "strategist",
    name: "Search",
    title: "Head of search",
    status: "live",
    opens: null,
    delivers:
      "End to end. Crawls, scores, writes the fixes, and publishes approved changes straight into WordPress, Shopify or Webflow. Nothing here waits on anybody else.",
    remit:
      "Everything that decides whether a page can be found and trusted: the crawl, the fixes, structured data, internal links, listings, links, and visibility inside AI answers.",
    method: [
      "Crawl before recommending, so nothing already done is proposed again",
      "Fix rather than list, and verify the change went live",
      "Narrow a check rather than let it fire loosely",
      "State coverage above the number, never under it",
    ],
    nav: [
      { href: "/findings", label: "Findings" },
      { href: "/pages", label: "Pages" },
      { href: "/keywords", label: "Keywords" },
      { href: "/aeo", label: "AI answers" },
      { href: "/linking", label: "Internal linking" },
      { href: "/links", label: "Links" },
      { href: "/local", label: "Local" },
      { href: "/rivals", label: "Rivals" },
    ],
    refusals: [
      "No disavow file without a manual action reported. Google's own guidance is that the tool is not normal site maintenance, and a careless disavow removes links that were counting in your favour.",
      "No structured data written over a node carrying an @id. That node is a reference into the entity graph, and completing it writes a second conflicting definition.",
      "No contextual link where no paragraph already shares terms with the target. Writing the sentence is a content change pretending to be a linking change.",
      "No score printed for a signal nothing measured. The space says what is missing instead.",
    ],
    overlap:
      "Search has its own content team, under the content strategist, and it is not the same job as the content desk. Search decides what to publish so a page can rank and be cited: briefs from measured gaps, refreshes of pages that have decayed, internal links, authorship and trust signals. The content desk decides what the company should be arguing in the first place. They share one production line on purpose, so the same writer does not write differently depending on which desk commissioned the piece.",
    team: subtree("strategist"),
  },
  {
    key: "content",
    agent: "content-director",
    name: "Content",
    title: "Head of content marketing",
    status: "live",
    opens: null,
    delivers:
      "Research, the argument, the briefs and the edit gates run with nothing connected. Long-form drafting relays your own model provider key, because this platform holds none of its own.",
    remit:
      "One argument per client, written down, with everything laddering to it. Reads the business, the buyer and the field before a brief exists, and measures tone rather than asserting it.",
    method: [
      "Read the business before writing about it",
      "Read the buyer, then the field, then measure both voices",
      "Decide the point of view, and get it approved once",
      "Only then commission anything",
    ],
    nav: [
      { href: "/content", label: "Plan and drafts" },
      { href: "/content/voice", label: "Voice" },
      { href: "/content/strategy", label: "Point of view" },
    ],
    refusals: [
      "No tone verdict on fewer than three readable rival pages. Two is one writer's habit, and asking you to rewrite a site against it would be the expensive kind of wrong.",
      "No voice ratios under 120 words. Below that the numbers are arithmetic rather than evidence, and the screen says so.",
      "No point of view nobody could argue with. A thesis with no opposing position is a description.",
      "No claim in a draft that is not in the fact ledger with the page it came from.",
    ],
    overlap:
      "The content desk owns the argument, the angles nobody took, distribution and the week-eight verdict. It does not own the keyword-led production queue, which belongs to search. When both want the same page, the point of view wins on what it says and search wins on where it sits and how it is marked up. Neither commissions a writer the other does not know about, because there is only one writer.",
    team: subtree("content-director"),
  },
  {
    key: "paid",
    agent: "paid-director",
    name: "Paid ads",
    title: "Head of paid media",
    status: "live",
    opens: null,
    delivers:
      "Everything up to the launch button: the measurement gate, the account audit, the budget arithmetic, the offer, the creative at every size and the policy check. Launching a campaign needs each network to approve this software first, and /paid publishes exactly where each one stands.",
    remit:
      "Search, shopping and paid social, planned against the same research the other desks run on, so paid is not bidding on demand the organic programme already owns. Verifies that a conversion can be counted before it will spend anything at all.",
    method: [
      "Verify the measurement before discussing the money",
      "Refuse a budget too small for the bidding to learn, with the arithmetic",
      "Read what organic already wins before spending on it",
      "Build everything paused, and let a person activate it",
    ],
    nav: [
      { href: "/paid", label: "Overview" },
      { href: "/paid/readiness", label: "Can we spend yet" },
      { href: "/paid/plan", label: "The plan" },
      { href: "/paid/creative", label: "Creative and sizes" },
      { href: "/paid/results", label: "Results, reconciled" },
    ],
    refusals: [
      "No spend at all on an account whose conversions cannot be read. A platform optimising toward an event it cannot see does worse than one given no target, so this is a blocked service rather than a reduced one.",
      "No budget below the learning floor. Roughly thirty conversions a month per platform is what automated bidding needs to fit a model, and taking a smaller budget anyway is how an agency earns a percentage of money it knows will not work.",
      "No spend recommendation on a term the organic programme already ranks first for, unless measured incrementality says otherwise.",
      "No campaign activated without a person, at any autonomy level, on any plan. Launching and raising a budget are the two actions in this product that turn a mistake straight into an invoice.",
      "No forecast built on an unmeasured click cost or conversion rate. A projection resting on two assumptions is a sales document.",
      "Never the sum of what the platforms claim. Each counts a conversion it touched, a customer often touches two, and the total is more customers than the business had.",
    ],
    overlap:
      "Paid reads the search desk's ranking data before it bids, and the content desk's approved point of view before it writes an ad. It will not hold a third version of either. A landing page problem goes back to the desk that owns pages rather than being rebuilt here, which is how a business avoids two versions of the same page competing in search.",
    team: subtree("paid-director"),
  },
  {
    key: "social",
    agent: "social-director",
    name: "Social",
    title: "Head of social",
    status: "live",
    opens: null,
    delivers:
      "Reading the field and drafting: competitor teardowns, share of voice, platform choice, the calendar and every post written for approval. Publishing to an account needs each platform to approve this software first.",
    remit:
      "The owned channels, worked from the argument the content desk already had approved. Reads what measurably worked for the competitors it can read, says plainly which platforms publish nothing, and drafts everything for a person to approve.",
    method: [
      "State what each platform will not allow, before promising any of it",
      "Measure the field against its own median, not against follower counts",
      "Decide which platforms to leave, not only which to join",
      "Draft everything, send nothing",
    ],
    nav: [
      { href: "/social", label: "Overview" },
      { href: "/social/teardown", label: "Competitor teardown" },
      { href: "/social/compare", label: "Compare brands" },
      { href: "/social/platforms", label: "What each platform allows" },
    ],
    refusals: [
      "No competitor impressions, reach or saves, on any platform, ever. They are computed for the account owner and exposed only through the owner's own token, so every rival reach figure in this category is an estimate presented as data.",
      "No median from fewer than twelve posts, and no pattern from fewer than three winners. Either would be one post's luck written up as a playbook.",
      "No share of voice from one readable account. A share of one is not a share.",
      "Nothing posted or replied to without a person approving it, at any autonomy level. The account is the client's and a post cannot be recalled.",
      "No claim to know which platform produced a competitor's leads. Nobody outside that business can see it, and the call-to-action density this desk does measure is trying rather than succeeding.",
    ],
    overlap:
      "Social is downstream of the content desk rather than beside it. It works from the point of view already approved instead of inventing a second brand voice, and the four assets inside a finished piece are pulled once by the repurposer rather than twice. Where social research turns up demand nobody has satisfied, it goes to the content desk as a subject rather than being written twice.",
    team: subtree("social-director"),
  },
];

export function managerByKey(key: ManagerKey): Manager | undefined {
  return MANAGERS.find((m) => m.key === key);
}

export function liveManagers(): Manager[] {
  return MANAGERS.filter((m) => m.status === "live");
}

export function plannedManagers(): Manager[] {
  return MANAGERS.filter((m) => m.status === "planned");
}

/** The whole roster, which is the number the interface is allowed to print. */
export function headcount(): number {
  return ROSTER_COUNT;
}

/**
 * Operations reports to the director rather than to a desk, because the work
 * is the same whichever desk commissioned it. Publishing a fix and publishing
 * a draft is one publisher.
 *
 * Declared after MANAGERS so the desk leads can be excluded by reading the
 * desks rather than by naming them. The hand-written exclusion list this
 * replaces held two names and never learned the third, so social-director was
 * counted once in operations and again as a desk lead, and the firm page
 * reported 81 of 80.
 */
const DESK_LEADS = new Set(MANAGERS.map((m) => m.agent));

/*
 * Declared before OPERATIONS, and that ordering is load-bearing.
 *
 * `.filter()` runs its callback immediately, so a `const` referenced inside
 * one and declared further down the file is read inside its temporal dead
 * zone and throws at module evaluation. TypeScript does not catch it, because
 * it cannot know the callback is synchronous, and esbuild happened to hoist
 * around it, so this passed a typecheck, a bundle and a local run before
 * failing the real build.
 */
const CMO_KEY = "chief-marketing-officer";

export const OPERATIONS: TeamMember[] = ROSTER
  .filter((a) => a.reportsTo === "account-director" && !DESK_LEADS.has(a.key) && a.key !== CMO_KEY)
  .map((a) => ({ ...a, runsInBrowser: IN_BROWSER.has(a.key) }));

/**
 * The office around the client-facing lead.
 *
 * Not a desk, because it sells nothing and owns no channel. It is the
 * machinery that lets one agent be the only agent a client speaks to: the
 * interview, the brief, the arbitration when two desks want the same week,
 * the batching of approvals, and the plain-language pass everything makes on
 * the way out.
 *
 * It is a separate group rather than part of operations because the firm page
 * has to show it. Adding these nine agents without a home on that page is how
 * it briefly reported 107 of 115.
 */
export const CMO = ROSTER.find((a) => a.key === CMO_KEY) ?? null;

export const CMO_OFFICE: TeamMember[] = ROSTER
  .filter((a) => a.reportsTo === CMO_KEY)
  .map((a) => ({ ...a, runsInBrowser: IN_BROWSER.has(a.key) }));

/**
 * Everyone this page actually shows, so the two numbers can be compared.
 *
 * Counted as distinct keys rather than as a sum of lengths. A sum cannot see
 * an agent that appears in two places, which is exactly the failure it is here
 * to catch.
 */
export function placed(): number {
  const keys = new Set<string>([DIRECTOR.agent]);
  if (CMO) keys.add(CMO.key);
  for (const member of CMO_OFFICE) keys.add(member.key);
  for (const member of OPERATIONS) keys.add(member.key);
  for (const manager of MANAGERS) {
    if (manager.status === "live") keys.add(manager.agent);
    for (const member of manager.team) keys.add(member.key);
  }
  return keys.size;
}

export function managerForPath(path: string, base: string): Manager | null {
  const rest = path.startsWith(base) ? path.slice(base.length) : path;
  for (const m of MANAGERS) {
    for (const item of m.nav) {
      if (item.href && (rest === item.href || rest.startsWith(item.href + "/"))) return m;
    }
  }
  return null;
}
