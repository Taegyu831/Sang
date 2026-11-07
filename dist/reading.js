// The three traditional frames, each read on its own:
//   삼정 (vertical thirds)   -> upper | middle | lower | balance
//   오안 (five eye spaces)   -> open | focused | even
//   오악 (outline structure) -> structure | soft
// These are the "how it was measured" layer. The five interpretation themes
// in interpret.js read across them.
//
// Every decision is made in typical steps (z) from calibration.js, so the
// average face lands in the middle of each frame instead of on one side.

import { CALIBRATION, zScore } from "./calibration.js";

export const AXES = {
  sanjeong: { label: "삼정", english: "THREE ZONES", options: ["upper", "middle", "lower", "balance"] },
  ogan: { label: "오안", english: "FIVE EYES", options: ["open", "focused", "even"] },
  oak: { label: "오악", english: "FIVE PEAKS", options: ["structure", "soft"] },
};

export const AXIS_ORDER = ["sanjeong", "ogan", "oak"];

export const THRESHOLDS = {
  // A third is emphasized when it is at least this many steps above typical.
  thirdsLead: 0.8,
  // Intensity of an emphasis, in steps above typical.
  tierClear: 1.8,
  tierModerate: 1.2,
  // Five-eye spaces: open above +step, focused below -step.
  ogan: 0.6,
  // Outline score, steps; structure at or above 0.
  oak: 0.0,
};

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const finite = Number.isFinite;

/** Near a decision line when the margin (0..1) is small. */
const NEAR = 0.3;

export function tierOf(z, t = THRESHOLDS) {
  if (z >= t.tierClear) return "clear";
  if (z >= t.tierModerate) return "moderate";
  return "light";
}

export function classifySanjeong(values, t = THRESHOLDS, calibration = CALIBRATION) {
  const entries = [
    ["upper", zScore("upperThird", values.upperThird, calibration)],
    ["middle", zScore("middleThird", values.middleThird, calibration)],
    ["lower", zScore("lowerThird", values.lowerThird, calibration)],
  ].sort((a, b) => b[1] - a[1]);
  const [leader, second] = entries;
  if (!finite(leader[1])) return null;
  let key;
  let marginSteps;
  if (leader[1] >= t.thirdsLead) {
    key = leader[0];
    marginSteps = Math.min(leader[1] - t.thirdsLead, leader[1] - second[1]);
  } else {
    key = "balance";
    marginSteps = t.thirdsLead - leader[1];
  }
  const margin = clamp(marginSteps / 0.6);
  return {
    key,
    margin,
    near: margin < NEAR,
    score: leader[1],
    tier: key === "balance" ? null : tierOf(leader[1], t),
    detail: { leader: leader[0], z: leader[1], gapZ: leader[1] - second[1] },
  };
}

export function classifyOgan(values, t = THRESHOLDS, calibration = CALIBRATION) {
  const z = zScore("openMeasure", values.openMeasure, calibration);
  if (!finite(z)) return null;
  let key;
  let marginSteps;
  if (z > t.ogan) {
    key = "open";
    marginSteps = z - t.ogan;
  } else if (z < -t.ogan) {
    key = "focused";
    marginSteps = -t.ogan - z;
  } else {
    key = "even";
    marginSteps = t.ogan - Math.abs(z);
  }
  const margin = clamp(marginSteps / 0.5);
  return { key, margin, near: margin < NEAR, score: z, tier: null, detail: { z, measure: values.openMeasure } };
}

/** Outline score in steps: wider jaw and wider face read as structured. */
export function structureScore(values, calibration = CALIBRATION) {
  const terms = [
    [0.6, zScore("jawCheek", values.jawCheek, calibration)],
    [0.4, zScore("faceRatio", values.faceRatio, calibration)],
  ].filter(([, z]) => finite(z));
  if (!terms.length) return NaN;
  const total = terms.reduce((a, [w]) => a + w, 0);
  return terms.reduce((a, [w, z]) => a + w * z, 0) / total;
}

export function classifyOak(values, t = THRESHOLDS, calibration = CALIBRATION) {
  const score = structureScore(values, calibration);
  if (!finite(score)) return null;
  const key = score >= t.oak ? "structure" : "soft";
  const margin = clamp(Math.abs(score - t.oak) / 0.4);
  return { key, margin, near: margin < NEAR, score, tier: null, detail: { score } };
}

/** One result per frame. Any frame can be null if its values are missing. */
export function classifyAxes(values, t = THRESHOLDS, calibration = CALIBRATION) {
  const axes = {
    sanjeong: classifySanjeong(values, t, calibration),
    ogan: classifyOgan(values, t, calibration),
    oak: classifyOak(values, t, calibration),
  };
  const signature = AXIS_ORDER.map((axis) => axes[axis]?.key ?? "?").join("|");
  return { axes, signature, nearAxes: AXIS_ORDER.filter((axis) => axes[axis]?.near) };
}
