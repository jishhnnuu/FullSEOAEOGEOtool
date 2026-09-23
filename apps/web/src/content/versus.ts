/**
 * One comparison per desk, against the thing that desk actually replaces.
 *
 * The site already carries `/compare/*`, which is this product against other
 * products. This is different and it catches a different search: somebody
 * typing "seo agency cost" or "is a ppc agency worth it" is not shopping for
 * software, they are deciding whether to hire a firm. Answering that with one
 * generic "vs an agency" page loses to four pages that each name the specific
 * thing that buyer is weighing.
 *
 * Every row is written so an agency could read it and not call it unfair. The
 * honest wins for an agency are listed as wins, because a comparison that
 * gives the other side nothing is read as marketing and discarded.
 */

import type { ManagerKey } from "@/lib/org";

export type VersusRow = {
  question: string;
  agency: string;
  here: string;
  /** Who genuinely wins this row. An honest loss is worth more than a fake win. */
  winner: "agency" | "here" | "draw";
};

export type Versus = {
  slug: string;
  desk: ManagerKey;
  /** The thing being compared against, as the buyer would name it. */
  rival: string;
  title: string;
  description: string;
  /** What this buyer is actually deciding between, in one sentence. */
  decision: string;
  rows: VersusRow[];
  /** Where an agency is genuinely the better answer. Stated plainly. */
  chooseAgency: string[];
};

