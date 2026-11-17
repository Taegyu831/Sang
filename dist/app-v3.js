import { estimatePose, frontalizePoints, poseFromMatrix } from "./pose.js";
import { LANDMARK, getPoints, computeFrontFeatures, vertical, mean } from "./features.js";
import { CALIBRATION } from "./calibration.js";
import { StableCapture, GUIDANCE, TURN_GUIDANCE, COMPARE_STEPS, PoseCompare, compareDeltas } from "./capture.js";
import { interpret } from "./interpret.js";
import { applyPoseResidual } from "./residual.js";
import { readParts, classifyFaceShape } from "./parts.js";
import { composeStory } from "./story.js";
import { avatarSvg, paramsOf } from "./avatar.js";

const MEDIAPIPE_VERSION = "1.1.1";
const MEDIAPIPE_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const PUBLIC_SITE_URL = "https://taegyu831.github.io/Sang/";
const MODEL_LOAD_TIMEOUT = 40000;
const CAMERA_LABEL = "시작하기";

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
const toResultButton = $("#toResultButton");
const scanActions = $("#scanActions");
// ?debug=1 (collecting samples) keeps the manual 풀이 보기 and 그만하기 buttons; the real exhibit goes on by itself.
scanActions.hidden = !DEBUG_MODE;
const statusMessage = $("#statusMessage");
const journeyProgress = $("#journeyProgress");
const turnGuide = $("#turnGuide");
const tgHead = $("#tgHead");
const tgGhost = $("#tgGhost");
const tgZones = Object.fromEntries([...turnGuide.querySelectorAll(".tg-zone")].map((el) => [el.dataset.zone, el]));
const loadBar = $("#loadBar");
const loadLine = $("#loadLine");
const pages = $("#pages");
const storyFirst = $("#storyFirst");
const closingLead = $("#closingLead");
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
let story = null;
let capture = new StableCapture();
let latestLandmarks = null;
let bestShot = null;
let lastShotAt = 0;
let finalMeasurement = null;
let reading = null;
let classificationComplete = false;
// After the relaxed capture, two posed shots (jaw clenched, smiling) are compared with it.
let compare = null;
let compareIndex = -1;
let compareResults = {};
let compareBase = null;
// The sim hook (tests) skips the waiting times.
const COMPARE_OPTIONS = new URLSearchParams(window.location.search).get("sim") === "1" ? { graceMs: 0, windowMs: 0, giveUpMs: 1500 } : {};
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
  compare = null;
  compareIndex = -1;
  compareResults = {};
  compareBase = null;
  toResultButton.hidden = true;
  setProgress(journeyProgress, 0);
  smoothYaw = 0;
  turnGuide.hidden = false;
  updateTurnGuide(null);
}

// ---------- turn guide (how far is "살짝") ----------

// Screen position of a head angle on the guide: yaw > 0 turns toward the left
// of the mirrored picture, and the track spans -30..30 degrees.
const yawToX = (yaw) => 50 - (clamp(yaw, -30, 30) / 30) * 50;
const ZONE_TARGET = { front: 0, left: 15, right: -15 };
let smoothYaw = 0;

