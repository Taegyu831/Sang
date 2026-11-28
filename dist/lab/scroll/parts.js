// Things the three looks build with: the photo cut into jigsaw pieces, the measuring section,
// the matching pieces, the whole summary and the last words.
import { h, button, rich, photoCard, focusPart, linesOf, dotsOn, firstSentence } from "../desk/engine.js";
import { CLOSING_NOTES, CLOSING_QUOTE } from "../../closing.js";

const SVG = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/** A repeatable pseudo-random number in [-1, 1]. */
export const wobble = (i, k = 1) => Math.sin((i + 1) * 91.7 * k) % 1;
/** Where the i-th piece flies in from: all around the screen. */
export const around = (i, turn = 90) => { const a = i * 2.399; return [Math.cos(a) * 70, Math.sin(a) * 80, wobble(i) * turn, 0.7]; };

// One jigsaw edge from (x0,y0) to (x1,y1). tab: 1 bulges out, -1 goes in, 0 stays straight.
function edge(x0, y0, x1, y1, tab) {
  if (!tab) return `L ${x1} ${y1}`;
  const dx = x1 - x0; const dy = y1 - y0;
  const at = (u, v) => `${(x0 + dx * u + dy * v * tab).toFixed(1)} ${(y0 + dy * u - dx * v * tab).toFixed(1)}`;
  return `L ${at(0.36, 0)} C ${at(0.47, 0)} ${at(0.28, 0.23)} ${at(0.5, 0.23)} C ${at(0.72, 0.23)} ${at(0.53, 0)} ${at(0.64, 0)} L ${x1} ${y1}`;
}
export const piecePath = (x, y, w, ht, [top, right, bottom, left]) =>
  `M ${x} ${y} ${edge(x, y, x + w, y, top)} ${edge(x + w, y, x + w, y + ht, right)} ${edge(x + w, y + ht, x, y + ht, bottom)} ${edge(x, y + ht, x, y, left)} Z`;

let cut = 0;
/** The photo as cols x rows jigsaw pieces that together make the whole picture. Returns the board and its pieces. */
export function jigsaw(src, cols = 4, rows = 5) {
  const w = 800 / cols; const ht = 1000 / rows; const pad = Math.max(w, ht) * 0.3;
  const sign = (a, b) => ((a * 7 + b * 13) % 2 ? 1 : -1);
  const board = h("div", "jigsaw");
  const pieces = [];
  cut += 1;
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const sides = [r ? -sign(r - 1, c) : 0, c < cols - 1 ? sign(r + 3, c) : 0, r < rows - 1 ? sign(r, c) : 0, c ? -sign(r + 3, c - 1) : 0];
    const x = c * w; const y = r * ht; const d = piecePath(x, y, w, ht, sides); const id = `cut${cut}-${r}-${c}`;
    const art = el("svg", { viewBox: `${x - pad} ${y - pad} ${w + pad * 2} ${ht + pad * 2}` });
    const clip = el("clipPath", { id }); clip.append(el("path", { d }));
    art.append(clip, el("image", { href: src, width: 800, height: 1000, preserveAspectRatio: "none", "clip-path": `url(#${id})` }), el("path", { d, class: "seam" }));
    const holder = h("div", "jig"); holder.append(art);
    Object.assign(holder.style, { left: `${((x - pad) / 800) * 100}%`, top: `${((y - pad) / 1000) * 100}%`, width: `${((w + pad * 2) / 800) * 100}%`, height: `${((ht + pad * 2) / 1000) * 100}%` });
    board.append(holder); pieces.push(holder);
  }
  return { board, pieces };
}
/** A single jigsaw-shaped card with a label, for the matching section. */
export function shapeCard(className, sides, small, big) {
  const art = el("svg", { viewBox: "-30 -30 160 160", preserveAspectRatio: "none" });
  art.append(el("path", { d: piecePath(0, 0, 100, 100, sides) }));
  const box = h("div", `shape ${className}`, h("div", "shape-text", h("small", "", small), h("b", "", big)));
  box.prepend(art);
  return box;
}
/** A close look at one part of the face: the photo zoomed there. */
export function closeUp(face, part, className = "closeup", most = 2.6) {
  const photo = photoCard(face);
  // The shortest line of a part is the part itself (longer ones are what it is compared with).
  const length = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);
  const line = linesOf(part, face.points).sort((m, n) => length(m) - length(n))[0];
  if (line) {
    const [a, b] = line;
    const scale = Math.max(Math.min(1.3, most), Math.min(most, 55 / Math.max(8, length(line)))); // ARTIFICIAL: zoom range
    const clampPct = (v) => Math.max(100 - 100 * scale, Math.min(0, v));
    photo.zoom.style.transform = `translate(${clampPct(50 - ((a.x + b.x) / 2) * scale)}%, ${clampPct(50 - ((a.y + b.y) / 2) * scale)}%) scale(${scale})`;
  }
  return h("div", className, photo.box);
}

