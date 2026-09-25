/**
 * What the crew decides to do, and where they are allowed to stand.
 *
 * Nobody controls them. A crew member picks the next move at random, follows
 * the reader down the page from one real edge to the next, and reacts to what
 * the reader does (scrolling, hovering a button, leaving the page alone), but
 * never takes a click and never covers text or a button.
 *
 * Three kinds of place to be:
 *  - the seat: the key word of the headline, marked `data-sprig-seat`. The
 *    crew member flies in on a spinning sprout and sits on it. Home base on
 *    pages without a line.
 *  - the line: the black border under a desk page's hero. Walked on, walked
 *    off, walked back from the other side.
 *  - ledges: the top edges of cards, boxes and bands further down, visited
 *    as the reader scrolls.
 *
 * Where they may stand is measured, not hard-coded: every heading line,
 * paragraph line, button, card and the menu bar is an obstacle, and a spot is
 * only used if the body fits between it and whatever is above. Under the hero
 * buttons there is not quite room, so they squash down to squeeze through.
 * Where there is no room at all, they do not go.
 */

import { BUG_SVG } from "./art";
import {
  BUTTON_LINES,
  CMO_VISITS,
  CREW,
  QUESTIONS,
  REMARKS,
  WAKE_LINES,
  greeting,
  pick,
  type Crew,
} from "./lines";

type Box = { l: number; t: number; r: number; b: number };

type Perch = {
  key: string;
  kind: "seat" | "line" | "ledge";
  el: Element;
  ground: number;
  /** Where the feet may stand, as centre x. A seat has one spot. */
  min: number;
  max: number;
  /** Where they may stand and still hold a sign above the head without covering anything. */
  talk: [number, number] | null;
};

type Actor = {
  el: HTMLElement;
  body: HTMLElement;
  bubble: HTMLElement;
  placard: HTMLElement;
  x: number;
  ground: number;
  face: number;
  tilt: number;
  sqx: number;
  sqy: number;
};

const POSES = ["walking", "p-wave", "p-hold", "p-inspect", "p-sit", "p-point", "p-propeller", "p-air", "p-happy", "p-nap", "p-excited", "p-dance", "p-stretch"];
const CREW_KEYS: Crew[] = ["search", "content", "social", "paid"];

const TEXT_SELECTOR = [
  "h1", "h2", "h3", "p", "li", "dt", "dd", "label", "blockquote", "summary",
  ".eyebrow", ".tag", ".fd-name", ".fd-line", ".fd-status", ".fd-go", ".ps-us", ".ps-them",
  ".big-button", ".chip-link", ".access-row", ".pp-name", ".pp-amt", ".pp-per", ".pp-line",
].map((s) => `main ${s}`).join(", ");

const BOX_SELECTOR = [
  ".work-card", ".fresh-desk", ".price-strip", ".cta-band", "details.acc", ".access-grid",
  ".steps3 > div", ".tool-card", ".mini-tool", ".chat-mock", ".vgrid", ".price-pill", ".urlbox",
  ".never-grid > div", ".card", ".try-band", ".desk-tab", ".tbl-wrap", ".frame-wrap",
].map((s) => `main ${s}`).join(", ");

/** Ledges, in the order they tend to appear. Each is the top edge of the rightmost box in its first row. */
const LEDGES = [".steps3 > div", ".work-card", ".fresh-desk", ".chat-mock", ".tool-card", ".mini-tool", ".vgrid", ".price-pill", "details.acc", ".price-strip", ".cta-band"];

class Cancelled extends Error {}

