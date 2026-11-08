import { estimatePose, frontalizePoints, poseFromMatrix } from "./pose.js";
import { LANDMARK, getPoints, computeFrontFeatures, vertical, mean } from "./features.js";
import { CALIBRATION } from "./calibration.js";
import { StableCapture, GUIDANCE } from "./capture.js";
import { interpret } from "./interpret.js";
import { applyPoseResidual } from "./residual.js";
import { readParts, synthesize } from "./parts.js";
import { createMaster, mountMaster, say } from "./character.js";

const MEDIAPIPE_VERSION = "1.1.1";
const MEDIAPIPE_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const PUBLIC_SITE_URL = "https://taegyu831.github.io/Sang/";
const MODEL_LOAD_TIMEOUT = 18000;
const CAMERA_LABEL = "▶ 관상 보기";

const SEARCH_PARAMS = new URLSearchParams(window.location.search);
// ?pose=raw turns the head pose correction off, to compare against the old behaviour.
const POSE_CORRECTION = SEARCH_PARAMS.get("pose") !== "raw";
// ?debug=1 opens the measurement panel for the team (all ratios, recording, CSV).
const DEBUG_MODE = SEARCH_PARAMS.get("debug") === "1";
// ?resid=off turns off the leftover head-angle correction (see dist/residual.js).
const POSE_RESIDUAL_ON = SEARCH_PARAMS.get("resid") !== "off";

const $ = (selector) => document.querySelector(selector);
const video = $("#camera");
const canvas = $("#overlay");
const ctx = canvas.getContext("2d");
const frame = $("#cameraFrame");
const startScreen = $("#emptyState");
const scanScreen = $("#scanScreen");
const loadingScreen = $("#loadingScreen");
const resultView = $("#resultView");
const cameraButton = $("#cameraButton");
const permissionNote = $(".permission-note");
const stopButton = $("#stopButton");
const statusMessage = $("#statusMessage");
const journeyProgress = $("#journeyProgress");
const loadBar = $("#loadBar");
const loadLine = $("#loadLine");
const pages = $("#pages");
const topList = $("#topList");
const topCards = $("#topCards");
const restCards = $("#restCards");
const synthesisBox = $("#synthesis");
const resultClosing = $("#resultClosing");
const resultFrontFigure = $("#resultFrontFigure");
const resultFrontImage = $("#resultFrontImage");
const resultFrontOverlay = $("#resultFrontOverlay");
const restartButton = $("#restartButton");
const homeButton = $("#homeButton");

let FaceLandmarker;
let DrawingUtils;
let faceLandmarker;
let drawingUtils;
let stream;
let animationId;
let running = false;
let lastVideoTime = -1;
let content = null;
let partsContent = null;
let parts = null;
let capture = new StableCapture();
let latestLandmarks = null;
let bestShot = null;
let lastShotAt = 0;
let finalMeasurement = null;
let reading = null;
let classificationComplete = false;
let flowRun = 0;

// ---------- the 역학원 master (pixel character with a speech bubble) ----------

const masters = {};
for (const row of document.querySelectorAll("[data-master]")) {
  masters[row.dataset.master] = mountMaster(row, { scale: Number(row.dataset.scale) || 4, pose: row.dataset.pose || "idle" });
}
const GREETINGS = {
  start: ["#startSay", "어서 오세요. 카메라 앞에 편히 앉으시면, 제가 얼굴을 하나하나 풀어 드리겠습니다."],
  result: ["#resultSay", "자, 얼굴을 다 읽었습니다. 정리해 드리겠습니다."],
};

function greet(name) {
  const entry = GREETINGS[name];
  if (entry && masters[name]) say(masters[name], $(entry[0]), entry[1]);
}

// The measuring guidance changes often; the master just moves his mouth.
new MutationObserver(() => masters.scan?.talk(500)).observe($("#statusMessage"), { childList: true, characterData: true, subtree: true });

// Masters further down the reading speak once when scrolled into view.
const speakOnView = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    speakOnView.unobserve(entry.target);
    const master = entry.target._master;
    const text = entry.target.querySelector(".bubble p, .part-summary");
    if (master && text) say(master, text, text.textContent, { speed: 14 });
  }
}, { threshold: 0.6 });

