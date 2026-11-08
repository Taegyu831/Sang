// Head pose estimation and frontalization for the face landmarks.
//
// Why this exists
//   The landmark x/y values are a 2D projection. When the head turns (yaw) the
//   horizontal distances shrink by about cos(yaw), and when it nods (pitch) the
//   vertical distances shrink by about cos(pitch). So the same face gives
//   different ratios at different angles. This module estimates the head
//   rotation from the 3D landmarks and rotates the landmarks back to a virtual
//   frontal pose before any ratio is calculated.
//
// Conventions (all points are in pixel units: x = nx * width, y = ny * height,
// z = nz * width, as MediaPipe documents z on roughly the same scale as x)
//   image x: right, image y: down, MediaPipe z: smaller is closer to camera.
//   yaw   > 0 : the face points toward the right side of the (unmirrored) frame.
//   pitch > 0 : the face looks up.
//   roll  > 0 : the head tilts clockwise on the (unmirrored) frame.
//   The sign conventions only matter for display; the correction itself does
//   not depend on them.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const length = (a) => Math.hypot(a.x, a.y, a.z);
const unit = (a) => {
  const l = length(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const addScaled = (acc, v, w) => ({ x: acc.x + v.x * w, y: acc.y + v.y * w, z: acc.z + v.z * w });
const clampUnit = (v) => Math.min(1, Math.max(-1, v));

// Pairs that point from the subject's image-left side to the image-right side.
// Eye corners are weighted higher because they are the most stable landmarks.
const WIDTH_PAIRS = [
  ["eyeLeftOuter", "eyeRightOuter", 2],
  ["eyeLeftInner", "eyeRightInner", 1],
  ["mouthLeft", "mouthRight", 1],
  ["cheekLeft", "cheekRight", 1],
  ["jawLeft", "jawRight", 1],
  ["templeLeft", "templeRight", 1],
  ["faceLeft", "faceRight", 1],
];

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

// Reference frame
//   The face basis built from landmarks is not exactly the camera frame even for
//   a perfectly frontal face (foreheads recede, noses protrude). To make
//   "frontal" mean frontal, the basis is compared with the same basis computed
//   on MediaPipe's canonical face model, which is by definition the straight-on
//   pose. Angles are reported relative to it and the frontalized points are
//   expressed in its axes, so a neutral frontal face keeps the same ratios as
//   the uncorrected measurement and the existing thresholds stay valid.
//   Coordinates (cm, y up, z toward camera) are vertices of
//   canonical_face_model.obj from google/mediapipe (Apache License 2.0).
const CANONICAL_CM = {
  meshTop: [0.000, 8.262, 4.482],
  glabella: [0.000, 3.271, 5.236],
  noseBridge: [0.000, 3.271, 5.236],
  foreheadLeft: [-6.279, 6.615, 1.426],
  foreheadRight: [6.279, 6.615, 1.426],
  chin: [0.000, -9.403, 4.264],
  faceLeft: [-7.664, 0.673, -2.436],
  faceRight: [7.664, 0.673, -2.436],
  templeLeft: [-7.743, 2.365, -2.005],
  templeRight: [7.743, 2.365, -2.005],
  cheekLeft: [-7.542, -1.049, -2.431],
  cheekRight: [7.542, -1.049, -2.431],
  jawLeft: [-5.941, -6.224, -0.631],
  jawRight: [5.941, -6.224, -0.631],
  eyeLeftOuter: [-4.446, 2.664, 3.173],
  eyeLeftInner: [-1.856, 2.585, 3.758],
  eyeRightInner: [1.856, 2.585, 3.758],
  eyeRightOuter: [4.446, 2.664, 3.173],
  noseTip: [0.000, -1.127, 7.476],
  noseBase: [0.000, -2.089, 6.058],
  noseLeft: [-1.406, -1.714, 5.241],
  noseRight: [1.406, -1.714, 5.241],
  upperLip: [0.000, -3.406, 5.980],
  lowerLip: [0.000, -5.365, 5.535],
  mouthLeft: [-2.456, -4.343, 4.284],
  mouthRight: [2.456, -4.343, 4.284],
  // Added 2026-11-08 for the eyebrow, eye opening, lip and chin ratios.
  eyeLeftTop: [-3.177, 2.964, 3.877],
  eyeLeftBottom: [-3.177, 2.294, 3.776],
  eyeRightTop: [3.177, 2.964, 3.877],
  eyeRightBottom: [3.177, 2.294, 3.776],
  upperLipInner: [0.000, -3.994, 5.219],
  lowerLipInner: [0.000, -4.542, 5.405],
  browLeftOuter: [-5.721, 4.255, 2.831],
  browLeftInner: [-1.396, 5.012, 5.316],
  browLeftTop: [-3.987, 5.109, 4.466],
  browRightOuter: [5.721, 4.255, 2.831],
  browRightInner: [1.396, 5.012, 5.316],
  browRightTop: [3.987, 5.109, 4.466],
  chinLeft: [-2.309, -8.974, 3.609],
  chinRight: [2.309, -8.974, 3.609],
};

/** Canonical model in this module's image convention (y down, z negative toward camera). */
export function canonicalPoints(pixelsPerCm = 1) {
  return Object.fromEntries(Object.entries(CANONICAL_CM).map(([name, [x, y, z]]) => [
    name,
    { x: x * pixelsPerCm, y: -y * pixelsPerCm, z: -z * pixelsPerCm },
  ]));
}

/**
 * Estimate the head rotation from named 3D points.
 * Builds an orthonormal face basis: x across the face, y up the face, z out of
 * the face (toward the camera). Several landmark pairs are averaged so that the
 * noisy MediaPipe depth of any single point matters less.
 */
function faceBasis(p) {
  let xSum = { x: 0, y: 0, z: 0 };
  for (const [from, to, weight] of WIDTH_PAIRS) {
    xSum = addScaled(xSum, unit(sub(p[to], p[from])), weight);
  }
  const xAxis = unit(xSum);

  const eyeMid = mid(mid(p.eyeLeftInner, p.eyeRightInner), mid(p.eyeLeftOuter, p.eyeRightOuter));
  const mouthMid = mid(p.mouthLeft, p.mouthRight);
  let upSum = { x: 0, y: 0, z: 0 };
  upSum = addScaled(upSum, unit(sub(p.meshTop, p.chin)), 1);
  upSum = addScaled(upSum, unit(sub(p.glabella, p.noseBase)), 1);
  upSum = addScaled(upSum, unit(sub(eyeMid, mouthMid)), 1);

  // Gram-Schmidt: make "up" exactly perpendicular to "across".
  const zAxis = unit(cross(xAxis, upSum));
  const yAxis = cross(zAxis, xAxis);

  return { x: xAxis, y: yAxis, z: zAxis };
}

const REFERENCE = faceBasis(canonicalPoints());

/**
 * Estimate the head rotation from named 3D points, relative to the canonical
 * straight-on face. Returns the live basis, the reference basis, and angles.
 */
export function estimatePose(p) {
  const live = faceBasis(p);
  const center = {
    x: (p.faceLeft.x + p.faceRight.x + p.meshTop.x + p.chin.x) / 4,
    y: (p.faceLeft.y + p.faceRight.y + p.meshTop.y + p.chin.y) / 4,
    z: (p.faceLeft.z + p.faceRight.z + p.meshTop.z + p.chin.z) / 4,
  };
  // R maps the reference axes onto the live axes: R = sum(live_i * reference_i^T).
  const apply = (v) => {
    const a = dot(v, REFERENCE.x);
    const b = dot(v, REFERENCE.y);
    const c = dot(v, REFERENCE.z);
    return {
      x: live.x.x * a + live.y.x * b + live.z.x * c,
      y: live.x.y * a + live.y.y * b + live.z.y * c,
      z: live.x.z * a + live.y.z * b + live.z.z * c,
    };
  };
  const ex = apply({ x: 1, y: 0, z: 0 });
  const up = apply({ x: 0, y: -1, z: 0 });
  return {
    basis: live,
    reference: REFERENCE,
    center,
    yaw: Math.asin(clampUnit(ex.z)) * DEG,
    pitch: Math.asin(clampUnit(up.z)) * DEG,
    roll: Math.atan2(ex.y, ex.x) * DEG,
  };
}

/**
 * Rotate every named point into the canonical straight-on frame: the view you
 * would get if the person looked straight at the camera with an upright head.
 * Output keeps the image convention (x right, y down, z negative toward the
 * camera) so the existing ratio code can use it unchanged.
 */
export function frontalizePoints(p, pose) {
  const { basis, reference, center } = pose;
  const out = {};
  for (const [name, point] of Object.entries(p)) {
    const d = sub(point, center);
    const a = dot(d, basis.x);
    const b = dot(d, basis.y);
    const c = dot(d, basis.z);
    out[name] = {
      x: reference.x.x * a + reference.y.x * b + reference.z.x * c,
      y: reference.x.y * a + reference.y.y * b + reference.z.y * c,
      z: reference.x.z * a + reference.y.z * b + reference.z.z * c,
    };
  }
  return out;
}

/**
 * Cross-check pose from MediaPipe's own facial transformation matrix
 * (column-major 4x4). Used for debug comparison only. The axis signs of this
 * matrix are not verified against the landmark pose, so compare magnitudes.
 */
export function poseFromMatrix(data) {
  if (!data || data.length < 16) return null;
  const r00 = data[0], r10 = data[1];
  const r11 = data[5];
  const r02 = data[8], r12 = data[9], r22 = data[10];
  return {
    yaw: Math.atan2(r02, r22) * DEG,
    pitch: Math.atan2(-r12, Math.hypot(r02, r22)) * DEG,
    roll: Math.atan2(r10, r11) * DEG,
  };
}

/** How trustworthy a frame is, 0..1, falling off smoothly as the head turns away. */
export function poseWeight(yaw, pitch, yawLimit = 35, pitchLimit = 30) {
  const y = Math.min(1, Math.abs(yaw) / yawLimit);
  const p = Math.min(1, Math.abs(pitch) / pitchLimit);
  return Math.max(0, 1 - y * y) * Math.max(0, 1 - p * p);
}

export const radians = (d) => d * RAD;

// ---------- small statistics helpers used by the debug recorder and tests ----------

export function meanOf(values) {
  const f = values.filter(Number.isFinite);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN;
}

export function stdOf(values) {
  const f = values.filter(Number.isFinite);
  if (f.length < 2) return NaN;
  const m = meanOf(f);
  return Math.sqrt(f.reduce((a, b) => a + (b - m) ** 2, 0) / (f.length - 1));
}

/**
 * Least squares fit  value = c0 + c1 * yaw + c2 * pitch  over recorded frames.
 * c1 and c2 are how much the metric moves per degree of head rotation, so a
 * well corrected metric has slopes close to zero.
 */
export function fitPoseSensitivity(rows, key) {
  const data = rows.filter((r) => Number.isFinite(r[key]) && Number.isFinite(r.yaw) && Number.isFinite(r.pitch));
  if (data.length < 8) return null;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const b = [0, 0, 0];
  for (const r of data) {
    const x = [1, r.yaw, r.pitch];
    for (let i = 0; i < 3; i += 1) {
      b[i] += x[i] * r[key];
      for (let j = 0; j < 3; j += 1) A[i][j] += x[i] * x[j];
    }
  }
  const c = solve3(A, b);
  if (!c) return null;
  const meanY = meanOf(data.map((r) => r[key]));
  let ssRes = 0;
  let ssTot = 0;
  for (const r of data) {
    const predicted = c[0] + c[1] * r.yaw + c[2] * r.pitch;
    ssRes += (r[key] - predicted) ** 2;
    ssTot += (r[key] - meanY) ** 2;
  }
  return {
    intercept: c[0],
    perYaw: c[1],
    perPitch: c[2],
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
    n: data.length,
  };
}

function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 4; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}
