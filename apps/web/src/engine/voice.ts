/**
 * Measured voice, in the browser.
 *
 * A port of `packages/seoos/analysis/voice.py`, deliberately kept line for
 * line where it can be, because the two engines must not disagree about what
 * a rhythm of 0.34 means. Everything here is arithmetic over text: no model
 * call, no key, no network. That matters because the product's whole claim on
 * tone is that a recommendation to change how a company writes arrives with
 * evidence attached, and a model asked "is this tone right" will always
 * produce a confident answer whether or not it has grounds for one.
 *
 * The two refusals below are worth more than any number the module produces:
 * under 120 words the ratios are noise, and under three readable rivals there
 * is no field to compare against.
 */

const SENTENCE_SPLIT = /[.!?]+(?:\s|$)/;
const WORD = /[A-Za-z']+/g;

/* First person plural is the "we are a company" voice. Second person is the
   "here is what you do" voice. The ratio between them is the most visible
   difference between a brochure and a page worth reading. */
const WE = new Set(["we", "our", "ours", "us", "ourselves"]);
const YOU = new Set(["you", "your", "yours", "yourself", "yourselves"]);
const I = new Set(["i", "my", "mine", "me", "myself"]);

/* Hedges make a sentence survivable in a legal review and useless to a reader. */
const HEDGES = new Set([
  "may", "might", "could", "perhaps", "possibly", "generally", "typically",
  "usually", "often", "sometimes", "arguably", "relatively", "fairly",
  "somewhat", "seemingly", "apparently", "potentially", "largely", "tends",
  "suggests", "appears", "likely", "presumably", "virtually", "essentially",
]);

/* The vocabulary that signals a page written to fill a slot. Shared with the
   humanizer's banned list on purpose: one definition of the tell, used by the
   checker and by the writer, so the two cannot drift apart. */
const FILLER = new Set([
  "leverage", "seamless", "robust", "unlock", "elevate", "delve",
  "synergy", "holistic", "bespoke", "cutting-edge", "best-in-class",
  "world-class", "game-changing", "revolutionary", "innovative",
  "empower", "streamline", "optimize", "optimise", "utilize", "utilise",
  "facilitate", "transformative", "paradigm", "ecosystem", "landscape",
  "journey", "solution", "solutions", "offering", "offerings",
]);

/* Words that carry a fact. A page dense in these is telling you something; a
   page empty of them is describing itself. */
const CONCRETE =
  /\b(\d+(?:\.\d+)?%|[$£€]\d|\d{4}|\d+(?:\.\d+)?\s?(?:x|times|hours?|days?|weeks?|months?|years?|minutes?|seconds?|users?|customers?|clients?))\b/gi;

const PASSIVE =
  /\b(?:is|are|was|were|be|been|being|get|got)\s+(?:\w+ly\s+)?(?:\w+ed|built|made|done|given|taken|seen|known|shown|held|sent|kept|left|found|told|brought|written|driven|chosen)\b/gi;

const DASH = /[—–]/g;

const IMPERATIVES = new Set([
  "use", "add", "check", "read", "start", "stop", "pick", "write", "run",
  "open", "send", "make", "take", "try", "set", "keep", "put", "call",
  "book", "get", "build",
]);

export type Address = "reader-facing" | "company-facing" | "impersonal" | "balanced";

export type VoiceFingerprint = {
  label: string;
  url: string | null;
  words: number;
  sentences: number;
  paragraphs: number;
  sentenceLenMean: number;
  sentenceLenStdev: number;
  sentenceLenMax: number;
  /** Coefficient of variation of sentence length. Human prose: roughly 0.45 to 0.8. */
  rhythm: number;
  readingGrade: number;
  lexicalDensity: number;
  wePer1k: number;
  youPer1k: number;
  iPer1k: number;
  address: Address;
  hedgesPer1k: number;
  fillerPer1k: number;
  concretePer1k: number;
  passiveRatio: number;
  questionRatio: number;
  imperativeRatio: number;
  dashCount: number;
  measured: boolean;
  notes: string[];
};

/** Below this, the ratios are arithmetic rather than evidence. */
export const WORD_FLOOR = 120;
/** Below this many readable rivals, there is no field to compare against. */
export const RIVAL_FLOOR = 3;

function syllables(word: string): number {
  const m = word.toLowerCase().match(/[aeiouy]{1,2}/g);
  return Math.max(m ? m.length : 0, 1);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Population standard deviation, matching Python's statistics.pstdev. */
function pstdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function empty(label: string, url: string | null): VoiceFingerprint {
  return {
    label, url,
    words: 0, sentences: 0, paragraphs: 0,
    sentenceLenMean: 0, sentenceLenStdev: 0, sentenceLenMax: 0, rhythm: 0,
    readingGrade: 0, lexicalDensity: 0,
    wePer1k: 0, youPer1k: 0, iPer1k: 0, address: "impersonal",
    hedgesPer1k: 0, fillerPer1k: 0, concretePer1k: 0,
    passiveRatio: 0, questionRatio: 0, imperativeRatio: 0, dashCount: 0,
    measured: false, notes: [],
  };
}

/**
 * Measure one body of text. Below 120 words the fingerprint reports
 * `measured: false` and says why, rather than printing a number nobody
 * should trust.
 */
export function fingerprint(text: string, label = "", url: string | null = null): VoiceFingerprint {
  const fp = empty(label, url);
  const body = (text || "").trim();
  if (!body) {
    fp.notes.push("No text to measure.");
    return fp;
  }

  const words = body.match(WORD) ?? [];
  fp.words = words.length;
  fp.measured = fp.words >= WORD_FLOOR;
  if (!fp.measured) {
    fp.notes.push(
      `Only ${fp.words} words. Voice ratios need about ${WORD_FLOOR} before they mean anything, so these are not reported as measured.`,
    );
  }

  const sents = body.split(SENTENCE_SPLIT).filter((s) => s.trim());
  fp.sentences = sents.length;
  fp.paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim()).length;

  const lengths = sents
    .map((s) => (s.match(WORD) ?? []).length)
    .filter((n) => n > 0);

  if (lengths.length) {
    fp.sentenceLenMean = mean(lengths);
    fp.sentenceLenStdev = pstdev(lengths);
    fp.sentenceLenMax = Math.max(...lengths);
    fp.rhythm = fp.sentenceLenMean ? fp.sentenceLenStdev / fp.sentenceLenMean : 0;

    const syll = words.reduce((n, w) => n + syllables(w), 0);
    fp.readingGrade = Math.max(
      0,
      0.39 * (fp.words / lengths.length) + 11.8 * (syll / fp.words) - 15.59,
    );
    fp.lexicalDensity = new Set(words.map((w) => w.toLowerCase())).size / fp.words;
  }

  const per1k = (n: number) => (fp.words ? (n / fp.words) * 1000 : 0);
  const lower = words.map((w) => w.toLowerCase());
  const count = (set: Set<string>) => lower.filter((w) => set.has(w)).length;

  fp.wePer1k = per1k(count(WE));
  fp.youPer1k = per1k(count(YOU));
  fp.iPer1k = per1k(count(I));
  fp.hedgesPer1k = per1k(count(HEDGES));
  fp.fillerPer1k = per1k(count(FILLER));
  fp.concretePer1k = per1k((body.match(CONCRETE) ?? []).length);

  if (fp.youPer1k > fp.wePer1k * 1.4) fp.address = "reader-facing";
  else if (fp.wePer1k > fp.youPer1k * 1.4) fp.address = "company-facing";
  else if (fp.wePer1k + fp.youPer1k < 3) fp.address = "impersonal";
  else fp.address = "balanced";

  if (sents.length) {
    fp.passiveRatio = (body.match(PASSIVE) ?? []).length / sents.length;
    fp.questionRatio = (body.match(/\?/g) ?? []).length / sents.length;
    const starts = sents
      .map((s) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "")
      .filter(Boolean);
    const imp = starts.filter((s) => IMPERATIVES.has(s)).length;
    fp.imperativeRatio = starts.length ? imp / starts.length : 0;
  }

  fp.dashCount = (body.match(DASH) ?? []).length;
  return fp;
}

/**
 * What a difference has to be before it is worth telling a client about, set
 * from the spread across ordinary business writing. Anything smaller is inside
 * the noise, and a tool that lists every tiny gap sounds certain about nothing.
 */
export const MATERIAL: Record<string, number> = {
  readingGrade: 2.0,
  sentenceLenMean: 4.0,
  rhythm: 0.12,
  wePer1k: 4.0,
  youPer1k: 4.0,
  hedgesPer1k: 4.0,
  fillerPer1k: 3.0,
  concretePer1k: 3.0,
  passiveRatio: 0.12,
};

const MEANING: Record<string, [string, string]> = {
  readingGrade: ["reads harder than", "reads easier than"],
  sentenceLenMean: ["uses longer sentences than", "uses shorter sentences than"],
  rhythm: ["varies sentence length more than", "is more uniform than"],
  wePer1k: ["talks about itself more than", "talks about itself less than"],
  youPer1k: ["addresses the reader more than", "addresses the reader less than"],
  hedgesPer1k: ["hedges more than", "hedges less than"],
  fillerPer1k: ["uses more marketing filler than", "uses less marketing filler than"],
  concretePer1k: ["carries more specifics than", "carries fewer specifics than"],
  passiveRatio: ["uses more passive voice than", "uses less passive voice than"],
};

const LABEL: Record<string, string> = {
  readingGrade: "Reading grade",
  sentenceLenMean: "Mean sentence length",
  rhythm: "Rhythm",
  wePer1k: "We, per 1,000 words",
  youPer1k: "You, per 1,000 words",
  hedgesPer1k: "Hedges, per 1,000 words",
  fillerPer1k: "Marketing filler, per 1,000 words",
  concretePer1k: "Specifics, per 1,000 words",
  passiveRatio: "Passive voice, per sentence",
};

export type Difference = {
  metric: string;
  label: string;
  site: number;
  rivalMedian: number;
  rivalRange: [number, number];
  gap: number;
  readsAs: string;
  direction: "higher" | "lower";
};

export type VoiceComparison = {
  measured: boolean;
  reason: string | null;
  sampleSize: number;
  differences: Difference[];
  verdict: string | null;
};

/**
 * Compare one site's voice against the pages it competes with. Returns only
 * differences big enough to act on, each carrying both numbers behind it. A
 * recommendation without both numbers is an opinion, and this does not ship
 * opinions as findings.
 */
export function compare(site: VoiceFingerprint, rivals: VoiceFingerprint[]): VoiceComparison {
  const usable = rivals.filter((r) => r.measured);

  if (!site.measured) {
    return {
      measured: false,
      reason: "Not enough text on your own pages to measure a voice. About 120 words on a page is the floor.",
      sampleSize: usable.length,
      differences: [],
      verdict: null,
    };
  }
  if (usable.length < RIVAL_FLOOR) {
    return {
      measured: false,
      reason:
        `Only ${usable.length} comparable page${usable.length === 1 ? "" : "s"} could be measured. ` +
        `${RIVAL_FLOOR} is the floor for calling a difference real rather than one rival's habit.`,
      sampleSize: usable.length,
      differences: [],
      verdict: null,
    };
  }

  const differences: Difference[] = [];
  for (const metric of Object.keys(MATERIAL)) {
    const threshold = MATERIAL[metric];
    const mine = (site as unknown as Record<string, number>)[metric];
    const theirs = usable.map((r) => (r as unknown as Record<string, number>)[metric]);
    const med = median(theirs);
    const gap = mine - med;
    if (Math.abs(gap) < threshold) continue;
    const [higher, lower] = MEANING[metric];
    differences.push({
      metric,
      label: LABEL[metric],
      site: mine,
      rivalMedian: med,
      rivalRange: [Math.min(...theirs), Math.max(...theirs)],
      gap,
      readsAs: gap > 0 ? higher : lower,
      direction: gap > 0 ? "higher" : "lower",
    });
  }

  differences.sort((a, b) => Math.abs(b.gap / MATERIAL[b.metric]) - Math.abs(a.gap / MATERIAL[a.metric]));

  return {
    measured: true,
    reason: null,
    sampleSize: usable.length,
    differences,
    verdict: differences.length
      ? `${differences.length} measured difference${differences.length === 1 ? "" : "s"} from the pages you compete with.`
      : "No material difference from the pages you compete with.",
  };
}