function clamp(value, minimum = 0, maximum = 1) { return Math.min(maximum, Math.max(minimum, value)); }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function withTimeout(promise, milliseconds, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

// ---------- screens ----------

const SCREENS = { start: startScreen, scan: scanScreen, loading: loadingScreen, result: resultView };

function showScreen(name) {
  for (const [key, node] of Object.entries(SCREENS)) node.hidden = key !== name;
  document.body.dataset.screen = name;
  greet(name);
}

function setCameraButton(label, action, disabled = false) {
  cameraButton.disabled = disabled;
  cameraButton.dataset.action = action;
  cameraButton.querySelector("span").textContent = label;
}

function blendshapeMap(result) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];
  return Object.fromEntries(categories.map((item) => [item.categoryName, item.score]));
}

function setProgress(bar, progress) {
  bar.style.setProperty("--p", `${Math.round(clamp(progress) * 100)}%`);
}

function resetClassification() {
  capture = new StableCapture();
  bestShot = null;
  lastShotAt = 0;
  finalMeasurement = null;
  reading = null;
  classificationComplete = false;
  setProgress(journeyProgress, 0);
}

// ---------- canvas ----------

function resizeCanvas() {
  if (!video.videoWidth || !video.videoHeight) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  // The video is letterboxed (object-fit: contain), so the drawing canvas is
  // placed exactly over the visible picture.
  const frameRect = frame.getBoundingClientRect();
  const scaleFactor = Math.min(frameRect.width / video.videoWidth, frameRect.height / video.videoHeight);
  const displayWidth = video.videoWidth * scaleFactor;
  const displayHeight = video.videoHeight * scaleFactor;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  canvas.style.left = `${(frameRect.width - displayWidth) / 2}px`;
  canvas.style.top = `${(frameRect.height - displayHeight) / 2}px`;
  canvas.style.right = "auto";
  canvas.style.bottom = "auto";
}

function drawFace(landmarks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Phosphor green mesh, like an old monitor drawing over the face.
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "rgba(140, 255, 140, 0.16)", lineWidth: 0.65 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "rgba(200, 255, 200, 0.8)", lineWidth: 1.4 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: "rgba(255, 220, 90, 0.95)", lineWidth: 1.5 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: "rgba(255, 220, 90, 0.95)", lineWidth: 1.5 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: "rgba(255, 120, 100, 0.9)", lineWidth: 1.4 });
  drawingUtils.drawLandmarks(Object.values(LANDMARK).map((index) => landmarks[index]), { color: "rgba(255,255,255,0.95)", fillColor: "rgba(179,38,30,0.95)", radius: 1.4 });
  if (DEBUG_MODE) drawDebugLabels(landmarks);
}

