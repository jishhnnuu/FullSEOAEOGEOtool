import Link from "next/link";

import { LAB, LAB_PATH, labPath } from "@/lib/brand";

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
    n: "1",
    title: `Try a tool in ${LAB}`,
    cost: "Costs: nothing",
    body: "Our do-it-yourself lab. Paste a URL or a rival's handle. Real results, in your browser, in seconds.",
    links: [{ href: LAB_PATH, label: `Open ${LAB}`, primary: true }],
  },
  {
    n: "2",
    title: "Check any website's SEO",
    cost: "Costs: a URL",
    body: "Reads up to 40 pages, writes every fix and queues it for your yes. Free.",
    links: [{ href: labPath("seo/audit"), label: "Check a website", primary: true }],
  },
  {
    n: "3",
    title: "Talk to a specialist",
    cost: "Costs: thirty minutes",
    body: "A free call about your business. We set it all up and run it with you, if you want us to.",
    links: [{ href: "/book", label: "Book a free call", primary: true }],
  },
];

export function TheFlow({ heading = "Three ways in." }: { heading?: string }) {
  return (
    <div>
      <h2 className="section-title">{heading}</h2>
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
