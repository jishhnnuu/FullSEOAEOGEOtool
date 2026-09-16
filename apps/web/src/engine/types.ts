/**
 * The shapes the engine produces and the workspace stores.
 *
 * One file so the crawler, the checks, the API routes and the dashboard all
 * agree on the vocabulary. Nothing here is persisted server side: a run is
 * computed in the Worker and handed back whole, and the browser keeps it.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Category =
  | "technical"
  | "content"
  | "performance"
  | "schema"
  | "aeo"
  | "local"
  | "offpage"
  | "international"
  | "ecommerce"
  | "ux"
  | "compliance"
  | "analytics";

/* ------------------------------------------------------------------ crawl */

export type ImageRef = {
  src: string;
  alt: string | null;
  width: string | null;
  height: string | null;
  loading: string | null;
};

export type LinkRef = {
  href: string;
  text: string;
  rel: string;
  internal: boolean;
};

/** Everything the parser pulls out of one HTML document. */
export type PageSignals = {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  viewport: boolean;
  lang: string | null;
  charset: string | null;
  h1: string[];
  headings: { level: number; text: string }[];
  images: ImageRef[];
  links: LinkRef[];
  jsonLd: unknown[];
  jsonLdErrors: string[];
  microdataTypes: string[];
  hreflang: { lang: string; href: string }[];
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  scripts: string[];
  inlineScriptBytes: number;
  stylesheets: string[];
  text: string;
  wordCount: number;
  /** First 60 words of body copy, used for the answer-block check. */
  lede: string;
  paragraphs: string[];
  lists: number;
  tables: number;
  forms: number;
  publishedAt: string | null;
  modifiedAt: string | null;
  author: string | null;
  analytics: string[];
  cms: string | null;
  questionHeadings: string[];
  /** Question and answer pairs read from the page's own FAQPage or QAPage markup. */
  faqPairs: { question: string; answer: string }[];
  /** True when the page marked its main region, so chrome removal was exact. */
  contentRegionFound: boolean;
  hasFaqBlock: boolean;
  numbers: number;
  externalCitations: number;
  ctaCount: number;
};

export type CrawledPage = {
  url: string;
  finalUrl: string;
  status: number;
  depth: number;
  contentType: string;
  bytes: number;
  elapsedMs: number;
  redirectChain: string[];
  error: string | null;
  signals: PageSignals | null;
  /** URLs on the site that link to this one. */
  inlinks: string[];
  /** A hash of the visible text, for duplicate detection. */
  textHash: string | null;
};

export type SiteFiles = {
  robotsTxt: string | null;
  robotsStatus: number | null;
  sitemapUrls: string[];
  sitemapEntries: string[];
  llmsTxt: string | null;
  securityTxt: boolean;
  faviconOk: boolean;
  /** AI crawlers that robots.txt disallows, by user agent. */
  blockedAiCrawlers: string[];
  allowedAiCrawlers: string[];
};

export type CrawlReport = {
  baseUrl: string;
  host: string;
  startedAt: string;
  finishedAt: string;
  pages: CrawledPage[];
  files: SiteFiles;
  discovered: number;
  fetched: number;
  capped: boolean;
  notes: string[];
};

/* --------------------------------------------------------------- findings */

export type Finding = {
  id: string;
  code: string;
  category: Category;
  severity: Severity;
  title: string;
  why: string;
  recommendation: string;
  detail: string;
  url: string | null;
  affectedUrls: string[];
  affectedCount: number;
  evidence: Record<string, unknown>;
  priority: number;
  impact: number;
  effort: number;
  confidence: number;
  autoFixable: boolean;
  fixStrategy: string | null;
  /** Populated when the engine can produce the corrected artefact itself. */
  fix: Fix | null;
  status: "open" | "fixed" | "accepted" | "in_progress";
  firstSeen: string;
  lastSeen: string;
};

/** A concrete change, ready to be reviewed and shipped. */
export type Fix = {
  kind:
    | "meta"
    | "html"
    | "jsonld"
    | "file"
    | "link_plan"
    | "redirect"
    | "copy"
    | "manual";
  label: string;
  target: string | null;
  before: string | null;
  after: string;
  /** Where the change is applied: the CMS, the server, a file at the root. */
  applyVia: string;
  risk: "low" | "medium" | "high" | "critical";
  reversible: boolean;
  instructions: string;
};

/* ----------------------------------------------------------------- scores */

