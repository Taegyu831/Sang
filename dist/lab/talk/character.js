// The master: a small white two-heads-tall character with black-rimmed glasses, drawn in SVG.
// Every pose is a set of numbers; the drawing eases toward them, so any pose can follow any other.
// ARTIFICIAL: all the shapes, poses and timings are this prototype's own.
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...children);
  return n;
};
const INK = "#1c1b1f";
const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// head: dx dy tilt (degrees). face: turn / nod (-1..1). eyes: ex ey look, open (height), happy, wink.
// mouth: smile (curve), wide (width), gape (opening). glasses: gy (slid down). arms: hand x y and elbow cx cy.
const REST = {
  dx: 0, dy: 0, tilt: 0, turn: 0, nod: 0, lean: 1, ex: 0, ey: 0, open: 1, happy: 0, wink: 0,
  smile: 14, wide: 34, gape: 0, gy: 0, pen: 0, lens: 0,
  lx: 298, ly: 752, lcx: 200, lcy: 700, rx: 502, ry: 752, rcx: 600, rcy: 700,
};
export const POSES = {
  idle: {},
  hello: { tilt: -6, smile: 22, wide: 44, gape: 14, rx: 682, ry: 330, rcx: 700, rcy: 600 },
  listen: { tilt: 7, smile: 16 },
  push: { gy: 0, ex: 0, smile: 4, wide: 22, rx: 530, ry: 318, rcx: 700, rcy: 560 },
  write: { tilt: 5, nod: 0.8, dy: 12, ey: 9, smile: 6, wide: 24, pen: 1, rx: 500, ry: 748, rcx: 640, rcy: 640, lx: 250, ly: 765 },
  think: { tilt: -9, ex: 11, ey: -10, smile: 0, wide: 20, lx: 345, ly: 482, lcx: 150, lcy: 690 },
  sky: { tilt: 10, nod: -0.75, ex: 6, ey: -13, smile: 2, wide: 16, gape: 5, pen: 1, rx: 612, ry: 455, rcx: 700, rcy: 650 },
  focus: { lean: 1.13, dy: 14, open: 0.42, smile: -2, wide: 24, lens: 1, rx: 505, ry: 322, rcx: 710, rcy: 560 },
  peek: { lean: 1.08, tilt: -5, wink: 1, smile: 20, wide: 40 },
  left: { turn: -1, tilt: -8, dx: -34, ex: -8, smile: 12, lx: 58, ly: 455, lcx: 150, lcy: 660 },
  right: { turn: 1, tilt: 8, dx: 34, ex: 8, smile: 12, rx: 742, ry: 455, rcx: 650, rcy: 660 },
  clench: { open: 0.12, smile: 0, wide: 54, dy: 6, lx: 285, ly: 470, lcx: 130, lcy: 640, rx: 515, ry: 470, rcx: 670, rcy: 640 },
  smile: { happy: 1, smile: 30, wide: 62, gape: 30, tilt: -4, lx: 222, ly: 420, lcx: 110, lcy: 640, rx: 578, ry: 420, rcx: 690, rcy: 640 },
  cheer: { happy: 1, smile: 30, wide: 56, gape: 26, dy: -16, lx: 120, ly: 250, lcx: 90, lcy: 560, rx: 680, ry: 250, rcx: 710, rcy: 560 },
};

const limb = () => {
  const outline = el("path", { fill: "none", stroke: INK, "stroke-width": 66, "stroke-linecap": "round" });
  const fill = el("path", { fill: "none", stroke: "#fff", "stroke-width": 50, "stroke-linecap": "round" });
  const hand = el("circle", { r: 40, fill: "#fff", stroke: INK, "stroke-width": 8 });
  return { outline, fill, hand };
};