// With ?debug=1 every measured point is named on the video, so the team can see
// which landmark each ratio really uses (the canvas is mirrored, so text is flipped back).
function drawDebugLabels(landmarks) {
  ctx.save();
  ctx.font = `${Math.max(10, canvas.width / 90)}px ui-monospace, monospace`;
  ctx.fillStyle = "rgba(255, 230, 150, 0.95)";
  for (const [name, index] of Object.entries(LANDMARK)) {
    const item = landmarks[index];
    ctx.save();
    ctx.translate(item.x * canvas.width + 4, item.y * canvas.height - 3);
    ctx.scale(-1, 1);
    ctx.fillText(`${name} ${index}`, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- portrait for the result ----------

function capturePortraitFrame() {
  if (!latestLandmarks?.length || !video.videoWidth || !video.videoHeight) return null;
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  const xs = latestLandmarks.map((item) => item.x * videoWidth);
  const ys = latestLandmarks.map((item) => item.y * videoHeight);
  const faceMinX = Math.min(...xs);
  const faceMaxX = Math.max(...xs);
  const faceMinY = Math.min(...ys);
  const faceMaxY = Math.max(...ys);
  const faceWidth = faceMaxX - faceMinX;
  const faceHeight = faceMaxY - faceMinY;
  let cropWidth = Math.max(faceWidth * 1.48, faceHeight * 1.48 * 0.8);
  let cropHeight = cropWidth / 0.8;
  if (cropHeight < faceHeight * 1.48) {
    cropHeight = faceHeight * 1.48;
    cropWidth = cropHeight * 0.8;
  }
  cropWidth = Math.min(cropWidth, videoWidth);
  cropHeight = Math.min(cropHeight, videoHeight);
  const centerX = (faceMinX + faceMaxX) / 2;
  const centerY = (faceMinY + faceMaxY) / 2 - faceHeight * 0.035;
  const cropX = clamp(centerX - cropWidth / 2, 0, videoWidth - cropWidth);
  const cropY = clamp(centerY - cropHeight / 2, 0, videoHeight - cropHeight);
  const output = document.createElement("canvas");
  output.width = 640;
  output.height = 800;
  const outputContext = output.getContext("2d");
  outputContext.save();
  outputContext.translate(output.width, 0);
  outputContext.scale(-1, 1);
  outputContext.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, output.width, output.height);
  outputContext.restore();
  const points = Object.fromEntries(Object.entries(LANDMARK).map(([key, index]) => {
    const item = latestLandmarks[index];
    return [key, {
      x: 100 - ((item.x * videoWidth - cropX) / cropWidth) * 100,
      y: ((item.y * videoHeight - cropY) / cropHeight) * 100,
    }];
  }));
  return { src: output.toDataURL("image/jpeg", 0.86), points };
}

function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function overlayLine(svg, from, to, color, className = "annotation-line") {
  if (!from || !to) return;
  svg.append(svgNode("line", {
    x1: from.x.toFixed(2), y1: from.y.toFixed(2),
    x2: to.x.toFixed(2), y2: to.y.toFixed(2),
    stroke: color, class: className,
  }));
}

function overlayLabel(svg, pointValue, label, color, offsetX = 2.2, offsetY = -1.5) {
  if (!pointValue) return;
  const labelX = clamp(pointValue.x + offsetX, 5, 95);
  const labelY = clamp(pointValue.y + offsetY, 5, 96);
  svg.append(
    svgNode("circle", { cx: pointValue.x.toFixed(2), cy: pointValue.y.toFixed(2), r: 1.15, fill: color, class: "annotation-point" }),
    svgNode("text", { x: labelX.toFixed(2), y: labelY.toFixed(2), fill: color, class: "annotation-label" }, label),
  );
}

// Lines for 삼정 (horizontal bands) and 오안 (vertical marks) over the face.
function renderFrontAnnotation(svg, points) {
  svg.replaceChildren();
  if (!points) return;
  const left = Math.min(points.faceLeft.x, points.faceRight.x);
  const right = Math.max(points.faceLeft.x, points.faceRight.x);
  const thirdColors = ["#9b3d2c", "#315d52", "#a47a35", "#6e4e61"];
  [points.meshTop, points.glabella, points.noseBase, points.chin].forEach((pointValue, index) => {
    overlayLine(svg, { x: left, y: pointValue.y }, { x: right, y: pointValue.y }, thirdColors[index], "annotation-line is-third");
  });
  const eyeY = mean(points.eyeLeftOuter.y, points.eyeLeftInner.y, points.eyeRightInner.y, points.eyeRightOuter.y);
  const fiveX = [points.templeLeft.x, points.eyeLeftOuter.x, points.eyeLeftInner.x, points.eyeRightInner.x, points.eyeRightOuter.x, points.templeRight.x].sort((a, b) => a - b);
  fiveX.forEach((x) => overlayLine(svg, { x, y: eyeY - 5.5 }, { x, y: eyeY + 5.5 }, "#a47a35", "annotation-line is-five"));
  if (points.foreheadLeft && points.foreheadRight) overlayLine(svg, points.foreheadLeft, points.foreheadRight, "#6e4e61", "annotation-line is-width");
  if (points.jawLeft && points.jawRight) overlayLine(svg, points.jawLeft, points.jawRight, "#6e4e61", "annotation-line is-width");
  overlayLabel(svg, points.glabella, "미간", "#315d52", 2.2, -2.1);
  overlayLabel(svg, points.noseTip, "코끝", "#9b3d2c", 2.4, -1.1);
  overlayLabel(svg, points.upperLip, "인중", "#6e4e61", 2.4, -1.4);
  overlayLabel(svg, points.chin, "턱", "#a47a35", 2.4, -1.6);
  overlayLabel(svg, points.faceLeft, "광대", "#315d52", -11.5, -1.4);
}

function createPreviewFrame() {
  const portrait = `<ellipse cx="320" cy="392" rx="178" ry="266" fill="#c9b79e" stroke="#5a4b3c" stroke-width="3"/><path d="M210 330 C245 307 276 308 302 331 M338 331 C366 307 400 309 430 333" fill="none" stroke="#5a4b3c" stroke-width="5"/><path d="M222 356 C249 371 277 370 299 356 M342 356 C370 372 400 370 421 355" fill="none" stroke="#3e372f" stroke-width="4"/><path d="M318 356 C306 420 302 455 320 470 C340 461 348 455 348 444" fill="none" stroke="#665446" stroke-width="4"/><path d="M264 523 C304 545 349 545 389 520" fill="none" stroke="#7b4639" stroke-width="4"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="#dfd2bd"/>${portrait}</svg>`;
  const points = {
    meshTop: { x: 50, y: 18 }, glabella: { x: 50, y: 39 }, noseBase: { x: 50, y: 59 }, chin: { x: 50, y: 82 },
    faceLeft: { x: 22, y: 50 }, faceRight: { x: 78, y: 50 }, templeLeft: { x: 25, y: 40 }, templeRight: { x: 75, y: 40 },
    foreheadLeft: { x: 30, y: 27 }, foreheadRight: { x: 70, y: 27 }, jawLeft: { x: 33, y: 71 }, jawRight: { x: 67, y: 71 },
    eyeLeftOuter: { x: 30, y: 43 }, eyeLeftInner: { x: 43, y: 43 }, eyeRightInner: { x: 57, y: 43 }, eyeRightOuter: { x: 70, y: 43 },
    noseTip: { x: 50, y: 55 }, upperLip: { x: 50, y: 65 }, lowerLip: { x: 50, y: 69 },
    noseLeft: { x: 44, y: 57 }, noseRight: { x: 56, y: 57 }, mouthLeft: { x: 40, y: 67 }, mouthRight: { x: 60, y: 67 },
    upperLipInner: { x: 50, y: 66.5 }, lowerLipInner: { x: 50, y: 67.5 },
    eyeLeftTop: { x: 36, y: 41.5 }, eyeLeftBottom: { x: 36, y: 44.5 }, eyeRightTop: { x: 64, y: 41.5 }, eyeRightBottom: { x: 64, y: 44.5 },
    browLeftOuter: { x: 27, y: 38 }, browLeftInner: { x: 45, y: 36 }, browLeftTop: { x: 36, y: 34.5 },
    browRightOuter: { x: 73, y: 38 }, browRightInner: { x: 55, y: 36 }, browRightTop: { x: 64, y: 34.5 },
    chinLeft: { x: 44, y: 81 }, chinRight: { x: 56, y: 81 },
  };
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, points };
}

// ---------- continuous capture ----------

function handleFace(landmarks, blend, matrixData) {
  latestLandmarks = landmarks;
  frame.classList.add("has-face");
  drawFace(landmarks);
  const raw = getPoints(landmarks, video.videoWidth, video.videoHeight);
  // Head pose from the 3D landmarks, then the same landmarks rotated back to a
  // straight-on view. Ratios come from the straight-on copy so they stay the
  // same when the person turns, nods or tilts the head (see dist/pose.js).
  const pose = estimatePose(raw);
  const rawValues = computeFrontFeatures(raw);
  const frontalValues = computeFrontFeatures(frontalizePoints(raw, pose));
  const correctedValues = POSE_RESIDUAL_ON ? applyPoseResidual(frontalValues, pose) : frontalValues;
  const values = POSE_CORRECTION ? correctedValues : rawValues;
  const faceFill = vertical(raw.meshTop, raw.chin) / video.videoHeight;
  const centerOffset = Math.abs(raw.noseTip.x / video.videoWidth - 0.5);
  if (DEBUG_MODE) {
    window.__sangDebug?.frame({
      t: performance.now(),
      pose,
      matrixPose: poseFromMatrix(matrixData),
      rawValues,
      correctedValues,
      blend,
      faceFill,
      centerOffset,
    });
  }
  if (classificationComplete) return;

  const verdict = capture.assess({ pose, blend, faceFill, centerOffset });
  if (verdict.ok) {
    capture.add(values, verdict.weight, pose);
    if (verdict.weight > (bestShot?.weight ?? 0) + 0.03 && performance.now() - lastShotAt > 400) {
      bestShot = { weight: verdict.weight, shot: capturePortraitFrame() };
      lastShotAt = performance.now();
    }
    setProgress(journeyProgress, capture.progress);
    statusMessage.textContent = "좋습니다. 그대로 편하게 계세요";
    if (capture.isDone(CALIBRATION)) completeClassification();
  } else if (verdict.reason && GUIDANCE[verdict.reason]) {
    statusMessage.textContent = GUIDANCE[verdict.reason];
  }
}

function noFace() {
  frame.classList.remove("has-face");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  statusMessage.textContent = "얼굴이 보이도록 화면 가운데에 앉아 주세요";
}

function completeClassification() {
  if (classificationComplete || !content) return;
  const snapshot = capture.snapshot(CALIBRATION);
  const confidence = Math.round(60 * snapshot.stability + 40 * clamp(snapshot.totalWeight / capture.options.targetWeight));
  finalMeasurement = { ...snapshot.values, confidence, frames: snapshot.frames, stability: snapshot.stability, coverage: snapshot.coverage };
  reading = interpret(finalMeasurement, content);
  classificationComplete = true;
  setProgress(journeyProgress, 1);
  statusMessage.textContent = "다 쟀습니다!";
  // Visitors go straight on to the reading; no extra button to find.
  const run = flowRun;
  window.setTimeout(() => { if (run === flowRun && !scanScreen.hidden) showResult(); }, 900);
}

async function predict() {
  if (!running) return;
  resizeCanvas();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = faceLandmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];
    if (landmarks) handleFace(landmarks, blendshapeMap(result), result.facialTransformationMatrixes?.[0]?.data);
    else noFace();
  }
  animationId = requestAnimationFrame(predict);
}

