const MEDIAPIPE_VERSION = "1.1.1";
const MEDIAPIPE_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const REQUIRED_FRONT_SAMPLES = 42;
const REQUIRED_PROFILE_SAMPLES = 34;
const MIN_FRONT_QUALITY = 76;
const MIN_PROFILE_QUALITY = 70;

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
const turnCue = $("#turnCue");
const turnArrow = $("#turnArrow");
const turnTitle = $("#turnTitle");
const turnCopy = $("#turnCopy");
const earMarker = $("#earMarker");
const earMarkerTitle = $("#earMarkerTitle");
const earMarkerCopy = $("#earMarkerCopy");
const skipEarButton = $("#skipEarButton");
const classificationReady = $("#classificationReady");
const resultView = $("#resultView");
const resultCode = $("#resultCode");
const resultName = $("#resultName");
const resultTagline = $("#resultTagline");
const resultKeywords = $("#resultKeywords");
const resultSecondary = $("#resultSecondary");
const resultConfidence = $("#resultConfidence");
const resultCopy = $("#resultCopy");
const resultContexts = $("#resultContexts");
const resultEvidence = $("#resultEvidence");
const resultMethod = $("#resultMethod");
const showAllTypes = $("#showAllTypes");
const restartButton = $("#restartButton");
const typeCatalog = $("#typeCatalog");
const catalogClose = $("#catalogClose");
const catalogList = $("#catalogList");

let FaceLandmarker;
let DrawingUtils;
let faceLandmarker;
let drawingUtils;
let stream;
let animationId;
let running = false;
let lastVideoTime = -1;
let currentStage = 0;
let stageStartedAt = 0;
let stageRecords = [];
let smoothed = null;
let firstProfileSign = 0;
let latestLandmarks = null;
let latestReference = null;
let earMarking = false;
let earPoints = [];
let earStageKey = null;
let captured = { front: null, profileA: null, profileB: null, ears: {} };
let finalMeasurement = null;
let classifiedType = null;
let classificationComplete = false;

const LANDMARK = {
  meshTop: 10,
  glabella: 168,
  chin: 152,
  faceLeft: 234,
  faceRight: 454,
  templeLeft: 127,
  templeRight: 356,
  cheekLeft: 93,
  cheekRight: 323,
  jawLeft: 172,
  jawRight: 397,
  eyeLeftOuter: 33,
  eyeLeftInner: 133,
  eyeLeftTop: 159,
  eyeLeftBottom: 145,
  eyeRightInner: 362,
  eyeRightOuter: 263,
  eyeRightTop: 386,
  eyeRightBottom: 374,
  noseBridge: 168,
  noseTip: 1,
  noseBase: 2,
  noseLeft: 98,
  noseRight: 327,
  upperLip: 0,
  lowerLip: 17,
  upperLipInner: 13,
  lowerLipInner: 14,
  mouthLeft: 61,
  mouthRight: 291,
};

const metricNodes = Object.fromEntries(
  [...document.querySelectorAll(".metric")].map((node) => [
    node.dataset.key,
    { node, value: node.querySelector("strong") },
  ]),
);

const METRIC_LABELS = {
  upperThird: { label: "상정 비율", unit: "%" },
  middleThird: { label: "중정 비율", unit: "%" },
  lowerThird: { label: "하정 비율", unit: "%" },
  outerLeft: { label: "왼쪽 바깥 구간", unit: "배" },
  leftEye: { label: "왼쪽 눈 구간", unit: "배" },
  eyeGap: { label: "눈 사이 구간", unit: "배" },
  rightEye: { label: "오른쪽 눈 구간", unit: "배" },
  outerRight: { label: "오른쪽 바깥 구간", unit: "배" },
  noseWidth: { label: "코 너비 비율", unit: "%" },
  philtrumLower: { label: "인중 / 하정", unit: "%" },
  jawCheek: { label: "턱 / 광대 너비", unit: "%" },
  faceRatio: { label: "얼굴 너비 비율", unit: "%" },
  noseDepth: { label: "코끝 상대 깊이", unit: "%" },
  earLength: { label: "귀 길이 비율", unit: "%" },
  symmetry: { label: "좌우 상대 균형", unit: "점" },
};

