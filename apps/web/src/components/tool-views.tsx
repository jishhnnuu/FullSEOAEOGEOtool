"use client";

/**
 * One component per tool, all reading the same inspection result.
 *
 * Each view renders its slice and nothing else, so a tool page answers the
 * one question its title promised rather than dumping an audit on someone who
 * asked about robots.txt. Anything the single-page fetch genuinely cannot
 * answer is said out loud instead of guessed, which is the same rule the
 * product applies to blocked stages and unmeasured scores.
 */

import { useState } from "react";

import type { InspectResult } from "@/app/api/tools/inspect/route";
import type { ToolDef } from "@/content/tools";
import type { Finding } from "@/engine/types";

import {
  CodeBlock,
  CrawlerTable,
  FindingList,
  headingOutline,
  llmsTxtFor,
  pixelWidth,
  robotsTxtFor,
} from "./tool-runner";

export type ViewProps = { tool: ToolDef; result: InspectResult; findings: Finding[] };

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={`tool-stat${tone ? ` ${tone}` : ""}`}>
      <div className="tool-stat-value">{value}</div>
      <div className="tool-stat-label">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------ crawlers */

function CrawlerView({ result, findings, tool }: ViewProps) {
  if (!result.crawlers) return <FindingList findings={findings} only={tool.checks} />;
  const robots = result.files?.robotsTxt;
  return (
    <>
      <CrawlerTable crawlers={result.crawlers} />
      {robots === null ? (
        <p className="tool-note">
          There is no robots.txt at this origin. Nothing is blocked, which is why every agent above reads as allowed,
          but nothing is declared either and no sitemap is advertised.
        </p>
      ) : null}
      <FindingList findings={findings} only={tool.checks} />
      {robots ? <CodeBlock value={robots.slice(0, 6000)} filename="your current robots.txt" /> : null}
    </>
  );
}

/* ------------------------------------------------------- extractability */