function stopStream() {
  running = false;
  cancelAnimationFrame(animationId);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  frame.classList.remove("has-face");
}

async function startCamera() {
  if (!faceLandmarker || running) return;
  flowRun += 1;
  setCameraButton("카메라 켜는 중", "busy", true);
  try {
    const isMobileView = window.matchMedia("(max-width: 780px)").matches;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: isMobileView ? 720 : 1280 },
        height: { ideal: isMobileView ? 960 : 720 },
        aspectRatio: { ideal: isMobileView ? 3 / 4 : 16 / 9 },
      },
    });
    video.srcObject = stream;
    await video.play();
    running = true;
    lastVideoTime = -1;
    resetClassification();
    showScreen("scan");
    statusMessage.textContent = "편하게 정면을 보고 입을 다물어 주세요";
    setCameraButton(CAMERA_LABEL, "camera");
    predict();
  } catch (error) {
    console.error(error);
    showScreen("start");
    setCameraButton("다시 시도", "camera");
    permissionNote.textContent = error?.name === "NotAllowedError"
      ? "카메라 권한을 허용한 뒤 다시 눌러 주세요."
      : "카메라 연결을 확인한 뒤 다시 눌러 주세요.";
  }
}

function goHome() {
  flowRun += 1;
  stopStream();
  resetClassification();
  showScreen("start");
}

