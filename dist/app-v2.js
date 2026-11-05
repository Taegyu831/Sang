const MEDIAPIPE_VERSION = "1.1.1";
const MEDIAPIPE_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const REQUIRED_STABLE_SAMPLES = 54;
const MIN_CLASSIFY_QUALITY = 78;

const video = document.querySelector("#camera");
const canvas = document.querySelector("#overlay");
const ctx = canvas.getContext("2d");
const frame = document.querySelector("#cameraFrame");
const emptyState = document.querySelector("#emptyState");
const cameraButton = document.querySelector("#cameraButton");
const stopButton = document.querySelector("#stopButton");
const captureStatus = document.querySelector("#captureStatus");
const statusMessage = document.querySelector("#statusMessage");
const qualityValue = document.querySelector("#qualityValue");
const systemState = document.querySelector("#systemState");
const sampleCount = document.querySelector("#sampleCount");
const classificationReady = document.querySelector("#classificationReady");
const resultView = document.querySelector("#resultView");
const resultCode = document.querySelector("#resultCode");
const resultName = document.querySelector("#resultName");
const resultTagline = document.querySelector("#resultTagline");
const resultKeywords = document.querySelector("#resultKeywords");
const resultCopy = document.querySelector("#resultCopy");
const resultEvidence = document.querySelector("#resultEvidence");
const showAllTypes = document.querySelector("#showAllTypes");
const restartButton = document.querySelector("#restartButton");
const typeCatalog = document.querySelector("#typeCatalog");
const catalogClose = document.querySelector("#catalogClose");
const catalogList = document.querySelector("#catalogList");

let FaceLandmarker;
let DrawingUtils;
let faceLandmarker;
let drawingUtils;
let stream;
let animationId;
let running = false;
let lastVideoTime = -1;
let samples = 0;
let smoothed = null;
let stableSamples = [];
let finalMeasurement = null;
let classifiedType = null;
let classificationComplete = false;

const metricNodes = Object.fromEntries(
  [...document.querySelectorAll(".metric")].map((node) => [
    node.dataset.key,
    { node, value: node.querySelector("strong") },
  ]),
);

const METRIC_LABELS = {
  eyeGap: { label: "눈 사이 비율", unit: "배" },
  philtrum: { label: "인중 비율", unit: "%" },
  eyeTilt: { label: "눈꼬리 각도", unit: "°" },
  browGap: { label: "미간 비율", unit: "%" },
  mouthLift: { label: "입꼬리 높이", unit: "%" },
  cheekWidth: { label: "광대부 비율", unit: "%" },
  jawWidth: { label: "턱 너비 비율", unit: "%" },
  faceRatio: { label: "얼굴 너비 비율", unit: "%" },
};

