// Design prototype (2026-11-27): one flow, three looks, for a portrait 1080x1920 screen.
//   attract -> pick -> shoot -> analyze -> reveal -> cards -> final
// The measuring and the readings are the app's own modules. The capture is simpler than the app's
// (one straight-on frame, no head turns), nothing is saved or sent, and the AI summary is not called.
// Keys: space or enter = go on / pause, arrows = move, digits = pick, T = next look, S = sample face, Esc = start over.
// ?theme=pop|scan|block  ?scene=analyze&sample=1 (jump, for screenshots)  ?hold=1 (stay on the scene)
import { estimatePose, frontalizePoints } from "../../pose.js";
import { getPoints, computeFrontFeatures, LANDMARK } from "../../features.js";
import { applyPoseResidual } from "../../residual.js";
import { CALIBRATION } from "../../calibration.js";
import { readParts, classifyFaceShape } from "../../parts.js";
import { composeStory } from "../../story.js";
import { extrasOf } from "../../extras.js";

const VENDOR = new URL("../../vendor/mediapipe/", import.meta.url).href;
const THEMES = ["pop", "scan", "block"];
// ARTIFICIAL: all the timings (ms) and counts of this prototype.
const T = { countStep: 800, dots: 2600, perPart: 2900, collect: 3200, reveal: 6000, card: 13000, final: 40000, steadyShots: 4 };
const PARTS_SHOWN = 4;
const FRONT = { yaw: 12, pitch: 14 };

const params = new URLSearchParams(location.search);
const hold = params.get("hold") === "1";
let theme = params.get("theme");
const $ = (s, root = document) => root.querySelector(s);
const stage = $("#stage");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = (tag, className, ...children) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
// ⟦word⟧ becomes a highlighted word; the part-name marks and the side-note mark are dropped.
function rich(tag, className, text) {
  const node = h(tag, className);
  const clean = text.replace(/⟪(?:\w+\|)?(.+?)⟫/g, "$1").replace(/§/g, "");
  clean.split(/⟦|⟧/).forEach((chunk, i) => { if (chunk) node.append(i % 2 ? h("em", "", chunk) : chunk); });
  return node;
}
const marks = (lines) => [...new Set([...lines.join(" ").matchAll(/⟦(.+?)⟧/g)].map((m) => m[1]))];

let run = 0;          // raised on every scene change; an older scene stops when it sees a new number
let sceneName = "";
let keys = () => {};  // the keys of the current scene
const visitor = { gender: null, age: 20, face: null };
let stream = null;
let landmarker = null;
let remake = null; // makes the model again on the CPU, for a computer whose GPU fails while measuring

function scene(name) {
  run += 1;
  sceneName = name;
  keys = () => {};
  stage.dataset.scene = name;
  stage.dataset.step = "0";
  const root = h("section", `scene scene-${name}`);
  stage.replaceChildren(root);
  const mine = run;
  return { root, alive: () => mine === run };
}
function stopCamera() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }

