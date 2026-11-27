// Landscape design prototype (2026-11-27): one flow, three looks that borrow familiar desktop layouts
// (a video platform, an AI chat, a music player), for a 1920x1080 screen.
//   attract -> pick -> shoot -> analyze -> topics (play by themselves) -> final
// Keys: space or enter = go on / pause, arrows = move, digits = pick, T = next look, S = sample face, Esc = start over.
// ?skin=video|chat|music   ?scene=analyze|topic|final&sample=1 (jump, for screenshots)   ?hold=1 (stay there)
import * as E from "./engine.js";
import { video } from "./video.js";
import { chat } from "./chat.js";
import { music } from "./music.js";

const SKINS = { video, chat, music };
// ARTIFICIAL: all the timings (ms) and counts of this prototype.
const T = { countStep: 800, dots: 2600, perPart: 2900, collect: 3000, lead: 500, tail: 2500, final: 45000, pickIdle: 30000, steadyShots: 4 };
// ARTIFICIAL: how long a piece of a topic stays before the next one comes (a word, or a sentence by its length).
const readingMs = (piece) => (piece.word ? 700 : Math.max(2800, 1200 + piece.text.length * 65));

const params = new URLSearchParams(location.search);
const hold = params.get("hold") === "1";
let skinName = params.get("skin");
const stage = document.querySelector("#stage");
const visitor = { gender: null, age: 20, face: null, data: null, summary: null };
let skin = null;
let run = 0;
let scene = "";
let keys = () => {};
let paused = false;
let onPause = () => {};

/** A new scene: older waits end, and keys and pause start over. */
function enter(name) {
  run += 1;
  const mine = run;
  scene = name; keys = () => {}; paused = false; onPause = () => {};
  stage.dataset.scene = name;
  const alive = () => mine === run;
  const ctx = {
    alive,
    hold,
    /** Waits; time stands still while paused. False when the scene is over. */
    async wait(ms) {
      let spent = 0; let last = performance.now();
      while (alive() && spent < ms) {
        await new Promise((r) => setTimeout(r, Math.min(40, ms)));
        const now = performance.now(); if (!paused) spent += now - last; last = now;
      }
      return alive();
    },
    togglePause() { paused = !paused; stage.classList.toggle("is-paused", paused); onPause(paused); },
    onPause(fn) { onPause = fn; },
    jump: (i) => topic(i),
    home: () => attract(),
    sample: () => useSample(),
  };
  stage.classList.remove("is-paused");
  return ctx;
}

function attract() {
  E.stopCamera();
  Object.assign(visitor, { gender: null, face: null, data: null, summary: null });
  const ctx = enter("attract");
  keys = (k) => { if (k === " " || k === "Enter") pickGender(); };
  skin.attract(ctx, pickGender);
}
function ask(name, title, options, done) {
  const ctx = enter(name);
  const choose = (i) => { if (options[i]) { skin.picked?.(options[i][0]); done(options[i][1]); } };
  keys = (k) => choose(Number(k) - 1);
  skin.pick(ctx, title, options.map(([label]) => label), choose);
  if (!hold) ctx.wait(T.pickIdle).then((on) => { if (on) attract(); });
}
const pickGender = () => ask("pick", "성별을 골라 주세요", [["여성", "female"], ["남성", "male"]], (g) => { visitor.gender = g; pickAge(); });
const pickAge = () => ask("pick-age", "몇 살 즈음인가요?", [["20대", 20], ["30대", 30], ["40대", 40], ["50대", 50]], (a) => { visitor.age = a; shoot(); });

function useSample() { E.stopCamera(); visitor.face = E.sampleFace(); analyze(); }

async function shoot() {
  const ctx = enter("shoot");
  const view = skin.camera(ctx);
  try { await E.openCamera(view.video); } catch (error) {
    console.error(error);
    if (ctx.alive()) view.say("카메라를 켤 수 없어요. S를 누르면 예시 얼굴로 볼 수 있어요.");
    return;
  }
  if (!ctx.alive()) { if (!scene.startsWith("shoot")) E.stopCamera(); return; }
  const canvas = document.createElement("canvas");
  let steady = 0;
  while (await ctx.wait(180)) {
    let seen;
    try { seen = E.measureFrame(view.video, canvas); } catch (error) {
      console.warn("measuring failed, switching to the CPU", error);
      if (!(await E.useCpu())) return view.say("측정을 할 수 없어요. S를 누르면 예시 얼굴로 볼 수 있어요.");
      continue;
    }
    steady = seen ? steady + 1 : 0;
    view.found(Boolean(seen));
    view.say(seen ? "좋아요, 그대로!" : "동그라미 안에서 정면을 봐 주세요");
    if (steady < T.steadyShots) continue;
    for (const n of [3, 2, 1]) { view.count(n); if (!(await ctx.wait(T.countStep))) return; }
    const shot = E.measureFrame(view.video, canvas);
    view.count(null);
    if (!shot) { steady = 0; continue; }
    visitor.face = E.cropFace(canvas, shot);
    view.flash();
    if (!(await ctx.wait(450))) return;
    E.stopCamera();
    return analyze();
  }
}