// ---------- reading: one scroll ----------

// A small crop of the visitor's own face with only this part's lines drawn.
// The portrait is 640 x 800 (4:5), so it is drawn 80 units wide and 100 high
// and every point's x is scaled by 0.8: the crop keeps the real proportions.
const SHOT_W = 80;
const SHOT_H = 100;

function partPicture(shot, draw) {
  const figure = el("figure", "part-pic");
  if (!shot) return figure;
  const p = Object.fromEntries(Object.entries(shot.points).map(([k, q]) => [k, { x: (q.x * SHOT_W) / 100, y: (q.y * SHOT_H) / 100 }]));
  const segments = [];
  const left = Math.min(p.faceLeft.x, p.faceRight.x);
  const right = Math.max(p.faceLeft.x, p.faceRight.x);
  for (const item of draw) {
    if (typeof item === "string" && item.startsWith("h:")) {
      const at = p[item.slice(2)];
      if (at) segments.push([{ x: left, y: at.y }, { x: right, y: at.y }]);
    } else if (Array.isArray(item) && p[item[0]] && p[item[1]]) {
      segments.push([p[item[0]], p[item[1]]]);
    }
  }
  const xs = segments.flat().map((q) => q.x);
  const ys = segments.flat().map((q) => q.y);
  const faceWidth = right - left;
  // Crop around the drawn part with some face around it, 4:3, inside the photo.
  let w = Math.max(faceWidth * 0.9, (Math.max(...xs) - Math.min(...xs)) * 1.4);
  let h = Math.max((Math.max(...ys) - Math.min(...ys)) * 1.4, w * 0.75);
  w = Math.min(SHOT_W, Math.max(w, h / 0.75));
  h = Math.min(SHOT_H, w * 0.75);
  const cx = segments.length ? (Math.max(...xs) + Math.min(...xs)) / 2 : SHOT_W / 2;
  const cy = segments.length ? (Math.max(...ys) + Math.min(...ys)) / 2 : SHOT_H / 2;
  const x0 = clamp(cx - w / 2, 0, SHOT_W - w);
  const y0 = clamp(cy - h / 2, 0, SHOT_H - h);
  const svg = svgNode("svg", { viewBox: `${x0.toFixed(2)} ${y0.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`, preserveAspectRatio: "xMidYMid slice", "aria-hidden": "true" });
  svg.append(svgNode("image", { href: shot.src, x: 0, y: 0, width: SHOT_W, height: SHOT_H, preserveAspectRatio: "none" }));
  for (const [a, b] of segments) {
    svg.append(svgNode("line", { x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2), class: "part-line" }));
    for (const q of [a, b]) svg.append(svgNode("circle", { cx: q.x.toFixed(2), cy: q.y.toFixed(2), r: (w / 90).toFixed(2), class: "part-dot" }));
  }
  figure.append(svg);
  return figure;
}

