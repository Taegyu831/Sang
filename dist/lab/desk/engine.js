// What the three desktop looks share: the camera, measuring, the reading and the photo with its overlay.
// The measuring and the readings are the app's own modules. The capture is simpler than the app's
// (one straight-on frame, no head turns) and nothing is saved.
import { estimatePose, frontalizePoints } from "../../pose.js";
import { getPoints, computeFrontFeatures, LANDMARK } from "../../features.js";
import { applyPoseResidual } from "../../residual.js";
import { CALIBRATION } from "../../calibration.js";
import { readParts, classifyFaceShape } from "../../parts.js";
import { composeStory } from "../../story.js";
import { extrasOf } from "../../extras.js";
import { openCameraStream } from "../../camera.js";
import { summarySpecOf } from "../../map.js";
import { summaryEndpoint, requestSummary } from "../../summary.js";

const VENDOR = new URL("../../vendor/mediapipe/", import.meta.url).href;
const FRONT = { yaw: 12, pitch: 14 }; // ARTIFICIAL: how straight the head must be for the one picture
const PARTS_SHOWN = 4;

export function h(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
export function button(className, onClick, ...children) {
  const node = h("button", className, ...children);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}
export const svg = (tag, attrs = {}) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
export const plain = (text) => text.replace(/⟪(?:\w+\|)?(.+?)⟫/g, "$1").replace(/[§⟦⟧]/g, "");
/** ⟦word⟧ becomes a highlighted word; part-name marks and the side-note mark are dropped. */
export function rich(tag, className, text) {
  const node = h(tag, className);
  text.replace(/⟪(?:\w+\|)?(.+?)⟫/g, "$1").replace(/§/g, "").split(/⟦|⟧/).forEach((chunk, i) => { if (chunk) node.append(i % 2 ? h("em", "", chunk) : chunk); });
  return node;
}
export const marks = (lines) => [...new Set([...lines.join(" ").matchAll(/⟦(.+?)⟧/g)].map((m) => m[1]))];
const sentences = (lines) => lines.flatMap((l) => l.split("\n")).flatMap((l) => l.split(/(?<=다\.)\s+/)).map((s) => s.trim()).filter(Boolean);
export const replay = (node, name = "in") => { node.classList.remove(name); void node.offsetWidth; node.classList.add(name); };

// ---------- sample face (no camera) ----------
const SAMPLE_POINTS = {
  meshTop: [50, 18], glabella: [50, 39], noseBase: [50, 59], chin: [50, 82], faceLeft: [22, 50], faceRight: [78, 50], templeLeft: [25, 40], templeRight: [75, 40],
  foreheadLeft: [30, 27], foreheadRight: [70, 27], jawLeft: [30, 70], jawRight: [70, 70], eyeLeftOuter: [29, 44], eyeLeftInner: [43, 44], eyeRightInner: [57, 44], eyeRightOuter: [71, 44],
  noseBridge: [50, 39], noseTip: [50, 56], upperLip: [50, 65], lowerLip: [50, 71], noseLeft: [43, 57], noseRight: [57, 57], mouthLeft: [38, 67], mouthRight: [62, 67],
  upperLipInner: [50, 67], lowerLipInner: [50, 68], eyeLeftTop: [36, 41.5], eyeLeftBottom: [36, 46.5], eyeRightTop: [64, 41.5], eyeRightBottom: [64, 46.5],
  browLeftOuter: [27, 38], browLeftInner: [45, 37], browLeftTop: [36, 35], browRightOuter: [73, 38], browRightInner: [55, 37], browRightTop: [64, 35], cheekLeft: [24, 58], cheekRight: [76, 58], chinLeft: [43, 80], chinRight: [57, 80],
};
export function sampleFace() {
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 100 125"><rect width="100" height="125" fill="#8f9bd8"/><g transform="scale(1 1.25)"><path d="M14 100c4-14 20-17 36-17s32 3 36 17z" fill="#2b2a4a"/><ellipse cx="50" cy="50" rx="29" ry="33" fill="#f3c6a5"/><path d="M20 48C16 20 36 10 52 12c18 1 33 14 28 38-4-12-6-17-12-20-12 7-30 8-40 4-4 3-6 7-8 14z" fill="#2b2a4a"/><path d="M28 38q8-5 16-1M56 37q8-4 16 1" stroke="#2b2a4a" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="36" cy="44" rx="6.5" ry="2.8" fill="#fff"/><ellipse cx="64" cy="44" rx="6.5" ry="2.8" fill="#fff"/><circle cx="36" cy="44" r="2.4" fill="#2b2a4a"/><circle cx="64" cy="44" r="2.4" fill="#2b2a4a"/><path d="M50 44q-2 10-7 13 7 4 14 0" stroke="#bd7a60" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M38 66q12 11 24 0-12 3-24 0z" fill="#d2506a"/></g></svg>`;
  const base = Object.fromEntries(Object.entries(CALIBRATION).map(([k, c]) => [k, c.center]));
  const values = { ...base, leftEye: 1, rightEye: 1, outerLeft: 1.27, outerRight: 1.27, eyeGap: 1.43, noseDepth: 64, bridgeDepth: 50, chinDepth: 44, stopMiddle: 33.5, stopLower: 46.9, jawCheek: 88, noseWidth: 28.5, eyeSize: 25, mouthFace: 41 };
  const points = Object.fromEntries(Object.entries(SAMPLE_POINTS).map(([k, [x, y]]) => [k, { x, y }]));
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art)}`, points, dots: Object.values(points), values, sample: true };
}

// ---------- camera ----------
let stream = null;
let landmarker = null;
let remake = null; // makes the model again on the CPU, for a computer whose GPU fails while measuring
export function stopCamera() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }
export async function openCamera(video) {
  stopCamera();
  stream = await openCameraStream({ width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" });
  video.srcObject = stream;
  await video.play();
  if (landmarker) return;
  const mod = await import(`${VENDOR}vision_bundle.mjs`);
  const files = await mod.FilesetResolver.forVisionTasks(`${VENDOR}wasm`);
  const options = (delegate) => ({ baseOptions: { modelAssetPath: `${VENDOR}face_landmarker.task`, delegate }, runningMode: "IMAGE", numFaces: 1 });
  remake = () => mod.FaceLandmarker.createFromOptions(files, options("CPU"));
  try { landmarker = await mod.FaceLandmarker.createFromOptions(files, options("GPU")); }
  catch { landmarker = await remake(); remake = null; }
}
export async function useCpu() {
  if (!remake) return false;
  landmarker = await remake(); remake = null;
  return true;
}
/** One frame of the camera, measured; null without a straight-on face. */
export function measureFrame(video, canvas) {
  const w = video.videoWidth; const ht = video.videoHeight;
  if (!w) return null;
  canvas.width = w; canvas.height = ht;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const found = landmarker.detect(canvas).faceLandmarks?.[0];
  if (!found) return null;
  const raw = getPoints(found, w, ht);
  const pose = estimatePose(raw);
  if (Math.abs(pose.yaw) > FRONT.yaw || Math.abs(pose.pitch) > FRONT.pitch) return null;
  return { found, values: applyPoseResidual(computeFrontFeatures(frontalizePoints(raw, pose)), pose) };
}
export function cropFace(canvas, { found, values }) {
  const w = canvas.width; const ht = canvas.height;
  const xs = found.map((m) => m.x * w); const ys = found.map((m) => m.y * ht);
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
  return { src: out.toDataURL("image/jpeg", 0.9), points: Object.fromEntries(Object.entries(LANDMARK).map(([k, i]) => [k, at(found[i])])), dots: found.map(at), values };
}

// ---------- reading ----------
let partsContent = null;
export async function loadContent() { partsContent = await (await fetch("../../parts.json")).json(); }
export function readingOf(face, age) {
  const parts = readParts(face.values, partsContent);
  const extras = extrasOf(face.values, parts.all, age);
  const story = composeStory(parts.all, classifyFaceShape(face.values), extras, { alone: true });
  const page = (title) => story.pages.find((p) => p.title === title);
  const topics = [["성격", "나는 어떤 사람?"], ["일과 재물", "돈이랑 일은 어때?"], ["사람과 사랑", "연애랑 사람은?"], ["시기", "언제 제일 빛나?"]]
    .filter(([title]) => page(title))
    .map(([title, ask]) => {
      const p = page(title);
      const lines = sentences(p.body.length ? p.body : [p.lead]).slice(0, 4);
      const words = marks(p.body.length ? p.body : [p.lead]).slice(0, 3);
      return { title, ask, lines, words: words.length ? words : [title] };
    });
  const fit = page("잘 맞는 인연"); const clash = page("조심할 인연");
  topics.push({ title: "인연", ask: "누구랑 잘 맞아?", lines: [fit.lead, ...sentences(fit.body).slice(0, 1), clash.lead, ...sentences(clash.body).slice(0, 1)], words: [`찰떡: ${fit.bond.name}`, `조심: ${clash.bond.name}`] });
  // The parts the analysis walks through: the ones that stand out, then ordinary ones if there are too few.
  const shown = [...parts.top, ...parts.rest].filter((p) => p.draw?.length).slice(0, PARTS_SHOWN);
  return { story, topics, shown, fit: fit.bond.name, clash: clash.bond.name, words: marks(topics.flatMap((t) => t.lines)).slice(0, 8), spec: summarySpecOf(parts.all, extras.stop, story.poles, age) };
}
/** The AI summary of a real visitor; the sample face never calls the service. */
export function summaryOf(face, data) {
  const rule = () => ({ paragraphs: [plain(data.story.closing)], ai: false });
  const endpoint = summaryEndpoint();
  if (face.sample || !endpoint) return Promise.resolve(rule());
  return requestSummary(endpoint, data.spec).then((paragraphs) => ({ paragraphs, ai: true })).catch((error) => { console.warn("summary failed", error); return rule(); });
}

// ---------- the photo with its overlay ----------
export function photoCard(face, className = "") {
  const img = h("img", ""); img.src = face.src; img.alt = "촬영한 얼굴";
  const over = svg("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none" });
  const zoom = h("div", "zoom", img, over);
  return { box: h("div", `photo ${className}`, zoom), zoom, over };
}
export function linesOf(part, points) {
  const out = [];
  for (const spec of part?.draw ?? []) {
    if (typeof spec === "string") {
      const at = points[spec.slice(2)];
      if (at && points.faceLeft) out.push([{ x: Math.min(points.faceLeft.x, points.faceRight.x), y: at.y }, { x: Math.max(points.faceLeft.x, points.faceRight.x), y: at.y }]);
    } else if (points[spec[0]] && points[spec[1]]) out.push([points[spec[0]], points[spec[1]]]);
  }
  return out;
}
export function dotsOn(photo, face, duration) {
  const dots = [...face.dots].sort((a, b) => a.y - b.y);
  const r = dots.length > 100 ? 0.35 : 0.9;
  const group = svg("g", { class: "dots" });
  dots.forEach((d, i) => { const c = svg("ellipse", { cx: d.x, cy: d.y, rx: r, ry: r * 0.8 }); c.style.animationDelay = `${(i / dots.length) * duration}ms`; group.append(c); });
  photo.over.append(group);
  return { group, total: dots.length };
}
/** Zooms to a part and draws its lines. Without a part the whole face comes back.
 *  Reading screens pass a small `most` so the face stays whole; the analysis comes closer. */
export function focusPart(photo, face, part, most = 1.8) {
  const lines = linesOf(part, face.points);
  photo.over.querySelectorAll(".measure").forEach((n) => n.remove());
  photo.over.querySelector(".dots")?.classList.toggle("is-faded", Boolean(part));
  if (!lines.length) { photo.zoom.style.transform = ""; return; }
  const [a, b] = lines[0];
  const scale = Math.max(Math.min(1.3, most), Math.min(most, 48 / Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)))); // ARTIFICIAL: zoom range
  const clampPct = (v) => Math.max(100 - 100 * scale, Math.min(0, v));
  photo.zoom.style.transform = `translate(${clampPct(50 - ((a.x + b.x) / 2) * scale)}%, ${clampPct(50 - ((a.y + b.y) / 2) * scale)}%) scale(${scale})`;
  const g = svg("g", { class: "measure" });
  for (const [p, q] of lines) g.append(svg("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y }));
  photo.over.append(g);
}
export const firstSentence = (text) => text.split(/(?<=니다\.)/)[0];
/** Counts a number up to the first figure of the part's measuring sentence. */
export async function countUp(node, part, ctx) {
  const figure = part.mine.match(/-?\d+(?:\.\d+)?(%|도|배)?/);
  if (!figure) { node.textContent = "OK"; return; }
  const value = parseFloat(figure[0]); const unit = figure[1] ?? ""; const digits = (figure[0].split(".")[1] ?? "").replace(/\D/g, "").length;
  for (let s = 1; s <= 16; s += 1) { node.textContent = `${(value * (s / 16)).toFixed(digits)}${unit}`; if (!(await ctx.wait(45))) return; }
}
/** Types text into a node a few letters at a time. */
export async function type(node, text, ctx, speed = 28) {
  for (let i = 2; i < text.length + 2; i += 2) { node.textContent = text.slice(0, i); if (!(await ctx.wait(speed))) return false; }
  return true;
}
