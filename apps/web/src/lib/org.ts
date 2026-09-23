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
  title: "The only agent you speak to",
  remit:
    "Holds the budget across every desk, decides what is worth your attention, batches approvals, and delivers a bad quarter first and plainly rather than after the explanation of it.",
  never: directorAgent?.never ?? "Reports activity as a result.",
};

/**
 * Operations reports to the director rather than to a desk, because the work
 * is the same whichever desk commissioned it. Publishing a fix and publishing
 * a draft is one publisher.
 */
export const OPERATIONS: TeamMember[] = ROSTER
  .filter((a) => a.reportsTo === "account-director" && !["strategist", "content-director"].includes(a.key))
  .map((a) => ({ ...a, runsInBrowser: IN_BROWSER.has(a.key) }));

export const MANAGERS: Manager[] = [
  {
    key: "search",
    agent: "strategist",
    name: "Search",
    title: "Head of search",
    status: "live",
    opens: null,
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
    status: "planned",
    opens: "Q1",
    remit:
      "Search, shopping and paid social, planned against the same research the other desks run on, so paid is not bidding on demand the organic programme already owns.",
    method: [
      "Read what organic already wins before spending on it",
      "Budget by measured incremental value, not by channel habit",
      "Check every creative claim against the same fact ledger",
      "Report spend against outcome, with the losers named",
    ],
    nav: [],
    refusals: [
      "No spend recommendation on a term the organic programme already ranks first for, unless measured incrementality says otherwise.",
      "No budget change applied on its own. Spend is always a person's decision.",
    ],
    overlap:
      "Paid reads the search desk's ranking data before it bids, and the content desk's approved point of view before it writes an ad. It will not hold a third version of either.",
    team: [],
  },
  {
    key: "social",
    agent: "social-director",
    name: "Social",
    title: "Head of social",
    status: "planned",
    opens: "Q2",
    remit:
      "The owned channels, working from the point of view the content desk already had approved, rather than inventing a second brand voice at a different desk.",
    method: [
      "One approved point of view, not a second voice",
      "Rewrite per format rather than resize",
      "Named accounts and named cadence, never a posting target",
      "Measure replies and saves, not impressions",
    ],
    nav: [],
    refusals: [
      "No posting on your behalf without approval. The account is yours.",
      "No engagement metric reported that the platform does not actually expose.",
    ],
    overlap:
      "Social is downstream of the content desk's repurposer rather than beside it. The four assets inside a finished piece are pulled once, not twice.",
    team: [],
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

/** Everyone this page actually shows, so the two numbers can be compared. */
export function placed(): number {
  return (
    1 +
    OPERATIONS.length +
    MANAGERS.filter((m) => m.status === "live").length +
    MANAGERS.reduce((n, m) => n + m.team.length, 0)
  );
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
