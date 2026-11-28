// The master: a two-heads-tall bald gentleman with glasses, a moustache and a
// white coat, simplified from a reference picture the team chose, with an open book on the desk.
// Arms are two sleeves with a real elbow (shoulder -> elbow -> wrist), so that they bend like arms
// resting on a desk; every pose names where the elbows and wrists are.
// ARTIFICIAL: all the shapes, colours, poses and timings are this prototype's own.
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...children);
  return n;
};
const INK = "#1f3b30"; // the forest green of the page
const SKIN = "#ffdcc2";
const HAIR = "#5a4c47";
const COAT = "#ffffff";
const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const line = { stroke: INK, "stroke-width": 8, "stroke-linejoin": "round", "stroke-linecap": "round" };
const thin = { fill: "none", stroke: INK, "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" };

// The signature pose: elbows apart on the desk, hands folded under the chin.
const FOLDED = { clasp: 1, lx: 362, ly: 568, lex: 205, ley: 738, rx: 438, ry: 568, rex: 595, rey: 738 };
// A forearm lying on the desk, for the hand that has nothing to do.
const REST_L = { lx: 330, ly: 730, lex: 175, ley: 715 };
const REST_R = { rx: 470, ry: 730, rex: 625, rey: 715 };
const REST = {
  dx: 0, dy: 0, tilt: 0, turn: 0, nod: 0, lean: 1, ex: 0, ey: 0, open: 1, happy: 0, wink: 0, brow: 9, lift: 0,
  smile: 6, wide: 24, gape: 0, gy: 0, pen: 0, ...FOLDED,
};
export const POSES = {
  idle: {},
  hello: { tilt: -6, brow: -4, lift: -10, smile: 18, wide: 34, gape: 12, clasp: 0, ...REST_L, rx: 668, ry: 420, rex: 660, rey: 640 },
  listen: { tilt: 6, brow: 2, smile: 10 },
  push: { clasp: 0, brow: 14, smile: 2, wide: 18, ...REST_L, rx: 590, ry: 392, rex: 668, rey: 622 },
  write: { clasp: 0, tilt: 5, nod: 0.8, dy: 10, ey: 8, brow: 6, smile: 4, wide: 18, pen: 1, lx: 270, ly: 736, lex: 145, ley: 690, rx: 540, ry: 724, rex: 692, rey: 682 },
  think: { clasp: 0, tilt: -9, ex: 9, ey: -8, brow: 16, lift: -4, smile: -2, wide: 16, lx: 340, ly: 535, lex: 250, ley: 738, rx: 430, ry: 735, rex: 610, rey: 715 },
  sky: { clasp: 0, tilt: 10, nod: -0.75, ex: 5, ey: -11, brow: -8, lift: -10, smile: 0, wide: 14, gape: 5, pen: 1, ...REST_L, rx: 560, ry: 535, rex: 660, rey: 710 },
  focus: { clasp: 0, lean: 1.12, dy: 14, open: 0.45, brow: 20, lift: 6, smile: -4, wide: 20, ...REST_L, rx: 540, ry: 488, rex: 690, rey: 650 },
  peek: { lean: 1.07, tilt: -5, wink: 1, brow: -2, lift: -6, smile: 16, wide: 30 },
  left: { clasp: 0, turn: -1, tilt: -8, dx: -30, ex: -7, brow: 0, smile: 10, lx: 112, ly: 470, lex: 165, ley: 665, ...REST_R },
  right: { clasp: 0, turn: 1, tilt: 8, dx: 30, ex: 7, brow: 0, smile: 10, ...REST_L, rx: 688, ry: 470, rex: 635, rey: 665 },
  clench: { clasp: 0, open: 0.12, brow: 24, lift: 8, smile: 0, wide: 36, dy: 6, lx: 205, ly: 500, lex: 150, ley: 690, rx: 595, ry: 500, rex: 650, rey: 690 },
  smile: { clasp: 0, happy: 1, brow: -10, lift: -12, smile: 22, wide: 44, gape: 24, tilt: -4, lx: 235, ly: 490, lex: 190, ley: 710, rx: 565, ry: 490, rex: 610, rey: 710 },
  cheer: { clasp: 0, happy: 1, brow: -12, lift: -14, smile: 22, wide: 40, gape: 20, dy: -14, lx: 135, ly: 335, lex: 145, ley: 560, rx: 665, ry: 335, rex: 655, rey: 560 },
};