const FACE_TYPES = {
  balance: {
    code: "F—01", name: "균형의 상", tagline: "한 부분보다 전체의 조율이 먼저 보이는 얼굴",
    keywords: ["조율", "안정", "중간의 감각"],
    summary: "주요 비율이 어느 한쪽으로 크게 치우치지 않아, 전체의 조화가 먼저 읽히는 유형입니다.",
    description: [
      "눈과 미간, 중안부와 하관의 비율이 한 방향으로 강하게 쏠리기보다 서로 비슷한 시각적 무게를 나누고 있습니다. 그래서 첫인상에서 특정 특징 하나가 앞서기보다 얼굴 전체가 비교적 고르게 들어오는 편입니다.",
      "전통적인 인상 해석의 언어로 옮기면, 여러 신호를 함께 살피고 상황의 속도를 조율하는 이미지에 가깝습니다. 결론을 급히 내리기보다 전체 관계를 먼저 보는 사람처럼 읽힐 수 있습니다. 때로는 강한 개성이 늦게 보이거나 결정을 유보하는 듯한 인상을 줄 수 있지만, 이 유형의 핵심은 망설임보다 ‘치우치지 않는 감각’에 있습니다.",
    ],
    evidence: [["eyeGap", "시선의 간격이 중앙 범위에 가깝습니다."], ["browGap", "미간이 한쪽 인상을 과도하게 강조하지 않습니다."], ["jawWidth", "하관이 얼굴 전체와 비교적 고른 무게를 이룹니다."]],
  },
  expansion: {
    code: "F—02", name: "확장의 상", tagline: "시선과 여백이 바깥으로 열리는 얼굴",
    keywords: ["개방", "탐색", "넓은 시야"],
    summary: "눈과 미간, 얼굴의 가로 여백이 비교적 넓어 외부로 열린 인상을 만드는 유형입니다.",
    description: [
      "눈 사이와 미간의 여백, 얼굴 가로 비율이 함께 넓게 나타나면 시선이 중심에 머물기보다 바깥으로 퍼지는 듯한 인상을 만듭니다. 얼굴 안에 여유 공간이 있어, 주변 환경과 새로운 자극을 넓게 받아들이는 이미지로 읽힙니다.",
      "전통적인 인상 해석에서는 낯선 상황을 탐색하고 여러 가능성을 동시에 열어 두는 성향의 상징으로 이야기되곤 합니다. 반대로 한 지점에 곧바로 몰입하기보다 다소 느슨하거나 산만해 보일 수도 있습니다. 그러나 이 분류에서 말하는 확장은 실제 성격의 단정이 아니라, 얼굴의 여백이 만들어내는 ‘열려 있음’의 시각적 은유입니다.",
    ],
    evidence: [["eyeGap", "두 눈 사이의 여백이 비교적 넓게 측정되었습니다."], ["browGap", "미간이 시선을 바깥쪽으로 확장하는 인상을 만듭니다."], ["faceRatio", "얼굴의 가로 비율이 넓은 편에 가깝습니다."]],
  },
  concentration: {
    code: "F—03", name: "집중의 상", tagline: "얼굴의 선이 중심으로 모여드는 인상",
    keywords: ["몰입", "정밀", "내적 기준"],
    summary: "눈과 미간의 간격이 중심에 모여 보여, 응축된 집중감을 주는 유형입니다.",
    description: [
      "눈과 미간의 주요 지점이 얼굴 중앙에 비교적 가깝게 모여 있습니다. 이 구조는 시선을 넓게 분산시키기보다 한곳으로 수렴하게 만들어, 작고 구체적인 대상에 오래 집중하는 듯한 인상을 줍니다.",
      "인상 해석의 관점에서는 세부를 놓치지 않고 자신의 기준을 깊게 파고드는 이미지로 번역할 수 있습니다. 처음에는 경계가 분명하거나 쉽게 속을 드러내지 않는 사람처럼 보일 수도 있지만, 이는 폐쇄성의 증거가 아니라 얼굴 중심부의 밀도가 만드는 시각적 효과입니다. 강점의 언어로는 ‘깊이’, 그림자의 언어로는 ‘긴장’에 가까운 유형입니다.",
    ],
    evidence: [["eyeGap", "두 눈 사이의 비율이 비교적 응축되어 있습니다."], ["browGap", "미간의 간격이 중심부 밀도를 높입니다."], ["cheekWidth", "가로 확장보다 중앙의 특징이 먼저 보입니다."]],
  },
  ascent: {
    code: "F—04", name: "상승의 상", tagline: "눈과 입의 선이 위쪽으로 힘을 보내는 얼굴",
    keywords: ["반응", "추진", "밝은 긴장"],
    summary: "눈꼬리와 입꼬리의 상승선이 얼굴에 빠른 반응과 추진감을 더하는 유형입니다.",
    description: [
      "눈꼬리와 입꼬리의 방향에서 위로 향하는 흐름이 비교적 선명합니다. 이 상승선은 얼굴을 정지된 형태보다 곧 반응할 것 같은 상태로 보이게 하며, 표정이 크지 않아도 기민하고 또렷한 에너지를 남깁니다.",
      "전통적인 인상 언어로는 먼저 움직이고 분위기를 끌어올리는 이미지, 혹은 기회를 빠르게 포착하는 이미지와 연결됩니다. 동시에 반응이 강하거나 성급해 보일 가능성도 있습니다. 여기서 상승은 낙천적 성격을 뜻하는 판정이 아니라, 얼굴의 방향성이 만들어내는 ‘위로 향하는 운동감’을 설명하는 이름입니다.",
    ],
    evidence: [["eyeTilt", "눈의 바깥선이 위쪽으로 향하는 흐름을 보입니다."], ["mouthLift", "입꼬리의 상대 높이가 상승 인상을 보탭니다."], ["browGap", "중앙의 여백이 상승선의 움직임을 또렷하게 만듭니다."]],
  },
  contemplation: {
    code: "F—05", name: "숙고의 상", tagline: "표정 사이에 한 박자의 여백이 남는 얼굴",
    keywords: ["관찰", "신중", "깊은 호흡"],
    summary: "수평적이거나 차분한 선과 세로 여백이 만나, 생각을 머금은 인상을 주는 유형입니다.",
    description: [
      "눈과 입의 끝점이 급하게 올라가기보다 수평에 가깝거나 차분하게 머물고, 중안부에는 한 박자의 여백이 있습니다. 그 결과 즉각적인 반응보다 안쪽에서 생각을 정리한 뒤 움직일 것 같은 인상이 형성됩니다.",
      "인상 해석에서는 관찰과 숙고, 쉽게 단정하지 않는 태도의 이미지로 읽힐 수 있습니다. 낯선 사람에게는 다소 무겁거나 조심스러워 보일 수도 있지만, 이 유형의 중심은 소극성보다 ‘서두르지 않는 깊이’입니다. 실제 감정 상태와 무관하게 얼굴의 선이 만들어내는 느린 호흡을 이름 붙인 결과입니다.",
    ],
    evidence: [["eyeTilt", "눈의 선이 수평 또는 차분한 방향에 가깝습니다."], ["mouthLift", "입꼬리의 선이 즉각적인 표정 변화를 덜 강조합니다."], ["philtrum", "중안부의 세로 여백이 숙고하는 인상을 보탭니다."]],
  },
  structure: {
    code: "F—06", name: "구조의 상", tagline: "하관의 선이 얼굴을 단단히 받쳐주는 인상",
    keywords: ["기준", "지속", "단단한 윤곽"],
    summary: "턱과 하관의 가로 비율이 안정적으로 받쳐 주어, 분명하고 견고한 인상을 만드는 유형입니다.",
    description: [
      "턱의 너비와 하관의 비중이 얼굴 전체를 안정적으로 지지하고 있습니다. 아래쪽 윤곽이 쉽게 흐려지지 않아, 첫인상에서도 경계와 중심이 비교적 분명하게 보입니다.",
      "전통적인 인상 언어로 번역하면 자신의 기준을 세우고 일을 끝까지 밀고 가는 이미지, 외부 변화 속에서도 자리를 지키는 이미지와 닿아 있습니다. 때로는 고집이 세거나 직선적으로 보일 수 있으나, 이는 실제 태도의 판정이 아니라 하관의 안정감이 만드는 시각적 추론입니다. 이 유형의 핵심 단어는 강함보다 ‘지탱함’입니다.",
    ],
    evidence: [["jawWidth", "턱 너비가 얼굴 하단에 분명한 지지선을 만듭니다."], ["cheekWidth", "광대부와 하관의 연결이 안정적으로 읽힙니다."], ["faceRatio", "얼굴 가로 비율이 구조적인 인상을 강화합니다."]],
  },
  flexibility: {
    code: "F—07", name: "유연의 상", tagline: "광대에서 턱으로 이어지는 선이 부드럽게 전환되는 얼굴",
    keywords: ["적응", "전환", "관계의 감각"],
    summary: "얼굴 중단에서 하관으로 갈수록 윤곽이 유연하게 좁아져, 부드러운 전환감을 주는 유형입니다.",
    description: [
      "광대부에서 턱으로 내려가는 윤곽이 급격히 끊기기보다 자연스럽게 좁아집니다. 단단한 수평선보다 곡선과 전환이 먼저 보여, 상황에 따라 표정과 인상이 유연하게 달라질 것 같은 느낌을 만듭니다.",
      "인상 해석의 언어로는 상대의 반응을 읽고 속도를 바꾸는 이미지, 서로 다른 분위기 사이를 연결하는 이미지와 가깝습니다. 반대로 중심이 약하거나 결정이 늦어 보일 수도 있습니다. 그러나 이 결과가 말하는 유연함은 실제 우유부단함이 아니라, 얼굴 외곽선이 보여주는 ‘전환의 부드러움’에 대한 시각적 번역입니다.",
    ],
    evidence: [["jawWidth", "하관이 광대부보다 부드럽게 좁아지는 편입니다."], ["cheekWidth", "얼굴 중단부에서 윤곽의 변화가 시작됩니다."], ["faceRatio", "세로 흐름이 외곽선의 유연한 전환을 강조합니다."]],
  },
};

