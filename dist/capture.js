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
  minFaceFill: 0.34,
  maxFaceFill: 0.82,
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
  // Guided turn: front, then a slight turn to each side. Pooling both sides
  // cancels what pose correction leaves over (one side reads a little high,
  // the other a little low) and side views show depth (nose, jaw) for real.
  // yaw > 0 turns toward the left of the mirrored screen (see dist/pose.js).
  zones: {
    front: { min: -6, max: 6, frames: 15 },
    left: { min: 8, max: 26, frames: 10 },
    right: { min: -26, max: -8, frames: 10 },
  },
  zoneOrder: ["front", "left", "right"],
  // estimate(): groups split at this yaw, and the weight a group needs to count.
  sideYaw: 6,
  groupMinWeight: 3,
  // Someone who cannot or will not turn still finishes after this long.
  zoneTimeoutMs: 15000,
  zoneTimeoutFrames: 450,
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
    this.zoneCount = Object.fromEntries(Object.keys(this.options.zones).map((z) => [z, 0]));
    this.added = 0;
    this.startedAt = null;
    this.lastAt = null;
  }

  /** Which guided zone a head angle falls in, or null between zones. */
  zoneOf(yaw) {
    for (const [name, z] of Object.entries(this.options.zones)) if (yaw >= z.min && yaw <= z.max) return name;
    return null;
  }

  /** 0..1 per zone. */
  get zoneProgress() {
    const out = {};
    for (const [name, z] of Object.entries(this.options.zones)) out[name] = clamp(this.zoneCount[name] / z.frames);
    return out;
  }

  /** The next zone still missing frames, in guidance order, or null when all are covered. */
  get nextZone() {
    const p = this.zoneProgress;
    return this.options.zoneOrder.find((z) => p[z] < 1) ?? null;
  }

  get zoneTimedOut() {
    const o = this.options;
    if (this.added >= o.zoneTimeoutFrames) return true;
    return this.startedAt !== null && this.lastAt - this.startedAt >= o.zoneTimeoutMs;
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

  /** t: timestamp in ms (optional; tests feed frames without real time). */
  add(values, weight, pose, t = null, fill = null, fix = null) {
    this.frames.push({ values, weight, yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll ?? 0, fill, fix });
    this.added += 1;
    const zone = this.zoneOf(pose.yaw);
    if (zone) this.zoneCount[zone] += 1;
    if (t !== null) {
      this.startedAt ??= t;
      this.lastAt = t;
    }
    this.totalWeight += weight;
    if (this.frames.length > this.options.maxFrames) {
      const dropped = this.frames.shift();
      this.totalWeight -= dropped.weight;
    }
  }

  get progress() {
    // Weight and turn coverage both count, so the bar keeps moving while turning.
    const o = this.options;
    const need = Object.values(o.zones).reduce((a, z) => a + z.frames, 0);
    const have = Object.entries(o.zones).reduce((a, [n, z]) => a + Math.min(this.zoneCount[n], z.frames), 0);
    const zones = this.zoneTimedOut ? 1 : have / need;
    return clamp(0.5 * clamp(this.totalWeight / o.targetWeight) + 0.5 * zones);
  }

  /**
   * Estimate from a list of frames (default: all).
   *
   * The frames are split by head turn (right, front, left) and each group gets
   * its own weighted median; the estimate is the plain mean of the groups that
   * have enough frames. Pose correction leaves a small error that has the
   * opposite sign on the two sides, so giving both sides the same say cancels
   * it, however long the visitor stayed on one side.
   */
  estimate(frames = this.frames) {
    const keys = new Set(frames.flatMap((f) => Object.keys(f.values)));
    const o = this.options;
    const groups = { right: [], front: [], left: [] };
    for (const f of frames) groups[f.yaw > o.sideYaw ? "left" : f.yaw < -o.sideYaw ? "right" : "front"].push(f);
    const used = Object.values(groups).filter((g) => g.reduce((a, f) => a + f.weight, 0) >= o.groupMinWeight);
    const values = {};
    for (const key of keys) {
      const single = weightedMedian(frames.map((f) => [f.values[key], f.weight]));
      if (used.length < 2) { values[key] = single; continue; }
      const parts = used.map((g) => weightedMedian(g.map((f) => [f.values[key], f.weight]))).filter(Number.isFinite);
      values[key] = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : single;
    }
    return values;
  }

  /** Median of the frames within a few degrees of straight-on, the fair partner for a frontal posed shot. */
  frontEstimate(limit = 8) {
    const front = this.frames.filter((f) => Math.abs(f.yaw) <= limit);
    return front.reduce((a, f) => a + f.weight, 0) >= 3 ? this.estimate(front) : null;
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
      // Stability uses the wider capture steps, not the narrow reading steps.
      const scale = calibration?.[key]?.captureScale ?? calibration?.[key]?.scale;
      if (!scale || !Number.isFinite(a[key]) || !Number.isFinite(b[key])) continue;
      worst = Math.max(worst, Math.abs(a[key] - b[key]) / scale);
    }
    // Done at stability 0.5, i.e. when the older and newer half differ by at most 0.25 steps.
    return clamp(1 - worst / 0.5);
  }

  isDone(calibration) {
    const o = this.options;
    if (this.frames.length < o.minFrames || this.totalWeight < o.targetWeight) return false;
    if (this.nextZone && !this.zoneTimedOut) return false;
    if (this.totalWeight >= o.capWeight) return true;
    return this.stability(calibration) >= 0.5;
  }

  /** "stable" when the ratios stopped drifting, "cap" when the frame limit ended it, null if not done. */
  doneReason(calibration) {
    if (!this.isDone(calibration)) return null;
    return this.stability(calibration) >= 0.5 ? "stable" : "cap";
  }

  /**
   * How the frames were taken, as plain numbers for the collected record: the weighted mean and
   * spread of the up/down angle, the mean tilt, and the mean face height in the picture (a stand-in
   * for the distance). With these the visitors' values can later be compared with camera height
   * and distance without a separate test.
   */
  captureContext() {
    const frames = this.frames;
    const total = frames.reduce((sum, f) => sum + f.weight, 0);
    if (!frames.length || total <= 0) return {};
    const wmean = (pick) => frames.reduce((sum, f) => sum + pick(f) * f.weight, 0) / total;
    const pitchMean = wmean((f) => f.pitch);
    const out = {
      capturePitchMean: pitchMean,
      capturePitchSd: Math.sqrt(wmean((f) => (f.pitch - pitchMean) ** 2)),
      captureRollAbs: wmean((f) => Math.abs(f.roll)),
    };
    const filled = frames.filter((f) => Number.isFinite(f.fill));
    if (filled.length) out.captureFill = filled.reduce((sum, f) => sum + f.fill, 0) / filled.length;
    // How much the head-angle correction (dist/residual.js) took off each ratio, weighted mean over
    // the frames. Stored value + residFix_<ratio> is the value before that correction, so the
    // correction table can be changed later and the collected rows recomputed.
    const fixKeys = new Set(frames.flatMap((f) => (f.fix ? Object.keys(f.fix) : [])));
    for (const key of fixKeys) out[`residFix_${key}`] = wmean((f) => f.fix?.[key] ?? 0);
    return out;
  }

  snapshot(calibration) {
    const yaws = this.frames.map((f) => f.yaw);
    const pitches = this.frames.map((f) => f.pitch);
    return {
      context: this.captureContext(),
      values: this.estimate(),
      frames: this.frames.length,
      totalWeight: this.totalWeight,
      zones: { ...this.zoneCount },
      stability: this.stability(calibration),
      coverage: this.frames.length
        ? { yaw: [Math.min(...yaws), Math.max(...yaws)], pitch: [Math.min(...pitches), Math.max(...pitches)] }
        : null,
    };
  }
}

