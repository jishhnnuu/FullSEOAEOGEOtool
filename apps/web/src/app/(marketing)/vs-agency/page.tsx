import { CtaBand } from "@/components/marketing";

export const metadata = {
  title: "Against an agency, a suite, and an AI writer",
  description:
    "An honest comparison: where an agency still wins, where enterprise suites stop, and why volume content tools create a problem rather than solving one.",
};

type Row = [string, string, string, string, string];

const ROWS: Row[] = [
  ["Technical audit", "yes", "yes", "yes", "no"],
  ["Writes the corrected title, meta and schema", "yes", "partial", "no", "no"],
  ["Generates sitemap, robots.txt and llms.txt", "yes", "partial", "no", "no"],
  ["Internal link plan with anchors and placement", "yes", "partial", "partial", "no"],
  ["Content briefs grounded in your own site", "yes", "yes", "partial", "partial"],
  ["Drafts that fail a gate before you see them", "yes", "yes", "no", "no"],
  ["Fact ledger, unverified claims blocked", "yes", "partial", "no", "no"],
  ["Publishes to your CMS on approval", "yes", "yes", "no", "yes"],
  ["Local profile, posts and review replies", "yes", "yes", "partial", "no"],
  ["Link prospecting", "yes", "yes", "yes", "no"],
  ["Outreach written and sent from your domain", "yes", "yes", "no", "no"],
  ["AI answer visibility across twelve engines", "yes", "partial", "partial", "no"],
  ["Flags what AI engines say wrongly about you", "yes", "partial", "no", "no"],
  ["Diffs each run against the last", "yes", "partial", "partial", "no"],
  ["Shows the trace behind every action", "yes", "no", "no", "no"],
  ["Runs at 3am on a Sunday", "yes", "no", "yes", "yes"],
  ["Understands your business over a call", "no", "yes", "no", "no"],
  ["Argues with your developer for you", "no", "yes", "no", "no"],
  ["Takes the blame in a board meeting", "no", "yes", "no", "no"],
];

const COLS = ["SEO OS", "An agency", "An enterprise suite", "An AI writer"];

function cell(value: string) {
  if (value === "yes") return <span className="yes">Yes</span>;
  if (value === "partial") return <span className="partial">Partly</span>;
  return <span className="no">No</span>;
}

export default function VsAgencyPage() {
  return (
    <>
      <section className="section">
        <div className="eyebrow">Comparison</div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          Where this wins, and where it does not.
        </h1>
        <p className="section-lede">
          A comparison table where every column says yes to everything is an advert. The last three rows of this
          one are the honest part, and they are the reason some companies should still hire a person.
        </p>
        <div className="table-scroll" style={{ marginTop: "1.5rem" }}>
          <table className="compare-table">
            <thead>
              <tr>
                <th style={{ minWidth: "260px" }}></th>
                {COLS.map((col) => <th key={col} className="center">{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row[0]}>
                  <td>{row[0]}</td>
                  {row.slice(1).map((value, i) => (
                    <td key={i} className="center">{cell(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section section-alt">
        <div style={{ padding: "0 1.5rem" }}>
          <div className="eyebrow">The agency</div>
          <h2 className="section-title">What a good agency is actually selling.</h2>
          <p className="section-lede">
            Not the audit. The audit is a PDF anybody can generate. What you are paying for is judgement, someone
            who will push back on a bad brief, and a name to hold responsible. Two of those three can be built.
          </p>
          <div className="feature-grid">
            <div className="feature">
              <span className="tag">Replaced</span>
              <h3>The production line</h3>
              <p>
                Crawling, checking, prioritising, writing meta, building schema, planning links, drafting content,
                finding prospects, assembling the report. This is most of the hours on most retainers, and it is
                the part that does not need a person.
              </p>
            </div>
            <div className="feature">
              <span className="tag">Replaced</span>
              <h3>The accountability gap</h3>
              <p>
                Every mission run, agent run and tool call is recorded with its arguments, duration, outcome and
                cost. Every live change names the agent that proposed it and the person who approved it. Ask any
                agency for that and watch what happens.
              </p>
            </div>
            <div className="feature">
              <span className="tag">Not replaced</span>
              <h3>Sitting in the room</h3>
              <p>
                Understanding why the product is priced that way, spotting that the real problem is the sales
                process, telling the CEO something they do not want to hear. Software does not do this and should
                not pretend to.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="tools">
        <div className="eyebrow">The suites</div>
        <h2 className="section-title">Enormous data, and a hard stop.</h2>
        <p className="section-lede">
          Semrush, Ahrefs, Conductor, BrightEdge, seoClarity and Botify are very good at measurement. Some of them
          now track AI visibility well. None of them find a prospect, qualify it, write a personal email
          referencing something the recipient published, and send it from your domain. None of them write this
          week&apos;s Business Profile post. None of them apply a single fix.
        </p>
        <div className="notice" style={{ maxWidth: "72ch" }}>
          <p style={{ margin: 0 }}>
            That is not a criticism of the software. It is what the software is for. The problem is that buying it
            does not reduce the headcount you need, and the licence sits on top of that headcount rather than
            instead of it.
          </p>
        </div>
      </section>

      <section className="section section-alt" id="autowriters">
        <div style={{ padding: "0 1.5rem" }}>
          <div className="eyebrow">The writers</div>
          <h2 className="section-title">Volume was never the constraint.</h2>
          <p className="section-lede">
            Enter a URL, the agent researches, writes and publishes to WordPress. It is the closest category to
            this one and it goes too far the other way: generic articles at volume with no brand grounding, no
            fact verification, no approval gate and no technical work at all.
          </p>
          <div className="feature-grid">
            <div className="feature">
              <h3>Grounding</h3>
              <p>
                Content here is written against a brief built from your own pages, your competitors and the terms
                you named, with a voice profile derived from your existing writing rather than from a list of
                adjectives.
              </p>
            </div>
            <div className="feature">
              <h3>Fact discipline</h3>
              <p>
                A writer may state a fact from your ledger or cite an external source. Anything else is marked
                unverified and fails the gate before a human sees it. This is the thing that gets AI content
                programmes switched off, and it is handled at the gate rather than in a review meeting.
              </p>
            </div>
            <div className="feature">
              <h3>Everything else</h3>
              <p>
                Content is one department. A site with perfect articles and a noindex on its category pages does
                not rank, and no writing tool will ever tell you that.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Judge it on your own site"
        body="Run the audit against something you know well. The findings will either be right or they will not, and you will be able to tell within a minute."
      />
    </>
  );
}