export type ScoreBreakdown = {
  score: number;
  components: Record<string, number>;
  counts: Partial<Record<Severity, number>>;
  topIssues: { code: string; title: string; severity: Severity; url: string | null; priority: number }[];
  /**
   * Whether anything was actually measured for this score.
   *
   * A category with no evidence behind it must not render a number. An
   * earlier version scored Experience 100 with no performance measurement of
   * any kind and Authority 84 with no link data, in the same visual language
   * as the two scores that were computed from real findings. A confident
   * number nobody measured is the single worst thing a tool in this category
   * can put on a screen, because it is indistinguishable from one that means
   * something.
   */
  measured: boolean;
  /** What is missing, in a sentence, when `measured` is false. */
  unmeasuredReason: string | null;
  /** What would turn this into a measurement. */
  unmeasuredFix: string | null;
};

export type Scores = {
  health: ScoreBreakdown;
  aeo: ScoreBreakdown;
  authority: ScoreBreakdown;
  experience: ScoreBreakdown;
};

/* ------------------------------------------------------------- strategy */

export type KeywordRow = {
  term: string;
  kind: "head" | "body" | "long_tail" | "question" | "brand" | "local";
  weight: number;
  onPageCount: number;
  bestUrl: string | null;
  bestUrlScore: number;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  cannibalised: string[];
  gap: boolean;
};

export type ContentGap = {
  topic: string;
  why: string;
  intent: string;
  format: "guide" | "comparison" | "landing" | "faq" | "case_study" | "location" | "glossary";
  priority: number;
  targetKeyword: string;
  supportingKeywords: string[];
  internalLinksFrom: string[];
};

export type ContentBrief = {
  id: string;
  title: string;
  slug: string;
  format: ContentGap["format"];
  targetKeyword: string;
  supportingKeywords: string[];
  intent: string;
  audience: string;
  wordTarget: number;
  outline: { heading: string; level: number; guidance: string }[];
  answerBlock: string;
  faq: { q: string; a: string }[];
  internalLinks: { url: string; anchor: string }[];
  schema: Record<string, unknown>;
  metaTitle: string;
  metaDescription: string;
  citationsNeeded: string[];
  notes: string[];
};

export type LinkProspect = {
  domain: string;
  url: string;
  kind:
    | "unlinked_mention"
    | "broken_inbound"
    | "redirect_only"
    | "relationship"
    | "directory"
    | "resource_page"
    | "broken_replacement"
    | "journalist"
    | "podcast"
    | "competitor_link"
    | "partner"
    | "press";
  why: string;
  authorityHint: string;
  contactPath: string;
  pitchAngle: string;
  priority: number;
};

export type AeoReadiness = {
  score: number;
  crawlerAccess: { agent: string; allowed: boolean; matters: string }[];
  answerable: { url: string; question: string; hasDirectAnswer: boolean; passage: string | null }[];
  entitySignals: { signal: string; present: boolean; detail: string }[];
  citableAssets: number;
  questions: string[];
};

export type LocalReadiness = {
  applicable: boolean;
  napFound: { name: string | null; address: string | null; phone: string | null; pages: number };
  consistency: { field: string; variants: string[] }[];
  hasLocalBusinessSchema: boolean;
  locationPages: string[];
  mapEmbeds: number;
  openingHours: boolean;
  recommendations: string[];
};

/* -------------------------------------------------------------- the run */

export type RunStep = {
  key: string;
  label: string;
  agent: string;
  status: "pending" | "running" | "done" | "skipped" | "blocked";
  detail: string;
  startedAt?: string;
  finishedAt?: string;
  /** Why a step could not run: a missing connection, usually. */
  blockedBy?: string;
};

import type { Coverage } from "./coverage";

export type AuditResult = {
  version: number;
  siteId: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  crawl: CrawlReport;
  findings: Finding[];
  scores: Scores;
  keywords: KeywordRow[];
  gaps: ContentGap[];
  briefs: ContentBrief[];
  prospects: LinkProspect[];
  aeo: AeoReadiness;
  local: LocalReadiness;
  inventory: PageInventoryRow[];
  /** What the crawl read, against what the sitemap declares. */
  coverage: Coverage;
  steps: RunStep[];
  quickWins: Finding[];
  estimatedAgencyHours: number;
  notes: string[];
};

export type PageInventoryRow = {
  url: string;
  title: string | null;
  status: number;
  depth: number;
  wordCount: number;
  h1: string | null;
  inlinks: number;
  outlinks: number;
  issues: number;
  worstSeverity: Severity | null;
  aeoScore: number;
  opportunity: number;
  type: string;
  indexable: boolean;
};

/* ------------------------------------------------------------ crawl input */

export type CrawlOptions = {
  url: string;
  maxPages?: number;
  maxDepth?: number;
  includeSubdomains?: boolean;
  respectRobots?: boolean;
  /** Business context that sharpens the checks and the strategy output. */
  businessType?: string;
  industry?: string;
  locations?: string[];
  competitors?: string[];
  targetKeywords?: string[];
  brandName?: string;
};
