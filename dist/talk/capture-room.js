// The guided capture (front, a slight turn to each side, a clenched jaw, a smile), driven from the
// character's screen. The measuring, the limits and the record are the same as in the earlier page
// (app-v3.js), so that visitor numbers from both can be used together.
import { getPoints, computeFrontFeatures, vertical } from "../features.js";
import { estimatePose, frontalizePoints } from "../pose.js";
import { applyPoseResidual, POSE_RESIDUAL, RESIDUAL_VERSION } from "../residual.js";
import { CALIBRATION } from "../calibration.js";
import { StableCapture, PoseCompare, COMPARE_STEPS, compareDeltas } from "../capture.js";
import { openCameraStream } from "../camera.js";
import { cropFace } from "./kit.js";

const VENDOR = new URL("../vendor/mediapipe/", import.meta.url).href;
// The same limits as app-v3.js captureOptions(); ?strict=0 gives the loose ones back.
const STRICT = { maxPitch: 8, maxRoll: 15, maxCenterOffset: 0.12, minFaceFill: 0.36, maxFaceFill: 0.55, limits: { smile: 0.2, jawOpen: 0.08, blink: 0.4, frown: 0.25 } };
const limits = () => (new URLSearchParams(location.search).get("strict") === "0" ? {} : STRICT);
const HARD_LIMIT_MS = 40000; // ARTIFICIAL: after this long the capture finishes with what it has
const MIN_AT_LIMIT = 15; // ARTIFICIAL: ... if at least this many frames were usable
const SIDE_YAW = 16; // ARTIFICIAL: the head angle (degrees) preferred for the side pictures
/** What the character says at each step: [pose, words, arrow, step number]. */
export const ASKS = {
  front: ["focus", "저를 똑바로 봐 주세요. 편한 표정이면 돼요.", "", 0],
  left: ["left", "좋아요. 고개를 살짝 이쪽으로 돌려 보세요.", "◀", 1],
  right: ["right", "이번엔 반대쪽이에요. 이쪽으로 살짝.", "▶", 2],
  done: ["focus", "음, 보여요. 다시 정면으로 돌아와 주세요.", "", 2],
  clench: ["clench", "입은 다물고, 턱에 힘을 꽉! 저처럼요.", "", 3],
  smile: ["smile", "마지막이에요. 활짝 웃어 보세요!", "", 4],
};
// The app's capture guidance (capture.js GUIDANCE), in the character's own voice.
export const TROUBLE = {
  none: "어라, 얼굴이 안 보여요. 화면 가운데에 앉아 주세요.",
  far: "조금만 더 가까이 와 주실래요?",
  near: "어이쿠, 가까워요. 조금만 뒤로 가 주세요.",
  "off-center": "얼굴이 화면 한가운데 오게 앉아 주세요.",
  yaw: "너무 많이 돌렸어요. 조금만 돌아와 주세요.",
  "pitch-up": "턱을 살짝 당겨 주세요.",
  "pitch-down": "고개를 살짝 들어 주세요.",
  roll: "고개를 조금만 바로 세워 주세요.",
  smile: "웃는 건 이따가요. 지금은 편한 무표정으로 부탁해요.",
  "mouth-open": "입은 편하게 다물어 주세요.",
  frown: "미간에 힘 빼고, 편안하게요.",
};
let landmarker = null;
let files = null;
let mod = null;
let stream = null;

export function stopCamera() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }

