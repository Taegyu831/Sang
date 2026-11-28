// Character design prototype (2026-11-28): the visitor sits across from a small, serious fortune
// reader and is led through the whole experience as a conversation.
//   seat -> gender, age, nickname -> guided capture -> thinking -> pick a question (again and again)
//   -> "이제 충분해요" -> the last words and a card
// Keys: space / enter = go on, digits = choose, T = next look, S = sample face, Esc = start over.
// ?look=desk|night|note   ?scene=menu|read|end|shoot&sample=1&topic=self  (for screenshots)
import { h, button, sampleFace, loadContent, photoCard } from "../desk/engine.js";
import { CLOSING_QUOTE, CLOSING_SPOKEN } from "../../closing.js";
import { createCharacter } from "./character.js";
import { captureFace, stopCamera } from "./capture-room.js";
import { TOPICS, NICKNAMES, answer, readingFor, josa } from "./spoken.js";

// ARTIFICIAL: timings (ms) of this prototype.
const T = { type: 38, after: 900, perChar: 55, gesture: 1500, stuck: 60000, askIdle: 45000, menuIdle: 60000, endIdle: 60000 };
const LOOKS = ["desk", "night", "note"];
const NAMES = { desk: "상담 책상", night: "밤의 상담소", note: "관상 노트" };

const params = new URLSearchParams(location.search);
let look = params.get("look");
const stage = document.querySelector("#stage");
let content = null;
const visitor = { gender: null, age: null, nick: null, face: null, reading: null, heard: [] };
let master = null;
let ui = null;
let run = 0;
let scene = "";
let skip = () => {};
let speech = 0;
let keys = () => {};

// ---------- the room ----------
function build() {
  master = createCharacter();
  const bubble = h("div", "bubble");
  const speaker = h("span", "speaker", "관상 선생");
  const text = h("p", "said");
  const more = h("span", "more", "▼");
  bubble.append(speaker, text, more);
  const choices = h("div", "choices");
  const book = h("div", "book");
  const video = h("video", ""); video.muted = true; video.playsInline = true;
  const dots = h("div", "dots", ...["정면", "왼쪽", "오른쪽", "턱 힘", "웃기"].map((n) => h("span", "", n)));
  const mirror = h("div", "mirror", h("div", "glass", video, h("div", "oval")), dots);
  const arrow = h("div", "arrow");
  const card = h("div", "card");
  const enough = button("enough", () => ending(), "이제 충분해요");
  const room = h("div", "room", h("div", "lamp"), h("div", "shelf"), h("div", "window"));
  const table = h("div", "table");
  const who = h("div", "who");
  stage.replaceChildren(h("div", "scene", room, h("div", "actor", master.el), table, arrow, bubble, book, choices, mirror, card, enough, who));
  bubble.addEventListener("click", () => skip());
  ui = { bubble, text, choices, book, video, mirror, dots, arrow, card, enough, who };
  seatAtDesk();
}
function seatAtDesk() {
  const actor = stage.querySelector(".actor"); const table = stage.querySelector(".table");
  if (actor?.offsetHeight) master.desk(((table.offsetTop + table.clientTop - actor.offsetTop) / actor.offsetHeight) * 900);
}

/** A new part of the conversation: whatever was waiting ends. */
function enter(name) {
  run += 1;
  const mine = run;
  scene = name; skip = () => {}; keys = () => {};
  stopCamera();
  stage.dataset.scene = name;
  ui.choices.replaceChildren(); ui.card.replaceChildren(); ui.arrow.textContent = "";
  ui.enough.hidden = !["menu", "read"].includes(name);
  ui.bubble.classList.remove("is-waiting");
  master.talk(false);
  const alive = () => mine === run;
  const wait = (ms) => new Promise((r) => setTimeout(() => r(alive()), ms));
  return { alive, wait };
}
const strip = (text) => text.replace(/[⟦⟧]/g, "");
function marked(tag, className, text) {
  const node = h(tag, className);
  text.split(/⟦|⟧/).forEach((chunk, i) => { if (chunk) node.append(i % 2 ? h("em", "", chunk) : chunk); });
  return node;
}
/** Speaks one sentence: typed with the mouth moving. A key or click shows it whole, then moves on.
 *  `hold`: how long it stays afterwards; null waits for nothing (a question stays on screen). */