const FACE_TYPES = {
  balance: {
    code: "F—01",
    name: "삼정 균형형",
    tagline: "상·중·하 세 구역이 비슷한 호흡을 나누는 얼굴",
    keywords: ["삼정", "균형", "조율"],
    summary: "상정·중정·하정의 상대 길이가 비교적 고르게 나타난 유형입니다.",
    description: [
      "얼굴 메시 상단에서 미간, 코 아래, 턱끝으로 이어지는 세 구역이 한쪽으로 크게 치우치지 않습니다. 특정 구역 하나가 먼저 강조되기보다 얼굴 전체의 비례가 동시에 들어오는 구조에 가깝습니다.",
      "전통 관상에서 삼정의 고른 배치는 삶의 여러 시기를 한쪽으로 몰지 않고 조율하는 이미지로 읽어왔습니다. 이 체험에서는 그것을 성격의 사실로 단정하지 않고, 얼굴의 세로 분할이 만들어내는 시각적 인상으로만 번역합니다.",
    ],
    contexts: [
      ["관계에서", "한쪽의 말만 빠르게 고르기보다 서로 다른 입장을 함께 보려는 사람처럼 읽힐 수 있습니다. 다만 조율하는 시간이 길어지면 자신의 선호가 늦게 드러나는 인상을 줄 수도 있습니다."],
      ["결정과 일에서", "전체 조건을 정리한 뒤 움직이는 안정적인 흐름으로 보일 수 있습니다. 명확한 기준이 생기면 일정한 속도를 오래 유지하는 이미지와 연결됩니다."],
      ["변화의 시기에서", "급히 자신을 바꾸기보다 새로운 환경 안에서 균형점을 찾는 사람처럼 보일 수 있습니다. 이 해석은 비율의 은유이지 실제 행동을 예측하는 진단은 아닙니다."],
    ],
    evidence: ["upperThird", "middleThird", "lowerThird", "symmetry"],
  },
  upper: {
    code: "F—02",
    name: "상정 강조형",
    tagline: "얼굴의 위쪽 여백이 먼저 시선을 붙잡는 구조",
    keywords: ["상정", "관찰", "구상"],
    summary: "추정된 상정 구역이 중정과 하정보다 상대적으로 길게 나타난 유형입니다.",
    description: [
      "얼굴 메시 상단을 임시 머리카락선으로 두었을 때, 그 지점에서 미간까지의 구역이 다른 두 구역보다 길게 측정되었습니다. 이 때문에 얼굴의 무게 중심이 위쪽으로 열리는 듯한 인상을 만듭니다.",
      "전통 관상 언어에서는 상정을 생각과 구상, 초기의 기운과 연결해 설명하곤 합니다. 실제 머리카락선이 아니라 메시 상단을 사용한 MVP 추정이므로, 이 유형은 특히 낮은 강도의 참고 해석으로 읽어야 합니다.",
    ],
    contexts: [
      ["관계에서", "말을 바로 꺼내기보다 먼저 관찰하고 머릿속에서 관계의 맥락을 정리하는 인상으로 읽힐 수 있습니다."],
      ["결정과 일에서", "행동보다 설계와 구상의 단계가 먼저 보이는 유형처럼 느껴질 수 있습니다. 준비가 길어지면 시작이 늦다는 인상으로 바뀔 여지도 있습니다."],
      ["변화의 시기에서", "새로운 상황을 곧장 받아들이기보다 의미를 해석하고 방향을 그린 뒤 움직이는 사람처럼 보일 수 있습니다."],
    ],
    evidence: ["upperThird", "middleThird", "lowerThird", "faceRatio"],
  },
  middle: {
    code: "F—03",
    name: "중정 강조형",
    tagline: "미간에서 코 아래까지의 중심축이 또렷한 얼굴",
    keywords: ["중정", "현실감", "추진"],
    summary: "중정의 세로 길이와 코 중심부의 입체감이 상대적으로 강조된 유형입니다.",
    description: [
      "미간에서 코 아래까지 이어지는 중정이 상정과 하정보다 길거나, 측면 촬영에서 코 중심축의 상대 깊이가 함께 드러났습니다. 얼굴 가운데가 시각적 중심을 강하게 잡는 구조입니다.",
      "전통 관상에서는 중정을 활동과 현실의 실행 구간으로 읽어왔습니다. 여기서는 코의 실제 높이나 골격을 재는 것이 아니라 카메라 메시 안의 상대 깊이를 사용하는 만큼, 실행력을 판정하기보다 중심부가 주는 인상을 설명합니다.",
    ],
    contexts: [
      ["관계에서", "상대의 말에 현실적인 반응을 빠르게 돌려주는 사람처럼 읽힐 수 있습니다. 직접적인 태도가 상황에 따라 단호함으로 보일 수도 있습니다."],
      ["결정과 일에서", "아이디어를 구체적인 행동으로 옮기는 구간이 선명한 인상과 연결됩니다. 결과와 과정의 실제 조건을 중요하게 보는 사람처럼 느껴질 수 있습니다."],
      ["변화의 시기에서", "불확실함을 오래 두기보다 지금 할 수 있는 행동을 찾는 모습으로 번역될 수 있습니다."],
    ],
    evidence: ["middleThird", "noseWidth", "noseDepth", "symmetry"],
  },
  lower: {
    code: "F—04",
    name: "하정 강조형",
    tagline: "코 아래에서 턱끝까지의 하관이 얼굴을 받치는 구조",
    keywords: ["하정", "지속", "의지"],
    summary: "하정의 길이와 턱·광대의 관계가 상대적으로 강하게 드러난 유형입니다.",
    description: [
      "코 아래에서 턱끝까지의 하정이 다른 구역보다 길거나, 턱 너비가 광대 너비에 가깝게 측정되었습니다. 얼굴 아래쪽의 선이 전체 인상을 안정적으로 받치는 형태입니다.",
      "전통 관상 언어에서는 하정을 지속과 결실의 이미지로 다뤄왔습니다. 이 결과는 의지나 미래를 예언하는 판정이 아니라, 하관의 길이와 너비가 만드는 단단한 시각적 무게를 설명합니다.",
    ],
    contexts: [
      ["관계에서", "약속과 경계를 분명히 유지하는 사람처럼 보일 수 있습니다. 단호한 표정이 실제 의도보다 강하게 전달될 가능성도 있습니다."],
      ["결정과 일에서", "한번 정한 구조를 끝까지 지탱하는 이미지와 연결됩니다. 변화가 잦은 환경에서는 속도를 바꾸는 데 시간이 필요한 사람처럼 읽힐 수 있습니다."],
      ["변화의 시기에서", "완전히 새로 시작하기보다 지켜야 할 기반을 남긴 뒤 움직이는 모습으로 번역될 수 있습니다."],
    ],
    evidence: ["lowerThird", "jawCheek", "philtrumLower", "faceRatio"],
  },
  open: {
    code: "F—05",
    name: "오안 개방형",
    tagline: "다섯 가로 구간의 여백이 바깥으로 열리는 얼굴",
    keywords: ["오안", "개방", "탐색"],
    summary: "눈 사이와 양옆의 바깥 구간이 평균 눈 너비보다 넓게 나타난 유형입니다.",
    description: [
      "양쪽 관자에서 눈 바깥, 두 눈, 눈 사이로 이어지는 다섯 구간을 평균 눈 너비로 나누었을 때 중앙과 바깥 여백이 비교적 넓습니다. 시선이 한 점에 모이기보다 얼굴 전체로 퍼지는 인상을 만듭니다.",
      "전통적인 오안 비례에서는 다섯 구간이 눈 하나의 너비에 가까운지를 살펴봅니다. 이 체험의 ‘개방’은 넓은 간격을 성격과 동일시하지 않고, 여러 방향으로 열린 듯 보이는 시각적 은유로만 사용합니다.",
    ],
    contexts: [
      ["관계에서", "처음 만나는 사람에게도 대화의 여지를 남기고 주변의 분위기를 넓게 살피는 사람처럼 보일 수 있습니다."],
      ["결정과 일에서", "하나의 답보다 여러 가능성을 먼저 펼치는 이미지와 연결됩니다. 선택지가 많아지면 집중 기준이 필요해 보일 수도 있습니다."],
      ["변화의 시기에서", "새로운 환경의 자극을 폭넓게 받아들이는 모습으로 읽힐 수 있습니다. 실제 개방성의 측정값은 아닙니다."],
    ],
    evidence: ["outerLeft", "eyeGap", "outerRight", "symmetry"],
  },
  focused: {
    code: "F—06",
    name: "오안 응집형",
    tagline: "다섯 가로 구간이 얼굴 중심으로 모이는 구조",
    keywords: ["오안", "응집", "집중"],
    summary: "눈 사이 또는 바깥 여백이 평균 눈 너비보다 좁아 중심부의 밀도가 높게 나타난 유형입니다.",
    description: [
      "오안의 다섯 구간 가운데 중앙이나 바깥 여백이 평균 눈 너비보다 좁게 측정되어, 시선이 얼굴 중심으로 모이는 듯한 인상을 만듭니다. 눈의 실제 크기보다 각 구간의 관계에서 생기는 효과입니다.",
      "전통 관상 언어에서는 응축된 배치를 집중과 세밀함의 상징으로 읽기도 합니다. 이 체험은 그 상징을 차용하되, 내향성이나 성격을 단정하지 않고 중심부의 시각적 밀도만 설명합니다.",
    ],
    contexts: [
      ["관계에서", "넓은 관계보다 신뢰가 생긴 몇 사람에게 주의를 오래 두는 사람처럼 보일 수 있습니다. 첫인상에서는 신중함이 거리감으로 읽힐 수도 있습니다."],
      ["결정과 일에서", "한 문제를 세밀하게 파고드는 이미지와 연결됩니다. 동시에 여러 일을 전환할 때는 평소보다 긴장감이 커 보일 수 있습니다."],
      ["변화의 시기에서", "충분한 근거를 확인한 뒤 움직이는 사람처럼 느껴질 수 있습니다. 납득한 뒤에는 방향이 선명해지는 인상과도 연결됩니다."],
    ],
    evidence: ["outerLeft", "eyeGap", "outerRight", "symmetry"],
  },
  structure: {
    code: "F—07",
    name: "오악 구조형",
    tagline: "이마·광대·코·턱의 관계가 입체적인 골격감을 만드는 얼굴",
    keywords: ["오악", "윤곽", "구조"],
    summary: "광대와 턱의 너비, 코와 턱의 상대 깊이가 함께 구조적인 인상을 만든 유형입니다.",
    description: [
      "정면의 광대·턱 너비 관계와 양측면의 코끝·턱끝 상대 깊이를 함께 보았을 때, 얼굴의 주요 구역이 분명한 입체적 연결을 보입니다. 실제 뼈의 높이를 측정한 오악 판정은 아니며, 카메라 메시가 제공하는 구역별 균형 추정입니다.",
      "전통 관상에서는 이마, 코, 양 광대, 턱의 호응을 산의 배치에 비유해 설명해왔습니다. 이 결과는 그 공간적 언어를 빌려 얼굴 윤곽의 지지와 연결을 표현할 뿐, 기질이나 운을 예측하지 않습니다.",
    ],
    contexts: [
      ["관계에서", "경계와 기준이 분명하고, 가까운 사람에게 일관된 태도를 보이는 인상으로 읽힐 수 있습니다."],
      ["결정과 일에서", "역할과 구조가 명확할 때 안정적으로 힘을 유지하는 이미지와 연결됩니다. 기준이 자주 바뀌면 단단함이 경직됨으로 보일 여지도 있습니다."],
      ["변화의 시기에서", "지켜야 할 기반을 먼저 정한 뒤 새로운 구조를 세우는 사람처럼 보일 수 있습니다. 이는 윤곽 비율의 상징적 번역입니다."],
    ],
    evidence: ["jawCheek", "faceRatio", "noseDepth", "earLength"],
  },
};