function updateTurnGuide(yaw) {
  if (Number.isFinite(yaw)) {
    smoothYaw += 0.35 * (yaw - smoothYaw);
    tgHead.style.setProperty("--x", `${yawToX(smoothYaw).toFixed(1)}%`);
    tgHead.classList.toggle("is-out", Math.abs(yaw) > capture.options.maxYaw);
  }
  const progress = capture.zoneProgress;
  const next = capture.zoneTimedOut ? null : capture.nextZone;
  for (const [name, el] of Object.entries(tgZones)) {
    el.querySelector("i").style.width = `${Math.round(progress[name] * 100)}%`;
    el.classList.toggle("is-done", progress[name] >= 1);
    el.classList.toggle("is-next", name === next);
  }
  // The faint dot shows the move to copy; only needed for the side turns.
  const showGhost = next === "left" || next === "right";
  tgGhost.classList.toggle("is-off", !showGhost);
  if (showGhost) tgGhost.style.setProperty("--to", `${yawToX(ZONE_TARGET[next])}%`);
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
  if (compare) {
    stepCompare(values, blend, pose);
    return;
  }
  updateTurnGuide(pose.yaw);

  const verdict = capture.assess({ pose, blend, faceFill, centerOffset });
  if (verdict.ok) {
    capture.add(values, verdict.weight, pose, performance.now());
    if (verdict.weight > (bestShot?.weight ?? 0) + 0.03 && performance.now() - lastShotAt > 400) {
      bestShot = { weight: verdict.weight, shot: capturePortraitFrame() };
      lastShotAt = performance.now();
    }
    setProgress(journeyProgress, capture.progress);
    const next = capture.zoneTimedOut ? null : capture.nextZone;
    const line = next ? TURN_GUIDANCE[next] : TURN_GUIDANCE.done;
    if (statusMessage.textContent !== line) statusMessage.textContent = line;
    if (capture.isDone(CALIBRATION)) beginCompare();
  } else if (verdict.reason && GUIDANCE[verdict.reason]) {
    statusMessage.textContent = GUIDANCE[verdict.reason];
  }
}

function noFace() {
  frame.classList.remove("has-face");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  statusMessage.textContent = "얼굴이 보이도록 화면 가운데에 앉아 주세요";
}

// The relaxed capture is done; ask for the two posed shots one after the other.
function beginCompare() {
  if (classificationComplete || compare || !content) return;
  compareBase = capture.frontEstimate();
  turnGuide.hidden = true;
  setProgress(journeyProgress, 1);
  if (!compareBase) { completeClassification(); return; }
  compareIndex = 0;
  compare = new PoseCompare(COMPARE_STEPS[0], COMPARE_OPTIONS);
  statusMessage.textContent = COMPARE_STEPS[0].prompt;
}

function stepCompare(values, blend, pose) {
  const t = performance.now();
  const want = COMPARE_STEPS[compareIndex].prompt;
  if (statusMessage.textContent !== want) statusMessage.textContent = want;
  compare.add({ values, blend, pose, t });
  if (!compare.finished(t)) return;
  compareResults[COMPARE_STEPS[compareIndex].id] = compare.result();
  compareIndex += 1;
  if (compareIndex < COMPARE_STEPS.length) {
    compare = new PoseCompare(COMPARE_STEPS[compareIndex], COMPARE_OPTIONS);
    statusMessage.textContent = COMPARE_STEPS[compareIndex].prompt;
    return;
  }
  compare = null;
  completeClassification(compareDeltas(compareBase, compareResults.clench, compareResults.smile));
}

