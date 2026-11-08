import { estimatePose, frontalizePoints, poseFromMatrix } from "./pose.js";
import { LANDMARK, getPoints, computeFrontFeatures, vertical, mean } from "./features.js";
import { CALIBRATION, zScore, formatValue } from "./calibration.js";
import { AXES, AXIS_ORDER, THRESHOLDS } from "./reading.js";
import { StableCapture, GUIDANCE } from "./capture.js";
import { interpret } from "./interpret.js";
import { applyPoseResidual } from "./residual.js";
import { FACE_TYPES, READING_PROFILES } from "./frames.js";

const MEDIAPIPE_VERSION = "1.1.1";
const MEDIAPIPE_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const PUBLIC_SITE_URL = "https://taegyu831.github.io/Sang/";
const MODEL_LOAD_TIMEOUT = 18000;
const CAMERA_LABEL = "▶ 관상 보러 들어가기";

const SEARCH_PARAMS = new URLSearchParams(window.location.search);
// ?pose=raw turns the head pose correction off, to compare against the old behaviour.
const POSE_CORRECTION = SEARCH_PARAMS.get("pose") !== "raw";
const DEBUG_MODE = SEARCH_PARAMS.get("debug") === "1";
// ?resid=off turns off the leftover head-angle correction (see dist/residual.js).
const POSE_RESIDUAL_ON = SEARCH_PARAMS.get("resid") !== "off";

const $ = (selector) => document.querySelector(selector);
const video = $("#camera");
const canvas = $("#overlay");
const ctx = canvas.getContext("2d");
const frame = $("#cameraFrame");
const emptyState = $("#emptyState");
const cameraButton = $("#cameraButton");
const stopButton = $("#stopButton");
const captureStatus = $("#captureStatus");
const stageLabel = $("#stageLabel");
const statusMessage = $("#statusMessage");
const qualityValue = $("#qualityValue");
const systemState = $("#systemState");
const sampleCount = $("#sampleCount");
const captureJourney = $("#captureJourney");
const journeyProgress = $("#journeyProgress");
const meterValue = $("#meterValue");
const classificationReady = $("#classificationReady");
const resultView = $("#resultView");
const resultCode = $("#resultCode");
const resultName = $("#resultName");
const resultTagline = $("#resultTagline");
const resultKeywords = $("#resultKeywords");
const resultFit = $("#resultFit");
const resultSecondary = $("#resultSecondary");
const resultConfidence = $("#resultConfidence");
const resultCopy = $("#resultCopy");
const resultThemes = $("#resultThemes");
const resultLinksWrap = $("#resultLinksWrap");
const resultLinks = $("#resultLinks");
const resultTone = $("#resultTone");
const resultSynthesis = $("#resultSynthesis");
const resultEvidence = $("#resultEvidence");
const resultAnalysis = $("#resultAnalysis");
const resultMethod = $("#resultMethod");
const resultFrontFigure = $("#resultFrontFigure");
const resultFrontImage = $("#resultFrontImage");
const resultFrontOverlay = $("#resultFrontOverlay");
const showAllTypes = $("#showAllTypes");
const restartButton = $("#restartButton");
const typeCatalog = $("#typeCatalog");
const catalogClose = $("#catalogClose");
const catalogList = $("#catalogList");
const scanScreen = $("#scanScreen");
const loadingScreen = $("#loadingScreen");
const loadLog = $("#loadLog");
const loadBar = $("#loadBar");
const winTitle = $("#winTitle");
const statusLeft = $("#statusLeft");
const stepText = $("#stepText");
const stepList = $("#stepList");
const lcdTimer = $("#lcdTimer");
const trayClock = $("#trayClock");
const receiptNo = $("#receiptNo");
const homeButton = $("#homeButton");
const tabPanels = $("#tabPanels");
const themeNav = $("#themeNav");
const themePrev = $("#themePrev");
const themeNext = $("#themeNext");
const themeCount = $("#themeCount");

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
let smoothed = null;
let latestLandmarks = null;
let bestShot = null;
let lastShotAt = 0;
let finalMeasurement = null;
let reading = null;
let classificationComplete = false;

const metricNodes = Object.fromEntries(
  [...document.querySelectorAll(".metric")].map((node) => [
    node.dataset.key,
    { node, value: node.querySelector("strong") },
  ]),
);

const STRENGTH_TEXT = { light: "미세한 쪽", moderate: "완만한 강조", clear: "뚜렷한 강조" };
const RELIABILITY_TEXT = { high: "근거 신뢰 높음", medium: "근거 신뢰 보통", low: "근거 신뢰 낮음" };
const RELATION_TEXT = { above: "평균보다 큼", typical: "평균 범위", below: "평균보다 작음" };

function clamp(value, minimum = 0, maximum = 1) { return Math.min(maximum, Math.max(minimum, value)); }

// ---------- screens, status bar and the little desk props ----------

const SCREENS = { start: emptyState, scan: scanScreen, loading: loadingScreen, result: resultView };
const SCREEN_STATUS = { start: "접수 대기 중", scan: "측정 중", loading: "풀이 준비 중", result: "풀이 열람 중" };
let timerStartedAt = 0;
let timerId = 0;
let loadingRun = 0;
let themeIndex = 0;

function showScreen(name) {
  for (const [key, node] of Object.entries(SCREENS)) {
    node.hidden = key !== name;
    node.classList.toggle("is-on", key === name);
  }
  const node = SCREENS[name];
  const step = Number(node.dataset.step);
  document.body.dataset.screen = name;
  winTitle.textContent = node.dataset.title;
  statusLeft.textContent = SCREEN_STATUS[name];
  stepText.textContent = `${step}단계 / 총 3단계`;
  for (const item of stepList.children) {
    const itemStep = Number(item.dataset.step);
    item.classList.toggle("is-on", itemStep === step);
    item.classList.toggle("is-done", itemStep < step);
  }
}