function setSystemState(state, label) {
  systemState.dataset.state = state;
  systemState.querySelector("span").textContent = label;
}

function point(landmarks, index) {
  const item = landmarks[index];
  return { x: item.x * video.videoWidth, y: item.y * video.videoHeight, z: item.z * video.videoWidth };
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function horizontal(a, b) { return Math.abs(a.x - b.x); }
function vertical(a, b) { return Math.abs(a.y - b.y); }
function mean(...values) {
  const finite = values.flat().filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : NaN;
}
function median(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return NaN;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
}
function medianMeasurement(records) {
  const keys = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return Object.fromEntries(keys.map((key) => [key, median(records.map((record) => record[key]))]));
}
function clamp(value, minimum = 0, maximum = 1) { return Math.min(maximum, Math.max(minimum, value)); }
function scale(value, low, high) { return clamp((value - low) / (high - low)); }
function degrees(radians) { return radians * (180 / Math.PI); }
function signedEyeTilt(outer, inner) { return degrees(Math.atan2(inner.y - outer.y, Math.abs(inner.x - outer.x))); }
function blendshapeMap(result) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];
  return Object.fromEntries(categories.map((item) => [item.categoryName, item.score]));
}

function getYawDegrees(result, landmarks) {
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (matrix?.length >= 16) {
    const candidate = degrees(Math.atan2(matrix[8], matrix[10]));
    if (Number.isFinite(candidate) && Math.abs(candidate) <= 70) return candidate;
  }
  const left = point(landmarks, LANDMARK.faceLeft);
  const right = point(landmarks, LANDMARK.faceRight);
  const nose = point(landmarks, LANDMARK.noseTip);
  const midX = (left.x + right.x) / 2;
  return degrees(Math.atan2((nose.x - midX) * 3.2, Math.max(1, horizontal(left, right))));
}

function getPoints(landmarks) {
  return Object.fromEntries(Object.entries(LANDMARK).map(([name, index]) => [name, point(landmarks, index)]));
}

function calculateSymmetry(p, faceWidth, faceHeight, leftEyeWidth, rightEyeWidth) {
  const faceMidX = mean(p.faceLeft.x, p.faceRight.x);
  const leftEyeCenter = { x: mean(p.eyeLeftOuter.x, p.eyeLeftInner.x), y: mean(p.eyeLeftOuter.y, p.eyeLeftInner.y) };
  const rightEyeCenter = { x: mean(p.eyeRightOuter.x, p.eyeRightInner.x), y: mean(p.eyeRightOuter.y, p.eyeRightInner.y) };
  const mouthCenterX = mean(p.mouthLeft.x, p.mouthRight.x);
  const eyeWidthDiff = Math.abs(leftEyeWidth - rightEyeWidth) / Math.max(1, mean(leftEyeWidth, rightEyeWidth));
  const eyeLevelDiff = Math.abs(leftEyeCenter.y - rightEyeCenter.y) / faceHeight;
  const noseOffset = Math.abs(p.noseTip.x - faceMidX) / faceWidth;
  const mouthOffset = Math.abs(mouthCenterX - faceMidX) / faceWidth;
  const chinOffset = Math.abs(p.chin.x - faceMidX) / faceWidth;
  const cheekBalance = Math.abs(distance(p.cheekLeft, p.noseTip) - distance(p.cheekRight, p.noseTip)) / faceWidth;
  const penalty = eyeWidthDiff * 0.22 + eyeLevelDiff * 2.4 * 0.16 + noseOffset * 2.8 * 0.19 + mouthOffset * 2.5 * 0.16 + chinOffset * 2.5 * 0.14 + cheekBalance * 1.8 * 0.13;
  return clamp(100 - penalty * 100, 0, 100);
}

