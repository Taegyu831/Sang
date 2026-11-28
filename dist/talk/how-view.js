// The big screen's way into "어떻게 읽나요?" (words and drawings in how.js).
//   1. One scroll down on the start screen only raises a small sign: scroll once more.
//      Without a second scroll in time, the sign goes and the next scroll counts as the first again.
//   2. The second scroll flies past the title into the explanation: the pages wait behind one another
//      and each scroll brings the next one forward, while shapes further away move more slowly.
// Scrolling up from the first page, the close button or Esc goes back to the start screen.
// ARTIFICIAL: every time and distance below, and the look.
import { h, button } from "./kit.js";
import { HOW_TITLE, HOW_LEAD, STEPS } from "./how.js";

const T = {
  again: 3500, // the second scroll must come within this
  quiet: 220, // wheel events closer together than this are one scroll (a trackpad sends many)
  settle: 650, // a new swipe is not taken while the last step is still moving
  renew: 1100, // while a long glide goes on, a clearly stronger push after this is a new scroll
  idle: 90000, // left alone, the explanation closes
};
const DEPTH = 90; // rem between two pages
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Turns the stream of wheel events into single scrolls: calls back with 1 (down) or -1 (up). */
export function scrollSteps(step, now = () => performance.now()) {
  let lastEvent = -1e9; let lastStep = -1e9; let lastSize = 0;
  return (deltaY) => {
    const t = now(); const size = Math.abs(deltaY);
    if (size < 4) return;
    const fresh = t - lastEvent > T.quiet;
    const pushed = t - lastStep > T.renew && size > 20 && size > lastSize * 1.6;
    lastEvent = t; lastSize = size;
    if ((fresh && t - lastStep > T.settle) || pushed) { lastStep = t; step(Math.sign(deltaY)); }
  };
}

/** The shapes behind the pages: rings, dots and the topic words, at different depths. */
function backdrop() {
  const WORDS = ["성격", "재물", "연애", "인연", "전성기", "첫인상"];
  return Array.from({ length: 34 }, (_, i) => {
    // the golden angle spreads them without a pattern, and the same way every time
    const a = i * 2.399963; const r = 52 + ((i * 29) % 50);
    const kind = i % 5 === 0 ? "word" : i % 3 === 0 ? "ring" : "dot";
    const node = h("i", `how-${kind}-bg`, kind === "word" ? WORDS[(i / 5) % WORDS.length] : "");
    const size = kind === "ring" ? 8 + (i % 4) * 5 : 1.6 + (i % 3) * 1.2;
    if (kind !== "word") { node.style.width = `${size}rem`; node.style.height = `${size}rem`; }
    return { node, x: Math.cos(a) * r * 1.5, y: Math.sin(a) * r * 0.85, z: -((i * 83) % 360) };
  });
}