const LANDMARK = { forehead: 10, chin: 152, faceLeft: 234, faceRight: 454, jawLeft: 172, jawRight: 397, eyeLeftOuter: 33, eyeLeftInner: 133, eyeRightInner: 362, eyeRightOuter: 263, browLeftInner: 107, browRightInner: 336, noseBase: 2, upperLip: 0, lowerLip: 17, mouthLeft: 61, mouthRight: 291, noseTip: 1 };

function setSystemState(state, label) { systemState.dataset.state = state; systemState.querySelector("span").textContent = label; }
function point(landmarks, index) { const item = landmarks[index]; return { x: item.x * video.videoWidth, y: item.y * video.videoHeight, z: item.z * video.videoWidth }; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function mean(...values) { return values.reduce((total, value) => total + value, 0) / values.length; }
function degrees(radians) { return radians * (180 / Math.PI); }
function signedEyeTilt(outer, inner) { return degrees(Math.atan2(inner.y - outer.y, Math.abs(inner.x - outer.x))); }
function blendshapeMap(result) { const categories = result.faceBlendshapes?.[0]?.categories ?? []; return Object.fromEntries(categories.map((item) => [item.categoryName, item.score])); }

function calculateMetrics(landmarks, blendshapes) {
  const p = Object.fromEntries(Object.entries(LANDMARK).map(([name, index]) => [name, point(landmarks, index)]));
  const faceHeight = distance(p.forehead, p.chin);
  const faceWidth = distance(p.faceLeft, p.faceRight);
  const averageEyeWidth = mean(distance(p.eyeLeftOuter, p.eyeLeftInner), distance(p.eyeRightInner, p.eyeRightOuter));
  const mouthWidth = distance(p.mouthLeft, p.mouthRight);
  const mouthCenterY = mean(p.upperLip.y, p.lowerLip.y);
  const cornerY = mean(p.mouthLeft.y, p.mouthRight.y);
  const leftTilt = signedEyeTilt(p.eyeLeftOuter, p.eyeLeftInner);
  const rightTilt = signedEyeTilt(p.eyeRightOuter, p.eyeRightInner);
  const smileScore = mean(blendshapes.mouthSmileLeft ?? 0, blendshapes.mouthSmileRight ?? 0);
  const yawProxy = Math.abs(distance(p.noseTip, p.faceLeft) - distance(p.noseTip, p.faceRight)) / faceWidth;
  const centerOffset = Math.abs(landmarks[LANDMARK.noseTip].x - 0.5);
  const faceFill = faceHeight / video.videoHeight;
  const centeredScore = Math.max(0, 1 - centerOffset / 0.16);
  const yawScore = Math.max(0, 1 - yawProxy / 0.2);
  const sizeScore = faceFill < 0.28 ? Math.max(0, faceFill / 0.28) : faceFill > 0.82 ? Math.max(0, 1 - (faceFill - 0.82) / 0.18) : 1;
  const neutralScore = Math.max(0, 1 - smileScore / 0.55);
  const quality = Math.round((centeredScore * 0.28 + yawScore * 0.34 + sizeScore * 0.23 + neutralScore * 0.15) * 100);
  let guidance = "측정 중 · 정면과 무표정을 유지해주세요";
  if (faceFill < 0.28) guidance = "카메라에 조금 더 가까이 와주세요";
  else if (faceFill > 0.82) guidance = "카메라에서 조금 멀어져 주세요";
  else if (centerOffset > 0.12) guidance = "얼굴을 화면 중앙에 맞춰주세요";
  else if (yawProxy > 0.12) guidance = "얼굴을 정면으로 돌려주세요";
  else if (smileScore > 0.35) guidance = "입꼬리 측정을 위해 편한 무표정을 지어주세요";
  return {
    values: {
      eyeGap: distance(p.eyeLeftInner, p.eyeRightInner) / averageEyeWidth,
      philtrum: (distance(p.noseBase, p.upperLip) / faceHeight) * 100,
      eyeTilt: mean(leftTilt, rightTilt), browGap: (distance(p.browLeftInner, p.browRightInner) / faceWidth) * 100,
      mouthLift: ((mouthCenterY - cornerY) / mouthWidth) * 100,
      cheekWidth: (faceWidth / faceHeight) * 100,
      jawWidth: (distance(p.jawLeft, p.jawRight) / faceWidth) * 100,
      faceRatio: (faceWidth / faceHeight) * 100,
    }, quality, guidance,
  };
}

function smoothValues(next) {
  if (!smoothed) { smoothed = { ...next }; return smoothed; }
  const alpha = 0.18;
  for (const key of Object.keys(next)) smoothed[key] = smoothed[key] * (1 - alpha) + next[key] * alpha;
  return smoothed;
}

function formatMetric(key, value) {
  if (!Number.isFinite(value)) return "—";
  if (key === "eyeGap") return value.toFixed(2);
  if (key === "eyeTilt") return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
  return value.toFixed(1);
}

function updateMetrics(values) {
  for (const [key, item] of Object.entries(metricNodes)) { item.value.textContent = formatMetric(key, values[key]); item.node.classList.add("is-live"); }
}

function resetMetrics() {
  smoothed = null; samples = 0; sampleCount.textContent = "WAITING"; qualityValue.textContent = "—";
  for (const item of Object.values(metricNodes)) { item.value.textContent = "—"; item.node.classList.remove("is-live"); }
}

function resetClassification() {
  stableSamples = []; finalMeasurement = null; classifiedType = null; classificationComplete = false;
  classificationReady.hidden = true; resultView.hidden = true; frame.classList.remove("is-result");
}

function median(values) { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function medianMeasurement(records) { return Object.fromEntries(Object.keys(records[0]).map((key) => [key, median(records.map((record) => record[key]))])); }
function clamp(value, minimum = 0, maximum = 1) { return Math.min(maximum, Math.max(minimum, value)); }
function scale(value, low, high) { return clamp((value - low) / (high - low)); }

function classifyMeasurement(values) {
  const wideEyes = scale(values.eyeGap, 0.82, 1.28);
  const wideBrow = scale(values.browGap, 15, 28);
  const wideFace = scale(values.faceRatio, 64, 86);
  const broadJaw = scale(values.jawWidth, 58, 82);
  const upwardEye = scale(values.eyeTilt, -4, 8);
  const upwardMouth = scale(values.mouthLift, -4, 7);
  const longPhiltrum = scale(values.philtrum, 4.2, 9.8);
  const centerDistances = [Math.abs(values.eyeGap - 1.02) / 0.3, Math.abs(values.browGap - 21.5) / 9, Math.abs(values.eyeTilt - 1.5) / 7, Math.abs(values.mouthLift - 1.2) / 6, Math.abs(values.jawWidth - 70) / 15, Math.abs(values.faceRatio - 75) / 14].map((value) => clamp(value));
  const balance = 1 - mean(...centerDistances);
  const scores = {
    balance: 0.16 + balance * 0.82,
    expansion: 0.14 + wideEyes * 0.34 + wideBrow * 0.28 + wideFace * 0.24,
    concentration: 0.14 + (1 - wideEyes) * 0.38 + (1 - wideBrow) * 0.34 + (1 - wideFace) * 0.14,
    ascent: 0.16 + upwardEye * 0.5 + upwardMouth * 0.34,
    contemplation: 0.12 + (1 - upwardEye) * 0.36 + (1 - upwardMouth) * 0.28 + longPhiltrum * 0.22,
    structure: 0.13 + broadJaw * 0.56 + wideFace * 0.25,
    flexibility: 0.13 + (1 - broadJaw) * 0.55 + (1 - wideFace) * 0.25,
  };
  const [key, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { key, score, scores };
}

function completeClassification() {
  if (classificationComplete || stableSamples.length < REQUIRED_STABLE_SAMPLES) return;
  finalMeasurement = medianMeasurement(stableSamples);
  classifiedType = classifyMeasurement(finalMeasurement);
  classificationComplete = true;
  updateMetrics(finalMeasurement);
  sampleCount.textContent = `${REQUIRED_STABLE_SAMPLES} STABLE SAMPLES`;
  statusMessage.textContent = "측정 완료 · 결과 안내를 눌러주세요";
  setSystemState("ready", "유형 분류 완료");
  classificationReady.hidden = false;
}

function resizeCanvas() { if (!video.videoWidth || !video.videoHeight) return; if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; } }

function drawFace(landmarks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "rgba(103, 152, 255, 0.16)", lineWidth: 0.65 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "rgba(255, 255, 255, 0.58)", lineWidth: 1.25 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: "rgba(103, 152, 255, 0.9)", lineWidth: 1.45 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: "rgba(103, 152, 255, 0.9)", lineWidth: 1.45 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: "rgba(114, 239, 176, 0.78)", lineWidth: 1.3 });
  drawingUtils.drawLandmarks(Object.values(LANDMARK).map((index) => landmarks[index]), { color: "rgba(255,255,255,0.9)", fillColor: "rgba(103,152,255,0.95)", radius: 1.35 });
}