/** The outline of two circles joined by their tangents: the forearm of a sleeve. */
function sleeve(x1, y1, r1, x2, y2, r2) {
  const d = Math.hypot(x2 - x1, y2 - y1) || 1;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const b = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
  const at = (x, y, r, angle) => `${(x + r * Math.cos(angle)).toFixed(1)} ${(y + r * Math.sin(angle)).toFixed(1)}`;
  const big = (angle) => (angle > Math.PI ? 1 : 0);
  return `M${at(x1, y1, r1, a + b)} A${r1} ${r1} 0 ${big(2 * Math.PI - 2 * b)} 1 ${at(x1, y1, r1, a - b)} L${at(x2, y2, r2, a - b)} A${r2} ${r2} 0 ${big(2 * b)} 1 ${at(x2, y2, r2, a + b)} Z`;
}

// The left half of the coat's outline (the same numbers as the coat path below; the right half
// mirrors it), so that a sleeve can start exactly on it.
const SHOULDER = [[400, 452], [300, 452], [236, 515], [220, 670]];
/** A point of that curve, moved half a line inwards, with the direction going down the shoulder. */
function onCoat(t) {
  const [a, b, c, d] = SHOULDER; const u = 1 - t;
  const at = (i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
  const slope = (i) => 3 * (u * u * (b[i] - a[i]) + 2 * u * t * (c[i] - b[i]) + t * t * (d[i] - c[i]));
  const long = Math.hypot(slope(0), slope(1));
  const dir = [slope(0) / long, slope(1) / long]; const inward = [dir[1], -dir[0]];
  return { p: [at(0) + inward[0] * 4, at(1) + inward[1] * 4], dir, inward, long };
}
const FROM = onCoat(0.5); const TO = onCoat(0.64); // about y = 524 to 558

/**
 * The upper sleeve, drawn as part of the coat. Its outer line first runs exactly along the coat's
 * own outline (the same curve, half a line inside, because only the outer half of the sleeve's
 * wider line shows) and then turns to the elbow; its inner line ends at the armpit inside the coat,
 * and nothing is drawn between the two, so the sleeve grows out of the coat without a step, a white
 * patch or a broken line. `lid` closes the fill so that it covers the start of the line.
 */
function upperSleeve(side, ex, ey, r = 43) {
  const x = (n) => (side < 0 ? n : 800 - n);
  const sx = x(TO.p[0]); const sy = TO.p[1];
  const ax = 400 + side * 112; const ay = 636; // the armpit
  const dx = ex - sx; const dy = ey - sy; const d = Math.hypot(dx, dy) || 1;
  let nx = -dy / d; let ny = dx / d;
  if (nx * side - ny * 0.6 < 0) { nx = -nx; ny = -ny; } // the normal that points up and away from the body
  const outer = [ex + nx * r, ey + ny * r]; const inner = [ex - nx * r, ey - ny * r];
  // the cap goes round the far side of the elbow
  const sweep = nx * dy - ny * dx > 0 ? 1 : 0;
  const f = (n) => n.toFixed(1);
  const bend = [(sx + outer[0]) / 2 + nx * 8, (sy + outer[1]) / 2 + ny * 8];
  const step = ((0.64 - 0.5) / 3);
  const along = `M${f(x(FROM.p[0]))} ${f(FROM.p[1])} C${f(x(FROM.p[0] + FROM.dir[0] * FROM.long * step))} ${f(FROM.p[1] + FROM.dir[1] * FROM.long * step)} ${f(x(TO.p[0] - TO.dir[0] * TO.long * step))} ${f(TO.p[1] - TO.dir[1] * TO.long * step)} ${f(sx)} ${f(sy)}`;
  const lid = `L${f(x(FROM.p[0] - FROM.dir[0] * 4 + FROM.inward[0] * 22))} ${f(FROM.p[1] - FROM.dir[1] * 4 + FROM.inward[1] * 22)} L${f(x(FROM.p[0] - FROM.dir[0] * 4))} ${f(FROM.p[1] - FROM.dir[1] * 4)} Z`;
  const edge = `${along} C${f(x(TO.p[0] + TO.dir[0] * 24))} ${f(TO.p[1] + TO.dir[1] * 24)} ${f(bend[0])} ${f(bend[1])} ${f(outer[0])} ${f(outer[1])} A${r} ${r} 0 0 ${sweep} ${f(inner[0])} ${f(inner[1])} Q${f((inner[0] + ax) / 2)} ${f((inner[1] + ay) / 2 + 6)} ${ax} ${ay}`;
  return { edge, fill: `${edge} ${lid}` };
}

/** `side`: -1 for the arm on the left of the screen, 1 for the right. */
function makeArm(side) {
  const edge = [el("path", { fill: INK, ...line, "stroke-width": 16 }), el("path", { fill: INK, ...line, "stroke-width": 16 })];
  const fill = [el("path", { fill: COAT }), el("path", { fill: COAT })];
  edge[0].setAttribute("stroke-linecap", "butt"); // no knob where it leaves the coat's line
  const crease = el("path", { ...thin, "stroke-width": 5 });
  const cuff = el("path", { fill: "#e6f4b4", ...line, "stroke-width": 6 });
  const strap = el("path", { fill: "#8a5a3c", ...line, "stroke-width": 5 }); // across the sleeve, turning with the arm
  const watch = el("g", {}, strap, el("circle", { r: 17, fill: "#d9d6d2", ...line, "stroke-width": 6 }), el("path", { d: "M0 -7 L0 0 L6 3", ...thin, "stroke-width": 4 }));
  // drawn pointing up from the wrist, the thumb on the inner side
  const hand = el("g", {},
    el("ellipse", { cx: -side * 27, cy: -20, rx: 15, ry: 23, fill: SKIN, ...line, "stroke-width": 7, transform: `rotate(${-side * 32} ${-side * 27} -20)` }),
    el("path", { d: "M-31 2 C-38 -42 -24 -66 0 -66 C24 -66 38 -42 31 2 Z", fill: SKIN, ...line, "stroke-width": 7 }),
    el("path", { d: "M-11 -62 L-10 -42 M11 -62 L10 -42", ...thin, "stroke-width": 5 }));
  const group = el("g", {}, ...edge, ...fill, crease, hand, cuff, ...(side > 0 ? [watch] : []));
  function set(ex, ey, wx, wy, folded) {
    const upper = upperSleeve(side, ex, ey);
    const fore = sleeve(ex, ey, 43, wx, wy, 30);
    edge[0].setAttribute("d", upper.edge);
    fill[0].setAttribute("d", upper.fill);
    edge[1].setAttribute("d", fore); fill[1].setAttribute("d", fore);
    const a = Math.atan2(wy - ey, wx - ex);
    const ux = Math.cos(a); const uy = Math.sin(a);
    const p = (along, across) => `${(wx + ux * along - uy * across).toFixed(1)} ${(wy + uy * along + ux * across).toFixed(1)}`;
    cuff.setAttribute("d", `M${p(-18, -31)} L${p(8, -27)} L${p(8, 27)} L${p(-18, 31)} Z`);
    crease.setAttribute("d", `M${(ex - ux * 4 + uy * side * 20).toFixed(1)} ${(ey - uy * 4 - ux * side * 20).toFixed(1)} q${(ux * 16).toFixed(1)} ${(uy * 16).toFixed(1)} ${(ux * 34 - uy * side * 8).toFixed(1)} ${(uy * 34 + ux * side * 8).toFixed(1)}`);
    hand.setAttribute("transform", `translate(${wx + ux * 6} ${wy + uy * 6}) rotate(${(a * 180) / Math.PI + 90})`);
    hand.setAttribute("opacity", folded ? 0 : 1);
    watch.setAttribute("transform", `translate(${wx - ux * 36} ${wy - uy * 36})`);
    const half = 30 + 13 * Math.min(1, 36 / (Math.hypot(wx - ex, wy - ey) || 1)); // the sleeve's half width there
    const q = (along, across) => `${(ux * along - uy * across).toFixed(1)} ${(uy * along + ux * across).toFixed(1)}`;
    strap.setAttribute("d", `M${q(-9, -half)} L${q(9, -half)} L${q(9, half)} L${q(-9, half)} Z`);
    return { x: wx + ux * 36, y: wy + uy * 36 };
  }
  return { group, set };
}

export function createCharacter() {
  // ---- body: coat, shirt, tie ----
  const coat = el("path", { d: "M400 452 C300 452 236 515 220 670 C212 750 210 820 210 884 L590 884 C590 820 588 750 580 670 C564 515 500 452 400 452 Z", fill: COAT, ...line });
  const body = el("g", {}, coat,
    el("path", { d: "M340 466 L400 640 L460 466 Q400 448 340 466 Z", fill: "#e6f4b4", ...line, "stroke-width": 6 }),
    el("path", { d: "M386 492 L414 492 L408 514 L428 640 L400 676 L372 640 L392 514 Z", fill: "#d6f26a", ...line, "stroke-width": 6 }),
    el("path", { d: "M340 466 L306 540 L336 552 L318 576 L400 672 M460 466 L494 540 L464 552 L482 576 L400 672 L400 884", ...thin }));
  // ---- head ----
  const tuft = (side) => {
    const x = (n) => 400 + side * n;
    return el("path", { d: `M${x(150)} 190 Q${x(206)} 178 ${x(214)} 222 Q${x(250)} 232 ${x(236)} 268 Q${x(262)} 300 ${x(232)} 322 Q${x(240)} 362 ${x(196)} 362 L${x(160)} 300 Z`, fill: HAIR, ...line });
  };
  const ear = (side) => el("g", {}, el("ellipse", { cx: 400 + side * 205, cy: 348, rx: 30, ry: 40, fill: SKIN, ...line }), el("path", { d: `M${400 + side * 204} 332 q${side * 16} 12 0 32`, ...thin }));
  const sides = el("g", {}, tuft(-1), tuft(1), ear(-1), ear(1));
  const skull = el("path", { d: "M400 92 C532 92 610 188 606 306 C603 430 520 504 400 504 C280 504 197 430 194 306 C190 188 268 92 400 92 Z", fill: SKIN, ...line });
  const shine = el("path", { d: "M298 152 Q332 118 388 112", fill: "none", stroke: "#fff3e8", "stroke-width": 17, "stroke-linecap": "round" });
  const blush = [el("ellipse", { cx: 262, cy: 402, rx: 30, ry: 17, fill: "#ff9f93", opacity: 0.55 }), el("ellipse", { cx: 538, cy: 402, rx: 30, ry: 17, fill: "#ff9f93", opacity: 0.55 })];
  const eye = (x) => ({ x, dot: el("ellipse", { cx: x, cy: 322, rx: 12, ry: 15, fill: INK }), arc: el("path", { d: `M${x - 19} 330 q19 -28 38 0`, ...thin, "stroke-width": 9, opacity: 0 }) });
  const eyes = [eye(325), eye(475)];
  const brows = [-1, 1].map((side) => el("path", { d: `M${400 + side * 112} 244 Q${400 + side * 76} 232 ${400 + side * 40} 244`, fill: "none", stroke: HAIR, "stroke-width": 18, "stroke-linecap": "round" }));
  const rim = (x) => el("rect", { x: x - 64, y: 272, width: 128, height: 100, rx: 34, fill: "rgba(205,232,255,0.22)", stroke: INK, "stroke-width": 12 });
  const glint = (x) => el("path", { d: `M${x - 44} 316 q6 -24 30 -30`, fill: "none", stroke: "#fff", "stroke-width": 9, "stroke-linecap": "round", opacity: 0 });
  const glints = [glint(325), glint(475)];
  const glasses = el("g", {}, rim(325), rim(475), el("path", { d: "M389 308 q11 -12 22 0 M261 306 L208 326 M539 306 L592 326", ...thin, "stroke-width": 10 }), ...glints);
  const nose = el("path", { d: "M388 372 Q400 396 416 382", ...thin, "stroke-width": 7 });
  const moustache = el("path", { d: "M400 408 C380 394 346 400 332 432 C356 424 374 434 400 424 C426 434 444 424 468 432 C454 400 420 394 400 408 Z", fill: "#b9b1ad", ...line, "stroke-width": 6 });
  const mouth = el("path", { ...line, "stroke-width": 7, fill: "none" });
  const face = el("g", {}, ...blush, glasses, ...eyes.flatMap((e) => [e.dot, e.arc]), ...brows, mouth, moustache, nose);
  const head = el("g", {}, sides, skull, shine, face);
  // ---- arms and what the hands hold ----
  const left = makeArm(-1); const right = makeArm(1);
  const knuckle = (x, y, turn) => el("ellipse", { cx: x, cy: y, rx: 17, ry: 30, fill: SKIN, ...line, "stroke-width": 6, transform: `rotate(${turn} ${x} ${y})` });
  const folded = el("g", { opacity: 0 },
    el("path", { d: "M-78 14 C-84 -30 -44 -50 0 -42 C44 -50 84 -30 78 14 C70 46 34 50 0 40 C-34 50 -70 46 -78 14 Z", fill: SKIN, ...line }),
    knuckle(-39, -22, 52), knuckle(39, -22, -52), knuckle(-19, -8, 58), knuckle(19, -8, -58), knuckle(-3, 8, 62));
  const pen = el("g", {}, el("path", { d: "M-6 14 L54 -72", stroke: "#4f8a5f", "stroke-width": 18, "stroke-linecap": "round" }), el("path", { d: "M-6 14 l-12 18", stroke: INK, "stroke-width": 7, "stroke-linecap": "round" }));
  // The open book on the desk, between the elbows: where the pen writes.
  const rows = [736, 752, 768].flatMap((y, i) => [`M${262 - i * 7} ${y} Q${322 - i * 3} ${y - 9} 382 ${y + 2}`, `M418 ${y + 2} Q${478 + i * 3} ${y - 9} ${538 + i * 7} ${y}`]).join(" ");
  const book = el("g", { class: "desk-book" },
    el("path", { d: "M244 718 Q322 696 400 722 Q478 696 556 718 L592 800 Q496 780 400 806 Q304 780 208 800 Z", fill: "#4f8a5f", ...line }),
    el("path", { d: "M256 712 Q330 692 400 718 L400 790 Q316 766 228 784 Z", fill: "#fffdf2", ...line, "stroke-width": 6 }),
    el("path", { d: "M544 712 Q470 692 400 718 L400 790 Q484 766 572 784 Z", fill: "#fffdf2", ...line, "stroke-width": 6 }),
    el("path", { d: rows, fill: "none", stroke: "#a9bfae", "stroke-width": 4, "stroke-linecap": "round" }));
  const torso = el("g", {}, body, head);
  const cut = el("rect", { x: -600, y: -600, width: 2000, height: 1500 });
  const behind = el("g", { "clip-path": "url(#behind-desk)" }, torso);
  const arms = el("g", {}, left.group, right.group, folded, pen);
  const root = el("svg", { viewBox: "0 0 800 900", class: "master", "aria-hidden": "true" }, el("clipPath", { id: "behind-desk" }, cut), behind, book, arms);

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
    const breath = wave(t * 2.1) * 4;
    v.dy += breath;
    if (goal.clasp) { v.ly += breath * 0.8; v.ry += breath * 0.8; }
    if (name === "hello") { v.rx += wave(t * 11) * 30; v.ry += Math.abs(wave(t * 11)) * 10; }
    if (name === "write") { v.rx += wave(t * 15) * 16 + wave(t * 2.3) * 22; v.ry += wave(t * 23) * 6; }
    if (name === "sky") { v.rx += wave(t * 9) * 7; v.ry += Math.abs(wave(t * 9)) * 14; }
    if (name === "think") { v.ly += wave(t * 3.2) * 4; v.tilt += wave(t * 1.4) * 2; v.rx += Math.max(0, wave(t * 8)) * 6; }
    if (name === "listen") v.nod += Math.max(0, wave(t * 5)) * 0.35 * Math.max(0, 1 - age / 2.4);
    if (name === "focus") { v.rx += wave(t * 1.8) * 34; v.dx += wave(t * 1.8) * 10; v.brow += wave(t * 3.6) * 3; }
    if (name === "left") { v.dx += wave(t * 4) * 10; v.lx += wave(t * 4) * 18; }
    if (name === "right") { v.dx += wave(t * 4) * 10; v.rx += wave(t * 4) * 18; }
    if (name === "clench") { v.dx += wave(t * 40) * 2.5; }
    if (name === "cheer" || name === "smile") v.dy -= Math.abs(wave(t * 6)) * 10;
    // push the glasses: they slip down while the hand comes, then go back up
    if (name === "push") { v.gy = age < 0.55 ? 28 : 28 * Math.max(0, 1 - (age - 0.55) * 5); v.ry += v.gy; }
    const talk = talking ? Math.abs(wave(t * 13)) * (0.6 + 0.4 * wave(t * 5.3)) : 0;
    if (talking) { v.dy += wave(t * 7) * 2.5; v.lift -= talk * 3; }
    let blink = 1;
    if (t > blinkAt) { blink = 0.1; if (t > blinkAt + 0.13) blinkAt = t + 2.2 + Math.random() * 2.5; }

    const scale = `translate(400 884) scale(${v.lean}) translate(-400 -884)`;
    torso.setAttribute("transform", scale);
    arms.setAttribute("transform", scale);
    head.setAttribute("transform", `translate(${v.dx} ${v.dy}) rotate(${v.tilt} 400 480)`);
    face.setAttribute("transform", `translate(${v.turn * 54} ${v.nod * 40})`);
    sides.setAttribute("transform", `translate(${-v.turn * 24} 0)`);
    shine.setAttribute("transform", `translate(${v.turn * 26} ${v.nod * 12})`);
    eyes.forEach((e, i) => {
      const closed = Math.max(v.happy, i === 1 ? v.wink : 0);
      e.dot.setAttribute("cx", e.x + v.ex); e.dot.setAttribute("cy", 322 + v.ey);
      e.dot.setAttribute("ry", 15 * Math.max(0.12, Math.min(v.open, blink)));
      e.dot.setAttribute("opacity", 1 - closed);
      e.arc.setAttribute("opacity", closed);
    });
    brows.forEach((b, i) => {
      const side = i ? 1 : -1;
      // a positive `brow` pulls the inner ends down: the serious look
      b.setAttribute("transform", `translate(0 ${v.lift}) rotate(${-side * v.brow} ${400 + side * 76} 240)`);
    });
    glasses.setAttribute("transform", `translate(0 ${v.gy})`);
    const flash = name === "focus" ? 0.55 + 0.45 * wave(t * 5) : name === "push" && age > 0.6 && age < 1.3 ? 1 : 0.35;
    glints.forEach((g) => g.setAttribute("opacity", flash));
    const gape = v.gape + talk * 22; const w = v.wide; const y = 456;
    mouth.setAttribute("d", gape > 2 ? `M${400 - w} ${y} Q400 ${y + v.smile * 0.4} ${400 + w} ${y} Q400 ${y + v.smile * 0.6 + gape * 1.7} ${400 - w} ${y} Z` : `M${400 - w} ${y} Q400 ${y + v.smile * 1.2} ${400 + w} ${y}`);
    mouth.setAttribute("fill", gape > 2 ? "#7a3440" : "none");
    const together = v.clasp > 0.8;
    left.set(v.lex, v.ley, v.lx, v.ly, together);
    const hold = right.set(v.rex, v.rey, v.rx, v.ry, together);
    folded.setAttribute("transform", `translate(${(v.lx + v.rx) / 2} ${(v.ly + v.ry) / 2 - 22}) scale(1.16)`);
    folded.setAttribute("opacity", together ? 1 : 0);
    pen.setAttribute("transform", `translate(${hold.x} ${hold.y})`); pen.setAttribute("opacity", Math.max(0, v.pen * 2 - 1));
  }
  let shown = false;
  const frame = (ms) => {
    if (root.isConnected) shown = true; else if (shown) return; // replaced by another screen
    draw(ms / 1000);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return {
    el: root,
    desk(y) { cut.setAttribute("height", y + 600); },
    pose(next) { if (!POSES[next]) return; name = next; goal = { ...REST, ...POSES[next] }; since = performance.now() / 1000; root.dataset.pose = next; },
    talk(on) { talking = on; },
  };
}