async function say(ctx, line, { hold } = {}) {
  const whole = strip(line);
  const mine = ++speech; // a newer sentence silences this one
  let rush = false;
  skip = () => { rush = true; };
  ui.bubble.classList.remove("is-waiting");
  ui.bubble.classList.add("is-on");
  master.talk(true);
  for (let i = 1; i <= whole.length && !rush; i += 1) {
    ui.text.textContent = whole.slice(0, i);
    if (!(await ctx.wait(T.type)) || mine !== speech) return false;
  }
  ui.text.replaceChildren(...marked("span", "", line).childNodes);
  master.talk(false);
  if (hold === null) { skip = () => {}; return true; }
  let next = false;
  skip = () => { next = true; };
  ui.bubble.classList.add("is-waiting");
  const stay = hold ?? T.after + whole.length * T.perChar;
  for (let spent = 0; spent < stay && !next; spent += 80) if (!(await ctx.wait(80)) || mine !== speech) return false;
  return true;
}
/** Choices float around the character. Resolves with the chosen value. */
function choose(ctx, options, { idle = T.askIdle, className = "" } = {}) {
  return new Promise((resolve) => {
    const picked = (i) => {
      if (!options[i] || !ctx.alive()) return;
      keys = () => {};
      ui.choices.replaceChildren();
      resolve(options[i][1]);
    };
    ui.choices.className = `choices n${options.length} ${className}`;
    ui.choices.replaceChildren(...options.map(([label, , extra = ""], i) => {
      const b = button(`choice p${i} ${extra}`, () => picked(i), h("kbd", "", String(i + 1)), h("span", "", label));
      b.style.setProperty("--i", i);
      return b;
    }));
    keys = (k) => picked(Number(k) - 1);
    if (!params.get("hold")) ctx.wait(idle).then((on) => { if (on && ui.choices.childElementCount) attract(); });
  });
}
const heading = (title) => { ui.book.replaceChildren(h("h3", "", title), h("ul", "")); };
/** Writes a line into the notebook, letter by letter. */
async function write(ctx, line) {
  const li = h("li", "");
  ui.book.querySelector("ul").append(li);
  const whole = strip(line);
  for (let i = 2; i < whole.length + 2; i += 2) {
    li.textContent = whole.slice(0, i);
    ui.book.scrollTop = ui.book.scrollHeight;
    if (!(await ctx.wait(30))) return false;
  }
  li.replaceChildren(...marked("span", "", line).childNodes);
  ui.book.scrollTop = ui.book.scrollHeight;
  return true;
}

// ---------- the conversation ----------
async function attract() {
  const ctx = enter("attract");
  Object.assign(visitor, { gender: null, age: null, nick: null, face: null, reading: null, heard: [] });
  heading("오늘의 손님");
  ui.who.textContent = "";
  master.pose("hello");
  const go = () => ask();
  choose(ctx, [["의자에 앉았어요", true, "big"]], { idle: 1e9 }).then(go);
  keys = (k) => { if (k === " " || k === "Enter" || k === "1") go(); };
  for (let i = 0; ctx.alive(); i += 1) {
    const line = ["어서 오세요! 기다리고 있었어요.", "여기 앉으시면 얼굴을 찬찬히 봐 드릴게요.", "준비되면 아래 버튼을 눌러 주세요."][i % 3];
    master.pose(["hello", "push", "idle"][i % 3]);
    if (!(await say(ctx, line, { hold: 2200 }))) return;
  }
}
async function ask() {
  const ctx = enter("ask");
  heading("오늘의 손님");
  master.pose("push");
  if (!(await say(ctx, "반가워요. 먼저 몇 가지만 여쭐게요.", { hold: 900 }))) return;
  master.pose("listen");
  if (!(await say(ctx, "성별이 어떻게 되세요?", { hold: null }))) return;
  visitor.gender = await choose(ctx, [["여성", "female"], ["남성", "male"]]);
  master.pose("write");
  if (!(await write(ctx, visitor.gender === "female" ? "여성" : "남성"))) return;
  master.pose("listen");
  if (!(await say(ctx, "좋아요. 나이대는요?", { hold: null }))) return;
  visitor.age = await choose(ctx, [["20대", 20], ["30대", 30], ["40대", 40], ["50대", 50]]);
  master.pose("write");
  if (!(await write(ctx, `${visitor.age}대`))) return;
  master.pose("think");
  if (!(await say(ctx, "여기서는 이름 대신 별명을 적어요. 마음에 드는 걸 골라 주세요.", { hold: null }))) return;
  const deck = [...NICKNAMES].sort(() => Math.random() - 0.5);
  for (let from = 0; !visitor.nick; from = (from + 5) % deck.length) {
    const some = Array.from({ length: 5 }, (_, i) => deck[(from + i) % deck.length]);
    const got = await choose(ctx, [...some.map((n) => [n, n]), ["다른 별명 보기", "", "ghost"]], { className: "names" });
    if (!ctx.alive()) return;
    if (got) visitor.nick = got; else master.pose("sky");
  }
  ui.who.textContent = visitor.nick;
  master.pose("write");
  if (!(await write(ctx, `⟦${visitor.nick}⟧`))) return;
  master.pose("peek");
  if (!(await say(ctx, `${visitor.nick}님, 예쁜 이름이네요.`, { hold: 900 }))) return;
  shoot();
}