export function createCharacter() {
  const outlined = { fill: "#fff", stroke: INK, "stroke-width": 8 };
  const body = el("path", { d: "M400 440 C278 440 222 548 208 690 C196 826 280 884 400 884 C520 884 604 826 592 690 C578 548 522 440 400 440 Z", ...outlined });
  const eye = (x) => {
    const dot = el("ellipse", { cx: x, cy: 318, rx: 14, ry: 18, fill: INK });
    const arc = el("path", { d: `M${x - 20} 326 q20 -30 40 0`, fill: "none", stroke: INK, "stroke-width": 9, "stroke-linecap": "round", opacity: 0 });
    return { dot, arc, x };
  };
  const eyes = [eye(318), eye(482)];
  const rim = (x) => el("circle", { cx: x, cy: 318, r: 64, fill: "none", stroke: INK, "stroke-width": 15 });
  const glint = (x) => el("path", { d: `M${x - 36} 296 q10 -22 32 -28`, fill: "none", stroke: INK, "stroke-width": 6, "stroke-linecap": "round", opacity: 0 });
  const glints = [glint(318), glint(482)];
  const glasses = el("g", {}, rim(318), rim(482), el("path", { d: "M382 310 q18 -16 36 0", fill: "none", stroke: INK, "stroke-width": 13 }),
    el("path", { d: "M254 308 L178 292 M546 308 L622 292", stroke: INK, "stroke-width": 11, "stroke-linecap": "round" }), ...glints);
  const mouth = el("path", { fill: "#fff", stroke: INK, "stroke-width": 9, "stroke-linecap": "round", "stroke-linejoin": "round" });
  const face = el("g", {}, ...eyes.flatMap((e) => [e.dot, e.arc]), glasses, mouth);
  const head = el("g", {}, el("ellipse", { cx: 400, cy: 290, rx: 238, ry: 208, ...outlined }), face);
  const left = limb(); const right = limb();
  const pen = el("g", {}, el("path", { d: "M-6 14 L54 -72", stroke: INK, "stroke-width": 18, "stroke-linecap": "round" }), el("path", { d: "M-6 14 l-12 18", stroke: INK, "stroke-width": 7, "stroke-linecap": "round" }));
  // the magnifying glass, held in the right hand while looking closely
  const lens = el("g", { opacity: 0 }, el("path", { d: "M0 0 L-6 -40", stroke: INK, "stroke-width": 20, "stroke-linecap": "round" }),
    el("circle", { cx: -20, cy: -112, r: 76, fill: "rgba(255,255,255,0.35)", stroke: INK, "stroke-width": 16 }), el("ellipse", { cx: -20, cy: -112, rx: 24, ry: 20, fill: INK }), el("circle", { cx: -12, cy: -120, r: 7, fill: "#fff" }));
  const torso = el("g", {}, body, head);
  // Whatever is below the desk top is hidden, so that the body sits behind the desk and the arms on it.
  const cut = el("rect", { x: -600, y: -600, width: 2000, height: 1500 });
  const behind = el("g", { "clip-path": "url(#behind-desk)" }, torso);
  const arms = el("g", {}, left.outline, left.fill, left.hand, right.outline, right.fill, right.hand, pen, lens);
  const root = el("svg", { viewBox: "0 0 800 900", class: "master", "aria-hidden": "true" }, el("clipPath", { id: "behind-desk" }, cut), behind, arms);

  const now = { ...REST };
  let goal = { ...REST };
  let name = "idle";
  let since = 0;
  let talking = false;
  let blinkAt = 2;
  function draw(t) {
    const wave = Math.sin;
    const k = still ? 1 : 0.13;
    for (const key of Object.keys(REST)) now[key] += (goal[key] - now[key]) * k;
    const v = { ...now };
    const age = t - since;
    // what moves on its own inside a pose
    v.dy += wave(t * 2.1) * 4;
    if (name === "hello") { v.rx += wave(t * 11) * 34; v.ry += wave(t * 22) * 6; }
    if (name === "write") { v.rx += wave(t * 15) * 22 + wave(t * 2.3) * 26; v.ry += wave(t * 23) * 7; v.lx += wave(t * 3) * 3; }
    if (name === "sky") { v.rx += wave(t * 9) * 9; v.ry += Math.abs(wave(t * 9)) * 14; }
    if (name === "think") { v.ly += wave(t * 3.2) * 5; v.tilt += wave(t * 1.4) * 2; }
    if (name === "listen") v.nod += Math.max(0, wave(t * 5)) * 0.35 * Math.max(0, 1 - age / 2.4);
    if (name === "focus") { v.rx += wave(t * 1.8) * 40; v.dx += wave(t * 1.8) * 10; }
    if (name === "left" || name === "right") { v.dx += wave(t * 4) * 10; }
    if (name === "cheer" || name === "smile") v.dy -= Math.abs(wave(t * 6)) * 12;
    // push the glasses: they slip down while the hand comes, then go back up
    if (name === "push") v.gy = age < 0.55 ? 30 : 30 * Math.max(0, 1 - (age - 0.55) * 5);
    if (name === "push") v.ry += v.gy;
    const talk = talking ? Math.abs(wave(t * 13)) * (0.6 + 0.4 * wave(t * 5.3)) : 0;
    if (talking) v.dy += wave(t * 7) * 2.5;
    // blinking
    let blink = 1;
    if (t > blinkAt) { blink = 0.1; if (t > blinkAt + 0.13) blinkAt = t + 2.2 + Math.random() * 2.5; }

    const scale = `translate(400 884) scale(${v.lean}) translate(-400 -884)`;
    torso.setAttribute("transform", scale);
    arms.setAttribute("transform", scale);
    head.setAttribute("transform", `translate(${v.dx} ${v.dy}) rotate(${v.tilt} 400 460)`);
    face.setAttribute("transform", `translate(${v.turn * 62} ${v.nod * 46})`);
    eyes.forEach((e, i) => {
      const winked = i === 1 ? v.wink : 0;
      const closed = Math.max(v.happy, winked);
      const h = Math.max(0.08, Math.min(v.open, blink));
      e.dot.setAttribute("cx", e.x + v.ex); e.dot.setAttribute("cy", 318 + v.ey);
      e.dot.setAttribute("ry", 18 * h); e.dot.setAttribute("opacity", 1 - closed);
      e.arc.setAttribute("opacity", closed);
    });
    glasses.setAttribute("transform", `translate(0 ${v.gy})`);
    const flash = name === "focus" ? 0.5 + 0.5 * wave(t * 5) : name === "push" && age > 0.6 && age < 1.3 ? 1 : 0;
    glints.forEach((g) => g.setAttribute("opacity", flash));
    const gape = v.gape + talk * 24; const w = v.wide; const y = 418;
    mouth.setAttribute("d", gape > 2 ? `M${400 - w} ${y} Q400 ${y + v.smile * 0.5} ${400 + w} ${y} Q400 ${y + v.smile + gape * 2} ${400 - w} ${y} Z` : `M${400 - w} ${y} Q400 ${y + v.smile * 1.4} ${400 + w} ${y}`);
    mouth.setAttribute("fill", gape > 2 ? INK : "none");
    for (const [arm, sx, x, yy, cx, cy] of [[left, 262, v.lx, v.ly, v.lcx, v.lcy], [right, 538, v.rx, v.ry, v.rcx, v.rcy]]) {
      const d = `M${sx} 590 Q${cx} ${cy} ${x} ${yy}`;
      arm.outline.setAttribute("d", d); arm.fill.setAttribute("d", d);
      arm.hand.setAttribute("cx", x); arm.hand.setAttribute("cy", yy);
    }
    pen.setAttribute("transform", `translate(${v.rx} ${v.ry})`); pen.setAttribute("opacity", Math.max(0, v.pen * 2 - 1));
    lens.setAttribute("transform", `translate(${v.rx} ${v.ry})`); lens.setAttribute("opacity", Math.max(0, v.lens * 3 - 2));
  }
  let shown = false;
  const frame = (ms) => { if (root.isConnected) shown = true; else if (shown) return; draw(ms / 1000); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  return {
    el: root,
    /** Where the desk top is, in the drawing's own units. */
    desk(y) { cut.setAttribute("height", y + 600); },
    pose(next) { if (!POSES[next]) return; name = next; goal = { ...REST, ...POSES[next] }; since = performance.now() / 1000; root.dataset.pose = next; },
    talk(on) { talking = on; },
  };
}
