/**
 * Sprig's drawing, as one SVG in a 120 x 150 box with his feet on the bottom
 * edge. Every moving part is its own group so the stylesheet can pose it:
 * legs, arms, the sprout on his head, the eyes and the props.
 *
 * The CMO is the same character in a suit. Same walk, same face, so a visitor
 * reads him as a colleague rather than a second mascot.
 */

const SUIT = `
  <g class="s-suit">
    <path class="s-jacket" d="M24 80 C24 104 39 120 60 120 C81 120 96 104 96 80 L72 80 L60 104 L48 80 Z"/>
    <path class="s-shirt" d="M48 80 L60 104 L72 80 Z"/>
    <path class="s-tie" d="M57 82 H63 L64.5 97 L60 103 L55.5 97 Z"/>
    <path class="s-lapel" d="M48 80 L55 95 M72 80 L65 95"/>
    <path class="s-pocket" d="M78 92 L86 92 L84 88 L81 91 L79 88 Z"/>
    <circle class="s-button" cx="60" cy="111" r="1.8"/>
  </g>`;

export function sprigSvg(variant: "sprig" | "cmo"): string {
  const suit = variant === "cmo" ? SUIT : "";
  return `
<svg viewBox="0 0 120 150" aria-hidden="true" focusable="false">
  <ellipse class="s-shadow" cx="60" cy="147" rx="27" ry="3.5"/>
  <g class="s-legs">
    <g class="s-leg s-leg-l"><path class="s-limb" d="M50 116 V135"/><path class="s-shoe" d="M37 141 Q37 131 47 131 Q56 131 56 141 Z"/><path class="s-sole" d="M40 141 H54"/></g>
    <g class="s-leg s-leg-r"><path class="s-limb" d="M70 116 V135"/><path class="s-shoe" d="M64 141 Q64 131 73 131 Q83 131 83 141 Z"/><path class="s-sole" d="M66 141 H80"/></g>
  </g>
  <g class="s-bodyall">
    <g class="s-arm s-arm-l"><path class="s-limb" d="M31 86 Q22 98 24 110"/><circle class="s-hand" cx="24" cy="112" r="6"/></g>
    <path class="s-body" d="M60 30 C88 30 98 58 97 84 C96 108 81 120 60 120 C39 120 24 108 23 84 C22 58 32 30 60 30 Z"/>
    <ellipse class="s-belly" cx="60" cy="97" rx="21" ry="16"/>
    <path class="s-vein" d="M60 36 Q57 46 58 54"/>${suit}
    <g class="s-sprout">
      <path class="s-stem" d="M60 31 C60 24 58 18 61 11"/>
      <path class="s-leaf" d="M60 21 C51 12 42 14 39 20 C46 27 54 27 60 21 Z"/>
      <path class="s-leaf" d="M61 12 C69 2 80 4 84 10 C78 18 68 18 61 12 Z"/>
    </g>
    <g class="s-face">
      <g class="s-eyes">
        <ellipse class="s-eyewhite" cx="48" cy="67" rx="8" ry="10"/>
        <ellipse class="s-eyewhite" cx="72" cy="67" rx="8" ry="10"/>
        <g class="s-pupils"><circle cx="49.5" cy="69" r="4.3"/><circle cx="73.5" cy="69" r="4.3"/><circle class="s-shine" cx="51.2" cy="67" r="1.4"/><circle class="s-shine" cx="75.2" cy="67" r="1.4"/></g>
      </g>
      <g class="s-closed"><path d="M41 69 Q48 74 55 69"/><path d="M65 69 Q72 74 79 69"/></g>
      <g class="s-happy"><path d="M41 71 Q48 62 55 71"/><path d="M65 71 Q72 62 79 71"/></g>
      <ellipse class="s-cheek" cx="37" cy="82" rx="6" ry="3.5"/>
      <ellipse class="s-cheek" cx="83" cy="82" rx="6" ry="3.5"/>
      <path class="s-mouth" d="M53 83 Q60 90 67 83"/>
      <path class="s-mouth-open" d="M52 82 Q60 96 68 82 Z"/>
    </g>
    <g class="s-arm s-arm-r">
      <g class="s-prop s-prop-sign"><path class="s-stick" d="M96 112 L112 172"/></g>
      <path class="s-limb" d="M89 86 Q98 98 96 110"/>
      <g class="s-prop s-prop-mag"><path class="s-stick" d="M96 113 L102 125"/><circle class="s-lens" cx="106" cy="134" r="10"/><path class="s-glint" d="M101 131 Q103 127 108 127"/></g>
      <circle class="s-hand" cx="96" cy="112" r="6"/>
    </g>
  </g>
</svg>`;
}

/** The little broken link he finds on the line and mends. */
export const BUG_SVG = `<svg viewBox="0 0 34 22" aria-hidden="true" focusable="false"><rect x="1.5" y="4" width="14" height="11" rx="5.5" fill="#ff6b4a" stroke="#16130f" stroke-width="2.5"/><rect x="18.5" y="4" width="14" height="11" rx="5.5" fill="#ff6b4a" stroke="#16130f" stroke-width="2.5"/><path d="M15 2 L19 18" stroke="#16130f" stroke-width="2.5" stroke-linecap="round"/></svg>`;

export function actorMarkup(variant: "sprig" | "cmo"): string {
  return `<div class="sprig-body">${sprigSvg(variant)}</div>
<div class="sprig-ui"><div class="sprig-bubble"></div><div class="sprig-placard"></div><span class="sprig-zzz">z</span><span class="sprig-zzz b">z</span></div>`;
}
