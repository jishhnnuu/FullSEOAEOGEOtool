import { CtaBand, MarketingChrome } from "@/components/marketing";
import { AI_CRAWLER_LIST } from "@/engine/robots";

export const metadata = {
  title: "AI answer visibility",
  description:
    "AEO and GEO done as work rather than a dashboard: crawler access, extractability, citable passages, entity resolution, llms.txt and the answer blocks that earn the citation.",
};

const STEPS = [
  {
    n: "01",
    title: "Can the engine reach you",
    body: "Twelve named crawlers, each checked against your robots.txt individually rather than assumed from a wildcard rule. Blocking them can be the right call. Blocking them by accident is the common one.",
  },
  {
    n: "02",
    title: "Can it read what it fetched",
    body: "A page whose body arrives empty and fills in with JavaScript is invisible to any engine that does not run scripts. Measured per page, reported as a finding with the word count the server actually sent.",
  },
  {
    n: "03",
    title: "Can it resolve who you are",
    body: "Organization or LocalBusiness markup, sameAs links to the profiles that describe the same entity, consistent naming, and a presence in the records models use to disambiguate companies.",
  },
  {
    n: "04",
    title: "Is any passage worth quoting",
    body: "A direct answer in the first paragraph, a specific number in the first sentence, question headings with short answers under them, tables and lists, a named author, and outbound citations.",
  },
  {
    n: "05",
    title: "Then fix it",
    body: "The answer block is drafted. The FAQ markup is generated from the questions already on the page. The llms.txt is built from the pages worth pointing at. The entity markup is written with your real profiles in it.",
  },
];

export default function AiSearchPage() {
  return (
    <MarketingChrome>
      <section className="section">
        <div className="eyebrow">AEO and GEO</div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          Being cited is the new being ranked.
        </h1>
        <p className="section-lede">
          When a question is answered inside ChatGPT, Perplexity, Gemini or an AI Overview, the click never
          happens. What happens instead is a citation, and citations go to pages a model could fetch, parse and
          trust. Almost none of that is the same work as ranking, and almost no tool checks it.
        </p>
        <div className="notice" style={{ maxWidth: "72ch" }}>
          <p style={{ margin: 0 }}>
            <strong>The specialist tools measure share of voice.</strong> Very few of them treat an engine stating
            your wrong price, or claiming you have closed, as the urgent revenue problem it is. Accuracy is
            checked here alongside visibility, against a ledger of facts you control.
          </p>
        </div>
      </section>

      <section className="section section-tight">
        <div className="eyebrow">The method</div>
        <h2 className="section-title">Five questions, in order.</h2>
        <div className="timeline" style={{ marginTop: "2rem", maxWidth: "64ch" }}>
          {STEPS.map((step) => (
            <div className="timeline-item" key={step.n}>
              <div className="timeline-when">{step.n}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <div style={{ padding: "0 1.5rem" }}>
          <div className="eyebrow">Crawler access</div>
          <h2 className="section-title">The twelve agents checked on every run.</h2>
          <p className="section-lede">
            Each one is evaluated against your robots.txt with the same longest-match rule a real crawler uses, so
            an allow buried under a wildcard disallow is resolved correctly rather than guessed at.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>User agent</th><th>What it feeds</th></tr>
              </thead>
              <tbody>
                {AI_CRAWLER_LIST.map((agent) => (
                  <tr key={agent.agent}>
                    <td className="mono">{agent.agent}</td>
                    <td className="muted">{agent.matters}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">What gets generated</div>
        <h2 className="section-title">Not advice. Artefacts.</h2>
        <div className="feature-grid">
          <div className="feature">
            <span className="tag">File</span>
            <h3>llms.txt, written from your site</h3>
            <p>
              Grouped by section, every entry with a one-line summary taken from the page itself. Curated down to
              the pages you would actually want quoted, not a dump of every URL.
            </p>
          </div>
          <div className="feature">
            <span className="tag">File</span>
            <h3>robots.txt with the engines you choose</h3>
            <p>
              Your existing rules kept, an explicit allow block added for the answer engines you want citations
              from, and the sitemap line added if it was missing. Marked critical risk, so a person reads it.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Markup</span>
            <h3>Entity and FAQ schema</h3>
            <p>
              Organization or LocalBusiness with the social profiles found on your own site as sameAs. FAQPage
              built from the questions already in your headings, answered from the paragraphs already under them.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Copy</span>
            <h3>Answer blocks</h3>
            <p>
              Two to three sentences that make sense quoted on their own, with the specific number first. Placed
              under the H1, above everything else, because that is the passage engines lift.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Structure</span>
            <h3>Headings that name the thing</h3>
            <p>
              &quot;Overview&quot; tells a model nothing. Generic headings are found and rewritten to say what the section
              answers, which is what decides whether a passage gets retrieved at all.
            </p>
          </div>
          <div className="feature">
            <span className="tag">Evidence</span>
            <h3>Citable facts</h3>
            <p>
              Pages with no figures and no sources are flagged. Models cite pages that contain specific numbers,
              dates and named sources, and a page of adjectives is not one of them.
            </p>
          </div>
        </div>
      </section>

      <CtaBand
        title="Find out which engines can currently reach you"
        body="The crawler check runs in the first few seconds of any audit, before the crawl proper starts. No account needed."
      />
    </MarketingChrome>
  );
}
