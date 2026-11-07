// Continuous capture. Instead of asking the visitor for a front shot and two
// side shots, every usable frame is collected while they move naturally.
//
//   1. assess(): is this frame usable? (not turned too far, face fills the
//      frame, neutral expression, eyes open) and how much should it count?
//   2. add(): keep the pose-corrected ratios of usable frames with a weight.
//   3. snapshot(): the weighted median of every ratio, which ignores the odd
//      bad frame, plus a stability number and the head angles covered.
//
// Because the ratios were already rotated to a straight-on view, frames from
// different head angles agree with each other and can be pooled.

import { poseWeight } from "./pose.js";

export const CAPTURE = {
  maxYaw: 26,
  maxPitch: 20,
  maxRoll: 28,
  minFaceFill: 0.28,
  maxFaceFill: 0.88,
  maxCenterOffset: 0.2,
  // Blendshape scores (0..1) above which the expression is not neutral.
  limits: { smile: 0.3, jawOpen: 0.12, blink: 0.5, frown: 0.35 },
  // Accumulated frame weight needed, and a hard cap in the same unit.
  targetWeight: 36,
  capWeight: 90,
  minFrames: 40,
  maxFrames: 400,
  // Keys checked for stability and how many typical steps may still drift.
  stabilityKeys: ["upperThird", "middleThird", "lowerThird", "openMeasure", "noseWidth", "mouthNose", "jawCheek", "faceRatio"],
};

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mean2 = (a, b) => (a + b) / 2;

export function weightedMedian(pairs) {
  const items = pairs.filter(([v, w]) => Number.isFinite(v) && w > 0).sort((a, b) => a[0] - b[0]);
  if (!items.length) return NaN;
  const total = items.reduce((a, [, w]) => a + w, 0);
  let run = 0;
  for (const [v, w] of items) {
    run += w;
    if (run >= total / 2) return v;
  }
  return items.at(-1)[0];
}

function expressionScores(blend) {
  return {
    smile: mean2(blend.mouthSmileLeft ?? 0, blend.mouthSmileRight ?? 0),
    frown: mean2(blend.mouthFrownLeft ?? 0, blend.mouthFrownRight ?? 0),
    jawOpen: blend.jawOpen ?? 0,
    blink: mean2(blend.eyeBlinkLeft ?? 0, blend.eyeBlinkRight ?? 0),
  };
}

export class StableCapture {
  constructor(options = {}) {
    this.options = { ...CAPTURE, ...options };
    this.reset();
  }

  reset() {
    this.frames = [];
    this.totalWeight = 0;
    this.rejected = 0;
    this.lastReason = null;
  }

  /**
   * input: { pose: {yaw, pitch, roll}, blend: {name: score}, faceFill, centerOffset }
   * Returns { ok, weight, reason }. reason is a short code for the guidance text.
   */
  assess({ pose, blend = {}, faceFill, centerOffset }) {
    const o = this.options;
    if (faceFill < o.minFaceFill) return { ok: false, weight: 0, reason: "far" };
    if (faceFill > o.maxFaceFill) return { ok: false, weight: 0, reason: "near" };
    if (centerOffset > o.maxCenterOffset) return { ok: false, weight: 0, reason: "off-center" };
    if (Math.abs(pose.yaw) > o.maxYaw) return { ok: false, weight: 0, reason: "yaw" };
    if (Math.abs(pose.pitch) > o.maxPitch) return { ok: false, weight: 0, reason: pose.pitch > 0 ? "pitch-up" : "pitch-down" };
    if (Math.abs(pose.roll) > o.maxRoll) return { ok: false, weight: 0, reason: "roll" };
    const e = expressionScores(blend);
    if (e.blink > o.limits.blink) return { ok: false, weight: 0, reason: "blink" };
    if (e.smile > o.limits.smile) return { ok: false, weight: 0, reason: "smile" };
    if (e.jawOpen > o.limits.jawOpen) return { ok: false, weight: 0, reason: "mouth-open" };
    if (e.frown > o.limits.frown) return { ok: false, weight: 0, reason: "frown" };
    const expressionPenalty = Math.max(e.smile / o.limits.smile, e.jawOpen / o.limits.jawOpen, e.frown / o.limits.frown);
    const weight = poseWeight(pose.yaw, pose.pitch, o.maxYaw + 10, o.maxPitch + 10) * (1 - 0.6 * clamp(expressionPenalty));
    return { ok: weight > 0.02, weight, reason: null };
  }

  add(values, weight, pose) {
    this.frames.push({ values, weight, yaw: pose.yaw, pitch: pose.pitch });
    this.totalWeight += weight;
    if (this.frames.length > this.options.maxFrames) {
      const dropped = this.frames.shift();
      this.totalWeight -= dropped.weight;
    }
  }

  get progress() {
    return clamp(this.totalWeight / this.options.targetWeight);
  }

  /** Estimate from a list of frames (default: all). */
  estimate(frames = this.frames) {
    const keys = new Set(frames.flatMap((f) => Object.keys(f.values)));
    const values = {};
    for (const key of keys) values[key] = weightedMedian(frames.map((f) => [f.values[key], f.weight]));
    return values;
  }

  /**
   * 0..1. Compares the estimate from the older half with the newer half; if the
   * ratios still drift, more frames are needed. calibration supplies the step
   * size of each ratio so drift is judged in meaningful units.
   */
  stability(calibration) {
    if (this.frames.length < 12) return 0;
    const half = Math.floor(this.frames.length / 2);
    const a = this.estimate(this.frames.slice(0, half));
    const b = this.estimate(this.frames.slice(half));
    let worst = 0;
    for (const key of this.options.stabilityKeys) {
      const scale = calibration?.[key]?.scale;
      if (!scale || !Number.isFinite(a[key]) || !Number.isFinite(b[key])) continue;
      worst = Math.max(worst, Math.abs(a[key] - b[key]) / scale);
    }
    return clamp(1 - worst / 0.3);
  }

  isDone(calibration) {
    const o = this.options;
    if (this.frames.length < o.minFrames || this.totalWeight < o.targetWeight) return false;
    if (this.totalWeight >= o.capWeight) return true;
    return this.stability(calibration) >= 0.5;
  }

  snapshot(calibration) {
    const yaws = this.frames.map((f) => f.yaw);
    const pitches = this.frames.map((f) => f.pitch);
    return {
      values: this.estimate(),
      frames: this.frames.length,
      totalWeight: this.totalWeight,
      stability: this.stability(calibration),
      coverage: this.frames.length
        ? { yaw: [Math.min(...yaws), Math.max(...yaws)], pitch: [Math.min(...pitches), Math.max(...pitches)] }
        : null,
    };
  }
}

export const GUIDANCE = {
  far: "카메라에 조금 더 가까이 와주세요",
  near: "카메라에서 조금 멀어져 주세요",
  "off-center": "얼굴을 화면 중앙에 맞춰주세요",
  yaw: "고개를 조금만 정면 쪽으로 돌려주세요",
  "pitch-up": "턱을 조금 당겨 주세요",
  "pitch-down": "고개를 조금 들어 주세요",
  roll: "고개를 너무 기울이지 않아도 괜찮아요",
  smile: "편하게 무표정을 유지해주세요",
  "mouth-open": "입을 편하게 다물어주세요",
  frown: "표정을 풀고 편안하게 있어주세요",
  blink: null,
};