// ---------- sample face (no camera) ----------
const SAMPLE_POINTS = {
  meshTop: [50, 18], glabella: [50, 39], noseBase: [50, 59], chin: [50, 82], faceLeft: [22, 50], faceRight: [78, 50], templeLeft: [25, 40], templeRight: [75, 40],
  foreheadLeft: [30, 27], foreheadRight: [70, 27], jawLeft: [30, 70], jawRight: [70, 70], eyeLeftOuter: [29, 44], eyeLeftInner: [43, 44], eyeRightInner: [57, 44], eyeRightOuter: [71, 44],
  noseBridge: [50, 39], noseTip: [50, 56], upperLip: [50, 65], lowerLip: [50, 71], noseLeft: [43, 57], noseRight: [57, 57], mouthLeft: [38, 67], mouthRight: [62, 67],
  upperLipInner: [50, 67], lowerLipInner: [50, 68], eyeLeftTop: [36, 41.5], eyeLeftBottom: [36, 46.5], eyeRightTop: [64, 41.5], eyeRightBottom: [64, 46.5],
  browLeftOuter: [27, 38], browLeftInner: [45, 37], browLeftTop: [36, 35], browRightOuter: [73, 38], browRightInner: [55, 37], browRightTop: [64, 35], cheekLeft: [24, 58], cheekRight: [76, 58], chinLeft: [43, 80], chinRight: [57, 80],
};
function sampleFace() {
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 100 125"><rect width="100" height="125" fill="#aeb9ff"/><g transform="scale(1 1.25)"><path d="M14 100c4-14 20-17 36-17s32 3 36 17z" fill="#2b2a4a"/><ellipse cx="50" cy="50" rx="29" ry="33" fill="#ffd2b0"/><path d="M20 48C16 20 36 10 52 12c18 1 33 14 28 38-4-12-6-17-12-20-12 7-30 8-40 4-4 3-6 7-8 14z" fill="#2b2a4a"/><path d="M28 38q8-5 16-1M56 37q8-4 16 1" stroke="#2b2a4a" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="36" cy="44" rx="6.5" ry="2.8" fill="#fff"/><ellipse cx="64" cy="44" rx="6.5" ry="2.8" fill="#fff"/><circle cx="36" cy="44" r="2.4" fill="#2b2a4a"/><circle cx="64" cy="44" r="2.4" fill="#2b2a4a"/><path d="M50 44q-2 10-7 13 7 4 14 0" stroke="#c98265" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M38 66q12 11 24 0-12 3-24 0z" fill="#e2566b"/></g></svg>`;
  const base = Object.fromEntries(Object.entries(CALIBRATION).map(([k, c]) => [k, c.center]));
  const values = { ...base, leftEye: 1, rightEye: 1, outerLeft: 1.27, outerRight: 1.27, eyeGap: 1.43, noseDepth: 64, bridgeDepth: 50, chinDepth: 44, stopMiddle: 33.5, stopLower: 46.9, jawCheek: 88, noseWidth: 28.5, eyeSize: 25, mouthFace: 41 };
  const points = Object.fromEntries(Object.entries(SAMPLE_POINTS).map(([k, [x, y]]) => [k, { x, y }]));
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art)}`, points, dots: Object.values(points), values, sample: true };
}

// ---------- camera ----------
async function openCamera(video) {
  stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" }, audio: false });
  video.srcObject = stream;
  await video.play();
  if (!landmarker) {
    const mod = await import(`${VENDOR}vision_bundle.mjs`);
    const files = await mod.FilesetResolver.forVisionTasks(`${VENDOR}wasm`);
    const options = (delegate) => ({ baseOptions: { modelAssetPath: `${VENDOR}face_landmarker.task`, delegate }, runningMode: "IMAGE", numFaces: 1 });
    remake = () => mod.FaceLandmarker.createFromOptions(files, options("CPU"));
    try { landmarker = await mod.FaceLandmarker.createFromOptions(files, options("GPU")); }
    catch { landmarker = await remake(); remake = null; }
  }
}
/** One frame of the camera, measured; null without a straight-on face. */
function measureFrame(video, canvas) {
  const w = video.videoWidth; const ht = video.videoHeight;
  if (!w) return null;
  canvas.width = w; canvas.height = ht;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const marksFound = landmarker.detect(canvas).faceLandmarks?.[0];
  if (!marksFound) return null;
  const raw = getPoints(marksFound, w, ht);
  const pose = estimatePose(raw);
  if (Math.abs(pose.yaw) > FRONT.yaw || Math.abs(pose.pitch) > FRONT.pitch) return null;
  const values = applyPoseResidual(computeFrontFeatures(frontalizePoints(raw, pose)), pose);
  return { marksFound, values };
}
function cropFace(canvas, { marksFound, values }) {
  const w = canvas.width; const ht = canvas.height;
  const xs = marksFound.map((m) => m.x * w); const ys = marksFound.map((m) => m.y * ht);
  const fh = Math.max(...ys) - Math.min(...ys); const fw = Math.max(...xs) - Math.min(...xs);
  const ch = Math.min(ht, Math.max(fh * 1.55, (fw * 1.45) / 0.8)); const cw = Math.min(w, ch * 0.8);
  const cx = Math.max(0, Math.min(w - cw, (Math.max(...xs) + Math.min(...xs)) / 2 - cw / 2));
  const cy = Math.max(0, Math.min(ht - ch, (Math.max(...ys) + Math.min(...ys)) / 2 - fh * 0.05 - ch / 2));
  const out = document.createElement("canvas");
  out.width = 800; out.height = 1000;
  const g = out.getContext("2d");
  g.translate(800, 0); g.scale(-1, 1); // a mirror, as the visitor saw it
  g.drawImage(canvas, cx, cy, cw, ch, 0, 0, 800, 1000);
  const at = (m) => ({ x: 100 - ((m.x * w - cx) / cw) * 100, y: ((m.y * ht - cy) / ch) * 100 });
  return { src: out.toDataURL("image/jpeg", 0.9), points: Object.fromEntries(Object.entries(LANDMARK).map(([k, i]) => [k, at(marksFound[i])])), dots: marksFound.map(at), values };
}

// ---------- reading ----------
let partsContent = null;
function readingOf(face) {
  const parts = readParts(face.values, partsContent);
  const shape = classifyFaceShape(face.values);
  const story = composeStory(parts.all, shape, extrasOf(face.values, parts.all, visitor.age), { alone: true });
  const page = (title) => story.pages.find((p) => p.title === title);
  const topics = [["성격", "나는 어떤 사람?"], ["일과 재물", "돈과 일은?"], ["사람과 사랑", "연애와 사람은?"], ["시기", "언제 빛날까?"]]
    .map(([title, ask]) => ({ title, ask, page: page(title) })).filter((t) => t.page);
  const fit = page("잘 맞는 인연"); const clash = page("조심할 인연");
  // The parts the analysis walks through: the ones that stand out, then ordinary ones if there are too few.
  const shown = [...parts.top, ...parts.rest].filter((p) => p.draw?.length).slice(0, PARTS_SHOWN);
  const words = marks(topics.flatMap((t) => t.page.body)).slice(0, 8);
  return { parts, story, topics, fit, clash, shown, words };
}

// ---------- the photo with its overlay ----------
function photoCard(face) {
  const img = h("img", ""); img.src = face.src; img.alt = "촬영한 얼굴";
  const over = svg("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none" });
  const zoom = h("div", "zoom", img, over);
  const box = h("div", "photo", zoom);
  return { box, zoom, over };
}
function linesOf(card, points) {
  const out = [];
  for (const spec of card.draw) {
    if (typeof spec === "string") {
      const at = points[spec.slice(2)];
      if (at && points.faceLeft) out.push([{ x: Math.min(points.faceLeft.x, points.faceRight.x), y: at.y }, { x: Math.max(points.faceLeft.x, points.faceRight.x), y: at.y }]);
    } else if (points[spec[0]] && points[spec[1]]) out.push([points[spec[0]], points[spec[1]]]);
  }
  return out;
}
function focus(zoom, lines) {
  if (!lines.length) { zoom.style.transform = ""; return; }
  // The first lines of a card are the part itself; later ones are the width it is compared with.
  const [a, b] = lines[0];
  const scale = Math.max(1.35, Math.min(2, 48 / Math.max(8, Math.hypot(a.x - b.x, a.y - b.y))));
  const clampPct = (v) => Math.max(100 - 100 * scale, Math.min(0, v));
  zoom.style.transform = `translate(${clampPct(50 - ((a.x + b.x) / 2) * scale)}%, ${clampPct(50 - ((a.y + b.y) / 2) * scale)}%) scale(${scale})`;
}

// ---------- scenes ----------
function attract() {
  stopCamera();
  visitor.gender = null; visitor.face = null;
  const { root, alive } = scene("attract");
  const words = ["재물 상", "인기 상", "리더 상", "뚝심 상", "다정 상", "눈치 상"];
  const swap = h("span", "swap", words[0]);
  const orbit = h("div", "orbit", ...["눈", "코", "입", "이마", "턱"].map((w, i) => { const s = h("span", "", w); s.style.setProperty("--i", i); return s; }));
  const face = h("div", "blob", h("i", "eye"), h("i", "eye"), h("i", "mouth"), h("i", "beam"));
  const start = h("button", "cta", "눌러서 시작");
  start.addEventListener("click", pick);
  root.append(h("p", "eyebrow", "AI 관상 체험 · 약 3분"), h("h1", "hero", "내 얼굴은", h("br"), "무슨 ", swap, "?"), h("div", "face-zone", face, orbit), start, h("p", "hint", "SPACE 또는 ENTER"));
  keys = (k) => { if (k === " " || k === "Enter") pick(); };
  let i = 0;
  (async () => { while (alive()) { await sleep(1500); i = (i + 1) % words.length; swap.textContent = words[i]; swap.classList.remove("in"); void swap.offsetWidth; swap.classList.add("in"); } })();
}

function pick() {
  const { root } = scene("pick");
  const ask = (title, options, done) => {
    root.replaceChildren(h("p", "eyebrow", "딱 두 가지만"), h("h2", "title", title),
      h("div", "options", ...options.map(([label, value], i) => {
        const b = h("button", "option", h("kbd", "", String(i + 1)), h("b", "", label));
        b.style.setProperty("--i", i);
        b.addEventListener("click", () => done(value));
        return b;
      })), h("p", "hint", "숫자 키를 누르거나 클릭"));
    keys = (k) => { const o = options[Number(k) - 1]; if (o) done(o[1]); };
  };
  ask("성별을 골라 주세요", [["여성", "female"], ["남성", "male"]], (g) => {
    visitor.gender = g;
    ask("몇 살 즈음인가요?", [["20대", 20], ["30대", 30], ["40대", 40], ["50대", 50]], (a) => { visitor.age = a; shoot(); });
  });
}

async function shoot() {
  const { root, alive } = scene("shoot");
  const video = h("video", ""); video.muted = true; video.playsInline = true;
  const msg = h("p", "say", "카메라를 켜는 중");
  const count = h("div", "count");
  const useSample = h("button", "ghost", "카메라 없이 예시로 보기 (S)");
  useSample.addEventListener("click", () => { visitor.face = sampleFace(); analyze(); });
  root.append(h("div", "mirror", video, h("div", "ring"), count), msg, useSample);
  try { await openCamera(video); } catch (error) {
    console.error(error);
    if (alive()) msg.textContent = "카메라를 켤 수 없어요. S를 누르면 예시 얼굴로 볼 수 있어요.";
    return;
  }
  if (!alive()) { if (sceneName !== "shoot") stopCamera(); return; }
  const canvas = document.createElement("canvas");
  let steady = 0;
  while (alive()) {
    await sleep(180);
    let seen;
    try { seen = measureFrame(video, canvas); }
    catch (error) {
      console.warn("measuring failed, switching to the CPU", error);
      if (!remake) { msg.textContent = "측정을 할 수 없어요. S를 누르면 예시 얼굴로 볼 수 있어요."; return; }
      landmarker = await remake(); remake = null;
      continue;
    }
    steady = seen ? steady + 1 : 0;
    msg.textContent = seen ? "좋아요, 그대로!" : "동그라미 안에서 정면을 봐 주세요";
    root.classList.toggle("is-found", Boolean(seen));
    if (steady < T.steadyShots) continue;
    for (const n of [3, 2, 1]) {
      count.replaceChildren(h("b", "", String(n)));
      await sleep(T.countStep);
      if (!alive()) return;
    }
    const shot = measureFrame(video, canvas);
    count.replaceChildren();
    if (!shot) { steady = 0; continue; }
    visitor.face = cropFace(canvas, shot);
    root.append(h("div", "flash"));
    await sleep(450);
    if (!alive()) return;
    stopCamera();
    return analyze();
  }
}

async function analyze() {
  stopCamera();
  const { root, alive } = scene("analyze");
  const face = visitor.face ?? (visitor.face = sampleFace());
  const data = readingOf(face);
  const photo = photoCard(face);
  const status = h("h2", "title", "얼굴에 점을 찍는 중");
  const panel = h("div", "panel");
  const bar = h("div", "meter", h("i", ""));
  const steps = data.shown.length + 2;
  const progress = (n) => { bar.firstChild.style.width = `${(n / steps) * 100}%`; stage.dataset.step = String(n); };
  root.append(h("p", "eyebrow", "분석 중"), status, photo.box, panel, bar);
  keys = (k) => { if (k === "Enter") reveal(data); };

  // 1. dots appear from the top of the face to the bottom
  const dots = [...face.dots].sort((a, b) => a.y - b.y);
  const radius = dots.length > 100 ? 0.35 : 0.9;
  const group = svg("g", { class: "dots" });
  dots.forEach((d, i) => { const c = svg("ellipse", { cx: d.x, cy: d.y, rx: radius, ry: radius * 0.8 }); c.style.animationDelay = `${(i / dots.length) * (T.dots * 0.7)}ms`; group.append(c); });
  photo.over.append(group);
  const counter = h("b", "big-number", "0");
  panel.append(counter, h("span", "", "개의 점으로 얼굴을 읽어요"));
  progress(1);
  const from = performance.now();
  while (alive() && performance.now() - from < T.dots) { counter.textContent = String(Math.round(Math.min(1, (performance.now() - from) / (T.dots * 0.8)) * dots.length)); await sleep(40); }
  if (!alive()) return;
  counter.textContent = String(dots.length);
  group.classList.add("is-faded");

  // 2. part by part: zoom in, draw the lines, say what it reads as
  for (const [i, part] of data.shown.entries()) {
    const lines = linesOf(part, face.points);
    status.textContent = `${part.part} 재는 중`;
    focus(photo.zoom, lines);
    photo.over.querySelectorAll(".measure").forEach((n) => n.remove());
    const g = svg("g", { class: "measure" });
    for (const [a, b] of lines) g.append(svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, pathLength: 1 }));
    photo.over.append(g);
    const figure = part.mine.match(/-?\d+(?:\.\d+)?(%|도|배)?/);
    const number = h("b", "big-number", figure ? "0" : "✓");
    panel.replaceChildren(number, h("div", "verdict", h("strong", "", part.name), h("span", "", part.mine.split(/(?<=니다\.)/)[0])));
    panel.classList.remove("in"); void panel.offsetWidth; panel.classList.add("in");
    progress(i + 2);
    if (figure) {
      const value = parseFloat(figure[0]); const unit = figure[1] ?? ""; const digits = (figure[0].split(".")[1] ?? "").replace(/\D/g, "").length;
      for (let s = 1; s <= 18 && alive(); s += 1) { number.textContent = `${(value * (s / 18)).toFixed(digits)}${unit}`; await sleep(45); }
    }
    await sleep(T.perPart - 800);
    if (hold && i === 1) return;
    if (!alive()) return;
  }

  // 3. everything comes together
  focus(photo.zoom, []);
  photo.over.replaceChildren(group);
  status.textContent = "하나로 모으는 중";
  panel.replaceChildren(h("div", "words", ...data.words.map((w, i) => { const s = h("span", "", w); s.style.setProperty("--i", i); return s; })));
  progress(steps);
  await sleep(T.collect);
  if (alive()) reveal(data);
}

function reveal(data) {
  const { root, alive } = scene("reveal");
  const photo = photoCard(visitor.face);
  const go = h("button", "cta", "하나씩 보기");
  go.addEventListener("click", () => cards(data, 0));
  root.append(h("p", "eyebrow", "분석 완료"), photo.box, h("div", "stamp", "완료!"), h("p", "pre", "당신은"), rich("h2", "verdict-line", data.story.headline), go);
  keys = (k) => { if (k === " " || k === "Enter" || k === "ArrowRight") cards(data, 0); };
  if (!hold) sleep(T.reveal).then(() => { if (alive()) cards(data, 0); });
}

function cards(data, index) {
  const total = data.topics.length + 1; // the last card is the 인연
  if (index >= total) return final(data);
  if (index < 0) index = 0;
  const { root, alive } = scene("cards");
  stage.dataset.step = String(index);
  const bars = h("div", "bars", ...Array.from({ length: total }, (_, i) => { const b = h("button", i < index ? "done" : i === index ? "now" : "", h("i", "")); b.setAttribute("aria-label", `${i + 1}번째`); b.addEventListener("click", () => cards(data, i)); return b; }));
  const topic = data.topics[index];
  const body = h("div", "card-body");
  if (topic) {
    const words = marks(topic.page.body).slice(0, 3);
    const lines = topic.page.body.flatMap((l) => l.split("\n")).filter(Boolean).slice(0, 3);
    body.append(h("p", "eyebrow", topic.title), h("h2", "title", topic.ask),
      h("div", "keywords", ...(words.length ? words : marks([topic.page.lead]).slice(0, 2)).map((w, i) => { const s = h("strong", "", w); s.style.setProperty("--i", i); return s; })),
      h("div", "story", ...(lines.length ? lines : [topic.page.lead]).map((l, i) => { const p = rich("p", "", l); p.style.setProperty("--i", i); return p; })));
  } else {
    const side = (label, page, kind) => h("div", `bond ${kind}`, h("span", "", label), h("strong", "", page.bond?.name ?? ""), rich("p", "", page.lead));
    body.append(h("p", "eyebrow", "인연"), h("h2", "title", "누구랑 잘 맞을까?"), side("잘 맞아요", data.fit, "fit"), side("조심해요", data.clash, "clash"));
  }
  const photo = photoCard(visitor.face);
  const shown = data.shown[index % data.shown.length];
  // Behind the words the picture only slides to the part (no close-up: that was hard to recognise).
  const first = shown && linesOf(shown, visitor.face.points)[0];
  if (first) photo.zoom.style.setProperty("--at", String((first[0].y + first[1].y) / 200));
  const state = h("p", "hint", "SPACE 멈춤 · ← → 넘기기");
  root.append(bars, photo.box, body, state);
  let paused = false; let spent = 0; let last = performance.now();
  const fill = bars.children[index].firstChild;
  const togglePause = () => { paused = !paused; root.classList.toggle("is-paused", paused); state.textContent = paused ? "멈춤 · SPACE 이어 보기" : "SPACE 멈춤 · ← → 넘기기"; };
  keys = (k) => { if (k === " ") togglePause(); else if (k === "ArrowRight" || k === "Enter") cards(data, index + 1); else if (k === "ArrowLeft") cards(data, index - 1); };
  body.addEventListener("click", togglePause);
  const tick = (now) => {
    if (!alive()) return;
    if (!paused && !hold) spent += now - last;
    last = now;
    fill.style.width = `${Math.min(100, (spent / T.card) * 100)}%`;
    if (spent >= T.card) cards(data, index + 1); else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function final(data) {
  const { root, alive } = scene("final");
  const photo = photoCard(visitor.face);
  const again = h("button", "cta", "처음으로");
  again.addEventListener("click", attract);
  const card = h("div", "idcard", h("p", "eyebrow", "나의 관상 카드"), photo.box, rich("h2", "verdict-line", data.story.headline),
    h("div", "words", ...data.words.slice(0, 5).map((w, i) => { const s = h("span", "", w); s.style.setProperty("--i", i); return s; })),
    h("dl", "", h("dt", "", "잘 맞아요"), h("dd", "", data.fit.bond?.name ?? ""), h("dt", "", "조심해요"), h("dd", "", data.clash.bond?.name ?? "")));
  const left = h("p", "hint", "");
  root.append(card, h("p", "say", "휴대폰으로 찍어 가세요!"), again, left);
  keys = (k) => { if (k === " " || k === "Enter") attract(); else if (k === "ArrowLeft") cards(data, data.topics.length); };
  (async () => { for (let s = T.final / 1000; s > 0 && alive() && !hold; s -= 1) { left.textContent = `${s}초 뒤 처음 화면 (얼굴 사진은 저장되지 않아요)`; await sleep(1000); } if (alive() && !hold) attract(); })();
}

// ---------- start ----------
function fit() { stage.style.setProperty("--scale", Math.min(innerWidth / 1080, innerHeight / 1920)); }
function setTheme(name) {
  theme = name;
  document.body.dataset.theme = name;
  const url = new URL(location.href); url.searchParams.set("theme", name); history.replaceState(null, "", url);
}
if (!THEMES.includes(theme)) $("#chooser").hidden = false;
else {
  $("#fit").hidden = false;
  setTheme(theme);
  addEventListener("resize", fit); fit();
  addEventListener("keydown", (event) => {
    if (event.target.closest?.("button") && (event.key === " " || event.key === "Enter")) return; // the button's own click
    const k = event.key;
    if (k === " ") event.preventDefault();
    if (k === "Escape") return attract();
    if (k === "t" || k === "T" || k === "ㅅ") return setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
    if ((k === "s" || k === "S" || k === "ㄴ") && ["attract", "pick", "shoot"].includes(sceneName)) { stopCamera(); visitor.face = sampleFace(); return analyze(); }
    keys(k);
  });
  partsContent = await (await fetch("../../parts.json")).json();
  const jump = params.get("scene");
  if (params.get("sample") === "1") visitor.face = sampleFace();
  if (jump === "analyze") analyze();
  else if (jump === "pick") pick();
  else if (jump === "reveal" || jump === "cards" || jump === "final") {
    visitor.face ??= sampleFace();
    const data = readingOf(visitor.face);
    if (jump === "reveal") reveal(data); else if (jump === "cards") cards(data, Number(params.get("i") ?? 0)); else final(data);
  } else attract();
}