async function predict() {
  if (!running) return;
  resizeCanvas();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = faceLandmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];
    if (landmarks) {
      frame.classList.add("has-face"); drawFace(landmarks);
      const calculated = calculateMetrics(landmarks, blendshapeMap(result));
      qualityValue.textContent = `${calculated.quality}%`;
      if (!classificationComplete) {
        const values = smoothValues(calculated.values); updateMetrics(values); samples += 1;
        sampleCount.textContent = `${String(samples).padStart(4, "0")} FRAMES`;
        if (calculated.quality >= MIN_CLASSIFY_QUALITY) {
          stableSamples.push({ ...values });
          const progress = Math.round((stableSamples.length / REQUIRED_STABLE_SAMPLES) * 100);
          statusMessage.textContent = `유형 판정을 위한 안정값 수집 중 · ${Math.min(progress, 100)}%`;
          if (stableSamples.length >= REQUIRED_STABLE_SAMPLES) completeClassification();
        } else statusMessage.textContent = calculated.guidance;
      } else statusMessage.textContent = "측정 완료 · 결과 안내를 눌러주세요";
    } else {
      frame.classList.remove("has-face"); ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!classificationComplete) statusMessage.textContent = "얼굴을 화면 중앙에 맞춰주세요";
      qualityValue.textContent = "—";
    }
  }
  animationId = requestAnimationFrame(predict);
}

