/**
 * The crew's drawing, as one SVG in a 120 x 150 box with the feet on the
 * bottom edge. Every moving part is its own group so the stylesheet can pose
 * it: legs, arms, the sprout on the head, the eyes and the props.
 *
 * Every desk has its own crew member, and like a row of minions they are the
 * same character with one small difference each: the colour of their shoes,
 * and one accessory. The stylesheet shows the right ones for the variant
 * class, so one drawing serves the whole crew.
 *
 * The CMO is the same character again in a suit and glasses, so he reads as
 * the boss checking in rather than as a different mascot.
 */

const SUIT = `
  <g class="s-suit">
    <path class="s-jacket" d="M24.5 95 C27 110 41 120 60 120 C79 120 93 110 95.5 95 L70 95 L60 111 L50 95 Z"/>
    <path class="s-shirt" d="M50 95 L60 111 L70 95 Z"/>
    <path class="s-lapel" d="M50 95 L56 105 M70 95 L64 105"/>
    <path class="s-pocket" d="M77 102 L85 102 L83 98.5 L80.5 101 L78.5 98.5 Z"/>
    <circle class="s-button" cx="60" cy="115.5" r="1.7"/>
  </g>`;

const GLASSES = `
      <g class="s-glasses"><circle cx="48" cy="67" r="11.5"/><circle cx="72" cy="67" r="11.5"/><path d="M59.5 66 Q60 63.5 60.5 66"/></g>`;

/*
 * Thymelab's scientists: the same character in a lab coat, with goggles
 * pushed up on the forehead so the eyes stay free to look excited.
 */
const COAT = `
  <g class="s-coat">
    <path class="s-coat-body" d="M23.6 88 C24.5 108 39 120.5 60 120.5 C81 120.5 95.5 108 96.4 88 L72 90 L60 106 L48 90 Z"/>
    <path class="s-coat-collar" d="M48 90 L60 106 L52 108 L43 92 Z M72 90 L60 106 L68 108 L77 92 Z"/>
    <path class="s-coat-line" d="M60 106 V120"/>
    <rect class="s-coat-pocket" x="70" y="104" width="12" height="9" rx="2"/>
    <path class="s-coat-pen" d="M73 104 V99 M78 104 V100.5"/>
  </g>`;

const GOGGLES = `
  <g class="s-goggles">
    <path class="s-goggle-band" d="M26 47 Q60 38 94 47"/>
    <circle class="s-goggle" cx="47" cy="43.5" r="8"/>
    <circle class="s-goggle" cx="73" cy="43.5" r="8"/>
    <path class="s-goggle-glint" d="M43 40 Q45 38 48 38.5 M69 40 Q71 38 74 38.5"/>
  </g>`;

/** Hats sit behind the sprout, so the sprout pokes through. */
const HATS = `
    <g class="s-acc s-beret"><path d="M31 41 Q58 17 90 38 Q62 47 31 41 Z"/><circle cx="62" cy="27" r="3"/></g>
    <g class="s-acc s-cap"><path class="s-cap-dome" d="M33 45 Q35 26 60 26 Q85 26 87 45 Z"/><path class="s-cap-brim" d="M35 43 Q21 41 14 47 Q25 50 37 47 Z"/></g>`;

const BOW = `
      <g class="s-acc s-bow"><path d="M60 22 L50 15 L50 29 Z M60 22 L70 15 L70 29 Z"/><circle cx="60" cy="22" r="2.8"/></g>`;

export function sprigSvg(role: "crew" | "cmo" | "scientist"): string {
  const cmo = role === "cmo";
  const sci = role === "scientist";
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
    <path class="s-vein" d="M60 36 Q57 46 58 54"/>${cmo ? SUIT : sci ? COAT + GOGGLES : HATS}
    <g class="s-sprout">
      <path class="s-stem" d="M60 31 C60 24 58 18 61 11"/>
      <path class="s-leaf" d="M60 21 C51 12 42 14 39 20 C46 27 54 27 60 21 Z"/>
      <path class="s-leaf" d="M61 12 C69 2 80 4 84 10 C78 18 68 18 61 12 Z"/>${cmo ? "" : BOW}
    </g>
    <g class="s-face">
      <g class="s-eyes">
        <ellipse class="s-eyewhite" cx="48" cy="67" rx="8" ry="10"/>
        <ellipse class="s-eyewhite" cx="72" cy="67" rx="8" ry="10"/>
        <g class="s-pupils"><circle cx="49.5" cy="69" r="4.3"/><circle cx="73.5" cy="69" r="4.3"/><circle class="s-shine" cx="51.2" cy="67" r="1.4"/><circle class="s-shine" cx="75.2" cy="67" r="1.4"/></g>
      </g>
      <g class="s-closed"><path d="M41 69 Q48 74 55 69"/><path d="M65 69 Q72 74 79 69"/></g>
      <g class="s-happy"><path d="M41 71 Q48 62 55 71"/><path d="M65 71 Q72 62 79 71"/></g>${cmo ? GLASSES : ""}
      <ellipse class="s-cheek" cx="37" cy="84" rx="6" ry="3.5"/>
      <ellipse class="s-cheek" cx="83" cy="84" rx="6" ry="3.5"/>
      <path class="s-mouth" d="M53 85 Q60 91 67 85"/>
      <path class="s-mouth-open" d="M52 84 Q60 97 68 84 Z"/>
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

export function actorMarkup(role: "crew" | "cmo" | "scientist"): string {
  return `<div class="sprig-body">${sprigSvg(role)}</div>
<div class="sprig-ui"><div class="sprig-bubble"></div><div class="sprig-placard"></div><span class="sprig-zzz">z</span><span class="sprig-zzz b">z</span></div>`;
}