export function startSprig(layer: HTMLElement, mode: Crew | "rotate"): () => void {
  const main = document.querySelector("main");
  const crewEl = layer.querySelector<HTMLElement>('[data-who="crew"]');
  const cmoEl = layer.querySelector<HTMLElement>('[data-who="cmo"]');
  if (!main || !crewEl || !cmoEl) return () => {};

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const actor = (el: HTMLElement): Actor => ({
    el,
    body: el.querySelector<HTMLElement>(".sprig-body")!,
    bubble: el.querySelector<HTMLElement>(".sprig-bubble")!,
    placard: el.querySelector<HTMLElement>(".sprig-placard")!,
    x: -999,
    ground: 0,
    face: -1,
    tilt: 0,
    sqx: 1,
    sqy: 1,
  });
  const me = actor(crewEl);
  const boss = actor(cmoEl);

  let who: Crew = mode === "rotate" ? pick(CREW_KEYS) : mode;
  function wear(c: Crew) {
    CREW_KEYS.forEach((k) => me.el.classList.remove(`v-${k}`));
    me.el.classList.add(`v-${c}`);
    who = c;
  }
  wear(who);
  const name = () => CREW[who].name;

  const bug = document.createElement("div");
  bug.className = "sprig-bug";
  bug.innerHTML = BUG_SVG;
  const fixtag = document.createElement("div");
  fixtag.className = "sprig-fixtag";
  fixtag.textContent = "Fixed!";
  layer.appendChild(bug);
  layer.appendChild(fixtag);

  let H = 144;
  let W = H * 0.8;
  let seat: Perch | null = null;
  let line: Perch | null = null;
  let ledges: Perch[] = [];
  let obstacles: { box: Box; el: Element }[] = [];
  let current: Perch | null = null;
  let run = 0;
  let paused = false;
  let napping = false;
  let entered = false;
  let lastActivity = performance.now();
  let lastLine = "";
  let lastButtonReaction = 0;
  let loops = 0;
  const timers: number[] = [];

  /* ------------------------------------------------------------ drawing */

  function render(a: Actor) {
    a.el.style.transform = `translate3d(${a.x - W / 2}px, ${a.ground - H}px, 0)`;
    a.body.style.setProperty("--face", String(a.face));
    a.body.style.setProperty("--tilt", `${a.tilt}deg`);
    a.body.style.setProperty("--sqx", String(a.sqx));
    a.body.style.setProperty("--sqy", String(a.sqy));
    // The sign's stick ends at x=97 of 120 facing right, mirrored facing left.
    a.placard.style.left = `${((a.face > 0 ? 97 : 23) / 120) * 100}%`;
  }

  function pose(a: Actor, ...add: string[]) {
    POSES.forEach((p) => a.el.classList.remove(p));
    add.forEach((p) => a.el.classList.add(p));
  }

  /**
   * Keep a bubble or sign clear of the page: inside the window, and off any
   * heading, paragraph, button or the menu bar. It slides sideways as little
   * as it can, and if there is no clear spot at all it is not shown.
   */
  function nudge(a: Actor, node: HTMLElement) {
    node.style.setProperty("--nx", "0px");
    requestAnimationFrame(() => {
      const parent = node.parentElement!.getBoundingClientRect();
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const centred = !(node === a.bubble && a.el.classList.contains("talk-side"));
      const l = parent.left + node.offsetLeft - (centred ? w / 2 : 0) + window.scrollX;
      const t = parent.top + node.offsetTop + window.scrollY;
      const vw = document.documentElement.clientWidth;
      const hits = (dx: number) =>
        obstacles.filter(({ box }) => box.l < l + dx + w + 4 && box.r > l + dx - 4 && box.t < t + h + 4 && box.b > t - 4);
      const fits = (dx: number) => l + dx >= 8 && l + dx + w <= vw - 8 && hits(dx).length === 0;
      const tries = [0, Math.min(0, vw - 8 - (l + w)) || Math.max(0, 8 - l)];
      for (const { box } of hits(0)) tries.push(box.r + 6 - l, box.l - 6 - (l + w));
      const best = tries.filter(fits).sort((x, y) => Math.abs(x) - Math.abs(y))[0];
      if (best === undefined) node.classList.remove("show");
      else node.style.setProperty("--nx", `${best}px`);
    });
  }

  function say(a: Actor, text: string) {
    a.placard.classList.remove("show");
    a.bubble.textContent = text;
    a.bubble.classList.toggle("show", text !== "");
    if (text) nudge(a, a.bubble);
  }

  function sign(a: Actor, text: string) {
    a.bubble.classList.remove("show");
    a.placard.textContent = text;
    a.placard.classList.toggle("show", text !== "");
    if (text) nudge(a, a.placard);
  }

  function quiet(a: Actor) {
    a.bubble.classList.remove("show");
    a.placard.classList.remove("show");
  }

  /** Beside-the-head bubbles, for when there is no room above. */
  function sideTalk(on: boolean) {
    me.el.classList.toggle("talk-side", on);
    me.el.classList.toggle("to-left", on && me.x > document.documentElement.clientWidth * 0.6);
  }

  /* ------------------------------------------------------------ measuring the page */

  function pageBox(r: DOMRect): Box {
    return { l: r.left + window.scrollX, t: r.top + window.scrollY, r: r.right + window.scrollX, b: r.bottom + window.scrollY };
  }

  function collectObstacles() {
    const out: { box: Box; el: Element }[] = [];
    const range = document.createRange();
    document.querySelectorAll(TEXT_SELECTOR).forEach((el) => {
      if (el.closest(".sprig-layer")) return;
      const own = el.getBoundingClientRect();
      if (own.width === 0 || own.height === 0) return;
      // Text is measured by its line boxes, so a heading that is 22ch wide
      // but whose words stop halfway blocks only where the words are.
      range.selectNodeContents(el);
      const lines = Array.from(range.getClientRects()).filter((r) => r.width > 2 && r.height > 2);
      if (lines.length && !el.matches(".big-button, .eyebrow, .tag, .fd-status, .chip-link")) lines.forEach((r) => out.push({ box: pageBox(r), el }));
      else out.push({ box: pageBox(own), el });
    });
    document.querySelectorAll(BOX_SELECTOR).forEach((el) => out.push({ box: pageBox(el.getBoundingClientRect()), el }));
    // The menu bar is never covered, not even by a speech bubble.
    const header = document.querySelector(".site-header");
    if (header) out.push({ box: pageBox(header.getBoundingClientRect()), el: header });
    return out;
  }

  /** The stretches of an edge where the centre can go, given what sits above it. */
  function freeRanges(ground: number, top: number, left: number, right: number, perchEl: Element): [number, number][] {
    const lo = left + W / 2 + 8;
    const hi = right - W / 2 - 8;
    if (hi <= lo) return [];
    const blocked = obstacles
      // Anything wrapping the edge (its section, main) is not in the way; things inside it are.
      .filter(({ box, el }) => box.b > top && box.t < ground - 1 && !el.contains(perchEl))
      .map(({ box }) => [box.l - W / 2 - 6, box.r + W / 2 + 6] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const free: [number, number][] = [];
    let cursor = lo;
    for (const [a, b] of blocked) {
      if (a > cursor) free.push([cursor, Math.min(a, hi)]);
      cursor = Math.max(cursor, b);
      if (cursor >= hi) break;
    }
    if (cursor < hi) free.push([cursor, hi]);
    return free.filter(([a, b]) => b >= a);
  }

  function widest(ranges: [number, number][]): [number, number] | null {
    let best: [number, number] | null = null;
    for (const r of ranges) if (!best || r[1] - r[0] > best[1] - best[0]) best = r;
    return best;
  }

  /** How much headroom there is at x on an edge, for squeezing under things. */
  function headroom(x: number, ground: number): number {
    let ceiling = -Infinity;
    for (const { box } of obstacles) {
      if (box.r < x - W / 2 || box.l > x + W / 2) continue;
      if (box.b > ground - 1 || box.b < ground - H) continue;
      ceiling = Math.max(ceiling, box.b);
    }
    return ceiling === -Infinity ? H : ground - ceiling - 4;
  }

  function firstRowRightmost(selector: string): Element | null {
    const els = Array.from(main!.querySelectorAll(selector)).filter((e) => e.getBoundingClientRect().width > 0);
    if (!els.length) return null;
    const tops = els.map((e) => e.getBoundingClientRect().top);
    const minTop = Math.min(...tops);
    const row = els.filter((_, i) => Math.abs(tops[i] - minTop) < 4);
    return row.reduce((a, b) => (b.getBoundingClientRect().right > a.getBoundingClientRect().right ? b : a));
  }

  function edgePerch(key: string, kind: "line" | "ledge", el: Element, ground: number, left: number, right: number): Perch | null {
    const body = widest(freeRanges(ground, ground - H, left, right, el));
    if (!body) return null;
    const talk = widest(
      freeRanges(ground, ground - H * 1.5, left, right, el)
        .map(([a, b]) => [Math.max(a, body[0]), Math.min(b, body[1])] as [number, number])
        .filter(([a, b]) => b >= a),
    );
    return { key, kind, el, ground, min: body[0], max: body[1], talk };
  }

  function measure() {
    const vw = document.documentElement.clientWidth;
    H = vw >= 1080 ? 144 : vw >= 760 ? 120 : 96;
    W = H * 0.8;
    for (const a of [me, boss]) a.el.style.setProperty("--h", `${H}px`);
    obstacles = collectObstacles();

    // The seat: sit with the bottom just into the tops of the letters, legs dangling in front.
    seat = null;
    const word = main!.querySelector("[data-sprig-seat]");
    if (word) {
      const range = document.createRange();
      range.selectNodeContents(word);
      const r = range.getClientRects()[0];
      if (r && r.width > 0) {
        const box = pageBox(r);
        const letterTop = box.t + (box.b - box.t) * 0.17;
        const x = Math.max(W / 2 + 8, Math.min(vw - W / 2 - 8, (box.l + box.r) / 2));
        let ceiling = 0;
        for (const o of obstacles) {
          if (o.el === word || o.el.contains(word)) continue;
          if (o.box.r < x - W / 2 || o.box.l > x + W / 2 || o.box.b > letterTop) continue;
          ceiling = Math.max(ceiling, o.box.b);
        }
        // Sitting takes about three quarters of the height; without that much room, no seat.
        if (letterTop - ceiling >= H * 0.76) seat = { key: "seat", kind: "seat", el: word, ground: letterTop + H * 0.05, min: x, max: x, talk: null };
      }
    }

    line = null;
    const band = main!.querySelector(".desk-hero-band");
    if (band) {
      const box = pageBox(band.getBoundingClientRect());
      // The line is the band's bottom border.
      line = edgePerch("line", "line", band, box.b - 2, 0, vw);
    }

    ledges = [];
    for (const sel of LEDGES) {
      const el = firstRowRightmost(sel);
      if (!el) continue;
      const box = pageBox(el.getBoundingClientRect());
      const p = edgePerch(sel, "ledge", el, box.t, box.l, box.r);
      // A ledge inside the hero belongs to the hero, not to scrolling.
      if (p && (!seat || p.ground > seat.ground + H)) ledges.push(p);
    }
    ledges.sort((a, b) => a.ground - b.ground);

    const lowest = Math.max(seat?.ground ?? 0, line?.ground ?? 0, ...ledges.map((p) => p.ground));
    layer.style.height = `${Math.ceil(lowest + H * 0.35)}px`;

    // Keep standing where he stands if the page moved under him.
    if (current) {
      const same = current.kind === "seat" ? seat : current.kind === "line" ? line : ledges.find((p) => p.key === current!.key);
      if (same) {
        current = same;
        if (!me.el.classList.contains("p-propeller") && !me.el.classList.contains("p-air")) {
          me.ground = same.ground;
          if (same.kind === "seat") me.x = same.min;
          else if (me.x > 0 && me.x < vw) me.x = Math.max(same.min, Math.min(same.max, me.x));
          render(me);
        }
      }
    }
  }

  /* ------------------------------------------------------------ time, and being interrupted */

  function alive(t: number) {
    if (t !== run) throw new Cancelled();
  }

  async function sleep(ms: number, t: number) {
    let left = ms;
    while (left > 0 || paused) {
      const step = Math.min(120, Math.max(16, left));
      await new Promise((r) => timers.push(window.setTimeout(r, step)));
      alive(t);
      if (!paused) left -= step;
    }
  }

  function animate(t: number, dur: number, fn: (u: number) => void) {
    return new Promise<void>((resolve, reject) => {
      let elapsed = 0;
      let last: number | null = null;
      const step = (now: number) => {
        if (t !== run) return reject(new Cancelled());
        if (last === null || paused) {
          last = now;
          requestAnimationFrame(step);
          return;
        }
        elapsed += Math.min(50, now - last);
        last = now;
        const u = Math.min(1, elapsed / dur);
        fn(u);
        render(me);
        if (u >= 1) return resolve();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function walk(a: Actor, to: number, t: number, speed = 1) {
    if (reduce) {
      a.x = to;
      render(a);
      return Promise.resolve();
    }
    const dir = Math.sign(to - a.x);
    if (dir === 0) return Promise.resolve();
    a.face = dir;
    a.el.classList.add("walking");
    const pxPerSec = H * 0.75 * speed;
    return new Promise<void>((resolve, reject) => {
      let last: number | null = null;
      const step = (now: number) => {
        if (t !== run) {
          a.el.classList.remove("walking");
          return reject(new Cancelled());
        }
        if (last === null || paused) {
          last = now;
          requestAnimationFrame(step);
          return;
        }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        a.x += dir * pxPerSec * dt;
        const done = dir > 0 ? a.x >= to : a.x <= to;
        if (done) a.x = to;
        // Squeeze under anything low, like the hero buttons.
        const room = Math.max(0.34, Math.min(1, headroom(a.x, a.ground) / H));
        a.sqy = room;
        a.sqx = room < 1 ? 1.12 : 1;
        render(a);
        if (done) {
          a.el.classList.remove("walking");
          a.sqx = a.sqy = 1;
          render(a);
          return resolve();
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /** Can they get from here to there along an edge, squeezing where they must? */
  function passable(from: number, to: number, ground: number) {
    const step = Math.sign(to - from) * 10;
    for (let x = from; step > 0 ? x < to : x > to; x += step) if (headroom(x, ground) < H * 0.34) return false;
    return true;
  }

  /**
   * Fly somewhere. The sprout spins like a propeller for anything more than a
   * hop; a short hop up is a jump. Lands with a little squash.
   */
  async function fly(tx: number, tg: number, t: number) {
    const from = { x: me.x, y: me.ground };
    const dy = tg - from.y;
    const propeller = dy > 0 || Math.abs(dy) > H * 0.8;
    pose(me, propeller ? "p-propeller" : "p-air");
    me.face = tx >= from.x ? 1 : -1;
    const dist = Math.hypot(tx - from.x, dy);
    const dur = Math.max(700, Math.min(1700, 500 + dist * 0.5));
    const arc = propeller ? 30 : Math.min(170, 70 + Math.abs(dy) * 0.12);
    const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    await animate(t, dur, (u) => {
      const e = ease(u);
      me.x = from.x + (tx - from.x) * e;
      me.ground = from.y + dy * e - arc * Math.sin(Math.PI * u);
      me.tilt = propeller ? Math.sin(u * 16) * 5 : 0;
    });
    me.tilt = 0;
    pose(me);
    me.sqx = 1.14;
    me.sqy = 0.82;
    render(me);
    await sleep(140, t);
    me.sqx = me.sqy = 1;
    render(me);
  }

  /** Plop down on the word. */
  async function landOnSeat(t: number) {
    if (!seat) return;
    await fly(seat.min, seat.ground, t);
    pose(me, "p-sit");
    sideTalk(true);
    me.face = me.x > document.documentElement.clientWidth * 0.6 ? -1 : 1;
    render(me);
  }

  async function leaveSeat(to: Perch, x: number, t: number) {
    sideTalk(false);
    quiet(me);
    await fly(x, to.ground, t);
  }

  /* ------------------------------------------------------------ moves */

  const within = (p: Perch) => p.min + Math.random() * (p.max - p.min);

  async function toTalkSpot(p: Perch, t: number) {
    if (!p.talk) return false;
    if (me.x >= p.talk[0] && me.x <= p.talk[1]) return true;
    await walk(me, p.talk[0] + Math.random() * (p.talk[1] - p.talk[0]), t);
    return true;
  }

  function phrase(list: string[]) {
    const l = pick(list, lastLine);
    lastLine = l;
    return l;
  }

  const MOVES: Record<string, (p: Perch, t: number) => Promise<void>> = {
    async wander(p, t) {
      await walk(me, within(p), t);
    },
    async ask(p, t) {
      if (!(await toTalkSpot(p, t))) return;
      pose(me, "p-wave");
      say(me, phrase(QUESTIONS));
      await sleep(900, t);
      pose(me);
      await sleep(2300, t);
      quiet(me);
    },
    async remark(p, t) {
      if (!(await toTalkSpot(p, t))) return;
      pose(me, "p-hold");
      render(me);
      sign(me, phrase(REMARKS));
      await sleep(3200, t);
      quiet(me);
      pose(me);
      await sleep(250, t);
    },
    async sit(_p, t) {
      pose(me, "p-sit");
      await sleep(3000 + Math.random() * 2500, t);
      pose(me);
    },
    async dance(_p, t) {
      pose(me, "p-dance");
      await sleep(2400, t);
      pose(me);
    },
    async stretch(_p, t) {
      pose(me, "p-stretch");
      await sleep(1400, t);
      pose(me);
    },
    async lookAround(_p, t) {
      me.face = -me.face;
      render(me);
      await sleep(900, t);
      me.face = -me.face;
      render(me);
      await sleep(700, t);
    },
    async fix(p, t) {
      const span = W * 2.4;
      if (p.max - p.min < span) return;
      const start = p.min + Math.random() * (p.max - p.min - span);
      await walk(me, start, t);
      const bugX = start + span;
      Object.assign(bug.style, { left: `${bugX}px`, top: `${p.ground}px` });
      Object.assign(fixtag.style, { left: `${bugX}px`, top: `${p.ground}px` });
      bug.classList.add("on");
      pose(me, "p-inspect");
      await walk(me, bugX - W * 0.8, t, 0.45);
      pose(me, "p-inspect");
      say(me, "Ooh, what's this?");
      await sleep(1300, t);
      say(me, "");
      bug.classList.remove("on");
      fixtag.classList.add("on");
      pose(me, "p-happy", "p-excited");
      await sleep(1500, t);
      pose(me);
      await sleep(700, t);
      fixtag.classList.remove("on");
    },
    async admireButton(p, t) {
      const btn = p.el.querySelector(".big-button.primary");
      if (!btn) return;
      const b = pageBox(btn.getBoundingClientRect());
      me.face = (b.l + b.r) / 2 > me.x ? 1 : -1;
      render(me);
      pose(me, "p-point");
      say(me, phrase(BUTTON_LINES));
      await sleep(2600, t);
      quiet(me);
      pose(me);
    },
  };

  /** What they do while sitting on the word. Everything seated, talking beside the head. */
  const SEAT_MOVES: Record<string, (t: number) => Promise<void>> = {
    async swing(t) {
      pose(me, "p-sit");
      await sleep(2600 + Math.random() * 2000, t);
    },
    async ask(t) {
      pose(me, "p-sit", "p-wave");
      say(me, phrase(QUESTIONS));
      await sleep(900, t);
      pose(me, "p-sit");
      await sleep(2400, t);
      quiet(me);
    },
    async remark(t) {
      pose(me, "p-sit", "p-happy");
      say(me, phrase(REMARKS));
      await sleep(3000, t);
      quiet(me);
      pose(me, "p-sit");
    },
    async look(t) {
      pose(me, "p-sit");
      me.face = -me.face;
      render(me);
      await sleep(1100, t);
      me.face = -me.face;
      render(me);
      await sleep(600, t);
    },
    async wave(t) {
      pose(me, "p-sit", "p-wave");
      await sleep(1600, t);
      pose(me, "p-sit");
    },
  };
  const SEAT_WEIGHTS: [string, number][] = [["swing", 3], ["ask", 3], ["remark", 3], ["look", 2], ["wave", 1]];

  async function greet(t: number, seated: boolean) {
    pose(me, ...(seated ? ["p-sit", "p-wave"] : ["p-wave"]));
    say(me, loops === 0 && mode !== "rotate" ? `${greeting()} I'm ${name()}.` : `Hi! I'm ${name()}, from ${CREW[who].desk}.`);
    await sleep(2600, t);
    quiet(me);
    pose(me, ...(seated ? ["p-sit"] : []));
  }

  /** The first arrival: fly in from the top corner and sit on the word. */
  async function entrance(t: number) {
    const vw = document.documentElement.clientWidth;
    me.x = vw + W * 0.6;
    me.ground = Math.max(H, seat!.ground - H * 2.4);
    me.el.classList.add("on");
    render(me);
    await landOnSeat(t);
    await greet(t, true);
  }

  async function seatMoves(n: number, t: number) {
    let prev = "";
    for (let i = 0; i < n; i++) {
      await sleep(900 + Math.random() * 1500, t);
      const m = choose(SEAT_WEIGHTS, prev);
      prev = m;
      await SEAT_MOVES[m](t);
    }
  }

  async function enterLine(p: Perch, t: number, fromLeft: boolean) {
    const vw = document.documentElement.clientWidth;
    me.ground = p.ground;
    me.x = fromLeft ? -W : vw + W;
    pose(me);
    render(me);
    me.el.classList.add("on");
    if (fromLeft && !passable(me.x, p.min, p.ground)) me.x = vw + W;
    await walk(me, within(p), t);
  }

  async function leaveLine(p: Perch, t: number) {
    const vw = document.documentElement.clientWidth;
    const left = Math.random() < 0.5 && passable(me.x, -W, p.ground);
    await walk(me, left ? -W : vw + W, t);
    await sleep(1800 + Math.random() * 2500, t);
    await enterLine(p, t, !left);
  }

  /** The CMO checks in, in his suit and glasses, from the right. Only where there is room for two. */
  async function cmoVisit(p: Perch, t: number) {
    // They meet where there is clear space above both heads for the chat.
    if (!p.talk || p.talk[1] - p.talk[0] < W * 1.5) return;
    const vw = document.documentElement.clientWidth;
    const [bossLine, reply] = pick(CMO_VISITS);
    await walk(me, p.talk[0] + W * 0.05, t);
    const meetAt = Math.min(p.talk[1], me.x + W * 1.4);
    boss.ground = p.ground;
    boss.x = vw + W;
    pose(boss);
    boss.el.classList.add("on");
    render(boss);
    await walk(boss, meetAt, t);
    boss.face = -1;
    me.face = 1;
    render(boss);
    render(me);
    pose(boss, "p-wave");
    say(boss, bossLine.replace("{name}", name()));
    await sleep(2200, t);
    quiet(boss);
    pose(boss);
    pose(me, "p-wave");
    say(me, reply.replace("{name}", name()));
    await sleep(2200, t);
    quiet(me);
    pose(me, "p-dance");
    pose(boss, "p-dance");
    await sleep(1400, t);
    pose(me);
    pose(boss);
    await walk(boss, vw + W, t);
    boss.el.classList.remove("on");
  }

  /** Home and the tools index: a different crew member takes a turn on the word. */
  async function shiftChange(t: number) {
    if (!seat) return;
    sideTalk(false);
    pose(me, "p-sit", "p-wave");
    say(me, "Back soon!");
    await sleep(1500, t);
    quiet(me);
    const vw = document.documentElement.clientWidth;
    await fly(vw + W * 0.6, Math.max(H, seat.ground - H * 2.4), t);
    await sleep(1200, t);
    wear(pick(CREW_KEYS.filter((c) => c !== who)));
    await landOnSeat(t);
    await greet(t, true);
  }

  const LINE_WEIGHTS: [string, number][] = [
    ["wander", 3],
    ["ask", 3],
    ["remark", 3],
    ["sit", 2],
    ["dance", 1],
    ["stretch", 1],
    ["lookAround", 1],
    ["fix", 2],
    ["admireButton", 1],
  ];
  const LEDGE_WEIGHTS: [string, number][] = [
    ["wander", 3],
    ["ask", 2],
    ["remark", 2],
    ["sit", 3],
    ["dance", 1],
    ["lookAround", 1],
    ["admireButton", 1],
  ];

  function choose(weights: [string, number][], avoid: string) {
    const pool = weights.filter(([k]) => k !== avoid);
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of pool) if ((r -= w) <= 0) return k;
    return pool[0][0];
  }

  /** Life on the word, for pages with no line under the hero. */
  async function seatLife(t: number) {
    for (;;) {
      await seatMoves(3, t);
      loops++;
      if (mode === "rotate" && loops % 3 === 0) await shiftChange(t);
    }
  }

  /** Life on the line: walking, talking, fixing, a visit from the CMO, and trips back up to the word. */
  async function lineLife(p: Perch, t: number) {
    let prev = "";
    for (;;) {
      await sleep(1200 + Math.random() * 2200, t);
      loops++;
      if (loops % 7 === 0) {
        await leaveLine(p, t);
        continue;
      }
      if (loops % 11 === 5 && Math.random() < 0.8) {
        await cmoVisit(p, t);
        continue;
      }
      if (seat && loops % 9 === 3) {
        await landOnSeat(t);
        await seatMoves(2, t);
        await leaveSeat(p, within(p), t);
        continue;
      }
      const move = choose(LINE_WEIGHTS, prev);
      prev = move;
      await MOVES[move](p, t);
    }
  }

  async function ledgeLife(p: Perch, t: number) {
    let prev = "";
    for (;;) {
      await sleep(1200 + Math.random() * 2200, t);
      loops++;
      const move = choose(LEDGE_WEIGHTS, prev);
      prev = move;
      await MOVES[move](p, t);
    }
  }

  /* ------------------------------------------------------------ the director */

  function restart(fn: (t: number) => Promise<void>) {
    run++;
    const t = run;
    quiet(me);
    quiet(boss);
    boss.el.classList.remove("on");
    bug.classList.remove("on");
    fixtag.classList.remove("on");
    me.el.classList.remove("walking");
    me.sqx = me.sqy = 1;
    me.tilt = 0;
    fn(t).catch((e) => {
      if (!(e instanceof Cancelled)) console.error(e);
    });
  }

  function place(p: Perch, x: number) {
    me.x = x;
    me.ground = p.ground;
    me.el.classList.add("on");
    pose(me, ...(p.kind === "seat" ? ["p-sit"] : []));
    sideTalk(p.kind === "seat");
    render(me);
  }

  function goTo(p: Perch) {
    const first = !entered;
    entered = true;
    const from = current;
    current = p;
    restart(async (t) => {
      const vw = document.documentElement.clientWidth;
      const offscreen = me.x < -W / 2 || me.x > vw + W / 2 || !me.el.classList.contains("on");

      if (reduce) {
        place(p, p.kind === "seat" ? p.min : p.talk ? (p.talk[0] + p.talk[1]) / 2 : within(p));
        if (p.kind === "seat") say(me, `${greeting()} I'm ${name()}.`);
        else {
          pose(me, "p-hold");
          sign(me, phrase(REMARKS));
        }
        return;
      }

      // Arriving at the top of the page: fly in and sit on the word first.
      if (first && seat && (p.kind === "seat" || p.kind === "line")) {
        await entrance(t);
        if (p.kind === "seat") return seatLife(t);
        await seatMoves(2, t);
        await leaveSeat(p, within(p), t);
        return lineLife(p, t);
      }

      if (first && !seat && p.kind === "line") {
        await enterLine(p, t, false);
        await toTalkSpot(p, t);
        await greet(t, false);
        return lineLife(p, t);
      }

      const tx = p.kind === "seat" ? p.min : p.talk ? (p.talk[0] + p.talk[1]) / 2 : within(p);
      if (offscreen) place(p, tx);
      else if (p.kind === "seat") await landOnSeat(t);
      else if (from?.kind === "seat" || me.el.classList.contains("p-sit")) await leaveSeat(p, tx, t);
      else await fly(tx, p.ground, t);

      if (p.kind === "seat") return seatLife(t);
      sideTalk(false);
      if (p.kind === "line") return lineLife(p, t);
      return ledgeLife(p, t);
    });
  }

  /**
   * Where to be. Near the top of the page, the hero: the line where there is
   * one, otherwise the word. Further down, the ledge nearest the middle of
   * the screen, among those actually on it.
   */
  function pickPerch(): Perch | null {
    const top = window.scrollY;
    const bottom = top + window.innerHeight;
    const hero = line ?? seat;
    const anchor = seat ?? line;
    if (hero && anchor && anchor.ground - top > H * 0.8 && anchor.ground < bottom - 8) return hero;
    const aim = top + window.innerHeight * 0.62;
    const onScreen = [...(line ? [line] : []), ...ledges].filter((p) => p.ground > top + H * 0.6 && p.ground < bottom - 8);
    if (!onScreen.length) return null;
    return onScreen.reduce((a, b) => (Math.abs(b.ground - aim) < Math.abs(a.ground - aim) ? b : a));
  }

  let scrollQueued = false;
  function onScroll() {
    activity();
    if (scrollQueued) return;
    scrollQueued = true;
    timers.push(
      window.setTimeout(() => {
        scrollQueued = false;
        const p = pickPerch();
        if (p && p !== current) goTo(p);
      }, 180),
    );
  }

  function activity() {
    lastActivity = performance.now();
    if (napping) {
      napping = false;
      const p = current;
      if (!p) return;
      restart(async (t) => {
        const seated = p.kind === "seat";
        pose(me, ...(seated ? ["p-sit", "p-wave"] : ["p-wave"]));
        say(me, phrase(WAKE_LINES));
        await sleep(1600, t);
        quiet(me);
        pose(me, ...(seated ? ["p-sit"] : []));
        if (seated) return seatLife(t);
        if (p.kind === "line") return lineLife(p, t);
        return ledgeLife(p, t);
      });
    }
  }

  // Eyes follow the pointer, a few units at most.
  function onPointer(e: PointerEvent) {
    activity();
    const r = me.el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height * 0.45);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 300);
    me.el.style.setProperty("--px", `${((dx / d) * 2.6 * k * me.face).toFixed(2)}px`);
    me.el.style.setProperty("--py", `${((dy / d) * 2.6 * k).toFixed(2)}px`);
  }

  // Hovering a big green button nearby gets an admiring point. Never more than once every eight seconds.
  function onButtonHover(e: Event) {
    const btn = (e.target as Element | null)?.closest?.(".big-button.primary, .urlbox button");
    if (!btn || !current || napping || reduce) return;
    const now = performance.now();
    if (now - lastButtonReaction < 8000) return;
    const b = btn.getBoundingClientRect();
    const s = me.el.getBoundingClientRect();
    if (s.bottom < 0 || s.top > window.innerHeight || Math.abs(b.top - s.top) > window.innerHeight * 0.6) return;
    lastButtonReaction = now;
    const p = current;
    restart(async (t) => {
      const seated = p.kind === "seat";
      me.face = b.left + b.width / 2 > s.left + s.width / 2 ? 1 : -1;
      render(me);
      pose(me, ...(seated ? ["p-sit", "p-happy"] : ["p-point", "p-excited"]));
      say(me, phrase(BUTTON_LINES));
      await sleep(2200, t);
      quiet(me);
      pose(me, ...(seated ? ["p-sit"] : []));
      if (seated) return seatLife(t);
      if (p.kind === "line") return lineLife(p, t);
      return ledgeLife(p, t);
    });
  }

  function blink() {
    timers.push(
      window.setTimeout(() => {
        for (const a of [me, boss]) {
          if (!a.el.classList.contains("p-nap")) {
            a.el.classList.add("blink");
            timers.push(window.setTimeout(() => a.el.classList.remove("blink"), 130));
          }
        }
        blink();
      }, 2400 + Math.random() * 3000),
    );
  }

  const napCheck = window.setInterval(() => {
    if (napping || reduce || !current) return;
    if (performance.now() - lastActivity > 60000) {
      napping = true;
      restart(async () => {
        pose(me, "p-sit", "p-nap");
      });
    }
  }, 2000);

  function onVisibility() {
    paused = document.hidden;
  }

  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      measure();
      const p = pickPerch();
      if (entered && p && current && p.kind !== current.kind && current.kind !== "ledge") goTo(p);
    }, 200);
  });

  /* ------------------------------------------------------------ start */

  let started = false;
  function start() {
    if (started) return;
    started = true;
    measure();
    const first = pickPerch() ?? line ?? seat ?? ledges[0];
    if (first) goTo(first);
    blink();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("keydown", activity);
    window.addEventListener("touchstart", activity, { passive: true });
    document.addEventListener("pointerover", onButtonHover, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    ro.observe(main!);
  }

  // Wait for the display font, so line boxes are measured at their final
  // size, but never wait on it for long: a font that never arrives must not
  // keep the crew off the page.
  const fontsReady = Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => timers.push(window.setTimeout(r, 2500)))]);
  fontsReady.then(() => timers.push(window.setTimeout(start, 300)));

  return () => {
    run++;
    timers.forEach((id) => window.clearTimeout(id));
    window.clearInterval(napCheck);
    window.clearTimeout(resizeTimer);
    ro.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("pointermove", onPointer);
    window.removeEventListener("keydown", activity);
    window.removeEventListener("touchstart", activity);
    document.removeEventListener("pointerover", onButtonHover);
    document.removeEventListener("visibilitychange", onVisibility);
    bug.remove();
    fixtag.remove();
  };
}
