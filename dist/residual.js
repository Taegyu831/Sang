// Leftover dependence on head angle after frontalization.
//
// pose.js removes most of the effect of turning and nodding, but a few ratios
// still drift with head angle because the landmark model slides the face
// outline (jaw, forehead, face width) along the surface instead of keeping
// the same anatomical point. The drift is steady and the same in two separate
// recordings, so it is removed with a straight line per ratio.
//
// Source: change per degree of head angle, fitted over frames inside the
// capture range (yaw within 26, pitch within 20) of two recordings of one person
// on 2026-11-07, so values are in the same units as the ratios (percent points,
// multiples, degrees). It has not yet been checked on other faces. Record
// somebody else with ?debug=1: the "per 10 degrees" columns of the "fixed" side
// should stay near zero. ?resid=off turns this off for comparison.
//
// The three thirds keep adding up to 100 (their slopes sum to zero).

export const POSE_RESIDUAL = {
  upperThird: { yaw: 0.007, pitch: -0.071 },
  middleThird: { yaw: -0.024, pitch: -0.057 },
  lowerThird: { yaw: 0.017, pitch: 0.128 },
  noseWidth: { yaw: -0.010, pitch: 0.020 },
  philtrumLower: { yaw: -0.021 },
  jawCheek: { yaw: -0.021, pitch: 0.191 },
  foreheadFace: { yaw: -0.059, pitch: -0.170 },
  faceRatio: { yaw: -0.028, pitch: -0.075 },
  eyeTilt: { yaw: 0.025, pitch: -0.010 },
  mouthLift: { yaw: -0.074, pitch: 0.096 },
};

// Angles beyond these are treated as these, so the straight line is never extrapolated.
export const RESIDUAL_LIMIT = { yaw: 30, pitch: 25 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function applyPoseResidual(values, pose, table = POSE_RESIDUAL, limit = RESIDUAL_LIMIT) {
  const yaw = clamp(pose.yaw, -limit.yaw, limit.yaw);
  const pitch = clamp(pose.pitch, -limit.pitch, limit.pitch);
  const out = { ...values };
  for (const [key, c] of Object.entries(table)) {
    if (Number.isFinite(out[key])) out[key] -= (c.yaw ?? 0) * yaw + (c.pitch ?? 0) * pitch;
  }
  return out;
}