export function createHow({ cover, start }) {
  const shapes = backdrop();
  const pages = [
    h("article", "how-page how-first", h("h2", "", HOW_TITLE), h("p", "", HOW_LEAD), h("p", "how-down", "아래로 내려 보세요 ↓")),
    ...STEPS.map((s, i) => {
      const art = h("div", "how-art"); art.innerHTML = s.art(); // our own drawing, from how.js
      const words = h("div", "how-words", h("b", "how-no", String(i + 1)), h("h2", "", s.title), ...s.lines.map((l) => h("p", "", l)));
      if (i === STEPS.length - 1) words.append(button("how-start", () => { close(); start(); }, "내 관상 보기"));
      return h("article", "how-page", art, words);
    }),
  ];
  const marks = pages.map((_, i) => button("how-mark", () => go(i)));
  marks.forEach((m, i) => m.setAttribute("aria-label", `${i + 1}번째 설명`));
  const layer = h("div", "how", h("div", "how-space", ...shapes.map((s) => s.node), ...pages), h("nav", "how-marks", ...marks), button("how-close", () => close(), "처음 화면으로 ↑"));
  layer.hidden = true;
  const peek = h("div", "how-peek", h("b", "", "한 번 더 내리면"), h("span", "", "어떻게 읽는지 알려 드려요"), h("i", ""), h("strong", "", "↓"));
  peek.style.setProperty("--again", `${T.again}ms`);
  document.body.append(layer, peek);

  let open = false; let target = 0; let at = 0; let waiting = null; let idle = null; let moving = 0;
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
  function draw() {
    const unit = rem();
    pages.forEach((p, i) => {
      const d = i - at; // above 0: still behind; below 0: passing the viewer
      const seen = clamp(d >= 0 ? 1 - d * 0.82 : 1 + d * 1.7, 0, 1);
      p.style.transform = `translate(-50%, -50%) translate3d(0, ${(d > 0 ? d * 5 : 0) * unit}px, ${-d * DEPTH * unit}px)`;
      p.style.opacity = seen.toFixed(3);
      p.style.visibility = seen > 0.01 ? "visible" : "hidden";
      p.style.pointerEvents = Math.abs(d) < 0.3 ? "auto" : "none";
      p.classList.toggle("is-here", Math.abs(d) < 0.4);
    });
    for (const s of shapes) {
      // each step brings the far shapes a part of a page closer; one that passes comes back far away
      const z = ((((s.z + at * DEPTH * 0.55 + 330) % 360) + 360) % 360) - 330;
      s.node.style.transform = `translate(-50%, -50%) translate3d(${s.x * unit}px, ${s.y * unit}px, ${z * unit}px)`;
      s.node.style.opacity = clamp(Math.min((z + 330) / 80, (30 - z) / 40), 0, 1).toFixed(3);
    }
  }
  function tick() {
    at += (target - at) * 0.085;
    if (Math.abs(target - at) < 0.002) at = target;
    draw();
    moving = at === target ? 0 : requestAnimationFrame(tick);
  }
  function go(i) {
    target = clamp(i, 0, pages.length - 1);
    marks.forEach((m, k) => m.classList.toggle("is-on", k === target));
    if (!moving) moving = requestAnimationFrame(tick);
    rest();
  }
  function rest() { clearTimeout(idle); idle = setTimeout(close, T.idle); }
  function forget() { clearTimeout(waiting); waiting = null; peek.classList.remove("is-on"); cover.classList.remove("is-lifted"); }
  function show() {
    forget();
    open = true; at = -0.9; target = 0;
    layer.hidden = false;
    draw(); void layer.offsetWidth; // so that the fade in starts from nothing
    layer.classList.add("is-on"); cover.classList.add("is-past");
    go(0);
  }
  function close() {
    forget(); clearTimeout(idle);
    if (!open) return;
    open = false;
    layer.classList.remove("is-on"); cover.classList.remove("is-past");
    setTimeout(() => { if (!open) layer.hidden = true; }, 600);
  }
  /** One scroll (or arrow key) on the start screen or inside the explanation. */
  function step(way) {
    if (open) {
      if (way < 0 && target === 0) close(); else go(target + way);
    } else if (way < 0) forget();
    else if (waiting) show();
    else {
      peek.classList.add("is-on"); cover.classList.add("is-lifted");
      waiting = setTimeout(forget, T.again);
    }
  }
  const wheel = scrollSteps(step);
  return {
    wheel, step, close,
    get open() { return open; },
    /** Keys while the start screen or the explanation is up. True when the key was used. */
    key(k) {
      if (k === "ArrowDown" || k === "PageDown") { step(1); return true; }
      if (k === "ArrowUp" || k === "PageUp") { step(-1); return true; }
      if (!open) return false;
      if (k === " " || k === "Enter" || k === "ArrowRight") { if (target === pages.length - 1) { close(); start(); } else go(target + 1); return true; }
      if (k === "ArrowLeft") { step(-1); return true; }
      return true; // no other key starts anything behind the explanation
    },
  };
}
