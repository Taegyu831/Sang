// Scroll design prototype (2026-11-27, paged 2026-11-28): after one automatic picture the whole reading
// is a website of full screens, one per turn of the wheel. Pieces are pulled into place from elsewhere.
//   start -> two questions -> camera -> result page (face, measuring, topics, bond, summary, last words)
// Keys: space / down = next step, up = back, T = next look, S = sample face, Esc = start over.
// ?look=puzzle|sticker|type   ?scene=result|shoot|ask&sample=1&at=<section number>  (for screenshots)
import { h, button, openCamera, stopCamera, measureFrame, useCpu, cropFace, sampleFace, loadContent, readingOf, summaryOf, replay } from "../desk/engine.js";
import { createMotion } from "./motion.js";
import { measureSection, bondSection, summarySection, closingSection, around } from "./parts.js";
import { LOOKS } from "./looks.js";

// ARTIFICIAL: timings (ms) and counts of this prototype.
const T = { countStep: 800, steadyShots: 4, askIdle: 30000, resultIdle: 90000, endIdle: 45000 };

const params = new URLSearchParams(location.search);
let lookName = params.get("look");
const screen = document.querySelector("#screen");
const page = document.querySelector("#page");
const topBar = document.querySelector("#top");
const cue = document.querySelector("#cue");
const visitor = { gender: null, age: null, face: null };
let look = null;
let motion = null;
let run = 0;
let scene = "";
let lastInput = performance.now();

function enter(name) {
  run += 1; scene = name;
  motion?.destroy(); motion = null;
  stopCamera();
  document.body.dataset.scene = name;
  const result = name === "result";
  screen.hidden = result; page.hidden = !result; topBar.hidden = !result; cue.hidden = true;
  screen.replaceChildren(); page.replaceChildren();
  scrollTo({ top: 0, behavior: "instant" });
  lastInput = performance.now();
  const mine = run;
  return { alive: () => mine === run, wait: (ms) => new Promise((r) => setTimeout(() => r(mine === run), ms)) };
}