function ExtractabilityView({ result, findings, tool }: ViewProps) {
  const signals = result.page.signals;
  const words = signals?.wordCount ?? 0;
  const scriptBytes = signals?.inlineScriptBytes ?? 0;
  const tone = words < 50 ? "bad" : words < 200 ? "warn" : "good";

  return (
    <>
      <p className={`tool-verdict ${tone === "good" ? "good" : "bad"}`}>
        {words < 50
          ? "Almost nothing reaches a crawler that does not run JavaScript."
          : words < 200
            ? "Some content reaches a non-rendering crawler, but not much of it."
            : "The content is present in the served HTML, before any JavaScript runs."}
      </p>
      <div className="tool-stats">
        <Stat label="Words in the served HTML" value={String(words)} tone={tone} />
        <Stat label="Title present without JS" value={signals?.title ? "Yes" : "No"} tone={signals?.title ? "good" : "bad"} />
        <Stat
          label="Description present without JS"
          value={signals?.metaDescription ? "Yes" : "No"}
          tone={signals?.metaDescription ? "good" : "warn"}
        />
        <Stat label="Structured data blocks" value={String(signals?.jsonLd.length ?? 0)} />
        <Stat label="External scripts" value={String(signals?.scripts.length ?? 0)} />
        <Stat label="Inline script" value={`${Math.round(scriptBytes / 1024)} KB`} />
      </div>
      <p className="tool-note">
        This is the page exactly as GPTBot, ClaudeBot and PerplexityBot receive it. They fetch raw HTML and execute no
        client-side code, so anything counted as zero above does not exist as far as those engines are concerned.
      </p>
      <FindingList findings={findings} only={tool.checks} />
      {signals?.lede ? (
        <>
          <h3 className="tool-subhead">The opening passage a model would extract</h3>
          <blockquote className="tool-quote">{signals.lede}</blockquote>
        </>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------ answer readiness */

function AnswerReadinessView({ result, findings, tool }: ViewProps) {
  const signals = result.page.signals;
  const relevant = findings.filter((f) => tool.checks.includes(f.code));
  // A simple, explainable deduction rather than a black box. The reader can
  // count the findings above and arrive at the same number, which is the point.
  const weight: Record<string, number> = { critical: 30, high: 18, medium: 9, low: 4, info: 1 };
  const deduction = relevant.reduce((total, f) => total + (weight[f.severity] ?? 5), 0);
  const score = Math.max(0, 100 - deduction);
  const tone = score >= 85 ? "good" : score >= 60 ? "warn" : "bad";

  return (
    <>
      <div className="tool-score">
        <div className={`tool-score-value ${tone}`}>{score}</div>
        <div>
          <strong>Answer readiness</strong>
          <p className="small muted">
            Out of 100, from {relevant.length} finding{relevant.length === 1 ? "" : "s"} across the AEO half of the
            catalogue. This measures whether an engine <em>could</em> use the page. Whether one <em>does</em> is a
            different question and needs the engines asked directly.
          </p>
        </div>
      </div>
      <div className="tool-stats">
        <Stat label="Words" value={String(signals?.wordCount ?? 0)} />
        <Stat label="Question headings" value={String(signals?.questionHeadings.length ?? 0)} />
        <Stat label="Citable numbers" value={String(signals?.numbers ?? 0)} />
        <Stat label="External citations" value={String(signals?.externalCitations ?? 0)} />
        <Stat label="Named author" value={signals?.author ? "Yes" : "No"} tone={signals?.author ? "good" : "warn"} />
        <Stat label="llms.txt published" value={result.files?.llmsTxt ? "Yes" : "No"} />
      </div>
      <FindingList findings={findings} only={tool.checks} />
    </>
  );
}

/* --------------------------------------------------------- generators */

function LlmsTxtView({ result }: ViewProps) {
  const generated = llmsTxtFor(result);
  const existing = result.files?.llmsTxt;
  return (
    <>
      <p className={existing ? "tool-verdict good" : "tool-verdict bad"}>
        {existing ? "This site already publishes an llms.txt." : "This site does not publish an llms.txt."}
      </p>
      <CodeBlock value={generated} filename="llms.txt" />
      <p className="tool-note">
        Save it at the root, served as <code>text/plain</code>, at <code>/llms.txt</code>. Read it before publishing:
        it is built from your sitemap and your pages, so anything wrong on your site is wrong here too.
      </p>
      {existing ? <CodeBlock value={existing.slice(0, 4000)} filename="your current llms.txt" /> : null}
    </>
  );
}

function RobotsView({ result, findings, tool }: ViewProps) {
  const [allowTraining, setAllowTraining] = useState(true);
  return (
    <>
      <div className="tool-toggle">
        <label>
          <input
            type="checkbox"
            checked={allowTraining}
            onChange={(event) => setAllowTraining(event.target.checked)}
          />{" "}
          Allow AI training crawlers as well as retrieval crawlers
        </label>
        <p className="small muted">
          Retrieval agents decide whether you appear in an answer today. Training agents build corpora for later.
          Refusing training does not remove you from answers; refusing retrieval does.
        </p>
      </div>
      <CodeBlock value={robotsTxtFor(result, allowTraining)} filename="robots.txt" />
      {result.crawlers ? <CrawlerTable crawlers={result.crawlers} /> : null}
      <FindingList findings={findings} only={tool.checks} />
    </>
  );
}

function SchemaView({ result, findings, tool }: ViewProps) {
  const blocks = result.page.signals?.jsonLd ?? [];
  return (
    <>
      <div className="tool-stats">
        <Stat label="JSON-LD blocks found" value={String(blocks.length)} tone={blocks.length ? "good" : "bad"} />
        <Stat label="Microdata types" value={String(result.page.signals?.microdataTypes.length ?? 0)} />
        <Stat label="Parse errors" value={String(result.page.signals?.jsonLdErrors.length ?? 0)} />
      </div>
      <FindingList findings={findings} only={tool.checks} />
      {blocks.length > 0 ? (
        <CodeBlock value={JSON.stringify(blocks, null, 2).slice(0, 12000)} filename="structured data on this page" />
      ) : (
        <p className="tool-note">
          No structured data on this page at all. The full audit generates Organization, Article, Product, FAQ,
          LocalBusiness and Breadcrumb blocks from what the page actually contains, which is the part that keeps the
          markup and the visible content in agreement.
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------- on-page */

function SerpView({ result, findings, tool }: ViewProps) {
  const signals = result.page.signals;
  const title = signals?.title ?? "";
  const description = signals?.metaDescription ?? "";
  const titleWidth = pixelWidth(title);
  const url = new URL(result.page.finalUrl);

  return (
    <>
      <div className="serp-preview">
        <div className="serp-url">
          {url.host}
          <span className="muted">{url.pathname === "/" ? "" : ` › ${url.pathname.split("/").filter(Boolean).join(" › ")}`}</span>
        </div>
        <div className="serp-title">{title || "No title tag on this page"}</div>
        <div className="serp-desc">
          {description || "No meta description. Search will pull a passage from the page instead, and it chooses badly more often than not."}
        </div>
      </div>
      <div className="tool-stats">
        <Stat
          label="Title width"
          value={`${titleWidth}px`}
          tone={titleWidth === 0 ? "bad" : titleWidth > 580 ? "warn" : "good"}
        />
        <Stat label="Title characters" value={String(title.length)} />
        <Stat
          label="Description characters"
          value={String(description.length)}
          tone={description.length === 0 ? "bad" : description.length > 160 ? "warn" : "good"}
        />
      </div>
      <p className="tool-note">
        Search truncates by pixel width rather than character count, which is why a count-based checker passes titles
        that get cut off. Roughly 580px is where desktop results start truncating.
      </p>
      <FindingList findings={findings} only={tool.checks} />
    </>
  );
}

function HeadingView({ result, findings, tool }: ViewProps) {
  const outline = headingOutline(result.page);
  return (
    <>
      {outline.length === 0 ? (
        <p className="tool-verdict bad">This page has no headings at all in its served HTML.</p>
      ) : (
        <ol className="heading-outline">
          {outline.map((heading, index) => (
            <li key={index} className={heading.issue ? "has-issue" : ""} style={{ marginLeft: (heading.level - 1) * 18 }}>
              <span className="heading-level">H{heading.level}</span>
              <span>{heading.text || <em className="muted">empty</em>}</span>
              {heading.issue ? <span className="heading-issue">{heading.issue}</span> : null}
            </li>
          ))}
        </ol>
      )}
      <FindingList findings={findings} only={tool.checks} />
    </>
  );
}

function SitemapView({ result, findings, tool }: ViewProps) {
  const files = result.files;
  const entries = files?.sitemapEntries ?? [];
  return (
    <>
      <p className={entries.length ? "tool-verdict good" : "tool-verdict bad"}>
        {entries.length
          ? `Found ${files?.sitemapUrls.length} sitemap file${files?.sitemapUrls.length === 1 ? "" : "s"} listing ${entries.length} URLs.`
          : "No sitemap was found at any of the usual locations, and robots.txt does not name one."}
      </p>
      {files?.sitemapUrls.length ? (
        <ul className="tool-list">
          {files.sitemapUrls.map((sitemap) => (
            <li key={sitemap}>
              <code>{sitemap}</code>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="tool-note">
        This tool reads the sitemap and checks it exists, is parseable and is advertised. Checking every entry for
        redirects, 404s and noindex means fetching every URL, which is the full audit rather than a single request.
      </p>
      <FindingList findings={findings} only={tool.checks} />
    </>
  );
}

function LinkView({ result, findings, tool }: ViewProps) {
  const links = result.page.signals?.links ?? [];
  const host = new URL(result.page.finalUrl).host;
  const internal = links.filter((link) => {
    try {
      return new URL(link.href).host === host;
    } catch {
      return false;
    }
  });
  const external = links.length - internal.length;
  return (
    <>
      <div className="tool-stats">
        <Stat
          label="Internal links out"
          value={String(internal.length)}
          tone={internal.length === 0 ? "bad" : internal.length < 3 ? "warn" : "good"}
        />
        <Stat label="External links out" value={String(external)} />
        <Stat label="Links with no anchor text" value={String(links.filter((l) => !l.text?.trim()).length)} />
      </div>
      <p className="tool-note">
        Orphan detection needs the whole site, because a page is only an orphan when nothing anywhere links to it. One
        page cannot answer that, so this tool does not pretend to. The full audit does.
      </p>
      <FindingList findings={findings} only={tool.checks} />
    </>
  );
}

const VIEWS: Record<string, (props: ViewProps) => React.ReactElement> = {
  "ai-crawler-check": CrawlerView,
  "extractability-check": ExtractabilityView,
  "answer-readiness": AnswerReadinessView,
  "llms-txt-generator": LlmsTxtView,
  "robots-txt-generator": RobotsView,
  "schema-generator": SchemaView,
  "serp-preview": SerpView,
  "heading-structure": HeadingView,
  "sitemap-auditor": SitemapView,
  "internal-link-check": LinkView,
};

export function ToolView(props: ViewProps) {
  const View = VIEWS[props.tool.slug];
  if (!View) return <FindingList findings={props.findings} only={props.tool.checks} />;
  return <View {...props} />;
}