function stopStream() {
  running = false; cancelAnimationFrame(animationId); stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height); frame.classList.remove("is-running", "has-face");
}

async function startCamera() {
  if (!faceLandmarker || running) return;
  cameraButton.disabled = true; cameraButton.querySelector("span:first-child").textContent = "카메라 연결 중";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } } });
    video.srcObject = stream; await video.play(); running = true; lastVideoTime = -1;
    emptyState.hidden = true; captureStatus.hidden = false; stopButton.hidden = false; frame.classList.add("is-running");
    setSystemState("running", "실시간 측정 중"); resetMetrics(); resetClassification(); predict();
  } catch (error) {
    console.error(error); cameraButton.disabled = false; cameraButton.querySelector("span:first-child").textContent = "다시 시도"; setSystemState("error", "카메라를 사용할 수 없음");
    document.querySelector(".permission-note").textContent = error?.name === "NotAllowedError" ? "브라우저 주소창의 카메라 권한을 허용한 뒤 다시 시도해주세요." : "카메라 연결을 확인한 뒤 다시 시도해주세요.";
  }
}

function stopCamera() {
  stopStream(); emptyState.hidden = false; captureStatus.hidden = true; stopButton.hidden = true; cameraButton.disabled = false;
  cameraButton.querySelector("span:first-child").textContent = "카메라 시작"; setSystemState("ready", "측정 준비 완료"); resetMetrics(); resetClassification();
}