/** Flies pieces in over time (for screens that are not scrolled). */
function arrive(items) {
  const centre = (n) => { const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  for (const { node, from, delay } of items) {
    let x; let y; let turn = -40; let size = 0.3;
    if (Array.isArray(from)) { x = (from[0] * innerWidth) / 100; y = (from[1] * innerHeight) / 100; turn = from[2]; size = from[3] ?? 1; } else { const a = centre(from.node); const b = centre(node); x = a.x - b.x; y = a.y - b.y; }
    const rest = getComputedStyle(node).transform; const end = rest === "none" ? "" : rest;
    node.animate([{ transform: `translate(${x}px, ${y}px) rotate(${turn}deg) scale(${size}) ${end}`, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: end || "none", opacity: 1 }], { duration: 900, delay, easing: "cubic-bezier(0.2, 1.25, 0.35, 1)", fill: "backwards" });
  }
}

// ---------- screens before the result ----------
const FLOATERS = ["성격", "재물", "연애", "인연", "전성기", "첫인상"];
function start() {
  Object.assign(visitor, { gender: null, age: null, face: null });
  enter("start");
  const bits = FLOATERS.map((w, i) => h("span", `float f${i}`, w));
  const go = button("cta big", ask, "내 관상 보기");
  const title = h("h1", "", h("span", "", "내 얼굴,"), " ", h("span", "", "스크롤해서"), h("br"), h("span", "", "읽어 보기"));
  screen.append(h("div", "start", h("p", "logo", look.name), ...bits, h("div", "start-mid", title, go, h("p", "hint", "클릭 또는 SPACE · 약 3분 · 얼굴 사진은 저장되지 않아요"))));
  arrive([...title.querySelectorAll("span")].map((node, i) => ({ node, from: around(i * 2 + 1, 50), delay: i * 140 })).concat(bits.map((node, i) => ({ node, from: around(i, 120), delay: 300 + i * 90 })), [{ node: go, from: [0, 60, 20, 1], delay: 650 }]));
}
function ask() {
  const ctx = enter("ask");
  const pickRow = (title, options, key) => h("div", "ask-row", h("h2", "", title), h("div", "ask-options", ...options.map(([label, value, k]) => {
    const b = button("option", () => { visitor[key] = value; [...b.parentNode.children].forEach((n) => n.classList.toggle("is-on", n === b)); if (visitor.gender && visitor.age) setTimeout(() => ctx.alive() && shoot(), 450); }, h("b", "", label), h("kbd", "", k));
    b.dataset.key = k;
    return b;
  })));
  const rows = [pickRow("성별", [["여성", "female", "1"], ["남성", "male", "2"]], "gender"), pickRow("나이대", [["20대", 20, "3"], ["30대", 30, "4"], ["40대", 40, "5"], ["50대", 50, "6"]], "age")];
  screen.append(h("div", "ask", ...rows, h("p", "hint", "둘 다 고르면 바로 촬영해요 · 숫자 키로도 고를 수 있어요")));
  arrive([...screen.querySelectorAll(".option")].map((node, i) => ({ node, from: around(i + 1, 70), delay: i * 70 })));
  ctx.wait(T.askIdle).then((on) => { if (on) start(); });
}
async function shoot() {
  const ctx = enter("shoot");
  const video = h("video", ""); video.muted = true; video.playsInline = true;
  const count = h("div", "count");
  const box = h("div", "camera", video, h("div", "ring"), count);
  const say = h("h2", "", "카메라를 켜는 중");
  screen.append(h("div", "shoot", box, h("div", "shoot-side", say, h("p", "", "눈썹이 보이게 머리를 살짝 넘기고 정면을 봐 주세요. 자동으로 찍혀요."), button("ghost", useSample, "카메라 없이 예시로 보기 (S)"))));
  try { await openCamera(video); } catch (error) { console.error(error); if (ctx.alive()) say.textContent = "카메라를 켤 수 없어요. S를 누르면 예시로 볼 수 있어요."; return; }
  if (!ctx.alive()) { if (scene !== "shoot") stopCamera(); return; }
  const canvas = document.createElement("canvas");
  let steady = 0;
  while (await ctx.wait(180)) {
    let seen;
    try { seen = measureFrame(video, canvas); } catch (error) {
      console.warn("measuring failed, switching to the CPU", error);
      if (!(await useCpu())) { say.textContent = "측정을 할 수 없어요. S를 누르면 예시로 볼 수 있어요."; return; }
      continue;
    }
    steady = seen ? steady + 1 : 0;
    box.classList.toggle("is-found", Boolean(seen));
    say.textContent = seen ? "좋아요, 그대로!" : "동그라미 안에서 정면을 봐 주세요";
    if (steady < T.steadyShots) continue;
    for (const n of [3, 2, 1]) { count.textContent = n; replay(count); if (!(await ctx.wait(T.countStep))) return; }
    const shot = measureFrame(video, canvas);
    count.textContent = "";
    if (!shot) { steady = 0; continue; }
    visitor.face = cropFace(canvas, shot);
    box.append(h("div", "flash"));
    if (!(await ctx.wait(450))) return;
    return result();
  }
}
function useSample() { visitor.face = sampleFace(); result(); }

// ---------- the result page ----------
function result() {
  const ctx = enter("result");
  visitor.face ??= sampleFace();
  const data = readingOf(visitor.face, visitor.age ?? 20);
  const summary = summaryOf(visitor.face, data);
  motion = createMotion();
  const hero = motion.section(page, "내 얼굴", 0, "hero-part");
  const flying = look.hero(hero.view, visitor.face, data);
  measureSection(motion, page, visitor.face, data, { numberFrom: look.shot.number, nameFrom: look.shot.name });
  data.topics.slice(0, -1).forEach((_, i) => look.topic(motion, page, data, i, visitor.face));
  bondSection(motion, page, data);
  summarySection(motion, page, visitor.face, data, summary);
  closingSection(motion, page, { again: () => motion.go(0), home: start });
  const names = motion.sections.map((s) => s.name);
  const links = names.map((n, i) => button("", () => motion.go(i), n));
  topBar.querySelector("b").textContent = look.name;
  topBar.querySelector("nav").replaceChildren(...links);
  const bar = topBar.querySelector("i");
  motion.start(({ index, progress, ready, end, next }) => {
    links.forEach((l, i) => l.classList.toggle("is-on", i === index));
    bar.style.transform = `scaleX(${progress})`;
    // The sign to go on shows only when this step is complete, and says what comes next.
    cue.hidden = end;
    cue.classList.toggle("is-waiting", !ready);
    cue.firstChild.textContent = next ? `아래로 한 번 · ${next}` : "";
    const dark = index === names.length - 1;
    topBar.classList.toggle("is-end", dark);
    cue.classList.toggle("is-end", dark);
  });
  arrive(flying);
  if (params.get("at") !== null) motion.go(Number(params.get("at")), true);
  // Left alone, the page goes back to the start: sooner once the end has been reached.
  const watch = async () => {
    while (await ctx.wait(1000)) {
      const atEnd = motion.atEnd;
      const quiet = performance.now() - lastInput;
      cue.classList.toggle("is-calling", quiet > 6000);
      if (params.get("hold") !== "1" && quiet > (atEnd ? T.endIdle : T.resultIdle)) return start();
    }
  };
  watch();
}

// ---------- start ----------
function fit() { document.documentElement.style.fontSize = `${Math.min(innerWidth / 192, innerHeight / 108)}px`; }
function setLook(name) {
  lookName = name; look = LOOKS[name];
  document.body.dataset.look = name;
  const url = new URL(location.href); url.searchParams.set("look", name); history.replaceState(null, "", url);
}
if (!LOOKS[lookName]) document.querySelector("#chooser").hidden = false;
else {
  history.scrollRestoration = "manual";
  addEventListener("resize", fit); fit();
  await loadContent();
  setLook(lookName);
  for (const kind of ["wheel", "pointerdown", "pointermove", "keydown", "touchstart"]) addEventListener(kind, () => { lastInput = performance.now(); }, { passive: true });
  addEventListener("click", (event) => { if (event.detail > 0) event.target.closest?.("button")?.blur(); });
  addEventListener("keydown", (event) => {
    const k = event.key;
    if (event.repeat) return; // a held key must not race through the pages
    if (event.target.closest?.("button") && (k === " " || k === "Enter")) return; // the button's own click
    if (k === "Escape") return start();
    if (k === "t" || k === "T" || k === "ㅅ") { const names = Object.keys(LOOKS); setLook(names[(names.indexOf(lookName) + 1) % names.length]); return scene === "result" ? result() : start(); }
    if ((k === "s" || k === "S" || k === "ㄴ") && scene !== "result") return useSample();
    if (scene === "result") {
      if ([" ", "ArrowDown", "PageDown", "Enter", "ArrowRight"].includes(k)) { event.preventDefault(); motion.step(1); }
      else if (["ArrowUp", "PageUp", "ArrowLeft"].includes(k)) { event.preventDefault(); motion.step(-1); }
    } else if (scene === "start" && (k === " " || k === "Enter")) { event.preventDefault(); ask(); }
    else if (scene === "ask") screen.querySelector(`.option[data-key="${CSS.escape(k)}"]`)?.click();
  });
  const jump = params.get("scene");
  if (params.get("sample") === "1") visitor.face = sampleFace();
  if (jump === "result") result(); else if (jump === "ask") ask(); else if (jump === "shoot") shoot(); else start();
}
