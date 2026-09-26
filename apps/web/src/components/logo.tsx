/**
 * The mark: a stopwatch whose hands are thyme leaves, with a sprout for its
 * crown. Thyme, now. Drawn in ink, a face colour and a leaf colour, and kept
 * as inline SVG so it needs no request and stays sharp at every size. The face
 * and leaf read `--logo-face` and `--logo-leaf`, so the agency pages can print
 * it in their own palette while everywhere else keeps lime and thyme green.
 * `app/icon.svg` is the same drawing, for the browser tab.
 */
const FACE = { fill: "var(--logo-face, #D4F55A)" };
const LEAF = { fill: "var(--logo-leaf, #0E6B4A)" };
const VEIN = { stroke: "var(--logo-face, #D4F55A)" };

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`logo-mark ${className}`}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 5.2 V2.6" stroke="#16130F" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M16.3 3.2 C17.6 1.2 20 0.9 21.6 1.9 C20.6 3.6 18.4 4.4 16.3 3.2 Z"
        style={LEAF}
        stroke="#16130F"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="18" r="12.4" style={FACE} stroke="#16130F" strokeWidth="2.3" />
      <g fill="#16130F">
        <circle cx="26" cy="18" r="1" />
        <circle cx="16" cy="28" r="1" />
        <circle cx="6" cy="18" r="1" />
      </g>
      <path
        d="M16 18.6 C12.2 15 12.4 10.4 16 7 C19.6 10.4 19.8 15 16 18.6 Z"
        style={LEAF}
        stroke="#16130F"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <path d="M16 17 V9.6" style={VEIN} strokeWidth="0.8" strokeLinecap="round" />
      <g transform="rotate(60 16 18)">
        <path
          d="M16 18.6 C13.3 16 13.4 12.8 16 10.4 C18.6 12.8 18.7 16 16 18.6 Z"
          style={LEAF}
          stroke="#16130F"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
        <path d="M16 17 V12.4" style={VEIN} strokeWidth="0.7" strokeLinecap="round" />
      </g>
      <circle cx="16" cy="18" r="1.7" fill="#16130F" />
    </svg>
  );
}