// ---------- reading text with emphasis ----------

// Splits text by a regex and wraps the matches in <b class=...>; plain text otherwise.
function rich(tag, className, text, pattern, markClass) {
  const node = el(tag, className);
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) node.append(document.createTextNode(text.slice(last, m.index)));
    node.append(el("b", markClass, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) node.append(document.createTextNode(text.slice(last)));
  return node;
}

// The summary bubble: the closing "전체적으로 ..." sentence in bold red, the
// "다만 / 한편" counter-view sentences one shade lighter.
function summaryBubble(text) {
  const p = el("p", "part-summary bubble");
  const sentences = text.match(/[^.]+\.\s*/g) ?? [text];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (/^전체적으로/.test(trimmed)) p.append(el("span", "sum-key", sentence));
    else if (/^(다만|한편)/.test(trimmed)) p.append(el("span", "sum-alt", sentence));
    else p.append(document.createTextNode(sentence));
  }
  return p;
}

// "내 얼굴": the measured sentence with its numbers highlighted, then "보통은 ..." in grey.
const NUMBER = /\d+분의 1|\d+(?:\.\d+)?\s*(?:%|배|개|도|점)?/g;
function mineRow(text) {
  const row = el("div", "part-row is-mine");
  const cut = text.indexOf("보통");
  const measured = cut > 0 ? text.slice(0, cut) : text;
  const p = rich("p", "", measured, NUMBER, "num");
  if (cut > 0) p.append(el("span", "typical", text.slice(cut)));
  row.append(el("span", "part-label", "내 얼굴"), p);
  return row;
}

const DOMAIN_CLASS = {
  재물: "is-money",
  직업: "is-work", 명예: "is-work", 중년운: "is-work", 부하운: "is-work",
  대인관계: "is-people", 형제운: "is-people", 부모운: "is-people", 가정: "is-people",
  결혼: "is-love", 연애: "is-love", 자녀운: "is-love",
  초년운: "is-time", 말년운: "is-time", 총운: "is-time", 수명: "is-time", 건강: "is-time",
};

// Readings grouped by what they are about (성격, 재물 ...), in the order the
// most common reading of each group comes.
function readingGroups(readings) {
  const groups = new Map();
  for (const r of readings) {
    const key = r.domain || "기타";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r.text);
  }
  const wrap = el("div", "part-readings");
  for (const [domain, texts] of groups) {
    const row = el("div", "rd");
    const body = el("div", "rd-text");
    body.append(...texts.map((t) => el("p", "", t)));
    row.append(el("span", `rd-tag ${DOMAIN_CLASS[domain] ?? ""}`.trim(), domain), body);
    wrap.append(row);
  }
  return wrap;
}

function labelRow(label, text, className) {
  const row = el("div", `part-row ${className}`);
  row.append(el("span", "part-label", label), el("p", "", text));
  return row;
}

