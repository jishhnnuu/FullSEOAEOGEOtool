import Link from "next/link";

import { CtaBand, MarketingChrome } from "@/components/marketing";
import { articleNode, breadcrumbNode, faqNode, graph } from "@/lib/schema";

export const metadata = {
  title: "AI crawlers do not run JavaScript, and an entire product category depends on you not knowing",
  description:
    "GPTBot, ClaudeBot and PerplexityBot fetch raw HTML and execute no client-side code. That single fact means any SEO fix injected by a pixel is invisible to the answer engines those same tools sell visibility against.",
  alternates: { canonical: "/ai-crawlers-and-javascript" },
};

const FAQ = [
  {
    q: "Which AI crawlers execute JavaScript?",
    a: "Among the major retrieval crawlers, effectively none. GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Meta-ExternalAgent and Bytespider fetch raw HTML and run no client-side code. The exceptions are Google's Gemini, because it rides Googlebot's rendering infrastructure, and Applebot, which does render.",
  },
  {
    q: "How much content does this actually cost a site?",
    a: "Onely's February 2026 analysis found that 42% of JavaScript-rendered content never reaches AI systems at all. For a site that is fully client-side rendered, the figure is closer to everything: the crawler receives an empty shell with a title and a script tag.",
  },
  {
    q: "Does this mean client-side SEO tools are useless?",
    a: "No. They work for Google, which renders JavaScript. They do not reach the answer engines. The problem is specifically that several of these products sell an AI visibility dashboard and a script-injected schema fix on the same screen, and the second cannot move the first.",
  },
  {
    q: "How do I check my own site?",
    a: "Fetch your page with curl and read what comes back, or use the extractability checker on this site, which does the same thing and counts what survives. If the word count is near zero and your page is full of text, that text does not exist as far as a non-rendering crawler is concerned.",
  },
  {
    q: "What is the fix?",
    a: "Server-side rendering or static generation for the pages you want cited, and writing SEO changes into the CMS rather than injecting them at runtime. A fix that lives in the served HTML is also a fix that survives you cancelling the tool that made it.",
  },
];

export default function AiCrawlersPage() {
  return (
    <MarketingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: graph(
            breadcrumbNode([
              { name: "Home", path: "/" },
              { name: "AI crawlers and JavaScript", path: "/ai-crawlers-and-javascript" },
            ]),
            articleNode({
              headline: "AI crawlers do not run JavaScript, and an entire product category depends on you not knowing",
              description:
                "The measurement behind the claim, and what it means for any SEO fix applied client side.",
              path: "/ai-crawlers-and-javascript",
              published: "2026-09-20",
            }),
            faqNode(FAQ),
          ),
        }}
      />

      <section className="section">
        <div className="eyebrow">Explainer</div>
        <h1 className="section-title" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          AI crawlers do not run JavaScript, and an entire product category depends on you not knowing.
        </h1>
        {/*
          The claim, the evidence and the consequence in the first paragraph.
          Anyone who reads one paragraph has the whole argument, and it is the
          passage a model extracts.
        */}
        <p className="section-lede">
          GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Meta-ExternalAgent and Bytespider all fetch raw HTML and
          execute no client-side code. So any SEO fix applied by a JavaScript pixel, which is how several popular
          &ldquo;autonomous SEO&rdquo; products work, is invisible to exactly the engines those same products sell you
          an AI visibility dashboard for. This is checkable in about thirty seconds and almost nobody checks.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">The measurement</h2>
        <p>
          Vercel published a crawler study that instrumented real requests from the major AI agents, and the 2026
          measurements that followed agree with it. GPTBot downloads JavaScript on roughly 11.5% of its requests and
          executes none of it. ClaudeBot downloads it on roughly 23.8% and executes none. Downloading a file is not
          the same as running it, and the distinction is the whole argument: these crawlers fetch the assets a page
          references and then do nothing with them.
        </p>
        <p>
          Onely&rsquo;s February 2026 analysis put a number on the cost. Across the sites they measured, 42% of
          JavaScript-rendered content never reached AI systems at all. For a fully client-side application the figure
          is not 42%, it is close to everything: the crawler receives a shell, a title, and a script tag.
        </p>
        <p>
          Two exceptions matter. Google&rsquo;s Gemini rides Googlebot&rsquo;s rendering infrastructure, so it sees
          rendered content. Applebot renders too. Everything else in the list above does not.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Why this is a product problem and not a trivia question</h2>
        <p>
          A category of tools has grown up around a genuinely good idea: most people cannot get a developer to change
          their page templates, so apply the fix in the browser instead. Add a script tag, and titles, meta
          descriptions, schema and internal links get rewritten after the page loads. It is a real solution to a real
          bottleneck and it works for Google.
        </p>
        <p>
          The same products now sell AI visibility monitoring, because that is where the category went. And the two
          halves cannot help each other. The schema block injected at runtime is not in the HTML that ClaudeBot
          received. The rewritten title is not in the HTML that PerplexityBot received. The dashboard will report your
          citation rate accurately, and the fix sitting next to it on the screen cannot change that number.
        </p>
        <p>
          Nobody in that category says this out loud. It is not a conspiracy, it is an awkward fact about two features
          that were built at different times for different reasons and ended up on the same page.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">The second fact: a fix you do not own is a fix you are renting</h2>
        <p>
          Search Atlas&rsquo;s own documentation confirms that schema, meta changes and redirects applied through
          their pixel revert when the pixel is removed. Content changes and Business Profile updates persist, because
          those were written into systems the customer owns.
        </p>
        <p>
          That is the tell, and it generalises. Whatever is written into your CMS survives cancellation, a billing
          failure, or a decision to bring the work in house. Whatever is injected at runtime disappears with the
          subscription. A year of SEO work that evaporates on churn was never an asset, and it should be priced as a
          service rather than sold as a fix.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">How to check your own site in thirty seconds</h2>
        <p>
          Fetch the page the way a crawler does and read what comes back. If your content is not in that response, it
          does not exist for any of the engines listed above.
        </p>
        <pre className="code-block">
          <code>{`curl -sS -A "GPTBot" https://example.com/your-page | wc -c
curl -sS -A "GPTBot" https://example.com/your-page | grep -o "<title>[^<]*"`}</code>
        </pre>
        <p>
          Or use the <Link href="/tools/extractability-check">extractability checker</Link>, which does the same fetch
          and counts the words, the title, the description and the structured data that survive. It is free and needs
          no account.
        </p>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">What to do about it</h2>
        <ul className="prose-list">
          <li>
            <strong>Render the pages you want cited on the server.</strong> Static generation or server-side
            rendering. This is the whole fix and everything else is a workaround.
          </li>
          <li>
            <strong>Write SEO changes into the CMS, not into a runtime script.</strong> The change then exists in the
            served HTML, is visible to every crawler, and is yours.
          </li>
          <li>
            <strong>Check that the crawlers are allowed in at all.</strong> Extractability is the second question. The
            first is whether robots.txt lets them fetch the page, and the answer is no more often than people expect.
          </li>
          <li>
            <strong>Stop treating an AI visibility dashboard as a fix.</strong> Measurement is a diagnosis. The
            treatment is crawler access, extractable content, entity clarity and mentions on sources the models
            already trust.
          </li>
        </ul>
      </section>

      <section className="section section-tight">
        <h2 className="section-title small-title">Questions</h2>
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <CtaBand
        title="Check what a crawler actually receives"
        body="The extractability checker fetches your page with no JavaScript and shows what survives. Free, no account."
        primary={{ href: "/tools/extractability-check", label: "Check a page" }}
      />
    </MarketingChrome>
  );
}