async function model(delegate) {
  mod ??= await import(`${VENDOR}vision_bundle.mjs`);
  files ??= await mod.FilesetResolver.forVisionTasks(`${VENDOR}wasm`);
  return mod.FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${VENDOR}face_landmarker.task`, delegate }, runningMode: "VIDEO", numFaces: 1,
    minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6, outputFaceBlendshapes: true,
  });
}
let loading = null;
let onCpu = false;
/** Loads the measuring model once, ahead of the first visitor; the CPU takes over without a usable GPU. */
export function prepare() {
  loading ??= model("GPU").catch(() => { onCpu = true; return model("CPU"); }).then((m) => { landmarker = m; }).catch((error) => { loading = null; throw error; });
  return loading;
}

/**
 * Runs the whole capture. on.stage(id) when a new thing is asked for ("front", "left", "right",
 * "done", "clench", "smile"), on.trouble(code | null) while the picture cannot be used,
 * on.progress(0..1). Returns the face to show with its values and `sides` (one picture from each
 * head turn, for the couple picture), or null when the scene ended.
 */
export async function captureFace(video, alive, on, { limits: own } = {}) {
  stopCamera();
  const opened = await openCameraStream({ width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" });
  if (!alive()) { opened.getTracks().forEach((t) => t.stop()); return null; }
  stream = opened;
  video.srcObject = stream;
  await video.play();
  await prepare();
  const capture = new StableCapture(own ?? limits());
  const canvas = document.createElement("canvas");
  let compare = null; let compareIndex = 0; const compared = {}; let base = null;
  let best = null; let asked = null; let began = null;
  const turned = {}; // the best picture of each head turn
  const picture = () => {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return canvas;
  };
  const ask = (id) => { if (asked !== id) { asked = id; on.stage(id); } };

  while (alive()) {
    await new Promise((r) => requestAnimationFrame(r));
    if (!alive()) break;
    if (!video.videoWidth) continue;
    const t = performance.now();
    let result;
    try { result = landmarker.detectForVideo(video, t); } catch (error) {
      if (onCpu) throw error;
      console.warn("measuring failed, switching to the CPU", error);
      landmarker = await model("CPU"); onCpu = true; continue;
    }
    const found = result.faceLandmarks?.[0];
    if (!found) { on.trouble("none"); continue; }
    const blend = Object.fromEntries((result.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
    const raw = getPoints(found, video.videoWidth, video.videoHeight);
    const pose = estimatePose(raw);
    const frontal = computeFrontFeatures(frontalizePoints(raw, pose));
    const values = applyPoseResidual(frontal, pose);
    began ??= t;

    if (compare) {
      on.trouble(null);
      compare.add({ values, blend, pose, t });
      if (!compare.finished(t)) continue;
      compared[compare.step.id] = compare.result();
      compareIndex += 1;
      if (compareIndex < COMPARE_STEPS.length) { compare = new PoseCompare(COMPARE_STEPS[compareIndex]); ask(COMPARE_STEPS[compareIndex].id); continue; }
      break;
    }
    const faceFill = vertical(raw.meshTop, raw.chin) / video.videoHeight;
    const centerOffset = Math.abs(raw.noseTip.x / video.videoWidth - 0.5);
    const verdict = capture.assess({ pose, blend, faceFill, centerOffset });
    if (verdict.ok) {
      on.trouble(null);
      const fix = Object.fromEntries(Object.keys(POSE_RESIDUAL).filter((k) => Number.isFinite(frontal[k]) && Number.isFinite(values[k])).map((k) => [k, frontal[k] - values[k]]));
      capture.add(values, verdict.weight, pose, t, faceFill, fix);
      const straight = Math.abs(pose.yaw) < 8 && Math.abs(pose.pitch) < 12;
      if (straight && verdict.weight > (best?.weight ?? 0)) {
        best = { weight: verdict.weight, shot: cropFace(picture(), { found, values }) };
      }
      const zone = capture.zoneOf(pose.yaw);
      if (zone === "left" || zone === "right") {
        // clearly turned is worth more than barely turned
        const score = verdict.weight * (1 - Math.abs(Math.abs(pose.yaw) - SIDE_YAW) / 30);
        // not every frame: cutting a picture out costs time
        if (score > (turned[zone]?.score ?? 0) * 1.05) turned[zone] = { score, src: cropFace(picture(), { found, values }).src };
      }
      ask(capture.zoneTimedOut ? "done" : capture.nextZone ?? "done");
      on.progress(capture.progress);
    } else if (verdict.reason) on.trouble(verdict.reason);
    const late = t - began > HARD_LIMIT_MS && capture.frames.length >= MIN_AT_LIMIT;
    if ((capture.isDone(CALIBRATION) || late) && best) {
      on.progress(1);
      base = capture.frontEstimate();
      if (!base) break;
      compare = new PoseCompare(COMPARE_STEPS[0]);
      ask(COMPARE_STEPS[0].id);
    }
  }
  stopCamera();
  if (!alive() || !best) return null;
  const snap = capture.snapshot(CALIBRATION);
  const confidence = Math.round(60 * snap.stability + 40 * Math.max(0, Math.min(1, snap.totalWeight / capture.options.targetWeight)));
  const measurement = { ...snap.values, ...compareDeltas(base, compared.clench, compared.smile), ...snap.context, residOn: 1, residVersion: RESIDUAL_VERSION, confidence, frames: snap.frames, stability: snap.stability, coverage: snap.coverage };
  return { ...best.shot, values: measurement, sides: [turned.left?.src, turned.right?.src].filter(Boolean) };
}
