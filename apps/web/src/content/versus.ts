/**
 * One comparison per service, against a traditional agency for that service.
 *
 * Both sides give the client a person, so the rows are about who does the
 * legwork, how fast, and what that costs, rather than people against software.
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
    rival: "a traditional SEO agency",
    title: "Against a traditional SEO agency",
    description:
      "What a traditional SEO agency does for £1,800 to £4,000 a month, what we do instead with a person and an AI team, and the cases where the traditional agency is still the right call.",
    decision:
      "Both give you a person to talk to. The difference is who does the legwork, how fast a problem becomes a fix, and what you pay for the hours in between.",
    rows: [
      {
        question: "Who you talk to",
        agency: "An account manager, often looking after a dozen clients.",
        here: "Your specialist, who knows your business, with an AI team doing the legwork behind them.",
        winner: "draw",
      },
      {
        question: "Who does the technical fixes",
        agency: "A developer, scheduled into a sprint, usually weeks after the audit that found the problem.",
        here: "Written by the AI team the same day, checked by your specialist, and put live through your website platform once you say yes.",
        winner: "here",
      },
      {
        question: "What the monthly report is",
        agency: "A deck, built by hand, with the metrics that moved chosen after the month ended.",
        here: "The same measures every week in your dashboard, the unmeasured ones labelled as unmeasured, and your specialist walking you through it.",
        winner: "here",
      },
      {
        question: "Deep industry experience",
        agency: "A senior strategist who may have worked in your sector for years.",
        here: "Your specialist learns your business on the calls. The AI reads your site and your competitors, not a decade of your industry.",
        winner: "agency",
      },
      {
        question: "Cost for the same scope",
        agency: "£1,800 to £4,000 a month at 20 to 40 hours, usually on a twelve-month minimum.",
        here: "A fixed monthly fee at a fraction of that, month to month, because the hours of legwork are done by AI.",
        winner: "here",
      },
      {
        question: "What happens when you leave",
        agency: "Access is revoked, the reporting stops, and the documentation is whatever you remembered to ask for.",
        here: "The fixes are already in your website, so they stay. Your accounts and your data are yours.",
        winner: "here",
      },
      {
        question: "Consistency month to month",
        agency: "Varies with who is staffed on the account. The good months are the months the best person was on it.",
        here: "The same checks and the same standards every week, whoever is looking.",
        winner: "here",
      },
    ],
    chooseAgency: [
      "You need a senior strategist in the room with your executive team every week, arguing for the budget.",
      "The work you need is mostly commercial: partnerships, sponsorships and relationships, rather than your website.",
      "You are a large company with an in-house team, and you want an agency to slot into their processes.",
    ],
  },
  {
    slug: "content-agency",
    desk: "content",
    rival: "a traditional content agency",
    title: "Against a traditional content agency",
    description:
      "What a traditional content agency charges for strategy and a handful of pieces a month, what we do with a person and an AI team, and where a specialist human writer is worth the money.",
    decision:
      "You need to explain what you do and be found for it. Both options give you a person; the question is who writes the first draft and what that costs.",
    rows: [
      {
        question: "Who agrees what to write",
        agency: "A strategist, in a kick-off workshop, then a calendar for the year.",
        here: "Your specialist, with you, on a call: one clear idea you agree on, and every piece built from it.",
        winner: "draw",
      },
      {
        question: "Who writes the first draft",
        agency: "A freelance writer, often a different one each month.",
        here: "The AI team, from research on you and your competitors, then edited by your specialist before you see it.",
        winner: "here",
      },
      {
        question: "How your voice is kept",
        agency: "A brand voice document, written once and quietly ignored by the third freelancer.",
        here: "Measured on every draft against how you actually write, and against the pages you compete with.",
        winner: "here",
      },
      {
        question: "Interviews and original reporting",
        agency: "A journalist-style writer can interview your customers and get the quote that makes the piece.",
        here: "Your specialist can run a customer interview with you, but a dedicated writer does it better.",
        winner: "agency",
      },
      {
        question: "Cost",
        agency: "£2,000 to £5,000 a month for strategy, four to eight pieces and distribution.",
        here: "A fixed monthly fee at a fraction of that, because the research and the drafting are done by AI.",
        winner: "here",
      },
    ],
    chooseAgency: [
      "Your best content would come from interviewing customers every month, and you want a specialist writer doing it.",
      "You need a named expert byline with real credentials, which matters more in some sectors than anything else.",
      "The writing is the product, not the marketing for it.",
    ],
  },
  {
    slug: "ppc-agency",
    desk: "paid",
    rival: "a traditional PPC agency",
    title: "Against a traditional PPC agency",
    description:
      "What a percentage-of-spend fee buys, what we do instead with a person and an AI team, and why we check your tracking before we take a budget.",
    decision:
      "You are ready to pay for customers, and choosing between paying an agency a percentage of your spend or a fixed fee to a person with an AI team behind them.",
    rows: [
      {
        question: "How the fee works",
        agency: "A percentage of spend. Raise the budget and the fee rises, with no extra work needed to earn it.",
        here: "A fixed monthly fee. What you spend on ads is between you and the platform.",
        winner: "here",
      },
      {
        question: "Before any money is spent",
        agency: "Usually straight to launch, with tracking fixed later if anyone notices.",
        here: "Your tracking is checked first. If a sale can't be measured, we won't spend on it.",
        winner: "here",
      },
      {
        question: "Who decides the budget",
        agency: "Usually the agency, inside an agreed ceiling.",
        here: "You. Every campaign is built paused, and no budget change happens without your yes.",
        winner: "draw",
      },
      {
        question: "What results you're shown",
        agency: "What each platform claims, often added together, so the total is more sales than you made.",
        here: "Your own sales, with each platform's claim shown separately and never summed.",
        winner: "here",
      },
      {
        question: "Video and photo shoots",
        agency: "In-house designers and editors who can shoot and cut new assets every week.",
        here: "We make every ad size from your images and write the copy, but we don't run shoots.",
        winner: "agency",
      },
    ],
    chooseAgency: [
      "Your spend is large enough that a percentage fee still buys a dedicated team, which is a real thing to want.",
      "Creative production, meaning shoots and edited video, is most of the work you need.",
      "You need campaigns live on a platform that has not yet approved our software. Each service page says where that stands.",
    ],
  },
  {
    slug: "social-agency",
    desk: "social",
    rival: "a traditional social agency",
    title: "Against a traditional social agency",
    description:
      "What a social retainer covers, what we do with a person and an AI team, and the parts where a dedicated community manager is still better.",
    decision:
      "You know you should be posting and never have the time. Both options will plan and write for you; the difference is what the plan is based on, and what it costs.",
    rows: [
      {
        question: "What the plan is based on",
        agency: "Best practice and the team's instinct, then a calendar filled in.",
        here: "Which of your competitors' posts actually beat their own usual, and what those winners had in common.",
        winner: "here",
      },
      {
        question: "Whose voice gets used",
        agency: "A social voice written by the social team, often not the one on your website.",
        here: "The same voice as your website and content, agreed with your specialist once.",
        winner: "here",
      },
      {
        question: "What gets reported",
        agency: "Reach and impressions, including numbers nobody can actually see for a competitor.",
        here: "Only what the platforms really expose, with anything unmeasured labelled as such.",
        winner: "here",
      },
      {
        question: "Replying to comments all day",
        agency: "A community manager reading every reply and knowing when to pick up the phone.",
        here: "Replies are drafted for you to approve. Nobody on our side is watching your comments hour by hour.",
        winner: "agency",
      },
      {
        question: "Cost",
        agency: "£1,200 to £3,000 a month for planning, production, scheduling and community management.",
        here: "A fixed monthly fee at a fraction of that, because research and drafting are done by AI.",
        winner: "here",
      },
    ],
    chooseAgency: [
      "Community management matters most to you, and you want a person watching your comments all day.",
      "Your channels run on video, and production is the job rather than the planning.",
      "You need posts going out automatically on a platform that has not yet approved our software.",
    ],
  },
];

export const VERSUS_BY_SLUG = new Map(VERSUS.map((v) => [v.slug, v]));
