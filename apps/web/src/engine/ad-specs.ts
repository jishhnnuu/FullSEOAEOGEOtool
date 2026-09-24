/**
 * Placements, safe zones and character limits, in the browser.
 *
 * The data is generated from `analysis/ad_specs.py`; this is the logic over
 * it. A crop is decided once and seen a hundred thousand times, so the safe
 * zone is drawn on the preview before anybody approves anything. Nearly half
 * a Reels frame is platform interface, and an advert that does not know that
 * puts its price behind the caption.
 */

import { PLACEMENTS, PLACEMENT_BY_KEY, type Placement } from "./ads.generated";

export { PLACEMENTS, type Placement };

export function placement(key: string): Placement | undefined {
  return PLACEMENT_BY_KEY.get(key);
}

export function forPlatform(platformKey: string): Placement[] {
  return PLACEMENTS.filter((p) => p.platform === platformKey);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function ratioLabel(width: number, height: number): string {
  const g = gcd(width, height) || 1;
  return `${width / g}:${height / g}`;
}

export function ratioOf(p: Placement): number {
  return p.width / p.height;
}

/**
 * Every distinct image a campaign on these platforms needs.
 *
 * Distinct means distinct dimensions. One 1080 by 1920 render serves Meta
 * Stories, TikTok and Shorts, so it is produced once and the tightest safe
 * zone of the three is applied to it.
 */
export function requiredRenders(platformKeys: string[]): Placement[] {
  const wanted = PLACEMENTS.filter((p) => platformKeys.includes(p.platform) && !p.video && p.width > 0);
  const seen = new Map<string, Placement>();

  for (const p of wanted) {
    const size = `${p.width}x${p.height}`;
    const held = seen.get(size);
    if (!held) {
      seen.set(size, p);
      continue;
    }
    const shared = held.formats.filter((f) => p.formats.includes(f));
    seen.set(size, {
      key: `shared_${size}`,
      platform: "shared",
      name: `${held.name}, also ${p.name}`,
      width: p.width,
      height: p.height,
      safeTop: Math.max(held.safeTop, p.safeTop),
      safeBottom: Math.max(held.safeBottom, p.safeBottom),
      safeLeft: Math.max(held.safeLeft, p.safeLeft),
      safeRight: Math.max(held.safeRight, p.safeRight),
      maxMb: Math.min(held.maxMb, p.maxMb),
      formats: shared.length ? shared : held.formats,
      video: false,
      textLimits: {},
      note: "One render covers both, using the tighter safe zone of the two.",
    });
  }

  return [...seen.values()].sort((a, b) => b.width * b.height - a.width * a.height || a.key.localeCompare(b.key));
}

export type SpecProblem = { field: string; problem: string; fix: string; blocking: boolean };

/** Character limits, checked before the platform truncates them silently. */
export function checkCopy(place: Placement, copy: Record<string, string>): SpecProblem[] {
  const out: SpecProblem[] = [];
  for (const [name, limit] of Object.entries(place.textLimits)) {
    const value = (copy[name] ?? "").trim();
    if (!value) continue;
    if (value.length > limit) {
      const over = value.length - limit;
      out.push({
        field: name,
        problem:
          `${value.length} characters against a ${limit} limit, so ${over} would be cut, leaving ` +
          `“${value.slice(0, limit).trimEnd()}…”`,
        fix: `Cut ${over} characters. The platform will not warn you; it truncates.`,
        blocking: true,
      });
    } else if (value.length > limit * 0.95) {
      out.push({
        field: name,
        problem: `${value.length} of ${limit} characters, which fits but leaves no room for a longer rendering on a narrow screen.`,
        fix: "Shorten it slightly, or check it on a phone preview.",
        blocking: false,
      });
    }
  }
  return out;
}

/** Whether an asset can be uploaded at all, checked before it is sent. */
export function checkAsset(place: Placement, width: number, height: number, sizeMb: number, fmt: string): SpecProblem[] {
  const out: SpecProblem[] = [];
  if (place.width === 0) return out;

  const clean = fmt.toLowerCase().replace(/^\./, "");
  if (!place.formats.includes(clean)) {
    out.push({
      field: "format",
      problem: `${fmt} is not accepted here. This placement takes ${place.formats.join(", ")}.`,
      fix: `Convert to ${place.formats[0]}.`,
      blocking: true,
    });
  }

  if (sizeMb > place.maxMb) {
    out.push({
      field: "size",
      problem: `${sizeMb.toFixed(1)} MB against a ${place.maxMb.toFixed(0)} MB ceiling.`,
      fix: "Re-encode. A lower quality setting is invisible at feed size and halves the file.",
      blocking: true,
    });
  }

  if (width <= 0 || height <= 0) return out;

  const target = ratioOf(place);
  const drift = Math.abs(width / height - target) / target;
  if (drift > 0.02) {
    out.push({
      field: "ratio",
      problem: `${ratioLabel(width, height)} against the ${ratioLabel(place.width, place.height)} this placement wants.`,
      fix: "Re-crop rather than stretch. A stretched face is noticed and a cropped one is not.",
      blocking: drift > 0.15,
    });
  }

  if (width < place.width) {
    out.push({
      field: "resolution",
      problem:
        `${width} pixels wide against a recommended ${place.width}. It will be upscaled and will look ` +
        "soft next to competitors who supplied the right size.",
      fix: `Supply at least ${place.width} by ${place.height}.`,
      blocking: width < place.width * 0.5,
    });
  }
  return out;
}

export type SafeBox = { x: number; y: number; width: number; height: number; coveredFraction: number };

/**
 * The rectangle inside a placement that is never covered by platform UI.
 *
 * In pixels, so it can be drawn on the preview. An advert whose product,
 * price or logo sits outside this box is an advert that partially does not
 * exist, and the preview in every ad manager shows it looking fine.
 */
export function safeBox(place: Placement): SafeBox {
  const w = 1 - place.safeLeft - place.safeRight;
  const h = 1 - place.safeTop - place.safeBottom;
  return {
    x: Math.round(place.width * place.safeLeft),
    y: Math.round(place.height * place.safeTop),
    width: Math.round(place.width * w),
    height: Math.round(place.height * h),
    coveredFraction: Math.round((1 - w * h) * 1000) / 1000,
  };
}
