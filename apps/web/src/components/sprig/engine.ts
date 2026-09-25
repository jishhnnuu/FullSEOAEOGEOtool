/**
 * What Sprig decides to do, and where he is allowed to stand.
 *
 * Nobody controls him. He picks his next move at random, follows the reader
 * down the page from one real edge to the next, and reacts to what they do
 * (scrolling, hovering a button, leaving the page alone), but he never takes
 * a click and never covers text or a button.
 *
 * "Where he may stand" is measured, not hard-coded: every heading line,
 * paragraph line, button and card on the page is an obstacle, and a spot on
 * an edge is only used if his body fits between that edge and whatever is
 * above it. Under the hero buttons there is not quite room, so he squashes
 * down to squeeze through. Where there is no room at all, he does not go.
 */

import { BUG_SVG } from "./art";
import { BUTTON_LINES, CMO_VISITS, QUESTIONS, REMARKS, WAKE_LINES, greeting, pick } from "./lines";

type Box = { l: number; t: number; r: number; b: number };

type Perch = {
  key: string;
  el: Element;
  ground: number;
  /** Where his feet may stand, as centre x. */
  min: number;
  max: number;
  /** Where he may stand and still hold a sign above his head without covering anything. */
  talk: [number, number] | null;
  /** The hero line is the only one he walks on and off. */
  hero: boolean;
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

const TEXT_SELECTOR =
  "main h1, main h2, main h3, main p, main blockquote, main summary, main .eyebrow, main .tag, main .fd-name, main .fd-count, main .fd-line, main .fd-status, main .fd-go, main .ps-us, main .ps-them, main .big-button, main .access-row";
const BOX_SELECTOR = "main .work-card, main .fresh-desk, main .price-strip, main .cta-band, main details.acc, main .access-grid";

class Cancelled extends Error {}

export function startSprig(layer: HTMLElement): () => void {
  const main = document.querySelector("main");
  const sprigEl = layer.querySelector<HTMLElement>('[data-who="sprig"]');
  const cmoEl = layer.querySelector<HTMLElement>('[data-who="cmo"]');
  if (!main || !sprigEl || !cmoEl) return () => {};

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
  const me = actor(sprigEl);
  const boss = actor(cmoEl);

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
  let perches: Perch[] = [];
  let obstacles: { box: Box; el: Element }[] = [];
  let current: Perch | null = null;
  let run = 0;
  let paused = false;
  let napping = false;
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
   * heading, paragraph or button. It slides sideways as little as it can, and
   * if there is no clear spot at all it is not shown.
   */
  function nudge(node: HTMLElement) {
    node.style.setProperty("--nx", "0px");
    requestAnimationFrame(() => {
      const parent = node.parentElement!.getBoundingClientRect();
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const l = parent.left + node.offsetLeft - w / 2 + window.scrollX;
      const t = parent.top + node.offsetTop + window.scrollY;
      const vw = document.documentElement.clientWidth;
      const hits = (dx: number) =>
        obstacles.filter(({ box }) => box.l < l + dx + w + 4 && box.r > l + dx - 4 && box.t < t + h + 4 && box.b > t - 4);
      const fits = (dx: number) => l + dx >= 8 && l + dx + w <= vw - 8 && hits(dx).length === 0;
      const tries = [0, Math.min(0, vw - 8 - (l + w)) || Math.max(0, 8 - l)];
      for (const { box } of hits(0)) tries.push(box.r + 6 - l, box.l - 6 - (l + w));
      const best = tries.filter(fits).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
      if (best === undefined) node.classList.remove("show");
      else node.style.setProperty("--nx", `${best}px`);
    });
  }

  function say(a: Actor, text: string) {
    a.placard.classList.remove("show");
    a.bubble.textContent = text;
    a.bubble.classList.toggle("show", text !== "");
    if (text) nudge(a.bubble);
  }

  function sign(a: Actor, text: string) {
    a.bubble.classList.remove("show");
    a.placard.textContent = text;
    a.placard.classList.toggle("show", text !== "");
    if (text) nudge(a.placard);
  }

  function quiet(a: Actor) {
    a.bubble.classList.remove("show");
    a.placard.classList.remove("show");
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
      if (lines.length && !el.matches(".big-button, .eyebrow, .tag, .fd-status")) lines.forEach((r) => out.push({ box: pageBox(r), el }));
      else out.push({ box: pageBox(own), el });
    });
    document.querySelectorAll(BOX_SELECTOR).forEach((el) => out.push({ box: pageBox(el.getBoundingClientRect()), el }));
    return out;
  }

  /** The stretches of an edge where his centre can go, given what sits above it. */
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

  /** How much headroom there is at x on the current edge, for squeezing under things. */
  function headroom(x: number, ground: number): number {
    let ceiling = -Infinity;
    for (const { box } of obstacles) {
      if (box.r < x - W / 2 || box.l > x + W / 2) continue;
      if (box.b > ground - 1 || box.b < ground - H) continue;
      ceiling = Math.max(ceiling, box.b);
    }
    return ceiling === -Infinity ? H : ground - ceiling - 4;
  }

  function topRowRightmost(selector: string): Element | null {
    const els = Array.from(main!.querySelectorAll(selector));
    if (!els.length) return null;
    const tops = els.map((e) => e.getBoundingClientRect().top);
    const minTop = Math.min(...tops);
    const row = els.filter((_, i) => Math.abs(tops[i] - minTop) < 4);
    return row.reduce((a, b) => (b.getBoundingClientRect().right > a.getBoundingClientRect().right ? b : a));
  }

  function measure() {
    const vw = document.documentElement.clientWidth;
    H = vw >= 1080 ? 144 : vw >= 760 ? 120 : 96;
    W = H * 0.8;
    for (const a of [me, boss]) a.el.style.setProperty("--h", `${H}px`);

    obstacles = collectObstacles();
    const candidates: { key: string; el: Element | null; hero?: boolean }[] = [
      { key: "hero", el: main!.querySelector(".desk-hero-band"), hero: true },
      { key: "work", el: topRowRightmost(".work-card") },
      { key: "fine", el: main!.querySelector("details.acc") },
      { key: "price", el: main!.querySelector(".price-strip") },
      { key: "desks", el: topRowRightmost(".fresh-desk") },
      { key: "cta", el: main!.querySelector(".cta-band") },
    ];

    const next: Perch[] = [];
    for (const c of candidates) {
      if (!c.el) continue;
      const box = pageBox(c.el.getBoundingClientRect());
      // The hero's line is its bottom border; everywhere else he stands on the top edge.
      const ground = c.hero ? box.b - 2 : box.t;
      const left = c.hero ? 0 : box.l;
      const right = c.hero ? vw : box.r;
      const body = widest(freeRanges(ground, ground - H, left, right, c.el));
      if (!body) continue;
      const talkRanges = freeRanges(ground, ground - H * 1.5, left, right, c.el)
        .map(([a, b]) => [Math.max(a, body[0]), Math.min(b, body[1])] as [number, number])
        .filter(([a, b]) => b >= a);
      next.push({ key: c.key, el: c.el, ground, min: body[0], max: body[1], talk: widest(talkRanges), hero: !!c.hero });
    }
    perches = next;

    const lowest = perches.reduce((m, p) => Math.max(m, p.ground), 0);
    layer.style.height = `${Math.ceil(lowest + H * 0.35)}px`;

    if (current) {
      const same = perches.find((p) => p.key === current!.key);
      if (same) {
        current = same;
        me.ground = same.ground;
        if (me.x > 0 && me.x < vw) me.x = Math.max(same.min, Math.min(same.max, me.x));
        render(me);
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

  function animate(t: number, dur: number, fn: (u: number) => void, actors: Actor[] = [me]) {
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
        actors.forEach(render);
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

  /** Can he get from here to there along the current edge, squeezing where he must? */
  function passable(from: number, to: number, ground: number) {
    const step = Math.sign(to - from) * 10;
    for (let x = from; step > 0 ? x < to : x > to; x += step) if (headroom(x, ground) < H * 0.34) return false;
    return true;
  }

  /* ------------------------------------------------------------ moves */

  const within = (p: Perch) => p.min + Math.random() * (p.max - p.min);

  async function toTalkSpot(p: Perch, t: number) {
    if (!p.talk) return false;
    if (me.x >= p.talk[0] && me.x <= p.talk[1]) return true;
    await walk(me, p.talk[0] + Math.random() * (p.talk[1] - p.talk[0]), t);
    return true;
  }

  function line(list: string[]) {
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
      say(me, line(QUESTIONS));
      await sleep(900, t);
      pose(me);
      await sleep(2300, t);
      quiet(me);
    },
    async remark(p, t) {
      if (!(await toTalkSpot(p, t))) return;
      pose(me, "p-hold");
      render(me);
      sign(me, line(REMARKS));
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
      say(me, line(BUTTON_LINES));
      await sleep(2600, t);
      quiet(me);
      pose(me);
    },
  };

  async function enterHero(p: Perch, t: number, fromLeft: boolean) {
    const vw = document.documentElement.clientWidth;
    me.ground = p.ground;
    me.x = fromLeft ? -W : vw + W;
    pose(me);
    render(me);
    me.el.classList.add("on");
    if (fromLeft && !passable(me.x, p.min, p.ground)) me.x = vw + W;
    await walk(me, within(p), t);
  }

  async function leaveHero(p: Perch, t: number) {
    const vw = document.documentElement.clientWidth;
    const left = Math.random() < 0.5 && passable(me.x, -W, p.ground);
    await walk(me, left ? -W : vw + W, t);
    await sleep(1800 + Math.random() * 2500, t);
    await enterHero(p, t, !left);
  }

  /** The CMO drops by in his suit from the right, says hello and heads off. Only where there is room for two. */
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
    me.face = -boss.face;
    render(boss);
    render(me);
    pose(boss, "p-wave");
    say(boss, bossLine);
    await sleep(2100, t);
    quiet(boss);
    pose(boss);
    pose(me, "p-wave");
    say(me, reply);
    await sleep(2100, t);
    quiet(me);
    pose(me, "p-dance");
    pose(boss, "p-dance");
    await sleep(1400, t);
    pose(me);
    pose(boss);
    await walk(boss, vw + W, t);
    boss.el.classList.remove("on");
  }

  const HERO_WEIGHTS: [string, number][] = [
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

  async function life(p: Perch, t: number, arrived: boolean) {
    let prev = "";
    if (p.hero && !arrived) {
      await enterHero(p, t, false);
      if (await toTalkSpot(p, t)) {
        pose(me, "p-wave");
        say(me, loops === 0 ? `${greeting()} I'm Sprig.` : greeting());
        await sleep(2400, t);
        quiet(me);
        pose(me);
      }
    }
    for (;;) {
      await sleep(1200 + Math.random() * 2200, t);
      loops++;
      if (p.hero && loops % 7 === 0) {
        await leaveHero(p, t);
        continue;
      }
      if (p.hero && loops % 11 === 5 && Math.random() < 0.8) {
        await cmoVisit(p, t);
        continue;
      }
      const move = choose(p.hero ? HERO_WEIGHTS : LEDGE_WEIGHTS, prev);
      prev = move;
      await MOVES[move](p, t);
    }
  }

  async function hop(to: Perch, t: number) {
    quiet(me);
    const vw = document.documentElement.clientWidth;
    const target = to.talk ? (to.talk[0] + to.talk[1]) / 2 : (to.min + to.max) / 2;
    const offscreen = me.x < -W / 2 || me.x > vw + W / 2 || !me.el.classList.contains("on");
    if (reduce || offscreen) {
      me.x = target;
      me.ground = to.ground;
      pose(me);
      render(me);
      me.el.classList.add("on");
      return;
    }
    const from = { x: me.x, y: me.ground };
    const down = to.ground > from.y;
    pose(me, down ? "p-propeller" : "p-air");
    me.face = target >= from.x ? 1 : -1;
    const dist = Math.hypot(target - from.x, to.ground - from.y);
    const dur = Math.max(650, Math.min(1500, 450 + dist * 0.5));
    const arc = down ? 30 : Math.min(170, 70 + Math.abs(to.ground - from.y) * 0.12);
    const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    await animate(t, dur, (u) => {
      const e = ease(u);
      me.x = from.x + (target - from.x) * e;
      me.ground = from.y + (to.ground - from.y) * e - arc * Math.sin(Math.PI * u);
      me.tilt = down ? Math.sin(u * 16) * 5 : 0;
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

  function goTo(p: Perch) {
    const arrivedBefore = current !== null;
    const fromHero = current?.hero ?? false;
    current = p;
    restart(async (t) => {
      if (arrivedBefore || !p.hero) await hop(p, t);
      if (reduce) {
        pose(me, "p-hold");
        me.face = -1;
        render(me);
        sign(me, p.hero ? `${greeting()} I'm Sprig.` : line(REMARKS));
        return;
      }
      await life(p, t, arrivedBefore || fromHero || !p.hero);
    });
  }

  /** The ledge nearest the middle of the screen, among those actually on screen. */
  function pickPerch(): Perch | null {
    if (!perches.length) return null;
    const top = window.scrollY;
    const bottom = top + window.innerHeight;
    const aim = top + window.innerHeight * 0.62;
    const onScreen = perches.filter((p) => p.ground > top + H * 0.6 && p.ground < bottom - 8);
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
        if (p && p.key !== current?.key) goTo(p);
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
        pose(me, "p-wave");
        say(me, line(WAKE_LINES));
        await sleep(1600, t);
        quiet(me);
        pose(me);
        await life(p, t, true);
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

  // Hovering a big green button near him gets an admiring point. Never more than once every eight seconds.
  function onButtonHover(e: Event) {
    const btn = (e.target as Element | null)?.closest?.(".big-button.primary");
    if (!btn || !current || napping || reduce) return;
    const now = performance.now();
    if (now - lastButtonReaction < 8000) return;
    const b = btn.getBoundingClientRect();
    const s = me.el.getBoundingClientRect();
    if (s.bottom < 0 || s.top > window.innerHeight || Math.abs(b.top - s.top) > window.innerHeight * 0.6) return;
    lastButtonReaction = now;
    const p = current;
    restart(async (t) => {
      me.face = b.left + b.width / 2 > s.left + s.width / 2 ? 1 : -1;
      render(me);
      pose(me, "p-point", "p-excited");
      say(me, line(BUTTON_LINES));
      await sleep(2200, t);
      quiet(me);
      pose(me);
      await life(p, t, true);
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
      const before = current?.key;
      measure();
      if (before && !perches.some((p) => p.key === before)) {
        const p = pickPerch();
        if (p) goTo(p);
      }
    }, 200);
  });

  /* ------------------------------------------------------------ start */

  let started = false;
  function start() {
    if (started) return;
    started = true;
    measure();
    const first = pickPerch() ?? perches[0];
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

  // Wait for the display font, so line boxes are measured in their final size.
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  fontsReady.then(() => timers.push(window.setTimeout(start, 400)));

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
