/**
 * robots.txt parsing and the AI crawler roster.
 *
 * Pure functions, no fetching, because both the Worker (when it crawls) and
 * the browser (when it decides what to queue next) need the same answers.
 */

export const AI_CRAWLER_LIST: { agent: string; matters: string }[] = [
  { agent: "GPTBot", matters: "Trains and grounds ChatGPT answers" },
  { agent: "OAI-SearchBot", matters: "Powers ChatGPT search results and citations" },
  { agent: "ChatGPT-User", matters: "Fetches a page when a user asks ChatGPT about it" },
  { agent: "ClaudeBot", matters: "Claude's crawler" },
  { agent: "Claude-User", matters: "Fetches a page when a user asks Claude about it" },
  { agent: "PerplexityBot", matters: "Perplexity's index and its citations" },
  { agent: "Google-Extended", matters: "Gemini grounding and AI Overviews training" },
  { agent: "Applebot-Extended", matters: "Apple Intelligence and Siri answers" },
  { agent: "Bytespider", matters: "TikTok search" },
  { agent: "meta-externalagent", matters: "Meta AI answers" },
  { agent: "CCBot", matters: "Common Crawl, which many models train on" },
  { agent: "Amazonbot", matters: "Alexa and Rufus answers" },
];

export type RobotsRules = {
  /** user agent (lower case) -> disallow prefixes */
  groups: Map<string, { disallow: string[]; allow: string[] }>;
  sitemaps: string[];
};

export function parseRobots(body: string): RobotsRules {
  const groups = new Map<string, { disallow: string[]; allow: string[] }>();
  const sitemaps: string[] = [];
  let current: string[] = [];
  let lastWasAgent = false;

  for (const line of body.split(/\r?\n/)) {
    const clean = line.split("#")[0].trim();
    if (!clean) continue;
    const idx = clean.indexOf(":");
    if (idx < 0) continue;
    const field = clean.slice(0, idx).trim().toLowerCase();
    const value = clean.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!lastWasAgent) current = [];
      current.push(value.toLowerCase());
      if (!groups.has(value.toLowerCase())) groups.set(value.toLowerCase(), { disallow: [], allow: [] });
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (field !== "disallow" && field !== "allow") continue;
    for (const agent of current) {
      const group = groups.get(agent) ?? { disallow: [], allow: [] };
      if (field === "disallow") {
        // "Disallow:" with an empty value allows everything, and is not a rule.
        if (value) group.disallow.push(value);
      } else if (value) {
        group.allow.push(value);
      }
      groups.set(agent, group);
    }
  }
  return { groups, sitemaps };
}

function matches(pattern: string, path: string): boolean {
  // robots.txt wildcards: * for any run, $ for end of URL.
  if (!pattern.includes("*") && !pattern.includes("$")) return path.startsWith(pattern);
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const anchored = escaped.endsWith("$") ? `^${escaped}` : `^${escaped}`;
  try {
    return new RegExp(anchored).test(path);
  } catch {
    return false;
  }
}

/** Is `path` allowed for `agent`, under the usual longest-match-wins rule. */
export function robotsAllows(rules: RobotsRules, agent: string, path: string): boolean {
  const lower = agent.toLowerCase();
  const group =
    [...rules.groups.keys()].find((k) => k !== "*" && lower.includes(k)) ??
    (rules.groups.has("*") ? "*" : null);
  if (!group) return true;
  const entry = rules.groups.get(group)!;
  let bestDisallow = -1;
  let bestAllow = -1;
  for (const rule of entry.disallow) if (matches(rule, path)) bestDisallow = Math.max(bestDisallow, rule.length);
  for (const rule of entry.allow) if (matches(rule, path)) bestAllow = Math.max(bestAllow, rule.length);
  if (bestDisallow < 0) return true;
  return bestAllow >= bestDisallow;
}

