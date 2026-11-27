// Scroll-driven assembly. Every section is taller than the screen and holds one pinned view.
// Its pieces start somewhere else and are pulled into place as the section scrolls; scrolling
// back takes them apart again.
// ARTIFICIAL: all the numbers here set the feel only.
const LEAD = 0.55; // a section starts moving when its top is this far (of a screen) from the top
const STOP = 0.82; // where an arrow key rests inside a section: everything has arrived by then
const SMOOTH = 0.16; // how quickly the drawn position follows the real scroll
const SNAP = 1.35; // overshoot of a piece just before it settles
const KEY_MS = 1300; // how long an arrow key takes to travel, so that the assembling can be watched

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v) => Math.max(0, Math.min(1, v));
const back = (p) => 1 + (SNAP + 1) * (p - 1) ** 3 + SNAP * (p - 1) ** 2;
const out = (p) => 1 - (1 - p) ** 3;

export function createMotion() {
  let sections = [];
  let drawn = 0;
  let frame = 0;
  let force = true;
  let listener = () => {};

  /**
   * Makes `node` a piece that arrives while the section scrolls.
   * from: [x in vw, y in vh, rotation in degrees, scale], or { node } to be pulled out of another element.
   * at / span: the part of the section's progress during which it travels.
   * tilt: the rotation it rests at. calm: no overshoot, no turning.
   */
  function piece(section, node, { from = [0, 40, 0, 1], at = 0, span = 0.28, tilt = 0, calm = false } = {}) {
    node.classList.add("piece");
    section.pieces.push({ node, from, at, span, tilt, calm, p: -1, dx: 0, dy: 0 });
    return node;
  }
  /** A section: `length` is how far it scrolls while pinned, in screens. */
  function section(root, name, length = 0.9, className = "") {
    const el = document.createElement("section");
    el.className = `part ${className}`;
    el.style.height = `${(1 + length) * 100}vh`;
    const view = document.createElement("div");
    view.className = "view";
    el.append(view);
    root.append(el);
    const entry = { name, el, view, pieces: [], onProgress: null, stops: null, top: 0, len: 0, q: -1 };
    sections.push(entry);
    return entry;
  }
  const offsetIn = (node, view) => {
    let x = 0; let y = 0;
    for (let n = node; n && n !== view; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x: x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
  };
  function measure() {
    for (const s of sections) {
      s.top = s.el.offsetTop; s.len = s.el.offsetHeight - innerHeight;
      for (const item of s.pieces) {
        if (Array.isArray(item.from)) { item.dx = (item.from[0] * innerWidth) / 100; item.dy = (item.from[1] * innerHeight) / 100; item.turn = item.from[2] ?? 0; item.size = item.from[3] ?? 1; continue; }
        const a = offsetIn(item.from.node, s.view); const b = offsetIn(item.node, s.view);
        item.dx = a.x - b.x; item.dy = a.y - b.y; item.turn = item.from.turn ?? -25; item.size = item.from.scale ?? 0.3;
      }
    }
    force = true;
  }
  function place(item, q) {
    const p = still ? 1 : clamp((q - item.at) / item.span);
    if (p === item.p && !force) return;
    item.p = p;
    const e = item.calm ? out(p) : back(p);
    const rest = 1 - e;
    item.node.style.transform = p >= 1 ? `rotate(${item.tilt}deg)` : `translate3d(${item.dx * rest}px, ${item.dy * rest}px, 0) rotate(${item.tilt + (item.calm ? 0 : item.turn * rest)}deg) scale(${1 + (item.size - 1) * rest})`;
    item.node.style.opacity = clamp(p * 3);
    item.node.style.visibility = p <= 0 ? "hidden" : "";
    item.node.classList.toggle("snapped", p >= 1);
  }
  function tick() {
    const target = scrollY;
    const moved = Math.abs(target - drawn) > 0.5;
    drawn = moved && !still ? drawn + (target - drawn) * SMOOTH : target;
    if (moved || force) {
      let current = 0;
      sections.forEach((s, i) => {
        const q = clamp((drawn - (s.top - innerHeight * LEAD)) / (s.len + innerHeight * LEAD));
        if (drawn >= s.top - innerHeight * 0.5) current = i;
        if (q === s.q && !force) return;
        s.q = q;
        for (const item of s.pieces) place(item, q);
        s.onProgress?.(q);
      });
      const max = document.documentElement.scrollHeight - innerHeight;
      listener(current, max > 0 ? clamp(drawn / max) : 0);
      force = false;
    }
    frame = requestAnimationFrame(tick);
  }
  /** Resting points of a section: its own progress values (`stops`), or one near its end. */
  const stopsOf = (s, i) => {
    if (!i) return [0];
    if (!s.stops) return [s.top + s.len * STOP];
    const lead = innerHeight * LEAD;
    return s.stops.map((q) => Math.min(document.documentElement.scrollHeight - innerHeight, s.top - lead + q * (s.len + lead)));
  };
  let travel = 0;
  let goal = null;
  const halt = () => { cancelAnimationFrame(travel); goal = null; };
  function glide(to) {
    halt(); goal = to;
    const from = scrollY; const began = performance.now();
    const move = (now) => {
      const p = still ? 1 : clamp((now - began) / KEY_MS);
      scrollTo({ top: from + (to - from) * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2), behavior: "instant" });
      if (p < 1) travel = requestAnimationFrame(move); else goal = null;
    };
    travel = requestAnimationFrame(move);
  }
  return {
    piece,
    section,
    start(onMove) { listener = onMove; for (const kind of ["wheel", "touchstart"]) addEventListener(kind, halt, { passive: true }); measure(); drawn = scrollY; frame = requestAnimationFrame(tick); addEventListener("resize", measure); document.fonts?.ready.then(measure); },
    destroy() { cancelAnimationFrame(frame); halt(); removeEventListener("resize", measure); for (const kind of ["wheel", "touchstart"]) removeEventListener(kind, halt); sections = []; },
    measure,
    get sections() { return sections; },
    /** The next or previous resting point from where the page is now (or is already heading). */
    step(direction) {
      const stops = sections.flatMap(stopsOf);
      const here = goal ?? scrollY;
      const next = direction > 0 ? stops.find((y) => y > here + 20) : [...stops].reverse().find((y) => y < here - 20);
      if (next !== undefined) glide(next);
    },
    /** To a section's first resting point; `instant` goes to its last, without travelling. */
    go(index, instant = false) {
      const s = sections[index];
      if (!s) return;
      const stops = stopsOf(s, index);
      if (!instant) return glide(stops[0]);
      halt(); scrollTo({ top: stops.at(-1), behavior: "instant" }); drawn = scrollY; force = true;
    },
  };
}
