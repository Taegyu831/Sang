// The exhibition page: the visitor sits across from a small, serious fortune reader and is led
// through the whole experience as a conversation.
//   start screen -> a short notice -> the master asks age, gender, name, a partner for the last picture (or none)
//   -> guided capture (the picture is ordered) -> thinking -> pick a question (again and again);
//      the couple picture closes the 인연 answer (or comes before the last words if never asked)
//   -> "이제 충분해요" -> the last words -> the card
// Keys: space / enter / down / right = go on, digits = choose, Esc = start over.
// For development: ?dev=1 adds S (a drawn sample face) and ?scene=ask|shoot|menu|read|end with
// &sample=1&topic=self&hold=1. ?collect=off sends nothing, ?couple=off offers no picture, ?strict=0 loosens the capture limits.
// The earlier page is classic.html (its ?debug=1 records samples).
import { h, button, sampleFace, photoCard } from "./kit.js";
import { CLOSING_QUOTE, CLOSING_SPOKEN } from "../closing.js";
import { DEFAULT_COLLECT_ENDPOINT, buildRecord, submitMeasurement, flushQueue } from "../collect.js";
import { coupleEndpoint, requestCouple } from "./couple.js";
import { createCharacter } from "./character.js";
import { captureFace, stopCamera, prepare as prepareModel, ASKS, TROUBLE } from "./capture-room.js";
import { TOPICS, answer, readingFor, profileOf, draw, josa } from "./spoken.js";

// ARTIFICIAL: timings (ms).
const T = { type: 38, after: 900, perChar: 55, rise: 200, stuck: 60000, askIdle: 120000, menuIdle: 120000, endIdle: 120000, photoIdle: 120000, printTalk: 11000, notice: 3200, closingGap: 2000, closingRead: 5000 };