function partCard(part, shot, compact) {
  const card = el("article", `part-card is-${part.dir}`);
  const body = el("div", "part-body");
  const head = el("div", "part-head");
  head.append(el("small", "", part.part), el("h3", "", part.name));
  body.append(head);
  // The conclusion first, then what it was built from.
  if (part.summary) {
    // The summary is the master speaking: a small still portrait and a bubble.
    const row = el("div", "master-row is-card");
    const master = createMaster({ scale: compact ? 2 : 3, pose: compact ? "idle" : "point" });
    row.append(master.node, summaryBubble(part.summary));
    body.append(row);
  }
  body.append(mineRow(part.mine));
  if (part.about) body.append(labelRow("이 부위는", part.about, "is-about"));
  if (part.readings.length) {
    // Readings come sorted by how many sources gave them.
    const details = el("details", "part-more");
    details.open = !compact;
    details.append(el("summary", "", `풀이 근거 ${part.readings.length}개`), readingGroups(part.readings));
    body.append(details);
  }
  card.append(partPicture(shot, part.draw), body);
  return card;
}

function renderParts(shot) {
  parts = readParts(finalMeasurement, partsContent);
  topList.replaceChildren(...parts.top.map((part) => {
    const item = el("li");
    item.append(el("small", "", part.part), el("b", "", part.name));
    return item;
  }));
  topCards.replaceChildren(...parts.top.map((part) => partCard(part, shot, false)));
  // Part names in red, life areas in gold.
  const names = parts.top.map((p) => p.part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const highlight = new RegExp(names.join("|"), "g");
  const areas = /재물 이야기|일과 사회적 자리|사람과의 인연|연애와 결혼|인생의 시기|일과 사회|성격과 기질/g;
  synthesisBox.replaceChildren(...synthesize(parts.top, partsContent).map((line, i) => {
    const p = rich("p", "", line, i === 0 ? /$^/g : highlight, "hl");
    if (i > 1) return rich("p", "", line, areas, "hl-domain");
    return p;
  }));
  restCards.replaceChildren(...parts.rest.map((part) => partCard(part, shot, true)));
}

function renderClosing() {
  const closingRow = document.querySelector('[data-master="closing"]');
  closingRow._master = masters.closing;
  speakOnView.observe(closingRow);
  resultClosing.textContent = "관상에서 이렇게들 풀이해 왔다는 이야기이며, 성격이나 미래를 정해 주지는 않습니다. 풀이가 여러 개면 해설마다 다르게 본다는 뜻입니다. 사진은 처음으로 돌아가면 지워집니다.";
}

function renderResult() {
  if (!reading || !finalMeasurement) return;
  const shot = bestShot?.shot ?? null;
  resultFrontFigure.hidden = !shot;
  if (shot) {
    resultFrontImage.src = shot.src;
    renderFrontAnnotation(resultFrontOverlay, shot.points);
  }
  renderParts(shot);
  renderClosing();
}

const LOADING_LINES = ["관상서를 펼치는 중입니다", "삼정과 오안을 맞춰 보는 중입니다", "부위마다 풀이를 모으는 중입니다"];

function showResult() {
  if (!classificationComplete) return;
  stopStream();
  renderResult();
  pages.scrollTop = 0;
  const run = ++flowRun;
  showScreen("loading");
  setProgress(loadBar, 0);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stepMs = reduced ? 50 : 650;
  LOADING_LINES.forEach((line, index) => {
    window.setTimeout(() => {
      if (run !== flowRun) return;
      say(masters.loading, loadLine, line);
      setProgress(loadBar, (index + 1) / LOADING_LINES.length);
    }, stepMs * index);
  });
  window.setTimeout(() => { if (run === flowRun) showScreen("result"); }, stepMs * LOADING_LINES.length);
}

// ---------- start up ----------

async function loadContent() {
  const [themesResponse, partsResponse] = await Promise.all([
    fetch("./content.json", { cache: "no-cache" }),
    fetch("./parts.json", { cache: "no-cache" }),
  ]);
  if (!themesResponse.ok || !partsResponse.ok) throw new Error("해석 문구 파일을 불러오지 못했습니다.");
  content = await themesResponse.json();
  partsContent = await partsResponse.json();
}

async function initialize() {
  if (window.location.protocol === "file:") return;
  if (!navigator.mediaDevices?.getUserMedia) {
    permissionNote.textContent = "최신 Chrome이나 Safari에서 열어 주세요.";
    return;
  }
  try {
    setCameraButton("준비 중", "loading", true);
    await loadContent();
    const module = await withTimeout(import(MEDIAPIPE_MODULE), MODEL_LOAD_TIMEOUT, "측정 모델을 불러오는 시간이 초과되었습니다.");
    FaceLandmarker = module.FaceLandmarker;
    DrawingUtils = module.DrawingUtils;
    const vision = await withTimeout(module.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM), MODEL_LOAD_TIMEOUT, "측정 엔진을 준비하는 시간이 초과되었습니다.");
    faceLandmarker = await withTimeout(
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }),
      MODEL_LOAD_TIMEOUT,
      "얼굴 측정 모델을 준비하는 시간이 초과되었습니다.",
    );
    drawingUtils = new DrawingUtils(ctx);
    setCameraButton(CAMERA_LABEL, "camera");
    permissionNote.textContent = "";
  } catch (error) {
    // The full engine error goes to the console; the visitor gets one short line.
    console.error(error);
    setCameraButton("다시 불러오기", "retry");
    permissionNote.textContent = "준비가 잘 안 됐어요. 인터넷 연결을 확인하고 다시 눌러 주세요.";
  }
}

