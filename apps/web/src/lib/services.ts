/**
 * What the agency sells, as a founder would shop for it.
 *
 * The four AI desks in `desks.ts` do the work behind search, content, social
 * and paid. A founder does not buy a desk, though: they buy "a website", "SEO"
 * or "someone to run our ads", and they buy it from people. So this list is
 * the menu, and every item on it comes with a person on the account.
 *
 * Websites is on the menu and has no desk, on purpose. A build is led by a
 * person on our team, with the audit engine checking it before launch; the
 * page says exactly that rather than implying a website generator exists.
 *
 * Prices live here and nowhere else on the public site. `from` is null until
 * the owner sets a published starting price, and while it is null every page
 * says the price is quoted on the call. A made-up starting price is worse than
 * none, because the first founder who is quoted more remembers the page.
 */

import type { ManagerKey } from "./org";

export type ServiceKey = "websites" | ManagerKey | "everything";

export type Service = {
  key: ServiceKey;
  path: string;
  /** Menu label. */
  label: string;
  /** One line under the label, in the founder's words. */
  line: string;
  /** Who it is for, in one sentence. */
  forWho: string;
  /** The published starting price per month (or one-off for a build), in pounds. Null means quoted on the call. */
  from: number | null;
  /** Whether `from` is a one-off rather than monthly. */
  oneOff: boolean;
  /** What a traditional agency typically charges for the same scope, and the basis. */
  agency: string;
  agencyBasis: string;
  /** The desk colour on tiles. */
  colour: "search" | "content" | "social" | "paid" | "cmo";
};

export const SERVICES: Service[] = [
  {
    key: "websites",
    path: "/websites",
    label: "Websites",
    line: "No website yet? We'll build one that gets you customers.",
    forWho: "New businesses with no site, or one they are embarrassed to send people to.",
    from: null,
    oneOff: true,
    agency: "£2,500 to £10,000",
    agencyBasis: "A UK small-business build by an agency: five to fifteen pages, design, copy and launch.",
    colour: "cmo",
  },
  {
    key: "search",
    path: "/seo",
    label: "SEO",
    line: "Get found on Google, and in AI answers too.",
    forWho: "Anyone with a website that customers are not finding.",
    from: null,
    oneOff: false,
    agency: "£1,800 to £4,000 a month",
    agencyBasis: "A mid-market UK retainer for technical SEO, content briefs and reporting, at 20 to 40 hours.",
    colour: "search",
  },
  {
    key: "paid",
    path: "/paid",
    label: "Paid ads",
    line: "Google, Meta and more, without wasting a penny.",
    forWho: "Businesses ready to pay for customers, who want to know the numbers are real.",
    from: null,
    oneOff: false,
    agency: "10 to 20 per cent of your ad spend",
    agencyBasis: "The standard UK management fee, which rises with your budget whether or not the work does.",
    colour: "paid",
  },
  {
    key: "social",
    path: "/social",
    label: "Social media",
    line: "Posts planned and written, based on what's working.",
    forWho: "Businesses who know they should be posting and never have the time.",
    from: null,
    oneOff: false,
    agency: "£1,200 to £3,000 a month",
    agencyBasis: "A UK social retainer for planning, production, scheduling and community management.",
    colour: "social",
  },
  {
    key: "content",
    path: "/content",
    label: "Content",
    line: "Articles and emails people actually finish.",
    forWho: "Businesses who need to explain what they do, and be found for it.",
    from: null,
    oneOff: false,
    agency: "£2,000 to £5,000 a month",
    agencyBasis: "A content agency retainer for strategy, four to eight pieces and distribution.",
    colour: "content",
  },
  {
    key: "everything",
    path: "/the-whole-agency",
    label: "Everything",
    line: "Your whole marketing, handled. One person, one plan.",
    forWho: "Founders who want all of it done, and one person to talk to about it.",
    from: null,
    oneOff: false,
    agency: "£5,000 to £15,000 a month",
    agencyBasis: "A full-service UK agency retainer across search, content, social and paid, before ad spend.",
    colour: "cmo",
  },
];

export function serviceByKey(key: ServiceKey): Service {
  const found = SERVICES.find((s) => s.key === key);
  if (!found) throw new Error(`No service ${key}`);
  return found;
}

/** The price as a page shows it. Never a number that was not set. */
export function servicePrice(service: Service): string {
  if (service.from === null) return "Quoted on your free call";
  return service.oneOff ? `From £${service.from.toLocaleString()}` : `From £${service.from.toLocaleString()} a month`;
}

/** The main action, everywhere. */
export const BOOK = { href: "/book", label: "Book a free call" };