const params = new URLSearchParams(location.search);
const DEV = params.get("dev") === "1";
const HOLD = DEV && params.has("hold");
const collectParam = params.get("collect");
const COLLECT_ENDPOINT = collectParam === "off" ? "" : collectParam || DEFAULT_COLLECT_ENDPOINT;
// ARTIFICIAL: the readings themselves go quicker than the small talk (ms; `stay` per letter after
// a sentence has been typed).
const READ = { gesture: 700, write: 18, type: 28, after: 600, stay: 40 };
const NAME_MAX = 10;
const isNext = (k) => [" ", "Enter", "ArrowDown", "ArrowRight"].includes(k); // "go on"
// ARTIFICIAL: wordings of the small talk around the readings; one is drawn each time.
const CHAT = {
  look: ["어디 보자...", "자, 한번 볼게요.", "음, 천천히 볼까요.", "오, 어디 봅시다."],
  first: [(p) => `흠, ${josa(p, "이", "가")} 눈에 띄네요.`, (p) => `먼저 ${josa(p, "이", "가")} 보여요.`, (p) => `${p}부터 눈이 가네요.`],
  second: [(p) => `그리고 ${p}도요.`, (p) => `${p}도 봐 둘게요.`, (p) => `${josa(p, "은", "는")} 또 이렇군요.`],
  third: [(p) => `오호, ${p}까지.`, (p) => `마지막으로 ${p}.`, (p) => `${p}도 흥미롭네요.`],
  ready: ["좋아요, 정리됐어요.", "됐어요, 다 읽었어요.", "자, 이제 말씀드릴게요."],
  ask: [(n) => `${n}님, 제일 궁금한 게 뭐예요?`, (n) => `${n}님, 어떤 것부터 볼까요?`, (n) => `${n}님, 먼저 듣고 싶은 걸 골라 주세요.`],
  more: ["그다음으로 더 궁금한 거 있어요?", "또 어떤 게 궁금해요?", "이번엔 무엇을 볼까요?"],
  good: ["좋은 질문이에요.", "그게 궁금했군요.", "어디 한번 볼까요.", "좋아요, 그걸 볼게요."],
};
const SAMPLE_NAME = "홍길동"; // only for the ?dev=1 shortcuts
const COUPLE_ENDPOINT = coupleEndpoint(params);
const stage = document.querySelector("#stage");
let content = null;
const fresh = () => ({ gender: null, age: null, name: null, shared: false, face: null, reading: null, heard: [], partner: "", couple: null });
let visitor = fresh();
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
  const text = h("p", "said");
  bubble.append(text, h("span", "more", "▼"));
  const choices = h("div", "choices");
  const book = h("div", "book");
  const video = h("video", ""); video.muted = true; video.playsInline = true;
  const dots = h("div", "dots", ...["정면", "왼쪽", "오른쪽", "턱 힘", "웃기"].map((n) => h("span", "", n)));
  const mirror = h("div", "mirror", h("div", "glass", video, h("div", "oval")), dots);
  const arrow = h("div", "arrow");
  const card = h("div", "card");
  const enough = button("enough", () => ending(), "이제 충분해요");
  const table = h("div", "table");
  const promise = h("p", "promise", "얼굴 사진과 영상은 저장되지 않아요 · 비율 숫자는 이름 없이 통계로 모아요");
  // The start screen covers the whole window until the button is pressed.
  // A QR code in its corner opens the phone version (dist/m); the picture is in talk/qr-phone.svg.
  const floaters = ["성격", "재물", "전성기", "첫인상", "연애", "인연"].map((w, i) => h("span", `float f${i}`, w));
  const title = h("h1", "", h("span", "", "내 얼굴"), h("span", "mark", "읽어 보기"));
  const code = h("img", ""); code.src = new URL("./qr-phone.svg", import.meta.url).href; code.alt = "휴대폰 버전 QR 코드";
  const phone = h("div", "to-phone", code, h("p", "", h("b", "", "휴대폰으로도"), h("span", "", "카메라로 QR을 찍어 보세요")));
  const cover = h("div", "cover", h("p", "team", "이음 | IUM"), ...floaters, h("div", "cover-mid", title, button("cta", () => notice(), "내 관상 보기")), phone);
  // shown for a moment on an empty page, between the start screen and the first question
  const notes = h("div", "notice", ...["약 3분이면 돼요", "얼굴 사진은 저장되지 않아요", "얼굴 비율 숫자는 이름 없이 통계로 모아요"].map((t, i) => { const p = h("p", "", t); p.style.setProperty("--i", i); return p; }));
  notes.addEventListener("click", () => skip());
  document.body.append(cover, notes);
  stage.replaceChildren(h("div", "scene", h("div", "room"), h("div", "actor", master.el), table, arrow, bubble, book, choices, mirror, card, enough, promise));
  bubble.addEventListener("click", () => skip());
  ui = { bubble, text, choices, book, video, mirror, dots, arrow, card, enough, cover, notes };
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
  ui.book.classList.remove("closing");
  ui.card.className = "card";
  ui.choices.replaceChildren(); ui.card.replaceChildren(); ui.arrow.textContent = "";
  ui.enough.hidden = !["menu", "read"].includes(name);
  ui.cover.hidden = name !== "attract";
  ui.notes.hidden = name !== "notice";
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
async function say(ctx, line, { hold, type = T.type } = {}) {
  const whole = strip(line);
  const mine = ++speech; // a newer sentence silences this one
  let rush = false;
  skip = () => { rush = true; };
  ui.bubble.classList.remove("is-waiting");
  ui.bubble.classList.add("is-on");
  master.talk(true);
  for (let i = 1; i <= whole.length && !rush; i += 1) {
    ui.text.textContent = whole.slice(0, i);
    if (!(await ctx.wait(type)) || mine !== speech) return false;
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
/** Shows choices: in a tidy block, or floating around when they are questions about the reading
 *  ("orbit"). Resolves with the chosen value. */
function choose(ctx, options, { idle = T.askIdle, className = "", note = "" } = {}) {
  return new Promise((resolve) => {
    const picked = (i) => {
      if (!options[i] || !ctx.alive()) return;
      keys = () => {};
      ui.choices.replaceChildren();
      resolve(options[i][1]);
    };
    ui.choices.className = `choices ${className}`;
    ui.choices.replaceChildren(...options.map(([label, , extra = ""], i) => {
      const b = button(`choice p${i} ${extra}`, () => picked(i), h("kbd", "", String(i + 1)), h("span", "", label));
      b.style.setProperty("--i", i);
      return b;
    }));
    if (note) ui.choices.prepend(marked("p", "choice-note", note));
    keys = (k) => picked(Number(k) - 1);
    if (!HOLD) ctx.wait(idle).then((on) => { if (on && ui.choices.childElementCount) attract(); });
  });
}
/** The name field. Resolves with what was typed; the name stays on this screen and is never sent. */
function askName(ctx) {
  return new Promise((resolve) => {
    const input = h("input", "name-input");
    Object.assign(input, { type: "text", maxLength: NAME_MAX, placeholder: "이름", autocomplete: "off", spellcheck: false });
    input.setAttribute("aria-label", "이름");
    const send = h("button", "name-send", "Enter");
    send.type = "submit";
    send.setAttribute("aria-label", "다 적었어요");
    const tail = h("span", "", "라고 합니다.");
    const row = h("div", "name-row", h("span", "", "저는"), input, tail, send);
    const form = h("form", "name-form", row, h("p", "name-note", "이름은 저장하지 않아요"));
    let typed = performance.now(); let done = false;
    input.addEventListener("input", () => {
      typed = performance.now(); form.classList.remove("is-empty");
      // "박태규라고", but "박민준이라고": after a Korean final consonant
      const last = input.value.trim().charCodeAt(input.value.trim().length - 1) - 0xac00;
      tail.textContent = last >= 0 && last < 11172 && last % 28 ? "이라고 합니다." : "라고 합니다.";
    });
    // the Enter that finishes a Korean syllable must not send the form
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault(); });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (done || !ctx.alive()) return;
      const name = cleanName(input.value);
      if (!name) { form.classList.add("is-empty"); input.focus(); return; }
      done = true;
      ui.choices.replaceChildren();
      resolve(name);
    });
    keys = () => {};
    ui.choices.className = "choices naming";
    ui.choices.replaceChildren(form);
    input.focus();
    // an empty chair: nothing typed for a while brings the start screen back
    (async () => { while (!HOLD && !done && (await ctx.wait(1000))) if (!done && performance.now() - typed > T.askIdle) return attract(); })();
  });
}
/** Trims what was typed; the sentences add "님", so a typed one is dropped. */
function cleanName(value) {
  const name = value.replace(/[⟦⟧]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return name.replace(/(?<=..)님$/, "").trim();
}
const heading = (title) => { ui.book.replaceChildren(h("h3", "", title), h("ul", "")); };
/** The saying at the end: the meaning first and large, the characters under it, then the room
 *  where the explanation arrives. */
function showSaying() {
  const lines = [h("h3", "", "마지막 한마디"), h("p", "mean", ...CLOSING_QUOTE.meaning.split(/(?<=,) /).map((t) => h("span", "", t))),
    h("p", "han", CLOSING_QUOTE.han), h("p", "reading", CLOSING_QUOTE.ko)];
  lines.forEach((line, i) => line.style.setProperty("--delay", `${i * T.rise}ms`));
  ui.book.classList.add("closing");
  ui.book.replaceChildren(...lines, h("ul", ""));
}
/** Writes a line on the page, letter by letter. */
async function write(ctx, line, step = 30, hurry = () => false) {
  const li = h("li", /^(그래서|그러니)/.test(line) ? "advice" : "");
  ui.book.querySelector("ul").append(li);
  const whole = strip(line);
  for (let i = 2; i < whole.length + 2 && !hurry(); i += 2) {
    li.textContent = whole.slice(0, i);
    ui.book.scrollTop = ui.book.scrollHeight;
    if (!(await ctx.wait(step))) return false;
  }
  li.replaceChildren(...marked("span", "", line).childNodes);
  ui.book.scrollTop = ui.book.scrollHeight;
  return true;
}

// ---------- the conversation ----------
function attract() {
  enter("attract");
  visitor.couple?.stop.abort();
  visitor = fresh();
  heading("");
  ui.text.textContent = "";
  ui.bubble.classList.remove("is-on");
  master.pose("hello");
  keys = (k) => { if (isNext(k) || k === "1") notice(); };
}
/** Waits, unless a key or click asks to go on. False when this part of the conversation is over. */
async function pause(ctx, ms) {
  let next = false;
  skip = () => { next = true; };
  for (const began = performance.now(); !next && performance.now() - began < ms;) if (!(await ctx.wait(80))) return false;
  return true;
}
/** A moment on an empty page: how long it takes and what happens to the face. */
async function notice() {
  const ctx = enter("notice");
  if (await pause(ctx, T.notice)) ask();
}
async function ask() {
  const ctx = enter("ask");
  heading("오늘의 손님");
  master.pose("hello");
  if (!(await say(ctx, "어서 오세요! 먼저 몇 가지만 여쭐게요.", { hold: 900 }))) return;
  master.pose("listen");
  if (!(await say(ctx, "나이대가 어떻게 되세요?", { hold: null }))) return;
  visitor.age = await choose(ctx, [["20대", 20], ["30대", 30], ["40대", 40], ["50대", 50]]);
  master.pose("write");
  if (!(await write(ctx, `${visitor.age}대`))) return;
  master.pose("listen");
  if (!(await say(ctx, "좋아요. 성별은요?", { hold: null }))) return;
  visitor.gender = await choose(ctx, [["여성", "female"], ["남성", "male"]]);
  master.pose("write");
  if (!(await write(ctx, visitor.gender === "female" ? "여성" : "남성"))) return;
  master.pose("listen");
  if (!(await say(ctx, "이름이 어떻게 되세요? 풀이할 때 불러 드릴게요.", { hold: null }))) return;
  visitor.name = await askName(ctx);
  if (!ctx.alive()) return;
  master.pose("write");
  if (!(await write(ctx, `${visitor.name}님`))) return;
  // The present at the end. Photos are sent only if the visitor picks a partner here.
  if (COUPLE_ENDPOINT) {
    master.pose("push");
    if (!(await say(ctx, "마지막에 선물로, 잘 어울리는 연인과 찍은 사진을 만들어 드릴까요?", { hold: null }))) return;
    visitor.partner = await choose(ctx, [["동의하고 남자 연인과 찍기", "male"], ["동의하고 여자 연인과 찍기", "female"], ["안 만들기", ""]],
      { className: "partner", note: "고르면 ⟦얼굴 사진(최대 3장)이 AI(OpenAI)로 전송⟧돼요 · 만 19세 이상만" });
    if (!ctx.alive()) return;
  }
  master.pose("peek");
  if (!(await say(ctx, `알겠어요. ${visitor.name}님, 이제 얼굴을 볼게요.`, { hold: 900 }))) return;
  shoot();
}

async function shoot() {
  const ctx = enter("shoot");
  visitor.face = null; visitor.reading = null; visitor.heard = [];
  master.pose("focus");
  say(ctx, "자, 얼굴을 찬찬히 살펴볼게요.", { hold: null });
  let current = null; let troubleAt = 0; let shown = null;
  const line = (id) => { const [pose, text, arrow, dot] = ASKS[id]; master.pose(pose); ui.arrow.textContent = arrow; ui.arrow.dataset.arrow = arrow === "▶" ? "right" : "left"; [...ui.dots.children].forEach((d, i) => { d.classList.toggle("is-on", i === dot); d.classList.toggle("is-done", i < dot); }); say(ctx, text, { hold: null }); };
  const wayOut = async () => {
    const again = await choose(ctx, [["다시 해 볼게요", true], ["처음으로", false]], { className: "stuck" });
    if (!ctx.alive()) return;
    if (again) shoot(); else attract();
  };
  // If the pictures stay unusable the visitor is offered a way out instead of waiting for ever.
  ctx.wait(T.stuck).then((on) => { if (on && !visitor.face && !ui.choices.childElementCount) wayOut(); });
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
    share();
    present();
  } catch (error) {
    console.error(error);
    if (!ctx.alive()) return;
    master.pose("think");
    say(ctx, "카메라가 안 켜지네요. 연결과 권한을 확인해 주세요.", { hold: null });
    wayOut();
    return;
  }
  [...ui.dots.children].forEach((d) => d.classList.add("is-done"));
  ui.arrow.textContent = "";
  master.pose("peek");
  if (!(await say(ctx, "찰칵! 다 봤어요. 아주 좋아요.", { hold: 900 }))) return;
  ponder();
}
/** Orders the couple picture right after the capture, so that it is ready when the readings are over. */
function present() {
  // the drawn sample face is not a photo; in development it goes to a test relay all the same
  if (!COUPLE_ENDPOINT || !visitor.partner || (visitor.face.sample && !DEV)) return;
  prepare();
  visitor.couple = order(visitor.partner);
}
/** Asks for the picture and keeps track of it. */
function order(partner) {
  const job = { done: false, image: null, stop: new AbortController() };
  const wanted = { photos: [visitor.face.src, ...(visitor.face.sides ?? [])], partner, age: visitor.age, pole: visitor.reading.say.fit.to ?? null };
  requestCouple(COUPLE_ENDPOINT, wanted, { signal: job.stop.signal })
    .then((image) => { job.image = image; }, (error) => console.warn("no couple picture", error))
    .finally(() => { job.done = true; });
  return job;
}
/** One anonymous record per finished capture (numbers only, announced on the start screen), never
 *  for the drawn sample face. */
