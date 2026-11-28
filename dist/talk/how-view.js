// The big screen's way into "어떻게 재나요?" (words and drawings in how.js): one page, one scroll.
//   0. A small moving arrow at the foot of the start screen says that something is below.
//   1. One scroll down only turns it into a sign: scroll once more. Without a second scroll in time,
//      the arrow comes back and the next scroll counts as the first again.
//   2. The second scroll slides the start screen away. From there every scroll moves one full page.
//      The drawing, the words and the shapes behind move at different speeds, which gives depth.
// Scrolling up from the first page, the close button or Esc goes back to the start screen.
// ARTIFICIAL: every time and distance below, and the look.
import { h, button } from "./kit.js";
import { HOW_TITLE, HOW_LEAD, HOW_PROMISE, STEPS } from "./how.js";

const T = {
  again: 3500, // the second scroll must come within this
  quiet: 220, // wheel events closer together than this are one scroll (a trackpad sends many)
  settle: 650, // a new swipe is not taken while the last page is still moving
  renew: 1100, // while a long glide goes on, a clearly stronger push after this is a new scroll
  idle: 90000, // left alone, the explanation closes
};
// how much further than its page each layer travels, in screen heights (the further ahead, the faster)
const LAG = { art: 0.34, words: 0.12 };
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

/** The shapes behind the pages: rings, dots and the topic words. `near` 0.2 (far, slow) to 0.7. */
function backdrop() {
  const WORDS = ["성격", "재물", "연애", "인연", "전성기", "첫인상"];
  return Array.from({ length: 36 }, (_, i) => {
    const near = [0.2, 0.42, 0.7][i % 3];
    const kind = i % 6 === 0 ? "word" : i % 4 === 1 ? "ring" : "dot";
    const node = h("i", `how-${kind}-bg`, kind === "word" ? WORDS[(i / 6) % WORDS.length] : "");
    const size = (kind === "ring" ? 6 + (i % 4) * 2.5 : 1.4 + (i % 3)) * (0.6 + near);
    if (kind !== "word") { node.style.width = `${size}rem`; node.style.height = `${size}rem`; } else node.style.scale = (0.55 + near).toFixed(2);
    // spread without a pattern, the same every time; mostly toward the sides, clear of the text
    const side = i % 2 ? 1 : -1;
    node.style.left = `${50 + side * (42 + ((i * 17) % 8))}%`;
    node.style.opacity = (0.25 + near * 0.8).toFixed(2);
    return { node, near, y: ((i * 61) % 140) / 100 };
  });
}

