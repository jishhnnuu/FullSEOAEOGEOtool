import Link from "next/link";

/*
 * Where the product actually is.
 *
 * This exists because someone read the whole site and still asked where the
 * dashboard was. Four desk pages, a roster of eighty and a check library
 * describe a company; none of them says what to click. The path was real the
 * whole time and simply never written down on a screen, which on a site whose
 * entire argument is "we do the work, watch us" is the worst possible thing to
 * leave implicit.
 *
 * Three steps, each with the one thing it costs you. The third is the only one
 * that asks for anything at all.
 */

type Step = {
  n: string;
  title: string;
  cost: string;
  body: string;
  links: { href: string; label: string; primary?: boolean }[];
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Run something, now, with nothing",
    cost: "No account, no card, no email",
    body:
      "Type a URL or a competitor's handle and watch real analysis happen in your browser. The crawl, the 90 checks, the voice comparison and the social teardown all run without us knowing who you are, and the results are yours to export.",
    links: [
      { href: "/tools/social-teardown", label: "Tear down a competitor", primary: true },
      { href: "/tools/voice-check", label: "Check a page against its rivals" },
      { href: "/tools", label: "All free tools" },
    ],
  },
  {
    n: "02",
    title: "Watch a whole account run",
    cost: "Still nothing",
    body:
      "Our own site, open, with the findings we have not fixed left in it. This is the workspace a paying account sees: the director's brief, the queue, the fixes already written, and the one row that refuses to score itself because a connection is missing.",
    links: [{ href: "/inside", label: "Look inside a live account", primary: true }],
  },
  {
    n: "03",
    title: "Point it at your own site",
    cost: "A URL. A card only if you want work shipped for you",
    body:
      "This is the dashboard. One workspace per site, a desk down the left for each team you have turned on, an approval queue in the middle, and a report that reads flat as flat. The free tier crawls and writes the fixes; a plan is what lets the agents push them.",
    links: [
      { href: "/app/new", label: "Open a workspace", primary: true },
      { href: "/pricing", label: "What a plan costs" },
    ],
  },
];

export function TheFlow({ heading = "Where the product is, in three clicks" }: { heading?: string }) {
  return (
    <div>
      <h2 className="section-title small-title">{heading}</h2>
      <div className="flow-steps">
        {STEPS.map((step) => (
          <div key={step.n} className="flow-step">
            <span className="flow-n">{step.n}</span>
            <h3>{step.title}</h3>
            <span className="flow-cost">{step.cost}</span>
            <p className="small muted">{step.body}</p>
            <div className="flow-links">
              {step.links.map((link) => (
                <Link key={link.href} href={link.href} className={link.primary ? "button primary" : "button"}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