function share() {
  if (visitor.shared || !COLLECT_ENDPOINT || visitor.face.sample) return;
  const record = buildRecord({ gender: visitor.gender, age: visitor.age, measurement: visitor.face.values });
  if (!record) return;
  visitor.shared = true;
  submitMeasurement(COLLECT_ENDPOINT, record).catch(() => {});
}
function prepare() {
  visitor.face ??= sampleFace(); visitor.name ??= SAMPLE_NAME; visitor.age ??= 20;
  visitor.reading ??= readingFor(visitor.face.values, visitor.age, content);
}
async function ponder() {
  const ctx = enter("ponder");
  prepare();
  heading(`${visitor.name}님의 상`);
  const parts = visitor.reading.read.slice(0, 3);
  const chat = (key) => draw(visitor.reading, `chat-${key}`, CHAT[key]);
  const mumbles = [chat("look"), ...parts.map((p, i) => chat(["first", "second", "third"][i])(p.part))];
  const gestures = ["sky", "write", "think", "write"];
  for (const [i, text] of mumbles.entries()) {
    master.pose(gestures[i]);
    if (!(await say(ctx, text, { hold: 150, type: READ.type }))) return;
    if (i) { master.pose("write"); if (!(await write(ctx, parts[i - 1].name, READ.write))) return; if (!(await ctx.wait(250))) return; }
  }
  master.pose("push");
  if (!(await say(ctx, chat("ready"), { hold: 600, type: READ.type }))) return;
  menu();
}
async function menu() {
  const ctx = enter("menu");
  prepare();
  const left = TOPICS.filter((t) => !visitor.heard.includes(t.id));
  if (!left.length) return ending();
  if (!ui.book.querySelector("h3")) heading(`${visitor.name}님의 상`);
  master.pose("listen");
  const first = !visitor.heard.length;
  say(ctx, first ? draw(visitor.reading, "chat-ask", CHAT.ask)(visitor.name) : draw(visitor.reading, "chat-more", CHAT.more), { hold: null });
  const id = await choose(ctx, left.map((t) => [t.ask, t.id]), { idle: T.menuIdle, className: "orbit" });
  if (ctx.alive()) read(id);
}
async function read(id) {
  const ctx = enter("read");
  prepare();
  const topic = TOPICS.find((t) => t.id === id) ?? TOPICS[0];
  const { lines } = answer(visitor.reading, topic.id, visitor.name);
  visitor.heard.push(topic.id);
  heading(topic.note);
  master.pose("push");
  if (!(await say(ctx, `${topic.note}, ${draw(visitor.reading, "chat-good", CHAT.good)}`, { hold: 350, type: READ.type }))) return;
  const gestures = ["think", "sky", "focus", "think", "sky"];
  for (const [i, line] of lines.entries()) {
    ui.bubble.classList.remove("is-on");
    master.pose(gestures[i % gestures.length]);
    // a press while he gestures or writes hurries to the spoken sentence
    let hurry = false;
    skip = () => { hurry = true; };
    for (let spent = 0; spent < READ.gesture && !hurry; spent += 80) if (!(await ctx.wait(80))) return;
    master.pose("write");
    if (!(await write(ctx, line, READ.write, () => hurry))) return;
    master.pose(i === lines.length - 1 ? "peek" : i % 2 ? "push" : "listen");
    if (!(await say(ctx, line, { hold: READ.after + strip(line).length * READ.stay, type: READ.type }))) return;
  }
  if (topic.id === "bond" && !(await couplePicture(ctx))) return;
  menu();
}
async function ending() {
  const ctx = enter("end");
  prepare();
  heading("");
  const job = visitor.couple;
  // never asked about 인연: the picture comes before the last words, so that it is not lost
  if (job && !job.shown && (job.done || !job.gaveUp)) {
    master.pose("peek");
    if (!job.done || job.image) if (!(await say(ctx, "가기 전에, 인연 사진부터 보여 드릴게요.", { hold: 900 }))) return;
    if (!(await couplePicture(ctx))) return;
  }
  const [intro, ...words] = CLOSING_SPOKEN;
  master.pose("push");
  if (!(await say(ctx, intro, { hold: 400 }))) return;
  showSaying();
  master.pose("write");
  if (!(await pause(ctx, 1600))) return;
  const gestures = ["listen", "think", "listen", "push", "peek"];
  for (const [i, spoken] of words.entries()) {
    const line = spoken.replace("{name}", () => visitor.name);
    const began = performance.now();
    master.pose(gestures[i % gestures.length]);
    // the last two sentences are the point of it all: a little larger
    ui.book.querySelector("ul").append(marked("li", i >= words.length - 2 ? "key" : "", line));
    if (!(await say(ctx, line, { hold: null, type: READ.type }))) return;
    const rest = i === words.length - 1 ? T.closingRead : T.closingGap - (performance.now() - began);
    if (!(await pause(ctx, HOLD && i === Number(params.get("at") ?? 99) ? 1e9 : rest))) return;
  }
  job?.stop.abort();
  card(ctx);
}
/** Shows the couple picture, once; resolves false when this part of the conversation is over. */
async function couplePicture(ctx) {
  const job = visitor.couple;
  if (!job || job.shown || (job.gaveUp && !job.done)) return true;
  const from = scene;
  ui.enough.hidden = true;
  if (!job.done && !(await printing(ctx, job))) return false;
  if (!job.done) job.gaveUp = true; // it goes on being made, and is shown at the end if it arrives
  else {
    job.shown = true;
    if (job.image) { if (!(await booth(ctx, job.image))) return false; }
    else { master.pose("think"); if (!(await say(ctx, "아쉽게도 사진은 이번에 못 받았어요.", { hold: 1600 }))) return false; }
  }
  ui.card.className = "card"; ui.card.replaceChildren(); ui.choices.replaceChildren(); keys = () => {};
  show(from);
  return ctx.alive();
}
const show = (name) => { stage.dataset.scene = name; scene = name; };
/** Waits for the picture. False when the part of the conversation has ended meanwhile. */
async function printing(ctx, job) {
  show("printing");
  ui.card.className = "booth";
  ui.card.replaceChildren(h("div", "print", h("i", ""), h("p", "", "네컷 사진 인화 중")));
  let gaveUp = false;
  choose(ctx, [["기다리지 않고 넘어갈래요", true]], { idle: 1e9, className: "stuck one" }).then(() => { gaveUp = true; });
  const talk = ["사진이 아직 인화 중이에요. 조금만 기다려 주세요.", "두 분 표정을 고르는 중인가 봐요.", "거의 다 됐을 거예요."];
  const poses = ["focus", "sky", "peek"];
  for (let i = 0; !job.done && !gaveUp; i += 1) {
    master.pose(poses[i % 3]);
    say(ctx, talk[Math.min(i, talk.length - 1)], { hold: null });
    for (let spent = 0; spent < T.printTalk && !job.done && !gaveUp; spent += 300) if (!(await ctx.wait(300))) return false;
  }
  ui.choices.replaceChildren();
  return ctx.alive();
}
/** The picture: one cut in a booth frame. Stays until the visitor goes on. */
async function booth(ctx, image) {
  show("photo");
  const picture = h("img", "");
  picture.src = image; picture.alt = "AI가 만든 커플 사진";
  let done = false;
  ui.card.className = "booth";
  ui.card.replaceChildren(picture, h("h2", "", `${visitor.name}님과 잘 맞는 인연`), h("p", "fit", `${visitor.reading.say.fit.desc} 사람`),
    h("p", "tip", "AI가 만든 가상의 사진이에요 · 휴대폰으로 찍어 가세요"), button("again", () => { done = true; }, "다 찍었어요"));
  const began = performance.now();
  // keys count only after a moment, so that presses meant for the reading do not close the picture
  keys = (k) => { if (isNext(k) && performance.now() - began > 2000) done = true; };
  master.pose("cheer");
  say(ctx, "짜잔! 잘 어울리죠? 휴대폰으로 찍어 가세요.", { hold: null });
  while (!done && (HOLD || performance.now() - began < T.photoIdle)) if (!(await ctx.wait(200))) return false;
  return true;
}
/** The end: the card to take home. */
async function card(ctx) {
  show("card");
  const me = profileOf(visitor.reading);
  const head = h("div", "card-head", h("small", "", "오늘의 관상 노트"), h("h2", "", visitor.name), h("p", "headline", me.headline), h("div", "tags", ...me.traits.map((w) => h("span", "", w))));
  ui.card.replaceChildren(h("div", "card-top", photoCard(visitor.face), head),
    h("dl", "", ...me.rows.map(([label, text]) => h("div", "", h("dt", "", label), h("dd", "", text)))),
    h("p", "tip", "재미로 보는 관상 풀이예요 · 휴대폰으로 찍어 가세요 · 얼굴 사진은 저장되지 않아요"),
    button("again", attract, "처음으로"));
  const began = performance.now();
  // as with the picture: presses meant for the last words must not close the card at once
  keys = (k) => { if (isNext(k) && performance.now() - began > 2000) attract(); };
  master.pose("cheer");
  if (!(await say(ctx, "또 놀러 오세요!", { hold: null }))) return;
  await ctx.wait(900); if (ctx.alive()) master.pose("hello");
  if (!HOLD && (await ctx.wait(T.endIdle))) attract();
}

