"use client";

import { useEffect, useState } from "react";

import { sprigSvg } from "@/components/sprig/art";
import "@/components/sprig/sprig.css";
import "./crew.css";

/*
 * Two scenes and a single assistant, all built from the same character.
 *
 *  - RoundTable: the agency. The CMO in a suit stands at the whiteboard; the
 *    four specialists sit round the table nodding, writing and chipping in.
 *  - LabScene: Thymelab. The same crew in lab coats and goggles: one typing,
 *    one holding up a bubbling flask, one at the microscope, one dashing past.
 *  - LabBuddy: one scientist beside a tool's headline, with that tool's prop.
 *
 * Their lines are short and friendly. No numbers, no commands, no teasing,
 * the same rules as the flying crew on the service pages.
 */

type Variant = "search" | "content" | "social" | "paid";
type Role = "crew" | "cmo" | "scientist";

function Actor({
  role,
  variant,
  x,
  y,
  h,
  className = "",
}: {
  role: Role;
  variant?: Variant;
  x: number;
  y: number;
  h: number;
  className?: string;
}) {
  const classes = ["sprig", "crew-actor", role === "cmo" ? "cmo" : "", role === "scientist" ? "scientist" : "", variant ? `v-${variant}` : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={classes}
      style={{ left: `${x}%`, top: `${y}%`, ["--h" as string]: `${h}cqw` }}
      dangerouslySetInnerHTML={{ __html: `<div class="sprig-body">${sprigSvg(role)}</div>` }}
    />
  );
}

/** Cycle through a script of lines, one speaker at a time. */
function useBeat(length: number, ms = 3200): { index: number; visible: boolean } {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    let i = 0;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      setIndex(i % length);
      setVisible(true);
      hide = setTimeout(() => setVisible(false), ms - 600);
      i += 1;
    };
    const first = setTimeout(show, 900);
    const timer = setInterval(show, ms);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      if (hide) clearTimeout(hide);
    };
  }, [length, ms]);
  return { index, visible };
}

/* ------------------------------------------------------ the round table */

type Seat = { key: "cmo" | Variant; x: number; y: number; h: number; bubbleY: number; cls: string };

const SEATS: Seat[] = [
  { key: "social", x: 13, y: 73, h: 24, bubbleY: 40, cls: "look-r d1" },
  { key: "search", x: 31, y: 69, h: 24, bubbleY: 36, cls: "nod d2" },
  { key: "cmo", x: 50, y: 66, h: 27, bubbleY: 29, cls: "present" },
  { key: "content", x: 69, y: 69, h: 24, bubbleY: 36, cls: "write look-down d3" },
  { key: "paid", x: 87, y: 73, h: 24, bubbleY: 40, cls: "nod look-l d1" },
];

const TABLE_TALK: { who: Seat["key"]; line: string }[] = [
  { who: "cmo", line: "Morning, team. New client today!" },
  { who: "search", line: "Ooh, I'll look at their website." },
  { who: "cmo", line: "Content, what are we thinking?" },
  { who: "content", line: "Already jotting down ideas." },
  { who: "paid", line: "Ads only where we can measure them." },
  { who: "social", line: "I'll see what their rivals post." },
  { who: "cmo", line: "Lovely. Let's make them proud." },
];