cameraButton.addEventListener("click", () => {
  const action = cameraButton.dataset.action;
  if (action === "open-public") window.location.assign(PUBLIC_SITE_URL);
  else if (action === "retry") initialize();
  else if (action === "camera") startCamera();
});
stopButton.addEventListener("click", goHome);
restartButton.addEventListener("click", () => { goHome(); startCamera(); });
homeButton.addEventListener("click", goHome);
loadingScreen.addEventListener("click", () => { flowRun += 1; showScreen("result"); });
window.addEventListener("beforeunload", stopStream);
showScreen("start");

if (DEBUG_MODE) import("./debug.js").catch((error) => console.error(error));

// ---------- local preview and simulation (127.0.0.1 only) ----------
// Preview the reading without a camera, overriding any ratio:
//   http://127.0.0.1:8000/?preview=1&v=lowerThird:47,jawCheek:84,philtrumLower:23
// Without v every ratio sits at the average face.
// ?sim=1 exposes the measurement pipeline to tests (see tests/flow.test.html).

const isLocal = window.location.hostname === "127.0.0.1";

function parseOverrides(text) {
  const out = {};
  for (const pair of (text ?? "").split(",")) {
    const [key, value] = pair.split(":");
    if (key && Number.isFinite(Number(value))) out[key] = Number(value);
  }
  return out;
}

async function startPreview() {
  await loadContent();
  const base = Object.fromEntries(Object.entries(CALIBRATION).map(([key, c]) => [key, c.center]));
  const values = { ...base, leftEye: 1, rightEye: 1, outerLeft: 1.27, outerRight: 1.27, eyeGap: 1.43, noseDepth: 64, bridgeDepth: 50, chinDepth: 44, ...parseOverrides(SEARCH_PARAMS.get("v")) };
  finalMeasurement = { ...values, confidence: 88, frames: 96, stability: 0.9, coverage: { yaw: [-18, 20], pitch: [-9, 11] } };
  reading = interpret(finalMeasurement, content);
  bestShot = { weight: 1, shot: createPreviewFrame() };
  classificationComplete = true;
  showResult();
}

if (isLocal && SEARCH_PARAMS.get("sim") === "1") {
  // Test hook: feed landmark arrays through the real pipeline without a camera.
  loadContent().then(() => {
    drawingUtils = { drawConnectors() {}, drawLandmarks() {} };
    FaceLandmarker = { FACE_LANDMARKS_TESSELATION: [], FACE_LANDMARKS_FACE_OVAL: [], FACE_LANDMARKS_LEFT_EYE: [], FACE_LANDMARKS_RIGHT_EYE: [], FACE_LANDMARKS_LIPS: [] };
    Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });
    window.__sang = {
      feed: (landmarks, blend = {}) => handleFace(landmarks, blend, null),
      state: () => ({ done: classificationComplete, progress: capture.progress, frames: capture.frames.length, reading, finalMeasurement, status: statusMessage.textContent }),
      show: showResult,
    };
    window.__sangReady = true;
  });
} else if (isLocal && SEARCH_PARAMS.get("preview")) {
  startPreview();
} else {
  initialize();
}