// What the master says while a usable frame comes in, by the next zone needed.
export const TURN_GUIDANCE = {
  front: "좋습니다. 먼저 정면을 편하게 봐 주세요",
  left: "이제 고개를 살짝 ◀ 쪽으로 돌려 보세요",
  right: "좋아요. 이번엔 살짝 ▶ 쪽으로 돌려 보세요",
  done: "다 봤습니다. 정면으로 돌아와 잠깐만 계세요",
};

export const GUIDANCE = {
  far: "카메라에 조금 더 가까이 와주세요",
  near: "카메라에서 조금 멀어져 주세요",
  "off-center": "얼굴을 화면 중앙에 맞춰주세요",
  yaw: "너무 많이 돌렸어요. 조금만 돌아와 주세요",
  "pitch-up": "턱을 조금 당겨 주세요",
  "pitch-down": "고개를 조금 들어 주세요",
  roll: "고개를 너무 기울이지 않아도 괜찮아요",
  smile: "편하게 무표정을 유지해주세요",
  "mouth-open": "입을 편하게 다물어주세요",
  frown: "표정을 풀고 편안하게 있어주세요",
  blink: null,
};

// ---------- posed shots: the same face, tensed and smiling ----------
//
// The relaxed capture above is the baseline. Two more short shots follow, each
// asked for by a line on screen: the jaw clenched, and a small smile. Their
// difference from the relaxed face says what is bone and what is muscle (a
// clenched jaw widens when the chewing muscles are strong) and how far the
// mouth corners travel when smiling.