function renderResult() {
  if (!classifiedType || !finalMeasurement) return;
  const type = FACE_TYPES[classifiedType.key];
  resultCode.textContent = type.code; resultName.textContent = type.name; resultTagline.textContent = type.tagline;
  resultKeywords.replaceChildren(...type.keywords.map((keyword) => { const span = document.createElement("span"); span.textContent = keyword; return span; }));
  resultCopy.replaceChildren(...type.description.map((paragraph) => { const p = document.createElement("p"); p.textContent = paragraph; return p; }));
  resultEvidence.replaceChildren(...type.evidence.map(([key, note]) => {
    const article = document.createElement("article"); const label = document.createElement("span"); const value = document.createElement("strong"); const copy = document.createElement("p");
    label.textContent = METRIC_LABELS[key].label; value.textContent = `${formatMetric(key, finalMeasurement[key])}${METRIC_LABELS[key].unit}`; copy.textContent = note; article.append(label, value, copy); return article;
  }));
}

function showResult() {
  if (!classificationComplete) return;
  stopStream(); renderResult(); classificationReady.hidden = true; captureStatus.hidden = true; stopButton.hidden = true; emptyState.hidden = true;
  resultView.hidden = false; frame.classList.add("is-result"); setSystemState("ready", "유형 결과 열람 중"); resultView.scrollTop = 0;
}