/** The measuring section: the face stays, and scrolling walks it through the parts. */
export function measureSection(m, root, face, data, { numberFrom, nameFrom }) {
  const s = m.section(root, "얼굴 측정", 6000, "measure-part");
  const photo = photoCard(face, "m-photo");
  const info = h("div", "m-info");
  const steps = h("ol", "m-steps", ...data.shown.map((p) => h("li", "", p.part)));
  const left = m.piece(s, h("div", "m-left", photo.box), { from: [-40, 10, -12, 0.8], at: 0, span: 0.1 });
  s.view.append(h("div", "m-wrap", left, h("div", "m-right", m.piece(s, h("h2", "m-head", "먼저, 얼굴을 재 볼게요"), { from: [40, -20, 6, 1], at: 0.02, span: 0.1 }), steps, info)));
  dotsOn(photo, face, 900);
  const cards = data.shown.map((part) => {
    const figure = part.mine.match(/-?\d+(?:\.\d+)?(%|도|배)?/);
    const number = h("b", "m-number", figure ? figure[0] : "OK");
    const card = h("div", "m-card", number, h("h3", "m-name", part.name), h("p", "m-mine", firstSentence(part.mine)), rich("p", "m-read", part.summary ?? ""));
    info.append(card);
    return { part, card, number, name: card.children[1], figure };
  });
  let shownStep = -2;
  const begin = 0.2; const width = (0.98 - begin) / cards.length;
  // One step for each part: the photo moves there and the number counts up by itself.
  s.stops = cards.map((_, i) => begin + width * (i + 0.6));
  s.froms = cards.map((_, i) => (i ? begin + width * i : 0));
  s.more = "다음 부위";
  s.onProgress = (q) => {
    const step = q < begin ? -1 : Math.min(cards.length - 1, Math.floor((q - begin) / width));
    if (step !== shownStep) {
      shownStep = step;
      focusPart(photo, face, step < 0 ? null : data.shown[step], 1.7);
      cards.forEach((c, i) => c.card.classList.toggle("is-on", i === step));
      [...steps.children].forEach((li, i) => { li.classList.toggle("is-on", i === step); li.classList.toggle("is-done", i < step); });
      info.classList.toggle("is-waiting", step < 0);
    }
    if (step < 0) return;
    // The number counts up and the name slides in with the first half of the step.
    const c = cards[step]; const local = Math.min(1, (q - begin - step * width) / (width * 0.45));
    if (c.figure) { const digits = (c.figure[0].split(".")[1] ?? "").replace(/\D/g, "").length; c.number.textContent = `${(parseFloat(c.figure[0]) * local).toFixed(digits)}${c.figure[1] ?? ""}`; }
    const rest = (1 - local) ** 2;
    c.number.style.transform = `translate(${numberFrom[0] * rest}vw, ${numberFrom[1] * rest}vh) rotate(${numberFrom[2] * rest}deg)`;
    c.name.style.transform = `translate(${nameFrom[0] * rest}vw, ${nameFrom[1] * rest}vh) rotate(${nameFrom[2] * rest}deg)`;
  };
  info.append(h("p", "m-prompt", "하나씩 재 볼게요"));
  return s;
}