export function createHow({ cover, start }) {
  const shapes = backdrop();
  const pages = [
    h("article", "how-page how-first", h("div", "how-words", h("h2", "", HOW_TITLE), h("p", "", HOW_LEAD), h("p", "how-promise", HOW_PROMISE), h("p", "how-down", "↓"))),
    ...STEPS.map((s, i) => {
      const art = h("div", "how-art"); art.innerHTML = s.art(); // our own drawing, from how.js
      const no = STEPS.slice(0, i + 1).filter((x) => !x.aside).length;
      const words = h("div", "how-words", h("b", s.aside ? "how-no aside" : "how-no", s.aside ? "잠깐!" : String(no)), h("h2", "", s.title), ...s.lines.map((l) => h("p", "", l)));
      if (i === STEPS.length - 1) words.append(button("how-start", () => { close(true); start(); }, "내 관상 보기"));
      return h("article", "how-page", art, words);
    }),
  ];
  const marks = pages.map((_, i) => button("how-mark", () => go(i)));
  marks.forEach((m, i) => m.setAttribute("aria-label", `${i + 1}번째 설명`));
  const layer = h("div", "how", ...shapes.map((s) => s.node), ...pages, h("nav", "how-marks", ...marks), button("how-close", () => close(), "처음 화면으로 ↑"));
  layer.hidden = true;
  const hint = button("how-hint", () => show(), h("span", "", "어떻게 재나요?"), h("i", ""));
  cover.append(hint);
  const peek = h("div", "how-peek", h("b", "", "한 번 더 내리면"), h("span", "", "어떻게 재는지 알려 드려요"), h("i", ""), h("strong", "", "↓"));
  peek.style.setProperty("--again", `${T.again}ms`);
  document.body.append(layer, peek);

  // `at` is the page in view; -1 is the start screen
  let open = false; let target = -1; let at = -1; let waiting = null; let idle = null; let moving = 0;
  function draw() {
    const high = innerHeight;
    const lifted = clamp(at + 1, 0, 1);
    cover.style.transform = lifted ? `translateY(${(-lifted * high).toFixed(1)}px)` : "";
    layer.style.transform = `translateY(${((1 - lifted) * high).toFixed(1)}px)`;
    const here = Math.max(0, at);
    pages.forEach((p, i) => {
      const d = i - here;
      p.style.transform = `translateY(${(d * high).toFixed(1)}px)`;
      p.style.visibility = Math.abs(d) < 0.999 ? "visible" : "hidden";
      p.style.pointerEvents = Math.abs(d) < 0.3 ? "auto" : "none";
      p.classList.toggle("is-here", at > -0.4 && Math.abs(d) < 0.4);
      for (const [name, lag] of Object.entries(LAG)) {
        const part = p.querySelector(`.how-${name}`);
        if (!part) continue;
        part.style.transform = `translateY(${(d * lag * high).toFixed(1)}px)`;
        part.style.opacity = clamp(1 - Math.abs(d) * 1.4, 0, 1).toFixed(3);
      }
    });
    for (const s of shapes) {
      // a shape that leaves at the top comes back from below
      const y = ((((s.y - at * s.near) % 1.4) + 1.4) % 1.4) - 0.2;
      s.node.style.transform = `translate(-50%, ${(y * high).toFixed(1)}px)`;
    }
  }
  function tick() {
    at += (target - at) * 0.09;
    if (Math.abs(target - at) < 0.0015) at = target;
    draw();
    moving = at === target ? 0 : requestAnimationFrame(tick);
    if (!moving && !open) rested();
  }
  function move() { if (!moving) moving = requestAnimationFrame(tick); }
  function go(i) {
    target = clamp(i, 0, pages.length - 1);
    marks.forEach((m, k) => m.classList.toggle("is-on", k === target));
    move(); rest();
  }
  function rest() { clearTimeout(idle); idle = setTimeout(() => close(), T.idle); }
  /** Back on the start screen: nothing of the explanation is left over it. */
  function rested() { layer.hidden = true; cover.style.transform = ""; }
  function forget() { clearTimeout(waiting); waiting = null; peek.classList.remove("is-on"); cover.classList.remove("is-lifted"); }
  function show() {
    forget();
    open = true; layer.hidden = false; draw();
    go(0);
  }
  /** `atOnce`: without the slide, because another screen takes over. */
  function close(atOnce = false) {
    forget(); clearTimeout(idle);
    open = false; target = -1;
    if (atOnce) { cancelAnimationFrame(moving); moving = 0; at = -1; rested(); return; }
    if (!layer.hidden) move();
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
  addEventListener("resize", () => { if (!layer.hidden) draw(); });
  const wheel = scrollSteps(step);
  return {
    wheel, step, close,
    get open() { return open; },
    /** Keys while the start screen or the explanation is up. True when the key was used. */
    key(k) {
      if (k === "ArrowDown" || k === "PageDown") { step(1); return true; }
      if (k === "ArrowUp" || k === "PageUp") { step(-1); return true; }
      if (!open) return false;
      if (k === " " || k === "Enter" || k === "ArrowRight") { if (target === pages.length - 1) { close(true); start(); } else go(target + 1); return true; }
      if (k === "ArrowLeft") { step(-1); return true; }
      return true; // no other key starts anything behind the explanation
    },
  };
}
