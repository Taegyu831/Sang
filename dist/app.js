const MEDIAPIPE_VERSION = "1.1.1";
const MEDIAPIPE_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

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

const metricNodes = Object.fromEntries(
  [...document.querySelectorAll(".metric")].map((node) => [
    node.dataset.key,
    { node, value: node.querySelector("strong") },
  ]),
);

const LANDMARK = {
  forehead: 10,
  chin: 152,
  faceLeft: 234,
  faceRight: 454,
  jawLeft: 172,
  jawRight: 397,
  eyeLeftOuter: 33,
  eyeLeftInner: 133,
  eyeRightInner: 362,
  eyeRightOuter: 263,
  browLeftInner: 107,
  browRightInner: 336,
  noseBase: 2,
  upperLip: 0,
  lowerLip: 17,
  mouthLeft: 61,
  mouthRight: 291,
  noseTip: 1,
};

function setSystemState(state, label) {
  systemState.dataset.state = state;
  systemState.querySelector("span").textContent = label;
}

function point(landmarks, index) {
  const item = landmarks[index];
  return {
    x: item.x * video.videoWidth,
    y: item.y * video.videoHeight,
    z: item.z * video.videoWidth,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mean(...values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function degrees(radians) {
  return radians * (180 / Math.PI);
}

function signedEyeTilt(outer, inner) {
  return degrees(Math.atan2(inner.y - outer.y, Math.abs(inner.x - outer.x)));
}

function blendshapeMap(result) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];
  return Object.fromEntries(categories.map((item) => [item.categoryName, item.score]));
}

function calculateMetrics(landmarks, blendshapes) {
  const p = Object.fromEntries(
    Object.entries(LANDMARK).map(([name, index]) => [name, point(landmarks, index)]),
  );

  const faceHeight = distance(p.forehead, p.chin);
  const faceWidth = distance(p.faceLeft, p.faceRight);
  const leftEyeWidth = distance(p.eyeLeftOuter, p.eyeLeftInner);
  const rightEyeWidth = distance(p.eyeRightInner, p.eyeRightOuter);
  const averageEyeWidth = mean(leftEyeWidth, rightEyeWidth);
  const mouthWidth = distance(p.mouthLeft, p.mouthRight);
  const mouthCenterY = mean(p.upperLip.y, p.lowerLip.y);
  const cornerY = mean(p.mouthLeft.y, p.mouthRight.y);

  const leftTilt = signedEyeTilt(p.eyeLeftOuter, p.eyeLeftInner);
  const rightTilt = signedEyeTilt(p.eyeRightOuter, p.eyeRightInner);

  const smileScore = mean(
    blendshapes.mouthSmileLeft ?? 0,
    blendshapes.mouthSmileRight ?? 0,
  );

  const leftNoseDistance = distance(p.noseTip, p.faceLeft);
  const rightNoseDistance = distance(p.noseTip, p.faceRight);
  const yawProxy = Math.abs(leftNoseDistance - rightNoseDistance) / faceWidth;
  const centerOffset = Math.abs(landmarks[LANDMARK.noseTip].x - 0.5);
  const faceFill = faceHeight / video.videoHeight;

  const centeredScore = Math.max(0, 1 - centerOffset / 0.16);
  const yawScore = Math.max(0, 1 - yawProxy / 0.2);
  const sizeScore = faceFill < 0.28
    ? Math.max(0, faceFill / 0.28)
    : faceFill > 0.82
      ? Math.max(0, 1 - (faceFill - 0.82) / 0.18)
      : 1;
  const neutralScore = Math.max(0, 1 - smileScore / 0.55);
  const quality = Math.round(
    (centeredScore * 0.28 + yawScore * 0.34 + sizeScore * 0.23 + neutralScore * 0.15) * 100,
  );

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
      eyeTilt: mean(leftTilt, rightTilt),
      browGap: (distance(p.browLeftInner, p.browRightInner) / faceWidth) * 100,
      mouthLift: ((mouthCenterY - cornerY) / mouthWidth) * 100,
      cheekWidth: (faceWidth / faceHeight) * 100,
      jawWidth: (distance(p.jawLeft, p.jawRight) / faceWidth) * 100,
      faceRatio: (faceWidth / faceHeight) * 100,
    },
    quality,
    guidance,
  };
}

function smoothValues(next) {
  if (!smoothed) {
    smoothed = { ...next };
    return smoothed;
  }

  const alpha = 0.18;
  for (const key of Object.keys(next)) {
    smoothed[key] = smoothed[key] * (1 - alpha) + next[key] * alpha;
  }
  return smoothed;
}

