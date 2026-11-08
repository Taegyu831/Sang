import { estimatePose, frontalizePoints, poseFromMatrix } from "./pose.js";
import { LANDMARK, getPoints, computeFrontFeatures, vertical, mean } from "./features.js";
import { CALIBRATION } from "./calibration.js";
import { StableCapture, GUIDANCE } from "./capture.js";
import { interpret } from "./interpret.js";
import { applyPoseResidual } from "./residual.js";

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
const resultName = $("#resultName");
const resultThemes = $("#resultThemes");
const resultLinksWrap = $("#resultLinksWrap");
const resultLinks = $("#resultLinks");
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
let capture = new StableCapture();
let latestLandmarks = null;
let bestShot = null;
let lastShotAt = 0;
let finalMeasurement = null;
let reading = null;
let classificationComplete = false;
let flowRun = 0;

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
    noseTip: { x: 50, y: 55 }, upperLip: { x: 50, y: 65 },
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
    statusMessage.textContent = "좋소. 그대로 편하게 계시오";
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
  statusMessage.textContent = "다 재었소!";
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
    statusMessage.textContent = "편하게 정면을 보고 입을 다물어 주시오";
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

function renderSummary() {
  resultName.replaceChildren(...reading.themes.map((theme) => {
    const item = el("li", `axis-line${theme.soft ? " is-soft" : ""}`);
    item.append(el("small", "", theme.short), el("b", "", theme.label));
    return item;
  }));
}

function renderThemePages() {
  const total = reading.themes.length;
  resultThemes.replaceChildren(...reading.themes.map((theme, index) => {
    const page = el("article", `page theme-page theme-card is-${theme.state}`);
    const top = el("div", "theme-top");
    top.append(el("span", "", theme.title), el("span", "", `${index + 1} / ${total}`));
    page.append(top, el("p", "theme-label", theme.label), el("p", "theme-reading", theme.reading));
    page.append(el("p", "theme-area", theme.area));
    return page;
  }));
}

function renderClosing() {
  resultLinks.replaceChildren(...reading.links.map((link) => el("p", "", link.text)));
  resultLinksWrap.hidden = reading.links.length === 0;
  resultClosing.textContent = `${content.general.closing} 사진은 처음으로 돌아가면 지워져요.`;
}

function renderResult() {
  if (!reading || !finalMeasurement) return;
  const shot = bestShot?.shot ?? null;
  resultFrontFigure.hidden = !shot;
  if (shot) {
    resultFrontImage.src = shot.src;
    renderFrontAnnotation(resultFrontOverlay, shot.points);
  }
  renderSummary();
  renderThemePages();
  renderClosing();
}

const LOADING_LINES = ["관상서를 펼치는 중", "삼정과 오안을 맞춰 보는 중", "다섯 가지로 풀어 보는 중"];

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
      loadLine.textContent = line;
      setProgress(loadBar, (index + 1) / LOADING_LINES.length);
    }, stepMs * index);
  });
  window.setTimeout(() => { if (run === flowRun) showScreen("result"); }, stepMs * LOADING_LINES.length);
}

// ---------- start up ----------

async function loadContent() {
  const response = await fetch("./content.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("해석 문구 파일을 불러오지 못했습니다.");
  content = await response.json();
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