function frontQuality(p, blendshapes, yawDegrees) {
  const faceHeight = vertical(p.meshTop, p.chin);
  const faceFill = faceHeight / video.videoHeight;
  const centerOffset = Math.abs(p.noseTip.x / video.videoWidth - 0.5);
  const smileScore = mean(blendshapes.mouthSmileLeft ?? 0, blendshapes.mouthSmileRight ?? 0);
  const centeredScore = Math.max(0, 1 - centerOffset / 0.15);
  const yawScore = Math.max(0, 1 - Math.abs(yawDegrees) / 15);
  const sizeScore = faceFill < 0.3 ? Math.max(0, faceFill / 0.3) : faceFill > 0.84 ? Math.max(0, 1 - (faceFill - 0.84) / 0.16) : 1;
  const neutralScore = Math.max(0, 1 - smileScore / 0.5);
  const quality = Math.round((centeredScore * 0.28 + yawScore * 0.36 + sizeScore * 0.22 + neutralScore * 0.14) * 100);
  let guidance = "정면과 편한 무표정을 잠시 유지해주세요";
  if (faceFill < 0.3) guidance = "카메라에 조금 더 가까이 와주세요";
  else if (faceFill > 0.84) guidance = "카메라에서 조금 멀어져 주세요";
  else if (centerOffset > 0.11) guidance = "얼굴을 화면 중앙에 맞춰주세요";
  else if (Math.abs(yawDegrees) > 10) guidance = "얼굴을 정면으로 돌려주세요";
  else if (smileScore > 0.32) guidance = "표정 영향을 줄이기 위해 편하게 입을 다물어주세요";
  return { quality, guidance, faceFill };
}

function calculateFrontMetrics(landmarks, blendshapes, yawDegrees) {
  const p = getPoints(landmarks);
  const faceHeight = vertical(p.meshTop, p.chin);
  const faceWidth = horizontal(p.faceLeft, p.faceRight);
  const cheekWidthPx = horizontal(p.cheekLeft, p.cheekRight);
  const jawWidthPx = horizontal(p.jawLeft, p.jawRight);
  const leftEyeWidthPx = horizontal(p.eyeLeftOuter, p.eyeLeftInner);
  const rightEyeWidthPx = horizontal(p.eyeRightInner, p.eyeRightOuter);
  const averageEyeWidth = mean(leftEyeWidthPx, rightEyeWidthPx);
  const upperPx = vertical(p.meshTop, p.glabella);
  const middlePx = vertical(p.glabella, p.noseBase);
  const lowerPx = vertical(p.noseBase, p.chin);
  const thirdsTotal = upperPx + middlePx + lowerPx;
  const noseWidthPx = horizontal(p.noseLeft, p.noseRight);
  const mouthWidthPx = horizontal(p.mouthLeft, p.mouthRight);
  const lowerThirdPx = Math.max(1, lowerPx);
  const philtrumPx = vertical(p.noseBase, p.upperLip);
  const leftTilt = signedEyeTilt(p.eyeLeftOuter, p.eyeLeftInner);
  const rightTilt = signedEyeTilt(p.eyeRightOuter, p.eyeRightInner);
  const mouthCenterY = mean(p.upperLip.y, p.lowerLip.y);
  const cornerY = mean(p.mouthLeft.y, p.mouthRight.y);
  const quality = frontQuality(p, blendshapes, yawDegrees);
  return {
    values: {
      upperThird: (upperPx / thirdsTotal) * 100,
      middleThird: (middlePx / thirdsTotal) * 100,
      lowerThird: (lowerPx / thirdsTotal) * 100,
      outerLeft: horizontal(p.templeLeft, p.eyeLeftOuter) / averageEyeWidth,
      leftEye: leftEyeWidthPx / averageEyeWidth,
      eyeGap: horizontal(p.eyeLeftInner, p.eyeRightInner) / averageEyeWidth,
      rightEye: rightEyeWidthPx / averageEyeWidth,
      outerRight: horizontal(p.eyeRightOuter, p.templeRight) / averageEyeWidth,
      noseWidth: (noseWidthPx / faceWidth) * 100,
      noseEyeGap: noseWidthPx / Math.max(1, horizontal(p.eyeLeftInner, p.eyeRightInner)),
      philtrumLower: (philtrumPx / lowerThirdPx) * 100,
      mouthNose: mouthWidthPx / Math.max(1, noseWidthPx),
      jawCheek: (jawWidthPx / cheekWidthPx) * 100,
      cheekWidth: (cheekWidthPx / faceHeight) * 100,
      faceRatio: (faceWidth / faceHeight) * 100,
      eyeTilt: mean(leftTilt, rightTilt),
      mouthLift: ((mouthCenterY - cornerY) / Math.max(1, mouthWidthPx)) * 100,
      symmetry: calculateSymmetry(p, faceWidth, faceHeight, leftEyeWidthPx, rightEyeWidthPx),
      faceHeightPx: faceHeight,
      captureQuality: quality.quality,
    },
    quality: quality.quality,
    guidance: quality.guidance,
    reference: {
      faceHeight,
      faceWidth,
      browY: p.glabella.y,
      subnasaleY: p.noseBase.y,
      chinY: p.chin.y,
    },
  };
}

