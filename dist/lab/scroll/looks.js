// The three looks. Each builds the same reading with its own way of putting things together.
import { h, rich, photoCard, focusPart } from "../desk/engine.js";
import { jigsaw, around, wobble, closeUp } from "./parts.js";

const HEADS = { 성격: "나는 이런 사람", "일과 재물": "돈이랑 일은?", "사람과 사랑": "사람 그리고 사랑", 시기: "나의 때는 언제?" };
const partFor = (data, i) => data.shown[i % data.shown.length];

// ---------- 1. puzzle: tiles fly in from every side and make one board ----------
const puzzle = {
  name: "관상 퍼즐",
  shot: { number: [30, -30, 25], name: [40, 10, -12] },
  /** The first screen of the result: the photo puts itself together. Returns the pieces to fly in over time. */
  hero(view, face, data) {
    const { board, pieces } = jigsaw(face.src);
    const head = h("div", "hero-text", h("p", "kicker", "당신의 얼굴 퍼즐, 완성"), rich("h1", "", data.story.headline));
    view.append(h("div", "hero", board, head));
    return [...pieces.map((node, i) => ({ node, from: around(i, 140), delay: i * 60 })), { node: head.children[0], from: [40, -30, 10, 1], delay: 1300 }, { node: head.children[1], from: [50, 20, -6, 1], delay: 1550 }];
  },
  topic(m, root, data, i, face) {
    const t = data.topics[i];
    const s = m.section(root, t.title, 2000, "topic");
    const title = h("div", "tile t-title", h("small", "", t.title), h("h2", "", HEADS[t.title] ?? t.ask));
    const shot = closeUp(face, partFor(data, i), "tile t-shot", 1.2);
    const keys = t.words.map((w, k) => h("div", `tile t-key k${k}`, w));
    const lines = t.lines.map((l, k) => h("div", `tile t-line l${k}`, rich("p", "", l)));
    s.view.append(h("div", `board n${t.lines.length} w${keys.length} ${i % 2 ? "flip" : ""}`, title, shot, ...keys, ...lines));
    [title, shot, ...keys].forEach((node, k) => m.piece(s, node, { from: around(k + i * 3, 55), at: 0.02 + k * 0.045, span: 0.26 }));
    lines.forEach((node, k) => m.piece(s, node, { from: around(k * 2 + i + 5, 30), at: 0.24 + k * 0.1, span: 0.24 }));
  },
};

// ---------- 2. sticker: the face stays put and stickers peel off it ----------
const sticker = {
  name: "관상 스티커북",
  shot: { number: [-34, 5, -30], name: [-30, 12, 20] },
  hero(view, face, data) {
    const photo = photoCard(face);
    const big = h("div", "sticker hero-photo", photo.box);
    const words = data.words.slice(0, 6).map((w, i) => h("span", `sticker word s${i}`, w));
    const head = h("div", "hero-text", h("p", "kicker", "당신 얼굴에서 찾은 것들"), rich("h1", "", data.story.headline));
    view.append(h("div", "hero", h("div", "hero-face", big, ...words), head));
    return [{ node: big, from: [0, -90, -30, 1.6], delay: 0 }, ...words.map((node, i) => ({ node, from: { node: big }, delay: 700 + i * 130 })), { node: head.children[0], from: [40, 0, 0, 1], delay: 900 }, { node: head.children[1], from: [40, 30, 8, 1], delay: 1100 }];
  },
  topic(m, root, data, i, face) {
    const t = data.topics[i];
    const s = m.section(root, t.title, 2000, "topic");
    const part = partFor(data, i);
    const photo = photoCard(face);
    focusPart(photo, face, part, 1.12);
    const source = h("div", "sticker s-face", photo.box);
    const badge = h("div", "s-badge", closeUp(face, part, "sticker s-crop"), h("span", "sticker s-part", part.name));
    const keys = h("div", "s-keys", ...t.words.map((w) => h("span", "sticker word", w)));
    const notes = h("div", "s-notes", ...t.lines.map((l) => h("div", "sticker note", rich("p", "", l))));
    s.view.append(h("div", `spread ${i % 2 ? "flip" : ""}`, h("div", "s-side", source, badge), h("div", "s-main", h("h2", "title", HEADS[t.title] ?? t.ask), keys, notes)));
    m.piece(s, source, { from: [i % 2 ? 40 : -40, 20, i % 2 ? 22 : -22, 0.7], at: 0, span: 0.2, tilt: i % 2 ? 2 : -2 });
    m.piece(s, s.view.querySelector(".title"), { from: [0, -35, 5, 1.3], at: 0.04, span: 0.2 });
    m.piece(s, badge.children[0], { from: { node: source, scale: 0.4, turn: -120 }, at: 0.16, span: 0.24, tilt: -6 });
    m.piece(s, badge.children[1], { from: { node: source }, at: 0.22, span: 0.22, tilt: 4 });
    [...keys.children].forEach((node, k) => m.piece(s, node, { from: { node: source, turn: 40 }, at: 0.2 + k * 0.06, span: 0.24, tilt: wobble(k + i, 3) * 4 }));
    [...notes.children].forEach((node, k) => m.piece(s, node, { from: { node: source, scale: 0.15, turn: -30 }, at: 0.34 + k * 0.09, span: 0.22, tilt: wobble(k * 2 + i, 7) * 1.4 }));
  },
};