function newReceipt() {
  receiptNo.textContent = `제 ${String(Math.floor(1000 + Math.random() * 9000))}호`;
}

function renderTimer() {
  const seconds = Math.floor((performance.now() - timerStartedAt) / 1000);
  lcdTimer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function startTimer() {
  stopTimer();
  timerStartedAt = performance.now();
  renderTimer();
  timerId = window.setInterval(renderTimer, 500);
}

function stopTimer() {
  window.clearInterval(timerId);
  timerId = 0;
}

function resetTimer() {
  stopTimer();
  lcdTimer.textContent = "00:00";
}

function renderClock() {
  const now = new Date();
  const hours = now.getHours();
  trayClock.textContent = `${hours < 12 ? "오전" : "오후"} ${((hours + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// The wallpaper is made of the classical lines the reading actually cites.
const WALL_LINES = ["三停得位", "六府相勻", "五官俱正", "眉長過目", "目秀而長", "鼻準洪直", "天地相配", "五嶽朝天", "三停平等", "頦圓豐滿", "光明如鏡", "山根平滿", "寬廣清長", "開大合小", "保壽官", "監察官", "審辯官", "出納官", "採聽官", "命宮", "財帛宮", "福德宮", "相貌宮"];

function fillWall() {
  const wall = $("#wallText");
  if (!wall) return;
  const parts = [];
  for (let i = 0; i < 260; i += 1) parts.push(WALL_LINES[(i * 7) % WALL_LINES.length]);
  wall.textContent = parts.join(" ");
}

function setSystemState(state, label) {
  systemState.dataset.state = state;
  systemState.querySelector("span").textContent = label;
}

function withTimeout(promise, milliseconds, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function setCameraButton(label, action, disabled = false) {
  cameraButton.disabled = disabled;
  cameraButton.dataset.action = action;
  cameraButton.querySelector("span:first-child").textContent = label;
}

function showLocalFileNotice() {
  setSystemState("error", "로컬 파일 실행 불가");
  setCameraButton("웹 버전으로 열기", "open-public");
  $(".permission-note").textContent = "카메라 측정은 file:// 주소에서 실행할 수 없습니다. 버튼을 눌러 HTTPS 웹 버전으로 이동해주세요.";
}

function blendshapeMap(result) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];
  return Object.fromEntries(categories.map((item) => [item.categoryName, item.score]));
}

// ---------- live numbers ----------

function smoothValues(next) {
  if (!smoothed) { smoothed = { ...next }; return smoothed; }
  const alpha = 0.18;
  for (const [key, value] of Object.entries(next)) {
    if (Number.isFinite(value)) smoothed[key] = Number.isFinite(smoothed[key]) ? smoothed[key] * (1 - alpha) + value * alpha : value;
  }
  return smoothed;
}

function updateMetrics(values) {
  for (const [key, item] of Object.entries(metricNodes)) {
    if (!Number.isFinite(values[key])) continue;
    const digits = CALIBRATION[key]?.digits ?? 1;
    item.value.textContent = values[key].toFixed(digits);
    item.node.classList.add("is-live");
  }
}

function resetMetrics() {
  smoothed = null;
  sampleCount.textContent = "대기";
  qualityValue.textContent = "-";
  for (const item of Object.values(metricNodes)) {
    item.value.textContent = "-";
    item.node.classList.remove("is-live");
  }
}

function resetClassification() {
  capture = new StableCapture();
  bestShot = null;
  lastShotAt = 0;
  finalMeasurement = null;
  reading = null;
  classificationComplete = false;
  classificationReady.hidden = true;
  resultView.hidden = true;
  frame.classList.remove("is-result");
  updateMeter(0);
}

function updateMeter(progress) {
  const percent = Math.round(clamp(progress) * 100);
  journeyProgress.style.setProperty("--p", `${percent}%`);
  meterValue.textContent = `${percent}%`;
}

// ---------- canvas ----------

function resizeCanvas() {
  if (!video.videoWidth || !video.videoHeight) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const fit = getComputedStyle(video).objectFit;
  if (fit === "contain") {
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
  } else {
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.right = "0";
    canvas.style.bottom = "0";
  }
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

// ---------- portrait for the result screen ----------

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
  updateMetrics(smoothValues(values));
  if (classificationComplete) return;

  const verdict = capture.assess({ pose, blend, faceFill, centerOffset });
  if (verdict.ok) {
    capture.add(values, verdict.weight, pose);
    if (verdict.weight > (bestShot?.weight ?? 0) + 0.03 && performance.now() - lastShotAt > 400) {
      bestShot = { weight: verdict.weight, shot: capturePortraitFrame() };
      lastShotAt = performance.now();
    }
    const progress = capture.progress;
    updateMeter(progress);
    qualityValue.textContent = `${Math.round(progress * 100)}%`;
    sampleCount.textContent = `${capture.frames.length}장`;
    statusMessage.textContent = "좋소. 그대로 편하게 계시오. 조금 움직여도 괜찮아요";
    if (capture.isDone(CALIBRATION)) completeClassification();
  } else if (verdict.reason && GUIDANCE[verdict.reason]) {
    statusMessage.textContent = GUIDANCE[verdict.reason];
  }
}

function noFace() {
  frame.classList.remove("has-face");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  statusMessage.textContent = "얼굴이 보이도록 화면 가운데에 앉아 주세요";
  qualityValue.textContent = "-";
}

function completeClassification() {
  if (classificationComplete || !content) return;
  const snapshot = capture.snapshot(CALIBRATION);
  const confidence = Math.round(60 * snapshot.stability + 40 * clamp(snapshot.totalWeight / capture.options.targetWeight));
  finalMeasurement = { ...snapshot.values, confidence, frames: snapshot.frames, stability: snapshot.stability, coverage: snapshot.coverage };
  reading = interpret(finalMeasurement, content);
  classificationComplete = true;
  updateMetrics(finalMeasurement);
  updateMeter(1);
  sampleCount.textContent = `${snapshot.frames}장`;
  statusMessage.textContent = "다 재었소. 아래 버튼을 눌러 풀이를 보시오";
  stopTimer();
  qualityValue.textContent = `${confidence}%`;
  setSystemState("ready", "읽기 분류 완료");
  classificationReady.hidden = false;
  captureJourney.hidden = true;
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
  frame.classList.remove("is-running", "has-face");
}

async function startCamera() {
  if (!faceLandmarker || running) return;
  cameraButton.disabled = true;
  cameraButton.querySelector("span:first-child").textContent = "카메라 연결 중";
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
    showScreen("scan");
    captureStatus.hidden = false;
    captureJourney.hidden = false;
    stopButton.hidden = false;
    frame.classList.add("is-running");
    startTimer();
    stageLabel.textContent = "연속 측정";
    setSystemState("running", "연속 측정 중");
    resetMetrics();
    resetClassification();
    statusMessage.textContent = "편하게 정면을 보고 입을 다물어 주시오. 고개를 조금 움직여도 괜찮아요";
    predict();
  } catch (error) {
    console.error(error);
    showScreen("start");
    resetTimer();
    cameraButton.disabled = false;
    cameraButton.querySelector("span:first-child").textContent = "다시 시도";
    setSystemState("error", "카메라를 사용할 수 없음");
    $(".permission-note").textContent = error?.name === "NotAllowedError"
      ? "브라우저 주소창의 카메라 권한을 허용한 뒤 다시 시도해주세요."
      : "카메라 연결을 확인한 뒤 다시 시도해주세요.";
  }
}

function stopCamera() {
  stopStream();
  loadingRun += 1;
  showScreen("start");
  resetTimer();
  newReceipt();
  captureStatus.hidden = true;
  captureJourney.hidden = true;
  stopButton.hidden = true;
  cameraButton.disabled = false;
  cameraButton.querySelector("span:first-child").textContent = CAMERA_LABEL;
  setSystemState("ready", "측정 준비 완료");
  resetMetrics();
  resetClassification();
}

// ---------- result: small DOM helpers ----------

function resultElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
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

function renderCapturedFrame(shot) {
  resultFrontFigure.hidden = !shot;
  if (shot) {
    resultFrontImage.src = shot.src;
    renderFrontAnnotation(resultFrontOverlay, shot.points);
  }
}

function createPreviewFrame() {
  const portrait = `<ellipse cx="320" cy="392" rx="178" ry="266" fill="#c9b79e" stroke="#5a4b3c" stroke-width="3"/><path d="M210 330 C245 307 276 308 302 331 M338 331 C366 307 400 309 430 333" fill="none" stroke="#5a4b3c" stroke-width="5"/><path d="M222 356 C249 371 277 370 299 356 M342 356 C370 372 400 370 421 355" fill="none" stroke="#3e372f" stroke-width="4"/><path d="M318 356 C306 420 302 455 320 470 C340 461 348 455 348 444" fill="none" stroke="#665446" stroke-width="4"/><path d="M264 523 C304 545 349 545 389 520" fill="none" stroke="#7b4639" stroke-width="4"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="#dfd2bd"/><path d="M0 80H640M0 720H640" stroke="#bfae94" stroke-width="1" opacity=".6"/>${portrait}<text x="32" y="48" fill="#7b6b59" font-family="serif" font-size="18">LOCAL PREVIEW PLATE</text></svg>`;
  const points = {
    meshTop: { x: 50, y: 18 }, glabella: { x: 50, y: 39 }, noseBase: { x: 50, y: 59 }, chin: { x: 50, y: 82 },
    faceLeft: { x: 22, y: 50 }, faceRight: { x: 78, y: 50 }, templeLeft: { x: 25, y: 40 }, templeRight: { x: 75, y: 40 },
    foreheadLeft: { x: 30, y: 27 }, foreheadRight: { x: 70, y: 27 }, jawLeft: { x: 33, y: 71 }, jawRight: { x: 67, y: 71 },
    eyeLeftOuter: { x: 30, y: 43 }, eyeLeftInner: { x: 43, y: 43 }, eyeRightInner: { x: 57, y: 43 }, eyeRightOuter: { x: 70, y: 43 },
    noseTip: { x: 50, y: 55 }, upperLip: { x: 50, y: 65 },
  };
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, points };
}

// ---------- result: five themes ----------

function createThemeCard(theme, index) {
  const card = resultElement("article", `theme-card is-${theme.state}${theme.soft ? " is-soft" : ""}`);
  const head = resultElement("header", "theme-head");
  head.append(
    resultElement("span", "theme-index", `${String(index + 1).padStart(2, "0")} · ${theme.tag}`),
    resultElement("h4", "", theme.title),
  );
  const chips = resultElement("div", "theme-chips");
  chips.append(resultElement("b", "theme-state", theme.label));
  if (theme.tier) chips.append(resultElement("span", "", STRENGTH_TEXT[theme.tier]));
  if (theme.soft) chips.append(resultElement("span", "is-warn", "약한 경향"));
  if (theme.near) chips.append(resultElement("span", "is-warn", "경계 근처"));
  chips.append(resultElement("span", "is-quiet", RELIABILITY_TEXT[theme.reliability]));

  const steps = resultElement("div", "theme-steps");
  const factList = resultElement("ul", "theme-facts");
  for (const row of theme.rows) {
    const item = resultElement("li", row.supporting ? "is-supporting" : "");
    item.append(
      resultElement("span", "", row.fact),
      resultElement("i", "", RELATION_TEXT[row.relation]),
    );
    factList.append(item);
  }
  const step = (labelText, bodyNode, className = "") => {
    const wrap = resultElement("section", `theme-step ${className}`.trim());
    wrap.append(resultElement("small", "", labelText));
    wrap.append(bodyNode);
    return wrap;
  };
  steps.append(
    step("측정된 사실", factList),
    step("전통 관상에서 보는 영역", resultElement("p", "", theme.area)),
    step("이 얼굴의 읽기", resultElement("p", "", theme.reading), "is-reading"),
    step("읽을 때의 한계", resultElement("p", "", theme.limit), "is-limit"),
  );
  card.append(head, chips, steps);
  return card;
}

function renderThemes() {
  resultThemes.replaceChildren(...reading.themes.map((theme, index) => createThemeCard(theme, index)));
  themeNav.replaceChildren(...reading.themes.map((theme, index) => {
    const chip = resultElement("button", "theme-chip", theme.short);
    chip.type = "button";
    chip.setAttribute("role", "tab");
    chip.addEventListener("click", () => selectTheme(index));
    return chip;
  }));
  selectTheme(0);
}

// One theme at a time, so each reading can be read at a comfortable size.
function selectTheme(index) {
  const total = resultThemes.children.length;
  if (!total) return;
  themeIndex = (index + total) % total;
  [...resultThemes.children].forEach((card, i) => card.classList.toggle("is-current", i === themeIndex));
  [...themeNav.children].forEach((chip, i) => chip.setAttribute("aria-selected", String(i === themeIndex)));
  themeCount.textContent = `${themeIndex + 1} / ${total}`;
  tabPanels.scrollTop = 0;
}

function selectTab(name) {
  resultView.dataset.tab = name;
  for (const tab of document.querySelectorAll(".tab")) {
    const on = tab.dataset.tab === name;
    tab.classList.toggle("is-on", on);
    tab.setAttribute("aria-selected", String(on));
  }
  for (const panel of document.querySelectorAll(".tab-panel")) {
    const on = panel.dataset.panel === name;
    panel.hidden = !on;
    panel.classList.toggle("is-on", on);
  }
  tabPanels.scrollTop = 0;
}

function renderLinksAndTone() {
  const nodes = [];
  for (const link of reading.links) {
    const names = link.themes.map((id) => reading.themes.find((t) => t.id === id)?.short ?? id).join(" × ");
    const card = resultElement("article", "link-card");
    card.append(resultElement("small", "", names), resultElement("p", "", link.text));
    nodes.push(card);
  }
  resultLinks.replaceChildren(...nodes);
  resultLinks.hidden = nodes.length === 0;
  if (reading.tone) {
    resultTone.hidden = false;
    resultTone.replaceChildren(
      resultElement("small", "", reading.tone.title),
      resultElement("p", "", reading.tone.intro),
      resultElement("strong", "", reading.tone.text),
      resultElement("p", "tone-limit", reading.tone.limit),
    );
  } else {
    resultTone.hidden = true;
  }
  resultLinksWrap.hidden = nodes.length === 0 && !reading.tone;
}

// ---------- result: three frames ----------

function frameEntries() {
  return AXIS_ORDER.map((axis) => {
    const result = reading.frames.axes[axis];
    if (!result) return null;
    return { axis, meta: AXES[axis], result, key: result.key, type: FACE_TYPES[result.key], profile: READING_PROFILES[result.key] };
  }).filter(Boolean);
}

function frameReason(entry, values) {
  const { axis, key, result } = entry;
  const step = (z) => `${z >= 0 ? "+" : ""}${z.toFixed(1)}단계`;
  if (axis === "sanjeong") {
    const names = { upper: "상정", middle: "중정", lower: "하정" };
    const keys = { upper: "upperThird", middle: "middleThird", lower: "lowerThird" };
    const leader = result.detail.leader;
    const value = values[keys[leader]];
    const typical = CALIBRATION[keys[leader]].center;
    if (key === "balance") {
      return `가장 높은 ${names[leader]}이 ${value.toFixed(1)}%로 평균 ${typical}%보다 ${step(result.detail.z)}라, 강조로 보는 기준 +${THRESHOLDS.thirdsLead}단계에 닿지 않았습니다.`;
    }
    return `${names[leader]}이 ${value.toFixed(1)}%로 평균 ${typical}%보다 ${step(result.detail.z)} 길고, 다음 구역보다 ${result.detail.gapZ.toFixed(1)}단계 앞섭니다.`;
  }
  if (axis === "ogan") {
    const where = key === "open" ? "열린 쪽" : key === "focused" ? "모인 쪽" : "평균 범위";
    return `눈 사이와 좌우 바깥 여백의 평균이 눈 하나 너비의 ${result.detail.measure.toFixed(2)}배로, 평균 ${CALIBRATION.openMeasure.center}배보다 ${step(result.detail.z)}, ${where}입니다.`;
  }
  return `턱 너비 ${values.jawCheek.toFixed(1)}%, 광대 너비/얼굴 길이 ${values.faceRatio.toFixed(1)}%를 합친 윤곽 점수가 ${step(result.detail.score)}로, 0단계 이상이면 구조형입니다.`;
}

function createFrameCard(entry, values) {
  const { meta, type, profile, result } = entry;
  const card = resultElement("article", "axis-card");
  const head = resultElement("div", "axis-card-head");
  head.append(
    resultElement("span", "axis-card-label", `${meta.label} · ${meta.english}`),
    resultElement("span", "axis-card-code", type.code),
  );
  const title = resultElement("h4", "", type.name);
  if (result.tier) title.append(resultElement("em", "axis-tier", STRENGTH_TEXT[result.tier]));
  card.append(
    head,
    title,
    resultElement("p", "axis-card-tagline", type.tagline),
    resultElement("p", "axis-card-reason", frameReason(entry, values)),
  );
  if (result.near) card.append(resultElement("p", "axis-card-near", "이 틀은 판정 경계에 가까워, 자세나 표정에 따라 인접한 읽기로 보일 수도 있습니다."));
  const more = resultElement("details", "axis-card-more");
  more.append(resultElement("summary", "", "이 틀의 전통적인 설명 보기"), resultElement("p", "axis-card-body", profile.overview), resultElement("p", "axis-card-shadow", profile.shadow));
  card.append(more);
  return card;
}

function renderFrames() {
  const wrap = resultElement("div", "axis-cards");
  wrap.append(...frameEntries().map((entry) => createFrameCard(entry, finalMeasurement)));
  resultSynthesis.replaceChildren(wrap);
}

// ---------- result: measurement detail ----------

function measurementBand(key, value, labels) {
  const z = zScore(key, value);
  if (!Number.isFinite(z)) return "측정 제외";
  return z < -0.5 ? labels[0] : z > 0.5 ? labels[2] : labels[1];
}

function signedValue(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function createRatioVisual(items, variant) {
  const visual = resultElement("div", `ratio-visual ${variant}`);
  for (const item of items) {
    const segment = resultElement("div", "ratio-segment");
    segment.style.flexGrow = Math.max(0.15, item.value);
    segment.append(
      resultElement("span", "", item.label),
      resultElement("strong", "", `${item.value.toFixed(item.digits ?? 1)}${item.unit ?? ""}`),
    );
    visual.append(segment);
  }
  return visual;
}

function createAnalysisFact(labelText, valueText, stateText, copyText, tone = "neutral") {
  const article = resultElement("article", "analysis-fact");
  const heading = resultElement("div", "analysis-fact-heading");
  heading.append(
    resultElement("span", "", labelText),
    resultElement("b", `analysis-state is-${tone}`, stateText),
  );
  article.append(heading, resultElement("strong", "analysis-value", valueText), resultElement("p", "", copyText));
  return article;
}

function createAnalysisPanel(index, title, summary, visual, facts, note) {
  const panel = resultElement("article", "analysis-panel");
  const heading = resultElement("header", "analysis-panel-heading");
  const titleBlock = resultElement("div", "");
  titleBlock.append(resultElement("span", "analysis-index", index), resultElement("h4", "", title));
  heading.append(titleBlock, resultElement("p", "", summary));
  panel.append(heading);
  if (visual) panel.append(visual);
  const factGrid = resultElement("div", "analysis-facts");
  factGrid.append(...facts);
  panel.append(factGrid);
  if (note) panel.append(resultElement("p", "analysis-note", note));
  return panel;
}

function renderDetailedAnalysis(v) {
  const thirds = [["상정", v.upperThird], ["중정", v.middleThird], ["하정", v.lowerThird]];
  const thirdsLeader = [...thirds].sort((a, b) => b[1] - a[1])[0];
  const stepOf = (key) => zScore(key, v[key]);
  const thirdsVisual = createRatioVisual(thirds.map(([label, value]) => ({ label, value, unit: "%" })), "is-thirds");
  const thirdsFacts = [
    createAnalysisFact("세 구역 분포", `상정 ${v.upperThird.toFixed(1)} · 중정 ${v.middleThird.toFixed(1)} · 하정 ${v.lowerThird.toFixed(1)}%`, "측정 틀 기준", `얼굴 메시에서는 평균 얼굴도 상정 ${CALIBRATION.upperThird.center}, 중정 ${CALIBRATION.middleThird.center}, 하정 ${CALIBRATION.lowerThird.center}%로 나옵니다. 그래서 33.3%가 아니라 이 평균을 기준으로 비교합니다.`),
    createAnalysisFact("평균과의 차이", `${signedValue(stepOf("upperThird"))} / ${signedValue(stepOf("middleThird"))} / ${signedValue(stepOf("lowerThird"))}단계`, thirdsLeader[0], "상정, 중정, 하정이 평균 얼굴에서 몇 단계 떨어졌는지 보여줍니다. 한 단계는 사람 사이의 보통 차이 정도로 잡은 값입니다."),
  ];
  const fiveVisual = createRatioVisual([
    { label: "좌외", value: v.outerLeft, unit: "×", digits: 2 },
    { label: "좌안", value: v.leftEye, unit: "×", digits: 2 },
    { label: "미간", value: v.eyeGap, unit: "×", digits: 2 },
    { label: "우안", value: v.rightEye, unit: "×", digits: 2 },
    { label: "우외", value: v.outerRight, unit: "×", digits: 2 },
  ], "is-five");
  const fiveFacts = [
    createAnalysisFact("세 여백의 평균", `${v.openMeasure.toFixed(2)}배`, measurementBand("openMeasure", v.openMeasure, ["모인 쪽", "평균 범위", "열린 쪽"]), `왼쪽 바깥, 눈 사이, 오른쪽 바깥 세 여백을 같은 비중으로 평균했습니다. 평균 얼굴은 ${CALIBRATION.openMeasure.center}배입니다.`),
    createAnalysisFact("눈 사이", `${v.eyeGap.toFixed(2)}배`, measurementBand("eyeGap", v.eyeGap, ["좁은 편", "평균 범위", "넓은 편"]), "두 눈 안쪽 사이를 평균 눈 너비와 비교했습니다."),
    createAnalysisFact("양쪽 눈 크기 관계", `${v.leftEye.toFixed(2)} / ${v.rightEye.toFixed(2)}배`, Math.abs(v.leftEye - v.rightEye) <= 0.08 ? "가까운 편" : "차이 있음", "왼쪽과 오른쪽 눈 너비를 두 눈의 평균값으로 나눈 상대 비교입니다."),
  ];
  const featureFacts = [
    createAnalysisFact("코 너비 / 얼굴 너비", formatValue("noseWidth", v.noseWidth), measurementBand("noseWidth", v.noseWidth, ["좁은 편", "평균 범위", "넓은 편"]), "콧방울 양끝의 정면 너비가 얼굴 너비에서 차지하는 비율입니다."),
    createAnalysisFact("코 너비 / 눈 사이", formatValue("noseEyeGap", v.noseEyeGap), measurementBand("noseEyeGap", v.noseEyeGap, ["눈 사이보다 좁음", "평균 범위", "눈 사이보다 넓음"]), "코 너비를 두 눈 안쪽 사이 거리와 직접 비교한 값입니다."),
    createAnalysisFact("입 너비 / 코 너비", formatValue("mouthNose", v.mouthNose), measurementBand("mouthNose", v.mouthNose, ["코 쪽 우세", "평균 범위", "입 쪽 우세"]), "입꼬리 사이 너비가 콧방울 너비의 몇 배인지 보여줍니다."),
    createAnalysisFact("인중 / 하정", formatValue("philtrumLower", v.philtrumLower), measurementBand("philtrumLower", v.philtrumLower, ["짧은 편", "평균 범위", "긴 편"]), "코 아래에서 윗입술까지가 하정 전체에서 차지하는 비율입니다. 깊이는 측정하지 않았습니다."),
    createAnalysisFact("눈꼬리 기울기", `${signedValue(v.eyeTilt)}°`, "표정 영향 있음", "눈 안쪽 점과 바깥쪽 점을 잇는 선의 각도이며, 고개 기울기는 보정했습니다. 표정에 민감해 말투 보정에만 사용했습니다.", "caution"),
    createAnalysisFact("입꼬리 상대 높이", `${signedValue(v.mouthLift)}%`, "표정 영향 있음", "입 중심과 양쪽 입꼬리의 높이 차이입니다. 무표정에 가까운 프레임만 모았고 말투 보정에만 사용했습니다.", "caution"),
  ];
  const contourFacts = [
    createAnalysisFact("턱 너비 / 광대 너비", formatValue("jawCheek", v.jawCheek), measurementBand("jawCheek", v.jawCheek, ["좁은 턱", "평균 범위", "넓은 턱"]), "광대 너비는 얼굴 윤곽이 가장 넓은 지점으로 잡았습니다."),
    createAnalysisFact("이마 너비 / 광대 너비", formatValue("foreheadFace", v.foreheadFace), measurementBand("foreheadFace", v.foreheadFace, ["좁은 이마", "평균 범위", "넓은 이마"]), "이마 위쪽 윤곽점 사이를 광대 너비와 비교했습니다. 머리카락과 앞머리의 영향을 받을 수 있습니다."),
    createAnalysisFact("광대 너비 / 얼굴 길이", formatValue("faceRatio", v.faceRatio), measurementBand("faceRatio", v.faceRatio, ["세로형 방향", "평균 범위", "가로형 방향"]), "정면 얼굴 전체의 가로와 세로 관계를 나타냅니다."),
    createAnalysisFact("좌우 상대 균형", formatValue("symmetry", v.symmetry), measurementBand("symmetry", v.symmetry, ["차이 감지", "평균 범위", "가까운 편"]), "눈, 코, 입, 턱 중심의 정면 차이를 합성한 점수입니다."),
    createAnalysisFact("코끝 상대 깊이", Number.isFinite(v.noseDepth) ? `${v.noseDepth.toFixed(1)}%` : "측정 제외", "읽기에 사용 안 함", "깊이값은 모델이 추정한 값이라 기준이 아직 없어 해석에 쓰지 않았습니다. 기록용으로만 표시합니다.", "caution"),
  ];
  resultAnalysis.replaceChildren(
    createAnalysisPanel("01", "삼정 · 얼굴의 세로 분할", `${thirdsLeader[0]} ${thirdsLeader[1].toFixed(1)}%가 가장 크게 측정되었습니다.`, thirdsVisual, thirdsFacts, "상정은 실제 머리카락선이 아니라 얼굴 메시 상단을 사용한 추정값입니다."),
    createAnalysisPanel("02", "오안 · 얼굴의 다섯 가로 구간", "평균 눈 너비를 기준으로 다섯 구간을 나란히 비교합니다.", fiveVisual, fiveFacts, "바깥 여백은 얼굴 윤곽점에 닿아 있어 다른 값보다 흔들림이 큽니다."),
    createAnalysisPanel("03", "오관 · 코·입·인중의 관계", "각 부위의 단독 크기보다 서로의 비례를 읽습니다.", null, featureFacts, "눈꼬리와 입꼬리 값은 표정에 민감해 다섯 읽기 대신 말투 보정에만 썼습니다."),
    createAnalysisPanel("04", "윤곽과 균형 · 정면", "이마, 광대, 턱의 너비와 얼굴의 가로세로 관계를 함께 봅니다.", null, contourFacts, "정면 윤곽점으로 잰 상대 비율이며 뼈의 높이는 측정하지 않습니다."),
  );
}

function renderEvidence() {
  const rows = new Map();
  for (const theme of reading.themes) {
    for (const row of theme.rows) {
      if (!rows.has(row.key)) rows.set(row.key, { row, themes: [] });
      rows.get(row.key).themes.push(theme.short);
    }
  }
  resultEvidence.replaceChildren(...[...rows.values()].map(({ row, themes }) => {
    const article = document.createElement("article");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    const copy = document.createElement("p");
    label.textContent = row.label;
    value.textContent = formatValue(row.key, row.value);
    const c = CALIBRATION[row.key];
    copy.textContent = `평균 ${c.center}${c.unit}에서 ${signedValue(row.z)}단계. ${themes.join(", ")} 읽기에 사용했습니다.`;
    article.append(label, value, copy);
    return article;
  }));
}

function renderMethod() {
  const coverage = finalMeasurement.coverage;
  const items = [
    ["연속 측정 · 여러 프레임", `${finalMeasurement.frames}개 프레임을 모아 각 비율의 가중 중앙값을 사용했습니다.${coverage ? ` 고개 좌우 ${Math.round(coverage.yaw[0])}~${Math.round(coverage.yaw[1])}도, 상하 ${Math.round(coverage.pitch[0])}~${Math.round(coverage.pitch[1])}도 범위의 프레임이 쓰였습니다.` : ""} 표정이 풀린 프레임과 눈을 깜빡인 프레임은 제외했습니다.`],
    ["자세 보정 · 정면 환산", POSE_CORRECTION
      ? "3D 메시에서 고개의 좌우, 상하, 기울기 각도를 추정하고, 얼굴을 정면으로 되돌린 좌표에서 비율을 계산했습니다. 각도가 클수록 모델이 추정한 깊이값의 오차가 남을 수 있어 정면에 가까운 프레임에 더 큰 비중을 두었습니다."
      : "자세 보정을 끈 비교 모드입니다. 화면에 보이는 2D 좌표 그대로 비율을 계산했습니다."],
    ["기준 · 평균 얼굴", "얼굴 메시에서 측정한 평균 얼굴의 값을 기준으로 얼마나 떨어졌는지(단계)를 봅니다. 기준값과 단계의 크기는 전시 프로토타입의 첫 추정이며 실제 관람객 데이터로 조정할 수 있습니다."],
    ["다섯 읽기 · 판정 규칙", "한 주제는 여러 비율을 모아 읽고, 근거가 두 가지 이상 같은 방향일 때만 뚜렷하게 읽습니다. 하나뿐이면 약한 경향으로, 평균 가까이에서는 균형으로 표시합니다."],
    ["상정 · 추정값", "실제 머리카락선을 찾지 않고 얼굴 메시 상단을 임시 기준으로 사용했습니다."],
    ["측정하지 않은 것", "눈썹, 귀, 콧구멍, 입술 두께, 인중의 깊이, 눈꺼풀 모양은 측정하지 않았습니다."],
  ];
  resultMethod.replaceChildren(...items.map(([title, copy]) => {
    const article = document.createElement("article");
    const strong = document.createElement("strong");
    const p = document.createElement("p");
    strong.textContent = title;
    p.textContent = copy;
    article.append(strong, p);
    return article;
  }));
}

function renderLead() {
  const strong = reading.themes.filter((t) => t.state !== "neutral" && !t.soft).sort((a, b) => Math.abs(b.pull) - Math.abs(a.pull));
  let lead;
  if (strong.length) {
    const top = strong[0];
    lead = `가장 또렷하게 읽힌 주제는 ${top.title}이며, ${top.label}입니다. ${top.reading}`;
  } else {
    lead = "이 얼굴은 다섯 주제 모두 평균 범위에 가깝거나 약한 경향으로만 읽혀, 어느 한쪽으로 크게 기울지 않은 고른 읽기가 나왔습니다.";
  }
  resultCopy.replaceChildren(
    resultElement("p", "result-reading-lead", lead),
    resultElement("p", "result-reading-sub", content.general.closing),
  );
}

function renderResult() {
  if (!reading || !finalMeasurement) return;
  const frames = frameEntries();
  const nearFrames = frames.filter((e) => e.result.near).map((e) => e.meta.label);
  const nearThemes = reading.themes.filter((t) => t.near).map((t) => t.short);
  resultCode.textContent = frames.map((e) => e.type.code).join(" · ");
  resultName.replaceChildren(...reading.themes.map((theme) => {
    const line = resultElement("span", `axis-line${theme.soft ? " is-soft" : ""}`);
    line.append(resultElement("small", "", theme.short), document.createTextNode(theme.label));
    return line;
  }));
  resultTagline.textContent = content.general.lead;
  resultFit.textContent = "5주제 · 3틀";
  resultSecondary.textContent = [...nearThemes, ...nearFrames].join(" · ") || "없음";
  resultConfidence.textContent = `${finalMeasurement.confidence}%`;
  resultKeywords.replaceChildren(...frames.flatMap((e) => e.type.keywords.slice(1)).map((keyword) => {
    const span = document.createElement("span");
    span.textContent = keyword;
    return span;
  }));
  renderCapturedFrame(bestShot?.shot ?? null);
  renderLead();
  renderThemes();
  renderLinksAndTone();
  renderFrames();
  renderEvidence();
  renderDetailedAnalysis(finalMeasurement);
  renderMethod();
}

// Between measuring and the reading, the old computer "works": every line
// is a number the reading really used, so the pause shows the method.
function loadingLines() {
  const v = finalMeasurement;
  const lines = [`얼굴 ${v.frames}장에서 비율 모으기`];
  if (v.coverage) {
    lines.push(`고개 각도 되돌리기 · 좌우 ${Math.round(v.coverage.yaw[0])}~${Math.round(v.coverage.yaw[1])}도, 상하 ${Math.round(v.coverage.pitch[0])}~${Math.round(v.coverage.pitch[1])}도`);
  }
  lines.push(
    `삼정 재기 · 상정 ${v.upperThird.toFixed(1)} / 중정 ${v.middleThird.toFixed(1)} / 하정 ${v.lowerThird.toFixed(1)}%`,
    `오안 재기 · 세 여백 평균 눈 하나의 ${v.openMeasure.toFixed(2)}배`,
    `오악 재기 · 턱 / 광대 ${v.jawCheek.toFixed(1)}%`,
    "다섯 가지 주제 읽기",
    "고전 관상서와 대조하기",
  );
  return lines;
}

function revealResult() {
  showScreen("result");
  setSystemState("ready", "풀이 열람 중");
  tabPanels.scrollTop = 0;
}

function showResult() {
  if (!classificationComplete) return;
  stopStream();
  stopTimer();
  renderResult();
  selectTab("summary");
  classificationReady.hidden = true;
  captureStatus.hidden = true;
  captureJourney.hidden = true;
  stopButton.hidden = true;
  frame.classList.add("is-result");
  const run = ++loadingRun;
  const lines = loadingLines();
  loadLog.replaceChildren();
  loadBar.style.setProperty("--p", "0%");
  showScreen("loading");
  setSystemState("running", "풀이 준비 중");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stepMs = reduced ? 60 : 380;
  lines.forEach((text, index) => {
    window.setTimeout(() => {
      if (run !== loadingRun) return;
      loadLog.lastElementChild?.classList.add("ok");
      loadLog.append(resultElement("li", "", text));
      loadBar.style.setProperty("--p", `${Math.round(((index + 1) / lines.length) * 100)}%`);
    }, stepMs * index);
  });
  window.setTimeout(() => {
    if (run !== loadingRun) return;
    loadLog.lastElementChild?.classList.add("ok");
    revealResult();
  }, stepMs * lines.length + (reduced ? 0 : 500));
}

function goHome() {
  if (typeCatalog.open) typeCatalog.close();
  loadingRun += 1;
  stopStream();
  frame.classList.remove("is-result");
  resetMetrics();
  resetClassification();
  resetTimer();
  newReceipt();
  showScreen("start");
  setSystemState("ready", "측정 준비 완료");
}

function restartMeasurement() {
  if (typeCatalog.open) typeCatalog.close();
  loadingRun += 1;
  frame.classList.remove("is-result");
  startCamera();
}

// ---------- catalog of the nine frame results ----------

function renderCatalog() {
  const current = new Set(AXIS_ORDER.map((axis) => reading?.frames.axes[axis]?.key).filter(Boolean));
  catalogList.replaceChildren(...AXIS_ORDER.map((axis) => {
    const group = resultElement("section", "catalog-group");
    const title = resultElement("h3", "catalog-group-title");
    title.append(document.createTextNode(AXES[axis].label), resultElement("span", "", AXES[axis].english));
    const list = resultElement("div", "catalog-group-list");
    list.append(...AXES[axis].options.map((key) => {
      const type = FACE_TYPES[key];
      const article = resultElement("article", "catalog-card");
      if (current.has(key)) article.classList.add("is-current");
      article.append(
        resultElement("span", "", current.has(key) ? `${type.code} · 나의 읽기` : type.code),
        resultElement("h3", "", type.name),
        resultElement("p", "", type.summary),
        resultElement("div", "", type.keywords.join(" · ")),
      );
      return article;
    }));
    group.append(title, list);
    return group;
  }));
}

function openCatalog() {
  renderCatalog();
  if (typeof typeCatalog.showModal === "function") typeCatalog.showModal();
  else typeCatalog.setAttribute("open", "");
}

// ---------- start up ----------

async function loadContent() {
  const response = await fetch("./content.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("해석 문구 파일을 불러오지 못했습니다.");
  content = await response.json();
}

async function initialize() {
  if (window.location.protocol === "file:") {
    showLocalFileNotice();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setSystemState("error", "지원되지 않는 브라우저");
    $(".permission-note").textContent = "카메라를 지원하는 최신 Chrome 또는 Safari에서 열어주세요.";
    return;
  }
  try {
    setSystemState("loading", "측정 모델 불러오는 중");
    setCameraButton("측정 모델 준비 중", "loading", true);
    await loadContent();
    const module = await withTimeout(
      import(MEDIAPIPE_MODULE),
      MODEL_LOAD_TIMEOUT,
      "측정 모델을 불러오는 시간이 초과되었습니다.",
    );
    FaceLandmarker = module.FaceLandmarker;
    DrawingUtils = module.DrawingUtils;
    const vision = await withTimeout(
      module.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM),
      MODEL_LOAD_TIMEOUT,
      "측정 엔진을 준비하는 시간이 초과되었습니다.",
    );
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
    setSystemState("ready", "측정 준비 완료");
    $(".permission-note").textContent = "시작하면 브라우저가 카메라 사용 권한을 요청합니다.";
  } catch (error) {
    console.error(error);
    setSystemState("error", "측정 모델 로드 실패");
    setCameraButton("모델 다시 불러오기", "retry");
    // The full engine error goes to the console; the visitor gets one short line.
    const reason = (error?.message || "").includes("시간이 초과") ? error.message : "측정 모델을 불러오지 못했어요.";
    $(".permission-note").textContent = `${reason} 인터넷 연결을 확인한 뒤 다시 시도해 주세요.`;
  }
}

cameraButton.addEventListener("click", () => {
  const action = cameraButton.dataset.action;
  if (action === "open-public") {
    window.location.assign(PUBLIC_SITE_URL);
    return;
  }
  if (action === "retry") {
    initialize();
    return;
  }
  if (action === "camera") startCamera();
});
stopButton.addEventListener("click", stopCamera);
classificationReady.addEventListener("click", showResult);
restartButton.addEventListener("click", restartMeasurement);
homeButton.addEventListener("click", goHome);
loadingScreen.addEventListener("click", () => {
  if (!loadingScreen.hidden) { loadingRun += 1; revealResult(); }
});
for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => selectTab(tab.dataset.tab));
themePrev.addEventListener("click", () => selectTheme(themeIndex - 1));
themeNext.addEventListener("click", () => selectTheme(themeIndex + 1));
if (SEARCH_PARAMS.get("full") === "1") document.body.classList.add("bare");
fillWall();
newReceipt();
renderClock();
window.setInterval(renderClock, 15000);
showScreen("start");
showAllTypes.addEventListener("click", openCatalog);
catalogClose.addEventListener("click", () => typeCatalog.close());
typeCatalog.addEventListener("click", (event) => { if (event.target === typeCatalog) typeCatalog.close(); });
window.addEventListener("beforeunload", stopStream);

if (DEBUG_MODE) import("./debug.js").catch((error) => console.error(error));

// ---------- local preview and simulation (127.0.0.1 only) ----------
// Preview the result screen without a camera, overriding any ratio:
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
  updateMetrics(finalMeasurement);
  sampleCount.textContent = "96장";
  showResult();
}

if (isLocal && SEARCH_PARAMS.get("sim") === "1") {
  // Test hook: feed landmark arrays through the real pipeline without a camera.
  loadContent().then(() => {
    drawingUtils = { drawConnectors() {}, drawLandmarks() {} };
    FaceLandmarker = { FACE_LANDMARKS_TESSELATION: [], FACE_LANDMARKS_FACE_OVAL: [], FACE_LANDMARKS_LEFT_EYE: [], FACE_LANDMARKS_RIGHT_EYE: [], FACE_LANDMARKS_LIPS: [] };
    Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });
    captureStatus.hidden = false;
    captureJourney.hidden = false;
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