export function RoundTable() {
  const { index, visible } = useBeat(TABLE_TALK.length);
  const beat = TABLE_TALK[index];
  const speaker = SEATS.find((s) => s.key === beat.who)!;
  return (
    <div className="crew-scene rt-scene" aria-hidden="true">
      <svg className="rt-board" viewBox="0 0 100 76" preserveAspectRatio="none">
        <rect x="29" y="3" width="42" height="27" rx="2.2" fill="#ffffff" stroke="#16130f" strokeWidth="0.7" />
        <rect x="29" y="3" width="42" height="3.2" rx="1.2" fill="#a9ebcf" stroke="#16130f" strokeWidth="0.5" />
        <path className="rt-line" d="M33 24 L40 20 L46 22 L53 14 L60 16 L67 9" fill="none" stroke="#0e6b4a" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <g fill="#cdbdff" stroke="#16130f" strokeWidth="0.35">
          <rect x="33" y="25.5" width="3" height="2.5" />
          <rect x="37.5" y="24" width="3" height="4" />
          <rect x="42" y="22.5" width="3" height="5.5" />
        </g>
        <path d="M59 26 H67 M59 27.8 H64" stroke="#8d8376" strokeWidth="0.6" strokeLinecap="round" />
      </svg>

      {SEATS.map((seat) => (
        <Actor
          key={seat.key}
          role={seat.key === "cmo" ? "cmo" : "crew"}
          variant={seat.key === "cmo" ? undefined : seat.key}
          x={seat.x}
          y={seat.y}
          h={seat.h}
          className={`${seat.cls}${visible && beat.who === seat.key ? " talking" : ""}`}
        />
      ))}

      <svg className="rt-table" viewBox="0 0 100 76" preserveAspectRatio="none">
        <ellipse cx="50" cy="70.5" rx="44" ry="4" fill="rgba(0,0,0,0.12)" />
        <path d="M3 56 V60.5 C3 66.5 24 71.5 50 71.5 C76 71.5 97 66.5 97 60.5 V56 Z" fill="#c98a4b" stroke="#16130f" strokeWidth="0.7" />
        <ellipse cx="50" cy="56" rx="47" ry="11" fill="#e8b27a" stroke="#16130f" strokeWidth="0.7" />
        <ellipse cx="50" cy="56" rx="40" ry="8.2" fill="none" stroke="rgba(22,19,15,0.12)" strokeWidth="0.5" />
        {/* Notepads, a laptop, papers and coffee. */}
        <g stroke="#16130f" strokeWidth="0.45" strokeLinejoin="round">
          <path d="M26.5 52.2 L34 51.3 L35 55 L27.3 56 Z" fill="#fff" />
          <path d="M64.8 51.2 L72.5 52 L71.9 55.8 L64 55 Z" fill="#fff" />
          <path d="M66 52.6 L70.6 53 M65.8 53.9 L69.8 54.3" stroke="#8d8376" strokeWidth="0.35" />
          <path d="M44 58 L55 57.4 L55.6 61 L44.4 61.6 Z" fill="#fff9ef" />
          <path d="M45.8 59 L53 58.6 M46 60.3 L51.6 60" stroke="#8d8376" strokeWidth="0.35" />
          <path d="M8 55 L18 54.4 L18.4 57.6 L8.4 58.2 Z" fill="#2b2620" />
          <path d="M9.2 50 L17.4 49.6 L18 54.4 L8 55 Z" fill="#3a332b" />
          <circle cx="13.2" cy="52.2" r="0.8" fill="#d4f55a" stroke="none" />
          <rect x="84.5" y="53.2" width="4.2" height="4.2" rx="0.9" fill="#ff6b4a" />
          <path d="M88.7 54.4 C90 54.4 90 56.4 88.7 56.4" fill="none" />
        </g>
        <path className="rt-steam" d="M86 52.2 C85.2 51 86.8 50.2 86 49" fill="none" stroke="#8d8376" strokeWidth="0.45" strokeLinecap="round" />
        <path className="rt-steam s2" d="M87.4 52.2 C86.6 51 88.2 50.2 87.4 49" fill="none" stroke="#8d8376" strokeWidth="0.45" strokeLinecap="round" />
      </svg>

      <div
        className={`crew-bubble${visible ? " show" : ""}`}
        style={{ left: `${Math.min(80, Math.max(20, speaker.x))}%`, top: `${speaker.bubbleY}%` }}
      >
        {beat.line}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the lab */

type LabSpot = { key: string; x: number; bubbleY: number };

const LAB_SPOTS: LabSpot[] = [
  { key: "typer", x: 20, bubbleY: 47 },
  { key: "flask", x: 52, bubbleY: 42 },
  { key: "micro", x: 79, bubbleY: 47 },
];

const LAB_TALK: { who: string; line: string }[] = [
  { who: "typer", line: "I'm excited to optimise your website with you!" },
  { who: "flask", line: "Ooh, something's bubbling!" },
  { who: "micro", line: "Fresh data. My favourite." },
  { who: "typer", line: "Every page, checked twice." },
  { who: "flask", line: "This one's going to be good." },
  { who: "micro", line: "Let's see what Google sees." },
];

export function LabScene() {
  const { index, visible } = useBeat(LAB_TALK.length, 3000);
  const beat = LAB_TALK[index];
  const spot = LAB_SPOTS.find((s) => s.key === beat.who)!;
  return (
    <div className="crew-scene lab-scene" aria-hidden="true">
      <svg className="ls-room" viewBox="0 0 100 78" preserveAspectRatio="none">
        {/* Shelves of glowing jars. */}
        <g stroke="#eef5e8" strokeOpacity="0.35" strokeWidth="0.5">
          <path d="M4 16 H40 M4 30 H40" />
        </g>
        <g strokeWidth="0.45" stroke="#eef5e8" strokeOpacity="0.6">
          <rect x="6" y="9" width="4" height="7" rx="1" fill="#d4f55a" fillOpacity="0.55" className="ls-glow" />
          <rect x="11.5" y="11" width="3.5" height="5" rx="1" fill="#b9a6ff" fillOpacity="0.55" />
          <path d="M18 16 L19.5 11 V8.5 H21.5 V11 L23 16 Z" fill="#5ee6d2" fillOpacity="0.55" className="ls-glow" />
          <rect x="26" y="10" width="5" height="6" rx="1.5" fill="#ff8fbd" fillOpacity="0.5" />
          <rect x="33" y="8" width="3" height="8" rx="1" fill="#ffbf5e" fillOpacity="0.5" />
          <rect x="7" y="23.5" width="6" height="6.5" rx="1.2" fill="#ffbf5e" fillOpacity="0.45" />
          <path d="M16 30 L17.8 25 V22.5 H19.8 V25 L21.6 30 Z" fill="#d4f55a" fillOpacity="0.55" />
          <rect x="25" y="24" width="3.5" height="6" rx="1" fill="#5ee6d2" fillOpacity="0.5" className="ls-glow" />
          <rect x="31" y="22" width="6" height="8" rx="1.4" fill="#b9a6ff" fillOpacity="0.45" />
        </g>
        {/* The wall monitor. */}
        <rect x="57" y="5" width="38" height="25" rx="2" fill="#060908" stroke="#eef5e8" strokeOpacity="0.45" strokeWidth="0.5" />
        <path d="M60 25 H92" stroke="#eef5e8" strokeOpacity="0.15" strokeWidth="0.4" />
        <path className="ls-chart" d="M60 24 L65 21 L69 22.5 L74 16 L79 17.5 L84 11 L91 9" fill="none" stroke="#d4f55a" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="61" cy="8" r="0.8" fill="#8fe3b0" />
        <path d="M63 8 H72" stroke="#eef5e8" strokeOpacity="0.4" strokeWidth="0.6" strokeLinecap="round" />
        <path d="M76 36 V30" stroke="#eef5e8" strokeOpacity="0.2" strokeWidth="0.6" />
      </svg>

      <div className="ls-runner">
        <Actor role="scientist" variant="paid" x={0} y={57} h={17} className="d2" />
      </div>

      <Actor role="scientist" variant="search" x={20} y={83} h={26} className={`type look-r d1${visible && beat.who === "typer" ? " talking" : ""}`} />
      <Actor role="scientist" variant="content" x={52} y={83} h={26} className={`raise happy d2${visible && beat.who === "flask" ? " talking" : ""}`} />
      <Actor role="scientist" variant="social" x={79} y={83} h={26} className={`peer look-down d3${visible && beat.who === "micro" ? " talking" : ""}`} />

      <svg className="ls-bench" viewBox="0 0 100 78" preserveAspectRatio="none">
        {/* The bench. */}
        <rect x="1" y="58" width="98" height="3.2" rx="0.8" fill="#26302a" stroke="#d4f55a" strokeOpacity="0.5" strokeWidth="0.35" />
        <rect x="3" y="61.2" width="94" height="16.8" fill="#151c18" stroke="#eef5e8" strokeOpacity="0.12" strokeWidth="0.35" />
        <g stroke="#eef5e8" strokeOpacity="0.25" strokeWidth="0.35">
          <path d="M34 61.2 V78 M66 61.2 V78" />
          <path d="M16 67 H22 M47 67 H53 M78 67 H84" strokeLinecap="round" strokeWidth="0.7" />
        </g>
        {/* The laptop, side on, screen glowing. */}
        <path d="M28 58 L41 58 L40 57.4 L29 57.4 Z" fill="#3a332b" stroke="#eef5e8" strokeOpacity="0.5" strokeWidth="0.3" />
        <path d="M30 57.4 L39.5 57.4 L41.8 46 L32.3 46 Z" fill="#060908" stroke="#eef5e8" strokeOpacity="0.55" strokeWidth="0.35" />
        <rect className="ls-screen-line" x="33.2" y="48.5" width="6" height="0.8" rx="0.4" fill="#d4f55a" />
        <rect className="ls-screen-line l2" x="33" y="50.8" width="4.6" height="0.8" rx="0.4" fill="#8fe3b0" />
        <rect className="ls-screen-line l3" x="32.6" y="53.1" width="5.4" height="0.8" rx="0.4" fill="#b9a6ff" />
        {/* The flask, held up and bubbling. */}
        <g transform="translate(60.5 44)">
          <path d="M-1.3 -8 V-4.5 L-4.6 1.6 C-5.2 2.8 -4.5 3.8 -3.3 3.8 H3.3 C4.5 3.8 5.2 2.8 4.6 1.6 L1.3 -4.5 V-8 Z" fill="#0f1512" stroke="#eef5e8" strokeWidth="0.45" strokeLinejoin="round" />
          <path d="M-3.9 0.4 H3.9 L4.6 1.6 C5.2 2.8 4.5 3.8 3.3 3.8 H-3.3 C-4.5 3.8 -5.2 2.8 -4.6 1.6 Z" fill="#b9a6ff" className="ls-glow" />
          <circle className="ls-bubble" cx="-1" cy="-1" r="0.7" fill="#b9a6ff" />
          <circle className="ls-bubble b2" cx="1" cy="-2" r="0.5" fill="#b9a6ff" />
          <circle className="ls-bubble b3" cx="0" cy="-4" r="0.6" fill="#b9a6ff" />
        </g>
        {/* The microscope. */}
        <g stroke="#eef5e8" strokeWidth="0.45" strokeLinejoin="round" strokeLinecap="round">
          <rect x="84" y="56.2" width="10" height="1.8" rx="0.6" fill="#26302a" />
          <path d="M92 56.2 V49 C92 46 89.6 44.4 87.6 45.2" fill="none" strokeWidth="1.2" />
          <path d="M85.6 44.2 L88.8 42.4 L90.4 45.2 L87.2 47 Z" fill="#5ee6d2" fillOpacity="0.7" />
          <path d="M87.8 48.4 L86.6 52.6" strokeWidth="0.9" />
          <rect x="85" y="52.6" width="6" height="1.1" rx="0.4" fill="#26302a" />
        </g>
        {/* A tray of test tubes in front. */}
        <g className="ls-front" stroke="#eef5e8" strokeOpacity="0.55" strokeWidth="0.35">
          <rect x="6" y="55.5" width="12" height="2.5" rx="0.5" fill="#26302a" />
          <rect x="7.5" y="51" width="1.6" height="5" rx="0.8" fill="#d4f55a" fillOpacity="0.8" />
          <rect x="10.5" y="52" width="1.6" height="4" rx="0.8" fill="#ff8fbd" fillOpacity="0.8" />
          <rect x="13.5" y="50.5" width="1.6" height="5.5" rx="0.8" fill="#5ee6d2" fillOpacity="0.8" />
        </g>
      </svg>

      <div className={`crew-bubble${visible ? " show" : ""}`} style={{ left: `${Math.min(78, Math.max(22, spot.x))}%`, top: `${spot.bubbleY}%` }}>
        {beat.line}
      </div>
    </div>
  );
}

/* -------------------------------------------- one scientist per tool */

export type BuddyTool = "seo" | "content" | "social" | "ads" | "website";

const BUDDY: Record<BuddyTool, { variant: Variant; pose: string; lines: string[] }> = {
  seo: {
    variant: "search",
    pose: "inspect happy",
    lines: ["I'm excited to optimise your website with you!", "Let's see what Google sees.", "Ooh, a new site to explore!"],
  },
  content: {
    variant: "content",
    pose: "hold",
    lines: ["Let's find your voice together.", "Words are my favourite thing.", "Ready when you are!"],
  },
  social: {
    variant: "social",
    pose: "hold",
    lines: ["Let's see what's working out there.", "I love a good competitor study!", "Scrolling, but for science."],
  },
  ads: {
    variant: "paid",
    pose: "hold",
    lines: ["Let's make every penny count.", "Maths first, ads second!", "Excited to crunch this with you."],
  },
  website: {
    variant: "search",
    pose: "hold",
    lines: ["Can't wait to build this with you.", "Blueprints are nearly ready!", "Something new is cooking."],
  },
};

function BuddyProp({ tool }: { tool: BuddyTool }) {
  const common = { stroke: "#eef5e8", strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  if (tool === "content") {
    return (
      <svg viewBox="0 0 40 48" style={{ left: "57%", top: "58%", width: "17%" }} className="lb-prop">
        <rect x="4" y="4" width="30" height="40" rx="3" fill="#0f1512" {...common} />
        <path d="M10 14 H28 M10 21 H26 M10 28 H22" stroke="#b9a6ff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M30 26 L38 8 L41 10 L33 28 Z" fill="#b9a6ff" {...common} strokeWidth="1.2" />
      </svg>
    );
  }
  if (tool === "social") {
    return (
      <svg viewBox="0 0 30 48" style={{ left: "58%", top: "56%", width: "13%" }} className="lb-prop">
        <rect x="3" y="3" width="24" height="42" rx="5" fill="#0f1512" {...common} />
        <rect x="7" y="9" width="16" height="10" rx="2" fill="#ff8fbd" fillOpacity="0.8" />
        <path d="M7 24 H23 M7 29 H19" stroke="#ff8fbd" strokeWidth="2" strokeLinecap="round" />
        <path d="M11 37 C11 35 13 34 15 36 C17 34 19 35 19 37 C19 39 15 41 15 41 C15 41 11 39 11 37 Z" fill="#ff8fbd" />
      </svg>
    );
  }
  if (tool === "ads") {
    return (
      <svg viewBox="0 0 40 48" style={{ left: "57%", top: "57%", width: "16%" }} className="lb-prop">
        <rect x="4" y="4" width="30" height="40" rx="4" fill="#0f1512" {...common} />
        <rect x="9" y="9" width="20" height="9" rx="2" fill="#ffbf5e" fillOpacity="0.85" />
        <g fill="#ffbf5e" fillOpacity="0.7">
          <circle cx="12" cy="25" r="2.2" /><circle cx="19" cy="25" r="2.2" /><circle cx="26" cy="25" r="2.2" />
          <circle cx="12" cy="32" r="2.2" /><circle cx="19" cy="32" r="2.2" /><circle cx="26" cy="32" r="2.2" />
          <circle cx="12" cy="39" r="2.2" /><circle cx="19" cy="39" r="2.2" /><circle cx="26" cy="39" r="2.2" />
        </g>
      </svg>
    );
  }
  if (tool === "website") {
    return (
      <svg viewBox="0 0 52 40" style={{ left: "55%", top: "58%", width: "21%" }} className="lb-prop">
        <rect x="3" y="3" width="46" height="34" rx="3" fill="#0f1512" {...common} />
        <path d="M3 10 H49" {...common} />
        <circle cx="8" cy="6.5" r="1.2" fill="#5ee6d2" /><circle cx="12" cy="6.5" r="1.2" fill="#5ee6d2" />
        <rect x="8" y="14" width="18" height="10" rx="1.5" fill="#5ee6d2" fillOpacity="0.8" />
        <path d="M30 15 H44 M30 20 H40 M8 29 H44" stroke="#5ee6d2" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

export function LabBuddy({ tool }: { tool: BuddyTool }) {
  const buddy = BUDDY[tool];
  const { index, visible } = useBeat(buddy.lines.length, 3600);
  return (
    <div className={`crew-scene lab-buddy tone-${tool}`} aria-hidden="true">
      <div className="lb-glow" />
      <div className="lb-floor" />
      <Actor role="scientist" variant={buddy.variant} x={50} y={92} h={62} className={`${buddy.pose} bounce${visible ? " talking" : ""}`} />
      <BuddyProp tool={tool} />
      <div className={`crew-bubble${visible ? " show" : ""}`} style={{ left: "50%", top: "22%" }}>
        {buddy.lines[index]}
      </div>
    </div>
  );
}