const ASKS = {
  front: ["focus", "이제 얼굴을 좀 볼게요. 저를 똑바로 봐 주세요.", "", 0],
  left: ["left", "좋아요. 고개를 살짝 이쪽으로 돌려 보세요.", "◀", 1],
  right: ["right", "이번엔 반대쪽이에요. 이쪽으로 살짝.", "▶", 2],
  done: ["focus", "음, 보여요. 다시 정면으로 돌아와 주세요.", "", 2],
  clench: ["clench", "입은 다물고, 턱에 힘을 꽉! 저처럼요.", "", 3],
  smile: ["smile", "마지막이에요. 활짝 웃어 보세요!", "", 4],
};
// The app's capture guidance (capture.js GUIDANCE), in the character's own voice.
const TROUBLE = {
  none: "어라, 안 보여요. 거울 가운데에 앉아 주세요.",
  far: "조금만 더 가까이 와 주실래요?",
  near: "어이쿠, 가까워요. 조금만 뒤로 가 주세요.",
  "off-center": "얼굴이 거울 한가운데 오게 앉아 주세요.",
  yaw: "너무 많이 돌렸어요. 조금만 돌아와 주세요.",
  "pitch-up": "턱을 살짝 당겨 주세요.",
  "pitch-down": "고개를 살짝 들어 주세요.",
  roll: "고개를 조금만 바로 세워 주세요.",
  smile: "웃는 건 이따가요. 지금은 편한 무표정으로 부탁해요.",
  "mouth-open": "입은 편하게 다물어 주세요.",
  frown: "미간에 힘 빼고, 편안하게요.",
};
async function shoot() {
  const ctx = enter("shoot");
  visitor.face = null; visitor.reading = null; visitor.heard = [];
  master.pose("focus");
  say(ctx, `${visitor.nick ?? "손님"}님, 거울을 켤게요. 잠깐만요.`, { hold: null });
  let current = null; let troubleAt = 0; let shown = null;
  const line = (id) => { const [pose, text, arrow, dot] = ASKS[id]; master.pose(pose); ui.arrow.textContent = arrow; ui.arrow.dataset.arrow = arrow === "▶" ? "right" : "left"; [...ui.dots.children].forEach((d, i) => { d.classList.toggle("is-on", i === dot); d.classList.toggle("is-done", i < dot); }); say(ctx, text, { hold: null }); };
  // If the pictures stay unusable the visitor is offered a way out instead of waiting for ever.
  ctx.wait(T.stuck).then(async (on) => {
    if (!on || visitor.face) return;
    const again = await choose(ctx, [["다시 해 볼게요", true], ["처음으로", false]], { className: "stuck" });
    if (!ctx.alive()) return;
    if (again) shoot(); else attract();
  });
  try {
    const face = await captureFace(ui.video, ctx.alive, {
      stage(id) { current = id; shown = null; line(id); },
      // A problem is spoken only when it lasts, so that the words do not flicker.
      trouble(code) {
        if (!code) { troubleAt = 0; if (shown && current) { shown = null; line(current); } return; }
        troubleAt ||= performance.now();
        if (performance.now() - troubleAt > 1200 && shown !== code && TROUBLE[code]) { shown = code; say(ctx, TROUBLE[code], { hold: null }); }
      },
      progress(p) { ui.mirror.style.setProperty("--p", p); },
    });
    if (!face || !ctx.alive()) return;
    visitor.face = face;
    ui.choices.replaceChildren(); keys = () => {};
  } catch (error) {
    console.error(error);
    if (ctx.alive()) { master.pose("think"); say(ctx, "거울이 안 켜지네요. 키보드의 S를 누르면 예시 얼굴로 봐 드릴게요.", { hold: null }); }
    return;
  }
  [...ui.dots.children].forEach((d) => d.classList.add("is-done"));
  ui.arrow.textContent = "";
  master.pose("peek");
  if (!(await say(ctx, "찰칵! 다 봤어요. 아주 좋아요.", { hold: 900 }))) return;
  ponder();
}
function useSample() { visitor.face = sampleFace(); visitor.nick ??= NICKNAMES[0]; visitor.age ??= 20; ui.who.textContent = visitor.nick; ponder(); }
function prepare() {
  visitor.face ??= sampleFace(); visitor.nick ??= NICKNAMES[0]; visitor.age ??= 20;
  visitor.reading ??= readingFor(visitor.face.values, visitor.age, content);
  ui.who.textContent = visitor.nick;
}
async function ponder() {
  const ctx = enter("ponder");
  prepare();
  heading(`${visitor.nick}님의 상`);
  const parts = visitor.reading.read.slice(0, 3);
  const mumbles = ["어디 보자...", ...parts.map((p, i) => [`흠, ${josa(p.part, "이", "가")} 눈에 띄네요.`, `그리고 ${p.part}도요.`, `오호, ${p.part}까지.`][i])];
  const gestures = ["sky", "write", "think", "write"];
  for (const [i, text] of mumbles.entries()) {
    master.pose(gestures[i]);
    if (!(await say(ctx, text, { hold: 300 }))) return;
    if (i) { master.pose("write"); if (!(await write(ctx, parts[i - 1].name))) return; if (!(await ctx.wait(500))) return; }
  }
  master.pose("push");
  if (!(await say(ctx, "좋아요, 정리됐어요.", { hold: 1000 }))) return;
  menu();
}
async function menu() {
  const ctx = enter("menu");
  prepare();
  const left = TOPICS.filter((t) => !visitor.heard.includes(t.id));
  if (!left.length) return ending();
  if (!ui.book.querySelector("h3")) heading(`${visitor.nick}님의 상`);
  master.pose("listen");
  const first = !visitor.heard.length;
  say(ctx, first ? `${visitor.nick}님, 제일 궁금한 게 뭐예요?` : "그다음으로 더 궁금한 거 있어요?", { hold: null });
  const id = await choose(ctx, left.map((t) => [t.ask, t.id]), { idle: T.menuIdle, className: "orbit" });
  if (ctx.alive()) read(id);
}
async function read(id) {
  const ctx = enter("read");
  prepare();
  const topic = TOPICS.find((t) => t.id === id) ?? TOPICS[0];
  const { lines, memo } = answer(visitor.reading, topic.id, visitor.nick);
  visitor.heard.push(topic.id);
  heading(topic.note);
  master.pose("push");
  if (!(await say(ctx, `${topic.note}, 좋은 질문이에요.`, { hold: 700 }))) return;
  const gestures = ["think", "sky", "focus", "think", "sky"];
  for (const [i, line] of lines.entries()) {
    ui.bubble.classList.remove("is-on");
    master.pose(gestures[i % gestures.length]);
    if (!(await ctx.wait(T.gesture))) return;
    // The note look reads from the notebook: the whole sentence is written. The others jot a few words.
    master.pose("write");
    if (look === "note") { if (!(await write(ctx, line))) return; } else if (memo[i]) { if (!(await write(ctx, memo[i]))) return; if (!(await ctx.wait(400))) return; } else if (!(await ctx.wait(800))) return;
    master.pose(i === lines.length - 1 ? "peek" : i % 2 ? "push" : "listen");
    if (!(await say(ctx, line))) return;
  }
  menu();
}
async function ending() {
  const ctx = enter("end");
  prepare();
  heading("마지막 한마디");
  const gestures = ["push", "write", "listen", "think", "listen", "peek"];
  for (const [i, spoken] of CLOSING_SPOKEN.entries()) {
    master.pose(gestures[i]);
    if (i === 1) { if (!(await write(ctx, CLOSING_QUOTE.han))) return; if (!(await write(ctx, CLOSING_QUOTE.ko))) return; master.pose("listen"); }
    if (!(await say(ctx, spoken.replace("{nick}", visitor.nick), { hold: params.get("hold") && i === Number(params.get("at") ?? 99) ? 1e9 : undefined }))) return;
  }
  stage.dataset.scene = "card";
  scene = "card";
  const photo = photoCard(visitor.face);
  const kept = visitor.heard.map((id) => { const { memo } = answer(visitor.reading, id, visitor.nick); return id === "self" || id === "bond" ? memo[0] : memo[1] ?? memo[0]; }).filter(Boolean).slice(0, 4);
  ui.card.replaceChildren(h("small", "", "오늘의 관상 노트"), h("h2", "", visitor.nick), photo.box,
    h("div", "tags", ...(kept.length ? kept : [`${visitor.reading.say.adn} 사람`]).map((w) => h("span", "", w))),
    h("p", "han", CLOSING_QUOTE.han), h("p", "mean", CLOSING_QUOTE.meaning), h("p", "tip", "휴대폰으로 찍어 가세요 · 얼굴 사진은 저장되지 않아요"),
    button("again", attract, "처음으로"));
  keys = (k) => { if (k === " " || k === "Enter") attract(); };
  master.pose("cheer");
  if (!(await say(ctx, "또 놀러 오세요!", { hold: null }))) return;
  await ctx.wait(900); if (ctx.alive()) master.pose("hello");
  if (!params.get("hold") && (await ctx.wait(T.endIdle))) attract();
}