function formatMetric(key, value) {
  if (!Number.isFinite(value)) return "—";
  if (key === "eyeGap") return value.toFixed(2);
  if (key === "eyeTilt") return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
  return value.toFixed(1);
}

function updateMetrics(values) {
  for (const [key, item] of Object.entries(metricNodes)) {
    item.value.textContent = formatMetric(key, values[key]);
    item.node.classList.add("is-live");
  }
}

function resetMetrics() {
  smoothed = null;
  samples = 0;
  sampleCount.textContent = "WAITING";
  qualityValue.textContent = "—";
  for (const item of Object.values(metricNodes)) {
    item.value.textContent = "—";
    item.node.classList.remove("is-live");
  }
}

function resizeCanvas() {
  if (!video.videoWidth || !video.videoHeight) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}

function drawFace(landmarks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_TESSELATION,
    { color: "rgba(103, 152, 255, 0.16)", lineWidth: 0.65 },
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    { color: "rgba(255, 255, 255, 0.58)", lineWidth: 1.25 },
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    { color: "rgba(103, 152, 255, 0.9)", lineWidth: 1.45 },
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    { color: "rgba(103, 152, 255, 0.9)", lineWidth: 1.45 },
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LIPS,
    { color: "rgba(114, 239, 176, 0.78)", lineWidth: 1.3 },
  );

  const highlighted = Object.values(LANDMARK).map((index) => landmarks[index]);
  drawingUtils.drawLandmarks(highlighted, {
    color: "rgba(255,255,255,0.9)",
    fillColor: "rgba(103,152,255,0.95)",
    radius: 1.35,
  });
}

async function predict() {
  if (!running) return;
  resizeCanvas();

  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = faceLandmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];

    if (landmarks) {
      frame.classList.add("has-face");
      drawFace(landmarks);

      const calculated = calculateMetrics(landmarks, blendshapeMap(result));
      const values = smoothValues(calculated.values);
      updateMetrics(values);

      samples += 1;
      sampleCount.textContent = `${String(samples).padStart(4, "0")} FRAMES`;
      qualityValue.textContent = `${calculated.quality}%`;
      statusMessage.textContent = calculated.guidance;
    } else {
      frame.classList.remove("has-face");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      statusMessage.textContent = "얼굴을 화면 중앙에 맞춰주세요";
      qualityValue.textContent = "—";
    }
  }

  animationId = requestAnimationFrame(predict);
}

async function startCamera() {
  if (!faceLandmarker || running) return;

  cameraButton.disabled = true;
  cameraButton.querySelector("span:first-child").textContent = "카메라 연결 중";

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 16 / 9 },
      },
    });

    video.srcObject = stream;
    await video.play();

    running = true;
    lastVideoTime = -1;
    emptyState.hidden = true;
    captureStatus.hidden = false;
    stopButton.hidden = false;
    frame.classList.add("is-running");
    setSystemState("running", "실시간 측정 중");
    resetMetrics();
    predict();
  } catch (error) {
    console.error(error);
    cameraButton.disabled = false;
    cameraButton.querySelector("span:first-child").textContent = "다시 시도";
    setSystemState("error", "카메라를 사용할 수 없음");
    const denied = error?.name === "NotAllowedError";
    document.querySelector(".permission-note").textContent = denied
      ? "브라우저 주소창의 카메라 권한을 허용한 뒤 다시 시도해주세요."
      : "카메라 연결을 확인한 뒤 다시 시도해주세요.";
  }
}

function stopCamera() {
  running = false;
  cancelAnimationFrame(animationId);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  frame.classList.remove("is-running", "has-face");
  emptyState.hidden = false;
  captureStatus.hidden = true;
  stopButton.hidden = true;
  cameraButton.disabled = false;
  cameraButton.querySelector("span:first-child").textContent = "카메라 시작";
  setSystemState("ready", "측정 준비 완료");
  resetMetrics();
}

async function initialize() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setSystemState("error", "지원되지 않는 브라우저");
    document.querySelector(".permission-note").textContent =
      "카메라를 지원하는 최신 Chrome 또는 Safari에서 열어주세요.";
    return;
  }

  try {
    const module = await import(MEDIAPIPE_MODULE);
    FaceLandmarker = module.FaceLandmarker;
    DrawingUtils = module.DrawingUtils;

    const vision = await module.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_MODEL,
        delegate: "GPU",
      },
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
    document.querySelector(".permission-note").textContent =
      "인터넷 연결을 확인하고 페이지를 새로고침해주세요.";
  }
}

cameraButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
window.addEventListener("beforeunload", stopCamera);

initialize();