function profileQuality(p, yawDegrees, expectedSign) {
  const faceHeight = vertical(p.meshTop, p.chin);
  const faceFill = faceHeight / video.videoHeight;
  const centerOffset = Math.abs(p.noseTip.x / video.videoWidth - 0.5);
  const absoluteYaw = Math.abs(yawDegrees);
  const targetScore = absoluteYaw < 14 ? absoluteYaw / 14 : absoluteYaw > 42 ? Math.max(0, 1 - (absoluteYaw - 42) / 20) : 1;
  const directionScore = expectedSign && Math.sign(yawDegrees) === expectedSign ? 0 : 1;
  const centerScore = Math.max(0, 1 - centerOffset / 0.23);
  const sizeScore = faceFill < 0.27 ? faceFill / 0.27 : faceFill > 0.88 ? Math.max(0, 1 - (faceFill - 0.88) / 0.12) : 1;
  const quality = Math.round((targetScore * 0.48 + directionScore * 0.2 + centerScore * 0.17 + sizeScore * 0.15) * 100);
  let guidance = "약 30° 각도를 잠시 유지해주세요";
  if (expectedSign && Math.sign(yawDegrees) === expectedSign && absoluteYaw > 8) guidance = "이전과 반대쪽으로 고개를 돌려주세요";
  else if (absoluteYaw < 14) guidance = "고개를 조금 더 옆으로 돌려주세요";
  else if (absoluteYaw > 42) guidance = "얼굴 기준점이 보이도록 조금만 정면 쪽으로 돌아와주세요";
  else if (centerOffset > 0.19) guidance = "옆모습을 유지한 채 화면 중앙에 맞춰주세요";
  return { quality, guidance };
}

function calculateProfileMetrics(landmarks, yawDegrees, expectedSign) {
  const p = getPoints(landmarks);
  const faceHeight = vertical(p.meshTop, p.chin);
  const faceWidth = Math.max(1, horizontal(p.faceLeft, p.faceRight));
  const cheekPlaneZ = mean(p.cheekLeft.z, p.cheekRight.z);
  const quality = profileQuality(p, yawDegrees, expectedSign);
  return {
    values: {
      noseDepth: ((cheekPlaneZ - p.noseTip.z) / faceWidth) * 100,
      bridgeDepth: ((cheekPlaneZ - p.noseBridge.z) / faceWidth) * 100,
      chinDepth: ((cheekPlaneZ - p.chin.z) / faceWidth) * 100,
      cheekDepthBalance: (Math.abs(p.cheekLeft.z - p.cheekRight.z) / faceWidth) * 100,
      yawDegrees,
      faceHeightPx: faceHeight,
      captureQuality: quality.quality,
    },
    quality: quality.quality,
    guidance: quality.guidance,
    reference: {
      faceHeight,
      browY: p.glabella.y,
      subnasaleY: p.noseBase.y,
      chinY: p.chin.y,
    },
  };
}

function smoothValues(next) {
  if (!smoothed) { smoothed = { ...next }; return smoothed; }
  const alpha = 0.18;
  for (const [key, value] of Object.entries(next)) {
    if (Number.isFinite(value)) smoothed[key] = Number.isFinite(smoothed[key]) ? smoothed[key] * (1 - alpha) + value * alpha : value;
  }
  return smoothed;
}

function formatMetric(key, value) {
  if (!Number.isFinite(value)) return "—";
  if (["outerLeft", "leftEye", "eyeGap", "rightEye", "outerRight"].includes(key)) return value.toFixed(2);
  return value.toFixed(1);
}

function updateMetrics(values) {
  for (const [key, item] of Object.entries(metricNodes)) {
    if (!Number.isFinite(values[key])) continue;
    item.value.textContent = formatMetric(key, values[key]);
    item.node.classList.add("is-live");
  }
}

function resetMetrics() {
  smoothed = null;
  sampleCount.textContent = "WAITING";
  qualityValue.textContent = "—";
  for (const item of Object.values(metricNodes)) {
    item.value.textContent = "—";
    item.node.classList.remove("is-live");
  }
}

function resetClassification() {
  currentStage = 0;
  stageStartedAt = performance.now();
  stageRecords = [];
  firstProfileSign = 0;
  earMarking = false;
  earPoints = [];
  earStageKey = null;
  captured = { front: null, profileA: null, profileB: null, ears: {} };
  finalMeasurement = null;
  classifiedType = null;
  classificationComplete = false;
  classificationReady.hidden = true;
  resultView.hidden = true;
  frame.classList.remove("is-result", "is-ear-marking");
  earMarker.hidden = true;
  turnCue.hidden = true;
  updateJourney();
}

function updateJourney(progress = 0) {
  const labels = ["정면 1/3", "측면 A 2/3", "측면 B 3/3"];
  stageLabel.textContent = labels[currentStage] ?? "분석 완료";
  document.querySelectorAll(".journey-step").forEach((step, index) => {
    step.classList.toggle("is-active", index === currentStage);
    step.classList.toggle("is-complete", index < currentStage || classificationComplete);
  });
  const overall = clamp((currentStage + progress) / 3) * 100;
  journeyProgress.style.setProperty("--journey-progress", `${overall}%`);
  captureJourney.style.setProperty("--journey-progress", `${overall}%`);
}

function beginStage(index) {
  currentStage = index;
  stageRecords = [];
  smoothed = null;
  stageStartedAt = performance.now();
  updateJourney(0);
  if (index === 1) {
    turnCue.hidden = false;
    turnArrow.textContent = "↔";
    turnTitle.textContent = "편한 방향으로 고개를 돌려주세요";
    turnCopy.textContent = "정면에서 약 30°만 천천히 돌립니다.";
    statusMessage.textContent = "첫 번째 측면 각도를 찾는 중입니다";
  } else if (index === 2) {
    turnCue.hidden = false;
    turnArrow.textContent = firstProfileSign > 0 ? "→" : "←";
    turnTitle.textContent = "이제 반대쪽으로 돌려주세요";
    turnCopy.textContent = "반대쪽도 약 30°에서 자동으로 포착합니다.";
    statusMessage.textContent = "반대쪽 측면 각도를 찾는 중입니다";
  }
}

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
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "rgba(103, 152, 255, 0.14)", lineWidth: 0.65 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "rgba(255, 255, 255, 0.58)", lineWidth: 1.25 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: "rgba(103, 152, 255, 0.9)", lineWidth: 1.45 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: "rgba(103, 152, 255, 0.9)", lineWidth: 1.45 });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: "rgba(114, 239, 176, 0.78)", lineWidth: 1.3 });
  drawingUtils.drawLandmarks(Object.values(LANDMARK).map((index) => landmarks[index]), { color: "rgba(255,255,255,0.9)", fillColor: "rgba(103,152,255,0.95)", radius: 1.25 });
  drawEarPoints();
}