/** 인연: the fitting piece clicks into mine, the other one stops short of it. */
export function bondSection(m, root, data) {
  const t = data.topics.at(-1);
  const s = m.section(root, "인연", 2400, "bond-part");
  const mine = shapeCard("is-mine", [0, 1, 0, 0], "당신", "나");
  const fit = shapeCard("is-fit", [0, 0, 0, -1], "찰떡인 사람", data.fit);
  const clash = shapeCard("is-clash", [0, 0, 0, 1], "조심할 사람", data.clash);
  const fitText = h("div", "bond-text", ...t.lines.slice(0, 2).map((l, i) => rich("p", i ? "" : "lead", l)));
  const clashText = h("div", "bond-text", ...t.lines.slice(2).map((l, i) => rich("p", i ? "" : "lead", l)));
  s.view.append(m.piece(s, h("h2", "title", "누구랑 잘 맞을까?"), { from: [0, -40, -4, 1.2], at: 0, span: 0.18 }),
    h("div", "bond-grid",
      h("div", "bond-row", m.piece(s, mine, { from: [-50, 0, -40, 1], at: 0.08, span: 0.2 }), m.piece(s, fit, { from: [60, -10, 60, 1], at: 0.22, span: 0.24 })), m.piece(s, fitText, { from: [0, 40, 0, 1], at: 0.38, span: 0.18 }),
      h("div", "bond-row is-apart", m.piece(s, clash, { from: [60, 20, -80, 1], at: 0.46, span: 0.24, tilt: 9 })), m.piece(s, clashText, { from: [0, 40, 0, 1], at: 0.6, span: 0.18 })));
  return s;
}

const fitText = (box) => { for (let size = 100; size > 52 && box.scrollHeight > box.clientHeight + 2; size -= 4) box.style.fontSize = `${size}%`; };
/** The friendly wrap-up: the card to photograph and the whole reading in a few paragraphs. */
export function summarySection(m, root, face, data, summary) {
  const s = m.section(root, "전체 정리", 1800, "sum-part");
  const photo = photoCard(face);
  const card = h("div", "sum-card", photo.box, h("div", "sum-words", ...data.words.slice(0, 5).map((w) => h("span", "", w))), h("p", "sum-bond", `찰떡  ${data.fit}`), h("p", "sum-bond", `조심  ${data.clash}`), h("small", "", "휴대폰으로 찍어 가세요"));
  const text = h("div", "sum-text", h("p", "sum-wait", "전체 정리를 쓰는 중"));
  s.view.append(h("div", "sum-wrap",
    m.piece(s, card, { from: [-60, 30, -35, 0.6], at: 0.04, span: 0.3, tilt: -2 }),
    h("div", "sum-side", m.piece(s, h("p", "kicker", "여기까지 본 걸 모으면"), { from: [40, -30, 8, 1], at: 0.14, span: 0.22 }), m.piece(s, rich("h2", "sum-head", data.story.headline), { from: [55, 0, 0, 1], at: 0.22, span: 0.26 }), m.piece(s, text, { from: [0, 45, 0, 1], at: 0.36, span: 0.28 }))));
  summary.then((result) => {
    text.replaceChildren(...result.paragraphs.map((p) => h("p", "", p)), ...(result.ai ? [h("small", "", "AI가 풀이 항목을 엮어 쓴 글입니다.")] : []));
    requestAnimationFrame(() => fitText(text));
  });
  return s;
}
/** The last words: everything stops flying about and the lines settle straight, one at a time. */
export function closingSection(m, root, { again, home }) {
  const s = m.section(root, "마지막 한마디", 5000, "end-part");
  s.stops = [0.41, 0.57, 1]; // the quotation, the first note, the last words
  const settle = (node, at, from = [0, 7], span = 0.1) => m.piece(s, node, { from: [...from, 0, 1], at, span, calm: true });
  const han = h("p", "q-han", ...[...CLOSING_QUOTE.han].map((c, i) => (c === " " ? h("i", "q-gap") : settle(h("span", "", c), 0.08 + i * 0.012, [0, i % 2 ? 9 : -9]))));
  const quote = h("blockquote", "q", han, settle(h("p", "q-ko", CLOSING_QUOTE.ko), 0.27), settle(h("p", "q-mean", CLOSING_QUOTE.meaning), 0.32), settle(h("p", "q-src", CLOSING_QUOTE.source), 0.35));
  const [a, b, c] = CLOSING_NOTES;
  const notes = h("div", "end-notes", settle(rich("p", "end-first", a), 0.44, [0, 8], 0.12), h("div", "end-key", settle(rich("p", "", b), 0.58, [-14, 0], 0.1), settle(rich("p", "", c), 0.68, [14, 0], 0.1)));
  s.view.append(quote, notes, settle(h("div", "end-actions", button("cta", again, "다시 보기"), button("ghost", home, "처음으로")), 0.8, [0, 6], 0.06));
  return s;
}