export const VERSUS: Versus[] = [
  {
    slug: "seo-agency",
    desk: "search",
    rival: "an SEO agency",
    title: "Against an SEO agency",
    description:
      "What an SEO agency does for £1,800 to £4,000 a month, what this does instead, and the three cases where hiring the agency is still the right call.",
    decision:
      "You have budget for search and you are choosing between a retainer with a team you can call and a subscription to a system you can watch.",
    rows: [
      {
        question: "Who does the technical fixes",
        agency: "A developer, scheduled into a sprint, usually two to six weeks after the audit that found the problem.",
        here: "Written the same run, queued for approval, pushed through your CMS and re-fetched to confirm it went live.",
        winner: "here",
      },
      {
        question: "What the monthly report is",
        agency: "A deck, built by hand, with the metrics that moved chosen after the month ended.",
        here: "The same measures every week, with the unmeasured ones labelled as unmeasured and a flat week printed as flat.",
        winner: "here",
      },
      {
        question: "Who understands your business",
        agency: "A person who has sat in your meetings, met your sales team, and knows why last year's launch failed.",
        here: "What is on your site and in your connected accounts. It reads the pricing page. It was not in the meeting.",
        winner: "agency",
      },
      {
        question: "Cost for the same scope",
        agency: "£1,800 to £4,000 a month at 20 to 40 hours, usually on a twelve-month minimum.",
        here: "£79 to £249 per site per month, monthly, no minimum term and no onboarding fee.",
        winner: "here",
      },
      {
        question: "What happens when you leave",
        agency: "Access is revoked, the reporting stops, and the documentation is whatever you remembered to ask for.",
        here: "The fixes are already in your CMS so they stay. The workspace exports as JSON whenever you want it.",
        winner: "here",
      },
      {
        question: "Negotiating with your developers",
        agency: "A human who can sit in the standup, argue the case and get it prioritised.",
        here: "A queue of complete changes. Somebody at your end still has to approve and, where there is no API, apply them.",
        winner: "agency",
      },
      {
        question: "Speed from finding to fix",
        agency: "Days to weeks, depending on the retainer's hours and who is on holiday.",
        here: "The same run. The constraint is how quickly you approve, not how many hours are left in the month.",
        winner: "here",
      },
      {
        question: "Consistency month to month",
        agency: "Varies with who is staffed on the account. The good months are the months your best person was on it.",
        here: "The same catalogue, the same weighting and the same refusals every run, whoever is looking.",
        winner: "here",
      },
    ],
    chooseAgency: [
      "You need somebody in the room with your executive team, arguing for the budget. No software does that.",
      "Your site has no CMS API and no developer, so a person has to make the changes by hand anyway.",
      "The work you need is mostly commercial: partnerships, sponsorships and relationships, rather than pages and markup.",
    ],
  },
  {
    slug: "content-agency",
    desk: "content",
    rival: "a content agency",
    title: "Against a content agency",
    description:
      "What a content agency charges for strategy and eight pieces a month, what this does instead, and where a human writer is genuinely worth the money.",
    decision:
      "You are publishing already, it is not working, and you are choosing between a content agency and a system that will not write anything until there is an argument you approved.",
    rows: [
      {
        question: "What gets commissioned",
        agency: "A calendar, usually agreed in the kick-off, then filled in for the rest of the year.",
        here: "Nothing, until a point of view is written and you have approved it. Then angles, measured against the ranking set.",
        winner: "here",
      },
      {
        question: "How tone is decided",
        agency: "A brand voice document, written once, from a workshop, and quietly ignored by the third freelancer.",
        here: "Measured. Rhythm, hedging, filler and specifics, yours against the field's median, enforced at the gate on every draft.",
        winner: "here",
      },
      {
        question: "Original thinking",
        agency: "A strategist who has worked in your sector and has opinions you did not pay for and could not have bought.",
        here: "It reads what is there. It does not have a decade in your industry and it will not pretend to.",
        winner: "agency",
      },
      {
        question: "Interviews and primary research",
        agency: "Can phone your customers, run the interview and get the quote that makes the piece.",
        here: "Cannot. It works from what is published and from your own fact ledger, and says so when the ledger is thin.",
        winner: "agency",
      },
      {
        question: "Volume and consistency",
        agency: "Depends on the retainer and the freelancer pool. Quality varies with who was available.",
        here: "Eight pieces a month through the same nine agents and the same three gates, every month.",
        winner: "here",
      },
      {
        question: "Whether anyone reads it",
        agency: "Measured by traffic, usually. Rarely by whether the piece did the job it was commissioned to do.",
        here: "At week eight, against what each piece was commissioned to do, with the losers named in the report.",
        winner: "here",
      },
      {
        question: "Cost",
        agency: "£2,000 to £5,000 a month for strategy, four to eight pieces and distribution.",
        here: "£249 per site per month, including the search desk, on a monthly plan.",
        winner: "here",
      },
    ],
    chooseAgency: [
      "Your best content would come from interviewing your customers, and somebody has to make those calls.",
      "You need a named expert byline with real credentials attached, which matters more in some sectors than anything else on this page.",
      "The writing is the product, not the marketing for it, and you want a person whose name is on it.",
    ],
  },
  {
    slug: "ppc-agency",
    desk: "paid",
    rival: "a PPC agency",
    title: "Against a PPC agency",
    description:
      "What a PPC agency's percentage-of-spend fee buys, what the paid desk will do differently, and why this page says the desk is not built yet.",
    decision:
      "You are spending on ads and paying somebody 10 to 20 per cent of that spend to manage it, and the fee rises with the budget whether or not the work does.",
    rows: [
      {
        question: "How the fee works",
        agency: "A percentage of spend. Raise the budget and the fee rises, with no extra work required to earn it.",
        here: "A flat monthly plan. What you spend on ads is between you and the platform.",
        winner: "here",
      },
      {
        question: "Does it read the organic data first",
        agency: "Rarely, because paid and SEO are different teams, often different agencies, and neither is paid to check.",
        here: "It will refuse a spend recommendation on a term the organic programme already ranks first for, unless measured incrementality says otherwise.",
        winner: "here",
      },
      {
        question: "Who decides the budget",
        agency: "Usually the agency, inside an agreed ceiling.",
        here: "You. No budget change applies on its own, at any autonomy level, ever.",
        winner: "draw",
      },
      {
        question: "Creative production",
        agency: "In-house designers and copywriters who can build the assets and iterate on them weekly.",
        here: "Not built yet, and when it is, creative claims get checked against the same fact ledger rather than produced from scratch.",
        winner: "agency",
      },
      {
        question: "Available today",
        agency: "Yes.",
        here: "No. This desk opens next quarter, and this page exists so you can see what it will do rather than being told it already does.",
        winner: "agency",
      },
    ],
    chooseAgency: [
      "You need paid media running this quarter. This desk is not built and will not pretend otherwise.",
      "Your spend is large enough that a percentage fee still buys you a dedicated team, which is a real thing to want.",
      "Creative production is most of the work, and you want people who will shoot and edit the assets.",
    ],
  },
  {
    slug: "social-agency",
    desk: "social",
    rival: "a social agency",
    title: "Against a social agency",
    description:
      "What a social retainer covers, what the social desk will do differently when it opens, and the parts a person will always do better.",
    decision:
      "You want the owned channels handled without inventing a second brand voice at a desk that has never read your content strategy.",
    rows: [
      {
        question: "Whose voice gets used",
        agency: "A social-specific voice, written by the social team, which is usually not the one on your website.",
        here: "The point of view the content desk already had approved. One voice, not two.",
        winner: "here",
      },
      {
        question: "What gets reported",
        agency: "Impressions and reach, which are the numbers the platforms make easiest to report.",
        here: "Replies and saves. No engagement metric reported that the platform does not actually expose.",
        winner: "here",
      },
      {
        question: "Community management",
        agency: "A person reading replies, spotting the angry one, and knowing when to pick up the phone.",
        here: "Not something software should do on your behalf, and this desk will not claim it.",
        winner: "agency",
      },
      {
        question: "Reacting to something today",
        agency: "Within the hour, if they are good.",
        here: "Nothing posts without your approval, so as fast as you are.",
        winner: "agency",
      },
      {
        question: "Available today",
        agency: "Yes.",
        here: "No. Opens in two quarters, and the page says so.",
        winner: "agency",
      },
    ],
    chooseAgency: [
      "Community management matters to you, and it should be a person.",
      "You need it now. This desk is not built.",
      "Your channels run on video and production is the job, not the scheduling.",
    ],
  },
];

export const VERSUS_BY_SLUG = new Map(VERSUS.map((v) => [v.slug, v]));