function drawEarPoints() {
  if (!earPoints.length) return;
  for (const [index, pointValue] of earPoints.entries()) {
    ctx.beginPath();
    ctx.arc(pointValue.x, pointValue.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = index === 0 ? "#6798ff" : "#72efb0";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (earPoints.length === 2) {
    ctx.beginPath();
    ctx.moveTo(earPoints[0].x, earPoints[0].y);
    ctx.lineTo(earPoints[1].x, earPoints[1].y);
    ctx.strokeStyle = "rgba(255,255,255,.82)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function captureCurrentStage() {
  const measurement = medianMeasurement(stageRecords);
  if (currentStage === 0) {
    captured.front = measurement;
    updateMetrics(measurement);
    beginStage(1);
    return;
  }
  const key = currentStage === 1 ? "profileA" : "profileB";
  captured[key] = measurement;
  if (currentStage === 1) firstProfileSign = Math.sign(measurement.yawDegrees) || 1;
  beginEarMarking(key);
}

function beginEarMarking(key) {
  earMarking = true;
  earStageKey = key;
  earPoints = [];
  frame.classList.add("is-ear-marking");
  turnCue.hidden = true;
  earMarker.hidden = false;
  earMarkerTitle.textContent = "보이는 귀의 위쪽을 눌러주세요";
  earMarkerCopy.textContent = "위쪽과 아래쪽 두 점만 지정합니다. 가려졌다면 건너뛰세요.";
  statusMessage.textContent = "귀의 위쪽과 아래쪽을 화면에서 지정해주세요";
  qualityValue.textContent = "2 POINTS";
  video.pause();
}

function mapPointerToVideo(event) {
  const rect = canvas.getBoundingClientRect();
  const visualX = ((event.clientX - rect.left) / rect.width) * video.videoWidth;
  const visualY = ((event.clientY - rect.top) / rect.height) * video.videoHeight;
  return { x: video.videoWidth - visualX, y: visualY };
}

function handleEarPoint(event) {
  if (!earMarking || event.target.closest("button")) return;
  const mapped = mapPointerToVideo(event);
  if (mapped.x < 0 || mapped.x > video.videoWidth || mapped.y < 0 || mapped.y > video.videoHeight) return;
  earPoints.push(mapped);
  drawEarPoints();
  if (earPoints.length === 1) {
    earMarkerTitle.textContent = "이제 같은 귀의 아래쪽을 눌러주세요";
    earMarkerCopy.textContent = "귓불의 가장 아래 지점을 지정합니다.";
  } else if (earPoints.length === 2) {
    const top = earPoints[0].y <= earPoints[1].y ? earPoints[0] : earPoints[1];
    const bottom = earPoints[0].y > earPoints[1].y ? earPoints[0] : earPoints[1];
    const reference = latestReference;
    captured.ears[earStageKey] = {
      earLength: (Math.abs(bottom.y - top.y) / reference.faceHeight) * 100,
      earTopToBrow: ((top.y - reference.browY) / reference.faceHeight) * 100,
      earBottomToNose: ((bottom.y - reference.subnasaleY) / reference.faceHeight) * 100,
      manual: 1,
    };
    earMarkerTitle.textContent = "귀의 두 지점을 기록했습니다";
    earMarkerCopy.textContent = "다음 측정으로 곧 이어집니다.";
    setTimeout(() => finishEarMarking(false), 520);
  }
}

async function finishEarMarking(skipped) {
  if (!earMarking) return;
  if (skipped) captured.ears[earStageKey] = { manual: 0 };
  earMarking = false;
  earPoints = [];
  frame.classList.remove("is-ear-marking");
  earMarker.hidden = true;
  await video.play();
  lastVideoTime = -1;
  if (currentStage === 1) beginStage(2);
  else completeClassification();
}

function classifyMeasurement(values) {
  const thirdsDeviation = mean(
    Math.abs(values.upperThird - 33.33),
    Math.abs(values.middleThird - 33.33),
    Math.abs(values.lowerThird - 33.33),
  );
  const fiveValues = [values.outerLeft, values.leftEye, values.eyeGap, values.rightEye, values.outerRight];
  const fiveDeviation = mean(...fiveValues.map((value) => Math.abs(value - 1)));
  const outerAverage = mean(values.outerLeft, values.outerRight);
  const openMeasure = mean(values.eyeGap, outerAverage);
  const upperLead = values.upperThird - Math.max(values.middleThird, values.lowerThird);
  const middleLead = values.middleThird - Math.max(values.upperThird, values.lowerThird);
  const lowerLead = values.lowerThird - Math.max(values.upperThird, values.middleThird);
  const scores = {
    balance: 0.22 + (1 - scale(thirdsDeviation, 1.2, 7.5)) * 0.58 + (1 - scale(fiveDeviation, 0.08, 0.34)) * 0.2,
    upper: 0.18 + scale(upperLead, 0.8, 7.5) * 0.75 + scale(values.upperThird, 33, 41) * 0.07,
    middle: 0.18 + scale(middleLead, 0.8, 7.5) * 0.68 + scale(values.noseDepth, 2.5, 9) * 0.14,
    lower: 0.18 + scale(lowerLead, 0.8, 7.5) * 0.62 + scale(values.jawCheek, 72, 92) * 0.2,
    open: 0.16 + scale(openMeasure, 1.02, 1.34) * 0.72 + scale(values.faceRatio, 68, 84) * 0.12,
    focused: 0.16 + (1 - scale(openMeasure, 0.72, 1.03)) * 0.72 + (1 - scale(values.faceRatio, 64, 80)) * 0.12,
    structure: 0.16 + scale(values.jawCheek, 72, 94) * 0.42 + scale(values.faceRatio, 68, 86) * 0.2 + scale(values.noseDepth, 2.5, 9) * 0.14 + scale(values.symmetry, 82, 98) * 0.08,
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { key: ranked[0][0], score: ranked[0][1], scores, ranked };
}

function completeClassification() {
  if (classificationComplete || !captured.front || !captured.profileA || !captured.profileB) return;
  const earValues = Object.values(captured.ears).filter((item) => Number.isFinite(item.earLength));
  const earLength = mean(earValues.map((item) => item.earLength));
  const earBalance = earValues.length === 2
    ? clamp(100 - (Math.abs(earValues[0].earLength - earValues[1].earLength) / mean(earValues[0].earLength, earValues[1].earLength)) * 100, 0, 100)
    : NaN;
  const profileDepth = mean(captured.profileA.noseDepth, captured.profileB.noseDepth);
  const captureQuality = mean(captured.front.captureQuality, captured.profileA.captureQuality, captured.profileB.captureQuality);
  const completeness = earValues.length === 2 ? 100 : earValues.length === 1 ? 88 : 76;
  finalMeasurement = {
    ...captured.front,
    noseDepth: profileDepth,
    bridgeDepth: mean(captured.profileA.bridgeDepth, captured.profileB.bridgeDepth),
    chinDepth: mean(captured.profileA.chinDepth, captured.profileB.chinDepth),
    earLength,
    earBalance,
    confidence: Math.round(captureQuality * 0.88 + completeness * 0.12),
    earCount: earValues.length,
  };
  if (Number.isFinite(earBalance)) finalMeasurement.symmetry = mean(finalMeasurement.symmetry, earBalance);
  classifiedType = classifyMeasurement(finalMeasurement);
  classificationComplete = true;
  updateMetrics(finalMeasurement);
  updateJourney(1);
  sampleCount.textContent = "3 / 3 CAPTURED";
  statusMessage.textContent = "측정 완료 · 결과 안내를 눌러주세요";
  qualityValue.textContent = `${finalMeasurement.confidence}%`;
  setSystemState("ready", "유형 분류 완료");
  classificationReady.hidden = false;
  captureJourney.hidden = true;
}

function acceptStageSample(calculated, required) {
  const values = smoothValues(calculated.values);
  stageRecords.push({ ...values });
  updateMetrics(values);
  const progress = clamp(stageRecords.length / required);
  updateJourney(progress);
  sampleCount.textContent = `${String(stageRecords.length).padStart(2, "0")} / ${required}`;
  statusMessage.textContent = `안정값을 수집하고 있습니다 · ${Math.round(progress * 100)}%`;
  if (stageRecords.length >= required) captureCurrentStage();
}

async function predict() {
  if (!running) return;
  resizeCanvas();
  if (!earMarking && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = faceLandmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];
    if (landmarks) {
      latestLandmarks = landmarks;
      frame.classList.add("has-face");
      drawFace(landmarks);
      const yawDegrees = getYawDegrees(result, landmarks);
      const blendshapes = blendshapeMap(result);
      let calculated;
      if (currentStage === 0) {
        calculated = calculateFrontMetrics(landmarks, blendshapes, yawDegrees);
        qualityValue.textContent = `${calculated.quality}%`;
        latestReference = calculated.reference;
        updateMetrics(smoothValues(calculated.values));
        if (calculated.quality >= MIN_FRONT_QUALITY && Math.abs(yawDegrees) <= 11 && performance.now() - stageStartedAt > 650) {
          acceptStageSample(calculated, REQUIRED_FRONT_SAMPLES);
        } else {
          stageRecords = [];
          updateJourney(0);
          statusMessage.textContent = calculated.guidance;
        }
      } else if (!classificationComplete) {
        const expectedSign = currentStage === 2 ? firstProfileSign : 0;
        calculated = calculateProfileMetrics(landmarks, yawDegrees, expectedSign);
        qualityValue.textContent = `${calculated.quality}%`;
        latestReference = calculated.reference;
        updateMetrics({ noseDepth: calculated.values.noseDepth });
        const correctDirection = currentStage === 1 || Math.sign(yawDegrees) !== firstProfileSign;
        const targetAngle = Math.abs(yawDegrees) >= 14 && Math.abs(yawDegrees) <= 42;
        if (calculated.quality >= MIN_PROFILE_QUALITY && correctDirection && targetAngle && performance.now() - stageStartedAt > 700) {
          turnCue.hidden = true;
          acceptStageSample(calculated, REQUIRED_PROFILE_SAMPLES);
        } else {
          stageRecords = [];
          updateJourney(0);
          statusMessage.textContent = calculated.guidance;
        }
      }
    } else {
      frame.classList.remove("has-face");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      statusMessage.textContent = "얼굴이 보이도록 화면 중앙에 맞춰주세요";
      qualityValue.textContent = "—";
      stageRecords = [];
    }
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
  frame.classList.remove("is-running", "has-face", "is-ear-marking");
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
    emptyState.hidden = true;
    captureStatus.hidden = false;
    captureJourney.hidden = false;
    stopButton.hidden = false;
    frame.classList.add("is-running");
    setSystemState("running", "3단계 측정 중");
    resetMetrics();
    resetClassification();
    statusMessage.textContent = "정면을 보고 편하게 입을 다물어주세요";
    predict();
  } catch (error) {
    console.error(error);
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
  emptyState.hidden = false;
  captureStatus.hidden = true;
  captureJourney.hidden = true;
  turnCue.hidden = true;
  earMarker.hidden = true;
  stopButton.hidden = true;
  cameraButton.disabled = false;
  cameraButton.querySelector("span:first-child").textContent = "카메라 시작";
  setSystemState("ready", "측정 준비 완료");
  resetMetrics();
  resetClassification();
}

function evidenceNote(key, typeKey) {
  const value = finalMeasurement[key];
  const notes = {
    upperThird: typeKey === "upper" ? "추정 상정이 다른 두 구역보다 상대적으로 길게 나타났습니다." : "추정 상정이 삼정 전체에서 차지하는 비율입니다.",
    middleThird: typeKey === "middle" ? "중정이 얼굴 중심축에서 가장 긴 구역으로 나타났습니다." : "미간에서 코 아래까지의 중정 비율입니다.",
    lowerThird: typeKey === "lower" ? "코 아래에서 턱끝까지의 하정이 상대적으로 강조되었습니다." : "하정이 삼정 전체에서 차지하는 비율입니다.",
    outerLeft: "오안의 왼쪽 바깥 구간을 평균 눈 너비와 비교했습니다.",
    eyeGap: typeKey === "open" ? "중앙 간격이 평균 눈 너비보다 넓게 나타났습니다." : "두 눈 사이를 평균 눈 너비와 비교한 값입니다.",
    outerRight: "오안의 오른쪽 바깥 구간을 평균 눈 너비와 비교했습니다.",
    noseWidth: "콧방울의 정면 너비를 얼굴 전체 너비와 비교했습니다.",
    philtrumLower: "인중 길이를 하정 전체 길이 안에서 비교했습니다.",
    jawCheek: "턱 너비가 광대 너비에 얼마나 가까운지 보여줍니다.",
    faceRatio: "정면 얼굴의 가로와 세로 관계를 보여줍니다.",
    noseDepth: "양측면 메시에서 코끝과 볼 평면의 상대 깊이를 평균했습니다.",
    earLength: Number.isFinite(value) ? "직접 지정한 귀 위·아래 두 점을 얼굴 길이와 비교했습니다." : "귀가 가려졌거나 건너뛰어 유형 판정에서 제외했습니다.",
    symmetry: "눈·코·입·턱 중심의 좌우 차이를 합성한 상대 균형 점수입니다.",
  };
  return notes[key] ?? "얼굴 내부의 상대값입니다.";
}

function renderResult() {
  if (!classifiedType || !finalMeasurement) return;
  const type = FACE_TYPES[classifiedType.key];
  const secondaryTypes = classifiedType.ranked
    .filter(([key]) => key !== classifiedType.key)
    .slice(0, 2)
    .map(([key]) => FACE_TYPES[key].name);
  resultCode.textContent = type.code;
  resultName.textContent = type.name;
  resultTagline.textContent = type.tagline;
  resultSecondary.textContent = secondaryTypes.join(" · ");
  resultConfidence.textContent = `${finalMeasurement.confidence}%`;
  resultKeywords.replaceChildren(...type.keywords.map((keyword) => {
    const span = document.createElement("span");
    span.textContent = keyword;
    return span;
  }));
  resultCopy.replaceChildren(...type.description.map((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    return p;
  }));
  resultContexts.replaceChildren(...type.contexts.map(([labelText, copyText]) => {
    const article = document.createElement("article");
    const label = document.createElement("span");
    const copy = document.createElement("p");
    label.textContent = labelText;
    copy.textContent = copyText;
    article.append(label, copy);
    return article;
  }));
  resultEvidence.replaceChildren(...type.evidence.map((key) => {
    const article = document.createElement("article");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    const copy = document.createElement("p");
    label.textContent = METRIC_LABELS[key].label;
    value.textContent = Number.isFinite(finalMeasurement[key])
      ? `${formatMetric(key, finalMeasurement[key])}${METRIC_LABELS[key].unit}`
      : "측정 제외";
    copy.textContent = evidenceNote(key, classifiedType.key);
    article.append(label, value, copy);
    return article;
  }));
  const methodItems = [
    ["상정 · 추정값", "실제 머리카락선을 찾지 않고 얼굴 메시 상단을 임시 기준으로 사용했습니다."],
    ["코·윤곽 · 상대 깊이", "좌우 약 30° 촬영의 메시 좌표를 합쳤으며, 밀리미터 단위의 보정된 3D 측정은 아닙니다."],
    ["귀 · 수동 지정", finalMeasurement.earCount ? `보이는 귀 ${finalMeasurement.earCount}면의 위·아래 지점을 직접 지정해 반영했습니다.` : "귀가 가려졌거나 건너뛰어 결과에서 제외했습니다."],
    ["눈썹 · 판정 제외", "눈썹 모양은 표정·화장·정리 방식의 영향을 크게 받아 이번 MVP 유형 분류에서 사용하지 않았습니다."],
  ];
  resultMethod.replaceChildren(...methodItems.map(([title, copy]) => {
    const article = document.createElement("article");
    const strong = document.createElement("strong");
    const p = document.createElement("p");
    strong.textContent = title;
    p.textContent = copy;
    article.append(strong, p);
    return article;
  }));
}

function showResult() {
  if (!classificationComplete) return;
  stopStream();
  renderResult();
  classificationReady.hidden = true;
  captureStatus.hidden = true;
  captureJourney.hidden = true;
  stopButton.hidden = true;
  emptyState.hidden = true;
  resultView.hidden = false;
  frame.classList.add("is-result");
  setSystemState("ready", "유형 결과 열람 중");
  resultView.scrollTop = 0;
}

function restartMeasurement() {
  if (typeCatalog.open) typeCatalog.close();
  resultView.hidden = true;
  frame.classList.remove("is-result");
  startCamera();
}

function renderCatalog() {
  catalogList.replaceChildren(...Object.entries(FACE_TYPES).map(([key, type]) => {
    const article = document.createElement("article");
    article.className = "catalog-card";
    if (classifiedType?.key === key) article.classList.add("is-current");
    const code = document.createElement("span");
    const title = document.createElement("h3");
    const summary = document.createElement("p");
    const keywords = document.createElement("div");
    code.textContent = classifiedType?.key === key ? `${type.code} · 나의 유형` : type.code;
    title.textContent = type.name;
    summary.textContent = type.summary;
    keywords.textContent = type.keywords.join(" · ");
    article.append(code, title, summary, keywords);
    return article;
  }));
}

function openCatalog() {
  renderCatalog();
  if (typeof typeCatalog.showModal === "function") typeCatalog.showModal();
  else typeCatalog.setAttribute("open", "");
}

async function initialize() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setSystemState("error", "지원되지 않는 브라우저");
    $(".permission-note").textContent = "카메라를 지원하는 최신 Chrome 또는 Safari에서 열어주세요.";
    return;
  }
  try {
    const module = await import(MEDIAPIPE_MODULE);
    FaceLandmarker = module.FaceLandmarker;
    DrawingUtils = module.DrawingUtils;
    const vision = await module.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    drawingUtils = new DrawingUtils(ctx);
    cameraButton.disabled = false;
    setSystemState("ready", "측정 준비 완료");
  } catch (error) {
    console.error(error);
    setSystemState("error", "측정 모델 로드 실패");
    cameraButton.disabled = true;
    $(".permission-note").textContent = "인터넷 연결을 확인하고 페이지를 새로고침해주세요.";
  }
}

cameraButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
classificationReady.addEventListener("click", showResult);
restartButton.addEventListener("click", restartMeasurement);
showAllTypes.addEventListener("click", openCatalog);
catalogClose.addEventListener("click", () => typeCatalog.close());
typeCatalog.addEventListener("click", (event) => { if (event.target === typeCatalog) typeCatalog.close(); });
frame.addEventListener("pointerdown", handleEarPoint);
skipEarButton.addEventListener("click", () => finishEarMarking(true));
window.addEventListener("beforeunload", stopStream);

const previewType = new URLSearchParams(window.location.search).get("preview");
if (window.location.hostname === "127.0.0.1" && FACE_TYPES[previewType]) {
  finalMeasurement = {
    upperThird: 33.4, middleThird: 33.1, lowerThird: 33.5,
    outerLeft: 1.03, leftEye: 0.98, eyeGap: 1.06, rightEye: 1.02, outerRight: 0.99,
    noseWidth: 23.8, philtrumLower: 22.4, jawCheek: 81.6, faceRatio: 75.2,
    noseDepth: 5.8, earLength: 31.2, symmetry: 92.5, confidence: 89, earCount: 2,
  };
  classifiedType = classifyMeasurement(finalMeasurement);
  classifiedType.key = previewType;
  classificationComplete = true;
  updateMetrics(finalMeasurement);
  sampleCount.textContent = "3 / 3 CAPTURED";
  showResult();
} else {
  initialize();
}