function restartMeasurement() { if (typeCatalog.open) typeCatalog.close(); resultView.hidden = true; frame.classList.remove("is-result"); startCamera(); }

function renderCatalog() {
  catalogList.replaceChildren(...Object.entries(FACE_TYPES).map(([key, type]) => {
    const article = document.createElement("article"); article.className = "catalog-card"; if (classifiedType?.key === key) article.classList.add("is-current");
    const code = document.createElement("span"); const title = document.createElement("h3"); const summary = document.createElement("p"); const keywords = document.createElement("div");
    code.textContent = classifiedType?.key === key ? `${type.code} · 나의 유형` : type.code; title.textContent = type.name; summary.textContent = type.summary; keywords.textContent = type.keywords.join(" · ");
    article.append(code, title, summary, keywords); return article;
  }));
}

function openCatalog() { renderCatalog(); if (typeof typeCatalog.showModal === "function") typeCatalog.showModal(); else typeCatalog.setAttribute("open", ""); }

async function initialize() {
  if (!navigator.mediaDevices?.getUserMedia) { setSystemState("error", "지원되지 않는 브라우저"); document.querySelector(".permission-note").textContent = "카메라를 지원하는 최신 Chrome 또는 Safari에서 열어주세요."; return; }
  try {
    const module = await import(MEDIAPIPE_MODULE); FaceLandmarker = module.FaceLandmarker; DrawingUtils = module.DrawingUtils;
    const vision = await module.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" }, runningMode: "VIDEO", numFaces: 1, minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true });
    drawingUtils = new DrawingUtils(ctx); cameraButton.disabled = false; setSystemState("ready", "측정 준비 완료");
  } catch (error) {
    console.error(error); setSystemState("error", "측정 모델 로드 실패"); cameraButton.disabled = true; document.querySelector(".permission-note").textContent = "인터넷 연결을 확인하고 페이지를 새로고침해주세요.";
  }
}

cameraButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
classificationReady.addEventListener("click", showResult);
restartButton.addEventListener("click", restartMeasurement);
showAllTypes.addEventListener("click", openCatalog);
catalogClose.addEventListener("click", () => typeCatalog.close());
typeCatalog.addEventListener("click", (event) => { if (event.target === typeCatalog) typeCatalog.close(); });
window.addEventListener("beforeunload", stopStream);

const previewType = new URLSearchParams(window.location.search).get("preview");
if (window.location.hostname === "127.0.0.1" && FACE_TYPES[previewType]) {
  finalMeasurement = { eyeGap: 1.04, philtrum: 6.8, eyeTilt: 2.1, browGap: 21.7, mouthLift: 1.6, cheekWidth: 74.8, jawWidth: 69.6, faceRatio: 74.8 };
  classifiedType = { key: previewType, score: 1, scores: {} };
  classificationComplete = true;
  updateMetrics(finalMeasurement);
  sampleCount.textContent = `${REQUIRED_STABLE_SAMPLES} STABLE SAMPLES`;
  showResult();
} else {
  initialize();
}