function prepare() {
  visitor.face ??= E.sampleFace();
  visitor.data ??= E.readingOf(visitor.face, visitor.age);
  visitor.summary ??= E.summaryOf(visitor.face, visitor.data);
  return visitor;
}

async function analyze() {
  E.stopCamera();
  const ctx = enter("analyze");
  const { face, data } = prepare();
  keys = (k) => { if (k === "Enter") topic(0); else if (k === " ") ctx.togglePause(); };
  const view = skin.analysis(ctx, face, data);
  const steps = data.shown.length + 2;
  view.step(1, steps, "얼굴에 점을 찍는 중");
  const dots = E.dotsOn(view.photo, face, T.dots * 0.7);
  for (let s = 1; s <= 24; s += 1) { view.dots(Math.round((s / 24) * dots.total)); if (!(await ctx.wait(T.dots / 24))) return; }
  for (const [i, part] of data.shown.entries()) {
    view.step(i + 2, steps, `${part.part} 재는 중`);
    E.focusPart(view.photo, face, part);
    view.part(part, i);
    if (!(await ctx.wait(T.perPart))) return;
    if (hold && i === 1) return;
  }
  E.focusPart(view.photo, face, null);
  view.step(steps, steps, "하나로 모으는 중");
  view.collect(data.words);
  if (await ctx.wait(T.collect)) topic(0);
}

async function topic(index) {
  prepare();
  const total = visitor.data.topics.length;
  if (index >= total) return final();
  const i = Math.max(0, index);
  const ctx = enter("topic");
  keys = (k) => { if (k === " ") ctx.togglePause(); else if (k === "ArrowRight" || k === "Enter") topic(i + 1); else if (k === "ArrowLeft") topic(i - 1); };
  const view = skin.topic(ctx, visitor.data, i, visitor.face);
  ctx.onPause((p) => view.paused?.(p));
  // view.units: what appears one after another, each followed by the time it takes to read it.
  const starts = []; let end = T.lead;
  for (const piece of view.units) { starts.push(end); end += readingMs(piece); }
  const length = end + T.tail;
  const tick = 100;
  let shown = 0; let spent = hold ? length * 0.75 : 0;
  while (spent < length) {
    while (shown < starts.length && spent >= starts[shown]) { view.show(shown); shown += 1; }
    view.progress(spent / length, length - spent, length);
    if (!(await ctx.wait(tick))) return;
    if (hold) { while (shown < starts.length) { view.show(shown); shown += 1; } view.progress(0.85, length * 0.15, length); return; }
    spent += tick;
  }
  topic(i + 1);
}

async function final() {
  prepare();
  const ctx = enter("final");
  keys = (k) => { if (k === " " || k === "Enter") attract(); else if (k === "ArrowLeft") topic(visitor.data.topics.length - 1); };
  skin.final(ctx, visitor.data, visitor.face, visitor.summary, attract);
  if (!hold && (await ctx.wait(T.final))) attract();
}

// ---------- start ----------
function fit() { stage.style.setProperty("--scale", Math.min(innerWidth / 1920, innerHeight / 1080)); }
function setSkin(name) {
  skinName = name;
  document.body.dataset.skin = name;
  const url = new URL(location.href); url.searchParams.set("skin", name); history.replaceState(null, "", url);
  stage.replaceChildren();
  skin = SKINS[name](stage);
}
if (!SKINS[skinName]) document.querySelector("#chooser").hidden = false;
else {
  document.querySelector("#fit").hidden = false;
  addEventListener("resize", fit); fit();
  await E.loadContent();
  // A button clicked with the mouse must not keep the space and enter keys to itself.
  addEventListener("click", (event) => { if (event.detail > 0) event.target.closest?.("button")?.blur(); });
  setSkin(skinName);
  addEventListener("keydown", (event) => {
    if (event.target.closest?.("button") && (event.key === " " || event.key === "Enter")) return; // the button's own click
    const k = event.key;
    if (k === " ") event.preventDefault();
    if (k === "Escape") return attract();
    if (k === "t" || k === "T" || k === "ㅅ") { const names = Object.keys(SKINS); setSkin(names[(names.indexOf(skinName) + 1) % names.length]); return attract(); }
    if ((k === "s" || k === "S" || k === "ㄴ") && ["attract", "pick", "pick-age", "shoot"].includes(scene)) return useSample();
    keys(k);
  });
  const jump = params.get("scene");
  if (params.get("sample") === "1") visitor.face = E.sampleFace();
  if (jump === "pick") pickAge();
  else if (jump === "analyze") analyze();
  else if (jump === "topic") topic(Number(params.get("i") ?? 0));
  else if (jump === "final") final();
  else attract();
}