// ---------- start ----------
function fit() { document.documentElement.style.fontSize = `${Math.min(innerWidth / 192, innerHeight / 108)}px`; }
function setLook(name) {
  look = name; document.body.dataset.look = name;
  const url = new URL(location.href); url.searchParams.set("look", name); history.replaceState(null, "", url);
  document.title = `상 · ${NAMES[name]}`;
}
if (!LOOKS.includes(look)) document.querySelector("#chooser").hidden = false;
else {
  addEventListener("resize", () => { fit(); if (master) seatAtDesk(); }); fit();
  content = await (await fetch("../../parts.json")).json();
  await loadContent();
  stage.hidden = false;
  setLook(look); build();
  addEventListener("click", (event) => { if (event.detail > 0) event.target.closest?.("button")?.blur(); });
  addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const k = event.key;
    if (event.target.closest?.("button") && (k === " " || k === "Enter")) return; // the button's own click
    if (k === "Escape") return attract();
    if (k === "t" || k === "T" || k === "ㅅ") { setLook(LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length]); seatAtDesk(); return attract(); }
    if ((k === "s" || k === "S" || k === "ㄴ") && ["attract", "ask", "shoot"].includes(scene)) return useSample();
    if (k === " ") event.preventDefault();
    if ((k === " " || k === "Enter") && scene !== "attract" && scene !== "card") return skip();
    keys(k);
  });
  const jump = params.get("scene");
  if (params.get("sample") === "1") visitor.face = sampleFace();
  if (jump === "menu") menu();
  else if (jump === "read") { prepare(); read(params.get("topic") ?? "self"); }
  else if (jump === "end") ending();
  else if (jump === "shoot") { visitor.nick = NICKNAMES[0]; visitor.age = 20; shoot(); }
  else if (jump === "ask") ask();
  else attract();
}