function completeClassification(extra = {}) {
  if (classificationComplete || !content) return;
  const snapshot = capture.snapshot(CALIBRATION);
  const confidence = Math.round(60 * snapshot.stability + 40 * clamp(snapshot.totalWeight / capture.options.targetWeight));
  finalMeasurement = { ...snapshot.values, ...extra, confidence, frames: snapshot.frames, stability: snapshot.stability, coverage: snapshot.coverage };
  reading = interpret(finalMeasurement, content);
  classificationComplete = true;
  setProgress(journeyProgress, 1);
  turnGuide.hidden = true;
  if (DEBUG_MODE) {
    statusMessage.textContent = "다 쟀습니다! 준비되시면 아래 버튼을 눌러 주세요";
    // The camera keeps running and ?debug=1 keeps recording until 풀이 보기 is pressed.
    toResultButton.hidden = false;
    toResultButton.focus({ preventScroll: true });
  } else {
    statusMessage.textContent = "다 쟀습니다! 풀이로 넘어갑니다";
    const run = flowRun;
    window.setTimeout(() => { if (run === flowRun && classificationComplete && !scanScreen.hidden) showResult(); }, 1400);
  }
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

// ---------- reading: the whole-person story ----------

// Who the imagined 인연 looks like: "any" keeps the hair neutral.
let bondGender = "any";
const GENDERS = [["any", "상관없음"], ["female", "여자"], ["male", "남자"]];

function drawBond(figure) {
  figure.replaceChildren(avatarSvg(paramsOf(figure.dataset.to || null), { gender: bondGender, tone: figure.dataset.kind }));
}

function bondBlock(bond, withChoice) {
  const block = el("div", `bond is-${bond.kind}`);
  const figure = el("figure", "avatar");
  figure.dataset.to = bond.to ?? "";
  figure.dataset.kind = bond.kind;
  drawBond(figure);
  const text = el("div", "bond-text");
  text.append(el("p", "kicker", bond.kind === "fit" ? "잘 맞는 인연" : "조심할 인연"), el("h3", "bond-name", bond.name));
  for (const line of bond.lines) text.append(el("p", "bond-line", line));
  if (withChoice) {
    const choice = el("div", "bond-choice");
    choice.append(el("span", "", "그려 볼 모습"));
    for (const [id, label] of GENDERS) {
      const b = el("button", `chip-btn${id === bondGender ? " is-on" : ""}`, label);
      b.type = "button";
      b.addEventListener("click", () => {
        bondGender = id;
        pages.querySelectorAll(".avatar").forEach(drawBond);
        pages.querySelectorAll(".chip-btn").forEach((n, i) => n.classList.toggle("is-on", GENDERS[i % GENDERS.length][0] === id));
      });
      choice.append(b);
    }
    text.append(choice);
  }
  block.append(figure, text);
  return block;
}

// ⟦word⟧ -> bold in the accent colour, ⟪word⟫ -> bold in ink.
function marked(tag, className, text) {
  const node = el(tag, className);
  let last = 0;
  for (const m of text.matchAll(/⟦(.+?)⟧|⟪(.+?)⟫/g)) {
    node.append(document.createTextNode(text.slice(last, m.index)));
    node.append(el("strong", m[1] ? "em" : "ink", m[1] ?? m[2]));
    last = m.index + m[0].length;
  }
  node.append(document.createTextNode(text.slice(last)));
  return node;
}

function storyPage(page, { first = false } = {}) {
  const wrap = first ? storyFirst : el("div", "story-page");
  wrap.append(marked("h2", "story-lead", page.lead));
  if (page.bond) wrap.append(bondBlock(page.bond, page.bond.kind === "fit"));
  for (const line of page.body.filter(Boolean)) wrap.append(marked("p", "story-body", line));
  if (page.basis.length) wrap.append(el("p", "story-basis", `근거 · ${page.basis.join(" · ")}`));
  return wrap;
}

function renderStory() {
  parts = readParts(finalMeasurement, partsContent);
  const shape = classifyFaceShape(finalMeasurement);
  story = composeStory(parts.all, shape);
  // The first page keeps the teacher's greeting; the rest are rebuilt each time.
  storyFirst.querySelectorAll(".story-lead, .story-body, .story-basis").forEach((n) => n.remove());
  storyPage(story.pages[0], { first: true });
  pages.querySelectorAll(".slide.is-story").forEach((n) => n.remove());
  const closingPage = pages.querySelector('[data-page="last"]');
  for (const page of story.pages.slice(1)) {
    const slide = el("article", "page slide is-story");
    slide.dataset.title = page.title;
    slide.append(storyPage(page));
    pages.insertBefore(slide, closingPage);
  }
  closingLead.replaceChildren(...marked("span", "", story.closing).childNodes);
}

function renderClosing() {
  resultClosing.textContent = "관상에서 이렇게들 풀이해 왔다는 이야기이며, 성격이나 미래를 정해 주지는 않습니다. 풀이가 여러 개면 해설마다 다르게 본다는 뜻입니다. 사진은 처음으로 돌아가면 지워집니다.";
}

// ---------- slides: one region on screen, the content itself changes ----------
let slideIndex = 0;
let slideLockedUntil = 0;
const slidesOf = () => [...pages.querySelectorAll(".slide")];
const slideDots = $("#slideDots");

function showSlide(index, { force = false } = {}) {
  const slides = slidesOf();
  const next = Math.max(0, Math.min(slides.length - 1, index));
  if (next === slideIndex && !force) return;
  slideIndex = next;
  slides.forEach((slide, i) => {
    slide.classList.toggle("is-active", i === next);
    slide.classList.toggle("is-before", i < next);
    slide.scrollTop = 0;
  });
  slideDots.querySelectorAll("button").forEach((dot, i) => dot.classList.toggle("is-on", i === next));
}

function step(delta) {
  const now = performance.now();
  if (now < slideLockedUntil) return;
  const before = slideIndex;
  showSlide(slideIndex + delta);
  if (slideIndex !== before) slideLockedUntil = now + 900;
}

function buildSlides() {
  const slides = slidesOf();
  slideDots.replaceChildren(...slides.map((slide, i) => {
    const dot = el("button", "slide-dot");
    dot.type = "button";
    dot.setAttribute("aria-label", slide.dataset.title || "요약");
    dot.title = slide.dataset.title || "요약";
    dot.addEventListener("click", () => showSlide(i));
    return dot;
  }));
  showSlide(0, { force: true });
}

// A slide taller than the screen scrolls by itself first; only at its edge does the wheel turn the page.
function atEdge(slide, delta) {
  if (!slide || slide.scrollHeight <= slide.clientHeight + 2) return true;
  return delta > 0 ? slide.scrollTop + slide.clientHeight >= slide.scrollHeight - 2 : slide.scrollTop <= 0;
}
resultView.addEventListener("wheel", (event) => {
  if (Math.abs(event.deltaY) < 12) return;
  event.preventDefault();
  if (atEdge(slidesOf()[slideIndex], event.deltaY)) step(event.deltaY > 0 ? 1 : -1);
  else slidesOf()[slideIndex].scrollTop += event.deltaY;
}, { passive: false });
let touchStartY = null;
let touchEdge = { up: true, down: true };
resultView.addEventListener("touchstart", (event) => {
  touchStartY = event.touches[0].clientY;
  // Only a swipe that began at the top or bottom edge of a long page turns the page.
  const slide = slidesOf()[slideIndex];
  touchEdge = { up: atEdge(slide, -1), down: atEdge(slide, 1) };
}, { passive: true });
resultView.addEventListener("touchend", (event) => {
  if (touchStartY === null) return;
  const dy = touchStartY - event.changedTouches[0].clientY;
  touchStartY = null;
  if (Math.abs(dy) < 60) return;
  if (dy > 0 && touchEdge.down) step(1);
  else if (dy < 0 && touchEdge.up) step(-1);
}, { passive: true });
document.addEventListener("keydown", (event) => {
  if (resultView.hidden || event.target.closest?.("button, a, input")) return;
  if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); step(1); }
  else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); step(-1); }
});

function renderResult() {
  if (!reading || !finalMeasurement) return;
  const shot = bestShot?.shot ?? null;
  resultFrontFigure.hidden = !shot;
  if (shot) {
    resultFrontImage.src = shot.src;
    renderFrontAnnotation(resultFrontOverlay, shot.points);
  }
  renderStory();
  renderClosing();
  buildSlides();
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
      loadLine.textContent = line;
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
toResultButton.addEventListener("click", showResult);
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
      state: () => ({ done: classificationComplete, comparing: Boolean(compare), progress: capture.progress, frames: capture.frames.length, reading, finalMeasurement, status: statusMessage.textContent }),
      show: showResult,
    };
    window.__sangReady = true;
  });
} else if (isLocal && SEARCH_PARAMS.get("preview")) {
  startPreview();
} else {
  initialize();
}
