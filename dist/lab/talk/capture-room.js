// The app's own guided capture (front, a slight turn to each side, a clenched jaw, a smile), driven
// from the character's screen. The measuring is the app's; only the words and the screen are new.
import { getPoints, computeFrontFeatures, vertical } from "../../features.js";
import { estimatePose, frontalizePoints } from "../../pose.js";
import { applyPoseResidual } from "../../residual.js";
import { CALIBRATION } from "../../calibration.js";
import { StableCapture, PoseCompare, COMPARE_STEPS, compareDeltas } from "../../capture.js";
import { openCameraStream } from "../../camera.js";
import { cropFace } from "../desk/engine.js";

const VENDOR = new URL("../../vendor/mediapipe/", import.meta.url).href;
const HARD_LIMIT_MS = 40000; // ARTIFICIAL: after this long the capture finishes with what it has
const MIN_AT_LIMIT = 15; // ARTIFICIAL: ... if at least this many frames were usable
let landmarker = null;
let files = null;
let mod = null;
let stream = null;

export function stopCamera() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }

async function model(delegate) {
  mod ??= await import(`${VENDOR}vision_bundle.mjs`);
  files ??= await mod.FilesetResolver.forVisionTasks(`${VENDOR}wasm`);
  return mod.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: `${VENDOR}face_landmarker.task`, delegate }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true });
}

/**
 * Runs the whole capture. on.stage(id) when a new thing is asked for ("front", "left", "right",
 * "done", "clench", "smile"), on.trouble(code | null) while the picture cannot be used,
 * on.progress(0..1). Returns the face to show with its values, or null when the scene ended.
 */
export async function captureFace(video, alive, on) {
  stopCamera();
  const opened = await openCameraStream({ width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" });
  if (!alive()) { opened.getTracks().forEach((t) => t.stop()); return null; }
  stream = opened;
  video.srcObject = stream;
  await video.play();
  let delegate = landmarker ? null : "GPU";
  if (!landmarker) {
    try { landmarker = await model("GPU"); } catch { landmarker = await model("CPU"); delegate = "CPU"; }
  }
  const capture = new StableCapture();
  const canvas = document.createElement("canvas");
  let compare = null; let compareIndex = 0; const compared = {}; let base = null;
  let best = null; let asked = null; let began = null;
  const ask = (id) => { if (asked !== id) { asked = id; on.stage(id); } };

  while (alive()) {
    await new Promise((r) => requestAnimationFrame(r));
    if (!alive()) break;
    if (!video.videoWidth) continue;
    const t = performance.now();
    let result;
    try { result = landmarker.detectForVideo(video, t); } catch (error) {
      if (delegate === "CPU") throw error;
      console.warn("measuring failed, switching to the CPU", error);
      landmarker = await model("CPU"); delegate = "CPU"; continue;
    }
    const found = result.faceLandmarks?.[0];
    if (!found) { on.trouble("none"); continue; }
    const blend = Object.fromEntries((result.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
    const raw = getPoints(found, video.videoWidth, video.videoHeight);
    const pose = estimatePose(raw);
    const values = applyPoseResidual(computeFrontFeatures(frontalizePoints(raw, pose)), pose);
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
      capture.add(values, verdict.weight, pose, t, faceFill);
      const straight = Math.abs(pose.yaw) < 8 && Math.abs(pose.pitch) < 12;
      if (straight && verdict.weight > (best?.weight ?? 0)) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        best = { weight: verdict.weight, shot: cropFace(canvas, { found, values }) };
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
  return { ...best.shot, values: { ...capture.snapshot(CALIBRATION).values, ...compareDeltas(base, compared.clench, compared.smile) } };
}