// ---------- 3. type: scattered words gather into large sentences ----------
/** A sentence as separate words, so that each can fly to its place. Highlighted words stay highlighted. */
function wordsOf(text) {
  const clean = text.replace(/⟪(?:\w+\|)?(.+?)⟫/g, "$1").replace(/§/g, "");
  const line = h("p", "assembled");
  const nodes = [];
  clean.split(/⟦|⟧/).forEach((chunk, i) => {
    // text that touches a highlighted word (a particle, a comma) stays attached to it
    chunk.split(/(\s+)/).forEach((word) => {
      if (!word) return;
      if (/^\s+$/.test(word)) { line.append(" "); return; }
      const node = h(i % 2 ? "em" : "span", "w", word);
      let holder = line.lastChild;
      if (!holder?.classList?.contains("glue")) { holder = h("span", "glue"); line.append(holder); nodes.push(holder); }
      holder.append(node);
    });
  });
  return { line, nodes };
}
const type = {
  name: "관상 문장",
  shot: { number: [0, 45, 0], name: [45, 0, 0] },
  hero(view, face, data) {
    const photo = photoCard(face);
    const round = h("div", "t-round", photo.box);
    const { line, nodes } = wordsOf(data.story.headline);
    const kicker = h("p", "kicker", "당신의 얼굴을 한 문장으로");
    view.append(h("div", "hero", round, kicker, line));
    return [{ node: round, from: [0, -70, 180, 0.2], delay: 0 }, { node: kicker, from: [-40, 0, 0, 1], delay: 600 }, ...nodes.map((node, i) => ({ node, from: around(i + 2, 60), delay: 800 + i * 110 }))];
  },
  topic(m, root, data, i, face) {
    const t = data.topics[i];
    const s = m.section(root, t.title, 2800, `topic ${i % 2 ? "is-dark" : ""}`);
    const giant = h("h2", "giant", ...[...(HEADS[t.title] ?? t.ask)].map((c) => h("span", "", c === " " ? " " : c)));
    const round = closeUp(face, partFor(data, i), "t-round", 1.5);
    const keys = h("div", "t-keys", ...t.words.map((w) => h("div", "slot", h("span", "", w))));
    const stack = h("div", `t-lines n${t.lines.length}`);
    s.view.append(h("div", "t-head", round, giant), keys, stack);
    [...giant.children].forEach((node, k) => m.piece(s, node, { from: [wobble(k + i, 5) * 40, wobble(k * 3 + i, 2) * 60, wobble(k, 9) * 120, 1.8], at: 0.02 + k * 0.008, span: 0.17 }));
    m.piece(s, round, { from: [-40, -10, -180, 0.2], at: 0.04, span: 0.2 });
    [...keys.children].forEach((slot, k) => m.piece(s, slot.firstChild, { from: [wobble(k, 11) * 60, 55 + k * 6, wobble(k, 4) * 40, 1.4], at: 0.16 + k * 0.05, span: 0.2 }));
    // The sentences assemble one after another and stay, the earlier ones stepping back.
    const starts = t.lines.map((_, k) => 0.3 + k * 0.13);
    t.lines.forEach((l, k) => {
      const { line, nodes } = wordsOf(l);
      stack.append(line);
      nodes.forEach((node, j) => m.piece(s, node, { from: [wobble(j + k, 13) * 45, wobble(j * 2 + k, 17) * 55, wobble(j, 19) * 50, 1.5], at: starts[k] + (j / nodes.length) * 0.05, span: 0.12 }));
    });
    s.onProgress = (q) => {
      const now = starts.filter((a) => q >= a).length - 1;
      [...stack.children].forEach((p, k) => p.classList.toggle("is-past", q < 0.84 && k < now));
    };
  },
};

export const LOOKS = { puzzle, sticker, type };