export const COMPARE_STEPS = [
  { id: "clench", prompt: "이번에는 입을 다문 채 턱에 힘을 꽉 줘 보세요", accepts: (e) => e.jawOpen < 0.12 && e.blink < 0.6 },
  { id: "smile", prompt: "마지막으로 입꼬리를 살짝 올려 웃어 보세요", accepts: (e) => e.smile >= 0.25 && e.jawOpen < 0.4 && e.blink < 0.6 },
];

export const COMPARE = {
  // Time to get into the pose, then the window in which frames are kept.
  graceMs: 1200,
  windowMs: 2400,
  // Give up (and read the face without this comparison) after this long without enough frames.
  giveUpMs: 4500,
  minFrames: 8,
  maxYaw: 16,
  maxPitch: 24,
};

export class PoseCompare {
  constructor(step, options = {}) {
    this.step = step;
    this.options = { ...COMPARE, ...options };
    this.frames = [];
    this.startedAt = null;
  }

  /** Returns true when the frame was kept. */
  add({ values, blend = {}, pose, t }) {
    this.startedAt ??= t;
    const o = this.options;
    const elapsed = t - this.startedAt;
    if (elapsed < o.graceMs) return false;
    if (Math.abs(pose.yaw) > o.maxYaw || Math.abs(pose.pitch) > o.maxPitch) return false;
    if (!this.step.accepts(expressionScores(blend))) return false;
    this.frames.push({ values, weight: 1, t });
    return true;
  }

  /** Enough frames are in (after the window opened), or time ran out. */
  finished(t) {
    const o = this.options;
    if (this.startedAt === null) return false;
    const elapsed = t - this.startedAt;
    if (this.frames.length >= o.minFrames && elapsed >= o.graceMs + o.windowMs) return true;
    return elapsed >= o.giveUpMs;
  }

  get inWindow() { return this.frames.length > 0; }

  /** Median of every ratio over the kept frames, or null when there were too few. */
  result() {
    if (this.frames.length < this.options.minFrames) return null;
    const keys = new Set(this.frames.flatMap((f) => Object.keys(f.values)));
    const out = {};
    for (const key of keys) out[key] = weightedMedian(this.frames.map((f) => [f.values[key], 1]));
    return out;
  }
}

/** Differences of each posed shot from the relaxed baseline (all in the ratios' own units, mostly percent points). */
export function compareDeltas(base, clench, smile) {
  const out = {};
  const put = (name, v) => { if (Number.isFinite(v)) out[name] = v; };
  if (base && clench) {
    put("jawFlex", clench.jawCheek - base.jawCheek);
    put("chinFlex", clench.chinWidth - base.chinWidth);
  }
  if (base && smile) {
    put("smileLift", smile.mouthLift - base.mouthLift);
    put("smileWiden", smile.mouthFace - base.mouthFace);
  }
  return out;
}
