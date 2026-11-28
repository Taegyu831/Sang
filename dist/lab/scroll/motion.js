// Page-by-page assembly. The reading is a stack of full screens: one turn of the wheel (or one key)
// moves exactly one step, and everything in that step then comes together by itself, so nothing
// has to be lined up by hand. A step still being put together is finished first by the next input.
// ARTIFICIAL: all the numbers here set the feel only.
const SNAP = 1.35; // overshoot of a piece just before it settles
const WAIT_MS = 250; // pieces start once the new page is partly in
const STEP_GAP_MS = 650; // the least time between two steps taken with the wheel
const QUIET_MS = 220; // a new wheel gesture needs this pause (a trackpad keeps sending while it coasts)
const WHEEL_MIN = 8; // smaller wheel movements are ignored

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v) => Math.max(0, Math.min(1, v));
const back = (p) => 1 + (SNAP + 1) * (p - 1) ** 3 + SNAP * (p - 1) ** 2;
const out = (p) => 1 - (1 - p) ** 3;

export function createMotion() {
  let sections = [];
  let at = { section: 0, step: 0 };
  let tween = 0;
  let ready = true;
  let listener = () => {};
  const events = new AbortController();

  /**
   * Makes `node` a piece that arrives while its section is put together.
   * from: [x in vw, y in vh, rotation in degrees, scale], or { node } to be pulled out of another element.
   * at / span: the part of the section's progress during which it travels.
   * tilt: the rotation it rests at. calm: no overshoot, no turning.
   */
  function piece(section, node, { from = [0, 40, 0, 1], at: begin = 0, span = 0.28, tilt = 0, calm = false } = {}) {
    node.classList.add("piece");
    section.pieces.push({ node, from, at: begin, span, tilt, calm, dx: 0, dy: 0 });
    return node;
  }
  /** A section: one screen. `ms` is how long its whole assembly takes. */
  function section(root, name, ms = 2000, className = "") {
    const el = document.createElement("section");
    el.className = `part ${className}`;
    const view = document.createElement("div");
    view.className = "view";
    el.append(view);
    root.append(el);
    // stops: progress values to rest at, one per step. froms: where a step's movement begins (optional).
    const entry = { name, el, view, ms, pieces: [], onProgress: null, stops: [1], froms: [], more: "이어서", q: 0 };
    sections.push(entry);
    return entry;
  }
  const offsetIn = (node, view) => {
    let x = 0; let y = 0;
    for (let n = node; n && n !== view; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x: x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
  };
  function place(item, q) {
    const p = still ? 1 : clamp((q - item.at) / item.span);
    const e = item.calm ? out(p) : back(p);
    const rest = 1 - e;
    item.node.style.transform = p >= 1 ? `rotate(${item.tilt}deg)` : `translate3d(${item.dx * rest}px, ${item.dy * rest}px, 0) rotate(${item.tilt + (item.calm ? 0 : item.turn * rest)}deg) scale(${1 + (item.size - 1) * rest})`;
    item.node.style.opacity = clamp(p * 3);
    item.node.style.visibility = p <= 0 ? "hidden" : "";
    item.node.classList.toggle("snapped", p >= 1);
  }
  function draw(s, q) { s.q = q; for (const item of s.pieces) place(item, q); s.onProgress?.(q); }
  function measure() {
    for (const s of sections) {
      for (const item of s.pieces) {
        if (Array.isArray(item.from)) { item.dx = (item.from[0] * innerWidth) / 100; item.dy = (item.from[1] * innerHeight) / 100; item.turn = item.from[2] ?? 0; item.size = item.from[3] ?? 1; continue; }
        const a = offsetIn(item.from.node, s.view); const b = offsetIn(item.node, s.view);
        item.dx = a.x - b.x; item.dy = a.y - b.y; item.turn = item.from.turn ?? -25; item.size = item.from.scale ?? 0.3;
      }
      draw(s, s.q);
    }
  }
  const last = () => at.section === sections.length - 1 && at.step === sections.at(-1).stops.length - 1;
  function report() {
    const s = sections[at.section];
    const total = sections.reduce((n, x) => n + x.stops.length, 0);
    const done = sections.slice(0, at.section).reduce((n, x) => n + x.stops.length, 0) + at.step;
    const next = at.step < s.stops.length - 1 ? s.more : sections[at.section + 1]?.name;
    listener({ index: at.section, progress: total > 1 ? done / (total - 1) : 1, ready, end: last(), next });
  }
  function finish() {
    cancelAnimationFrame(tween);
    const s = sections[at.section];
    draw(s, s.stops[at.step]); ready = true; report();
  }
  /** Shows a step. `play` puts it together over time, otherwise it is there at once. */
  function show(index, step, play) {
    cancelAnimationFrame(tween);
    const arriving = index !== at.section;
    at = { section: index, step };
    sections.forEach((s, i) => {
      s.el.classList.toggle("is-below", i > index);
      s.el.classList.toggle("is-now", i === index);
      s.el.classList.toggle("is-near", Math.abs(i - index) === 1);
    });
    const s = sections[index];
    const to = s.stops[step];
    if (!play || still) return finish();
    const from = s.froms[step] ?? (step ? s.stops[step - 1] : 0);
    const length = (to - (step ? s.stops[step - 1] : 0)) * s.ms;
    const began = performance.now() + (arriving ? WAIT_MS : 0);
    ready = false; draw(s, from); report();
    const move = (now) => {
      const p = length > 0 ? clamp((now - began) / length) : 1;
      draw(s, from + (to - from) * p);
      if (p < 1) tween = requestAnimationFrame(move); else finish();
    };
    tween = requestAnimationFrame(move);
  }
  /** One step on or back. Going back shows the earlier step as it was left. */
  function step(direction) {
    if (direction > 0) {
      if (!ready) return finish();
      if (at.step < sections[at.section].stops.length - 1) return show(at.section, at.step + 1, true);
      if (at.section < sections.length - 1) return show(at.section + 1, 0, true);
      return;
    }
    if (at.step > 0) return show(at.section, at.step - 1, false);
    if (at.section > 0) return show(at.section - 1, sections[at.section - 1].stops.length - 1, false);
  }
  function listen() {
    let heard = 0; let stepped = 0; let armed = true; let touch = null;
    const { signal } = events;
    addEventListener("wheel", (event) => {
      event.preventDefault();
      const now = performance.now();
      if (now - heard > QUIET_MS) armed = true;
      heard = now;
      if (!armed || Math.abs(event.deltaY) < WHEEL_MIN || now - stepped < STEP_GAP_MS) return;
      armed = false; stepped = now;
      step(Math.sign(event.deltaY));
    }, { passive: false, signal });
    addEventListener("touchstart", (event) => { touch = event.touches[0].clientY; }, { passive: true, signal });
    addEventListener("touchend", (event) => { const moved = touch - event.changedTouches[0].clientY; if (Math.abs(moved) > 40) step(Math.sign(moved)); }, { passive: true, signal });
    addEventListener("resize", measure, { signal });
  }
  return {
    piece,
    section,
    step,
    start(onMove) { listener = onMove; listen(); measure(); document.fonts?.ready.then(measure); show(0, 0, false); },
    destroy() { cancelAnimationFrame(tween); events.abort(); sections = []; },
    get sections() { return sections; },
    get atEnd() { return sections.length > 0 && last(); },
    /** To a section's first step; `instant` shows its last step, finished. */
    go(index, instant = false) {
      if (!sections[index]) return;
      show(index, instant ? sections[index].stops.length - 1 : 0, !instant);
    },
  };
}