// ---------- start ----------
function fit() { document.documentElement.style.fontSize = `${Math.min(innerWidth / 192, innerHeight / 108)}px`; }
addEventListener("resize", () => { fit(); if (master) seatAtDesk(); });
fit();
content = await (await fetch(new URL("../parts.json", import.meta.url))).json();
build();
addEventListener("click", (event) => { if (event.detail > 0) event.target.closest?.("button")?.blur(); });
addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const k = event.key;
  if (event.target.tagName === "INPUT" && k !== "Escape") return; // typing a name
  if (event.target.closest?.("button") && (k === " " || k === "Enter")) return; // the button's own click
  if (k === "Escape") return attract();
  if (DEV && (k === "s" || k === "S" || k === "ㄴ") && ["attract", "ask", "shoot"].includes(scene)) { visitor.face = sampleFace(); return ponder(); }
  if (isNext(k)) event.preventDefault(); // the page itself must not scroll
  if (isNext(k) && !["attract", "card", "photo"].includes(scene)) return skip();
  keys(k);
});
const jump = DEV ? params.get("scene") : null;
if (DEV && params.get("sample") === "1") visitor.face = sampleFace();
if (jump === "menu") menu();
else if (jump === "read") { prepare(); read(params.get("topic") ?? "self"); }
else if (jump === "end") ending();
else if (jump === "shoot") { visitor.name = SAMPLE_NAME; visitor.age = 20; shoot(); }
else if (jump === "ask") ask();
else attract();
prepareModel().catch((error) => console.warn("the measuring model will be loaded again later", error));
// numbers left over from an earlier visit (no internet at the time) go out when the page opens
if (COLLECT_ENDPOINT) {
  flushQueue(COLLECT_ENDPOINT).catch(() => {});
  addEventListener("online", () => flushQueue(COLLECT_ENDPOINT).catch(() => {}));
}
// Offline cache (sw.js). On https only; on localhost it is off unless ?sw=on.
if ("serviceWorker" in navigator && (location.protocol === "https:" || params.get("sw") === "on")) {
  navigator.serviceWorker.register(new URL("../sw.js", import.meta.url)).catch(() => { /* the app works without it */ });
}
