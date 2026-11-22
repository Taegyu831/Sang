// Front face measurements. Pure functions so they can be tested without a camera.
// Every ratio is computed from points that were already rotated to a straight-on
// view by pose.js, so head turn, nod and tilt do not change the numbers.

export const LANDMARK = {
  meshTop: 10,
  glabella: 168,
  chin: 152,
  // widest face outline, used as the face (cheekbone level) width
  faceLeft: 234,
  faceRight: 454,
  templeLeft: 127,
  templeRight: 356,
  // lower cheek outline, kept for the symmetry score
  cheekLeft: 93,
  cheekRight: 323,
  jawLeft: 172,
  jawRight: 397,
  foreheadLeft: 54,
  foreheadRight: 284,
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
  // eyebrows: outer end, inner end, top of the arch
  browLeftOuter: 70,
  browLeftInner: 107,
  browLeftTop: 105,
  browRightOuter: 300,
  browRightInner: 336,
  browRightTop: 334,
  // chin tip outline, narrower than the jaw points
  chinLeft: 176,
  chinRight: 400,
};

// The iris ring (landmarks 468 to 477, present when the model gives 478 points).
// Left and right ends of each iris, used as a ruler: a human iris is almost the
// same size in everyone (about 11.7 mm across).
export const IRIS_LANDMARK = { irisLeftA: 469, irisLeftB: 471, irisRightA: 474, irisRightB: 476 };
export const IRIS_MM = 11.7;

const finite = Number.isFinite;
export const horizontal = (a, b) => Math.abs(a.x - b.x);
export const vertical = (a, b) => Math.abs(a.y - b.y);
export function mean(...values) {
  const f = values.flat().filter(finite);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN;
}
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const degrees = (r) => r * (180 / Math.PI);

/** Pixel points by name from MediaPipe normalized landmarks. */
export function getPoints(landmarks, width, height) {
  return Object.fromEntries(Object.entries(LANDMARK).map(([name, index]) => {
    const item = landmarks[index];
    return [name, { x: item.x * width, y: item.y * height, z: item.z * width }];
  }).concat(landmarks.length >= 478
    ? Object.entries(IRIS_LANDMARK).map(([name, index]) => [name, { x: landmarks[index].x * width, y: landmarks[index].y * height, z: landmarks[index].z * width }])
    : []));
}

// Positive when the outer corner sits higher than the inner corner.
function signedEyeTilt(outer, inner) {
  return degrees(Math.atan2(inner.y - outer.y, Math.abs(inner.x - outer.x)));
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// How far the top of the brow rises above the straight line from its inner
// to its outer end, as a share of the brow length (0 = straight brow).
function browArch(outer, inner, top) {
  const t = (top.x - outer.x) / ((inner.x - outer.x) || 1);
  const lineY = outer.y + t * (inner.y - outer.y);
  return ((lineY - top.y) / Math.max(1e-6, distance(outer, inner))) * 100;
}

// How unequal the two cheekbone sides are: the face outline at its widest (the cheekbone
// level), left and right of the midline drawn through the brow centre and the chin tip,
// as a percent of their sum. 0 is an even pair.
function cheekAsymmetry(p) {
  const midX = mean(p.glabella.x, p.chin.x);
  const left = midX - p.faceLeft.x;
  const right = p.faceRight.x - midX;
  const sum = left + right;
  return finite(sum) && sum > 0 ? (Math.abs(left - right) / sum) * 100 : NaN;
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
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cheekBalance = Math.abs(dist(p.cheekLeft, p.noseTip) - dist(p.cheekRight, p.noseTip)) / faceWidth;
  const penalty = eyeWidthDiff * 0.22 + eyeLevelDiff * 2.4 * 0.16 + noseOffset * 2.8 * 0.19 + mouthOffset * 2.5 * 0.16 + chinOffset * 2.5 * 0.14 + cheekBalance * 1.8 * 0.13;
  return clamp(100 - penalty * 100, 0, 100);
}

const BROW_POINTS = ["browLeftOuter", "browLeftInner", "browLeftTop", "browRightOuter", "browRightInner", "browRightTop"];

/**
 * 삼정 cut the way the old text cuts it: 自髮際至眉 (hairline to brow),
 * 眉至準頭 (brow to nose), 準頭至地閣 (nose to chin tip). The earlier thirds in
 * this file (upperThird, middleThird, lowerThird) cut at the glabella instead
 * and are kept only for the part cards and the recorded history.
 *
 * Choices that are ours, not the text's (see docs/READING_ENGINE.md, "삼정"):
 *  - the brow line is the mean height of the six brow points;
 *  - 準頭 is the nose tip point (noseTip), as the text says (2026-11-22: it was
 *    the lower edge of the nose before). The lower-edge version is still kept,
 *    as stopMidLowBase, so the two cuts can be compared on real data;
 *  - the top is still the mesh top, not the hairline, so stopUpper is short by
 *    the hair gap and is not used to judge equality (sanjeong.js).
 * Units: shares in percent of mesh top to chin; stopMidLow and stopMidLowBase are
 * multiples (middle zone over lower zone).
 */
export function stopFeatures(p) {
  if (!BROW_POINTS.every((name) => p[name]) || !p.meshTop || !p.noseBase || !p.noseTip || !p.chin) return {};
  const browY = mean(BROW_POINTS.map((name) => p[name].y));
  const total = p.chin.y - p.meshTop.y;
  const upper = browY - p.meshTop.y;
  const middle = p.noseTip.y - browY;
  const lower = p.chin.y - p.noseTip.y;
  const middleBase = p.noseBase.y - browY;
  const lowerBase = p.chin.y - p.noseBase.y;
  if (![total, upper, middle, lower, middleBase, lowerBase].every((v) => finite(v) && v > 0)) return {};
  return {
    stopUpper: (upper / total) * 100,
    stopMiddle: (middle / total) * 100,
    stopLower: (lower / total) * 100,
    stopMidLow: middle / lower,
    stopMidLowBase: middleBase / lowerBase,
  };
}

/**
 * All ratios used by the readings, from straight-on points.
 * Units: thirds, noseWidth, philtrumLower, jawCheek, foreheadFace, faceRatio,
 * mouthLift, depths are percent; eye spaces and noseEyeGap, mouthNose are
 * multiples; eyeTilt is degrees (positive = outer corner higher).
 */
export function computeFrontFeatures(p) {
  const faceHeight = vertical(p.meshTop, p.chin);
  const faceWidth = horizontal(p.faceLeft, p.faceRight);
  const jawWidth = horizontal(p.jawLeft, p.jawRight);
  const foreheadWidth = horizontal(p.foreheadLeft, p.foreheadRight);
  const leftEyeWidth = horizontal(p.eyeLeftOuter, p.eyeLeftInner);
  const rightEyeWidth = horizontal(p.eyeRightInner, p.eyeRightOuter);
  const averageEyeWidth = mean(leftEyeWidth, rightEyeWidth);
  const upperPx = vertical(p.meshTop, p.glabella);
  const middlePx = vertical(p.glabella, p.noseBase);
  const lowerPx = vertical(p.noseBase, p.chin);
  const thirdsTotal = upperPx + middlePx + lowerPx;
  const noseWidth = horizontal(p.noseLeft, p.noseRight);
  const mouthWidth = horizontal(p.mouthLeft, p.mouthRight);
  const eyeGapPx = horizontal(p.eyeLeftInner, p.eyeRightInner);
  const philtrumPx = vertical(p.noseBase, p.upperLip);
  const mouthCenterY = mean(p.upperLip.y, p.lowerLip.y);
  const cornerY = mean(p.mouthLeft.y, p.mouthRight.y);
  const cheekPlaneZ = mean(p.cheekLeft.z, p.cheekRight.z);
  const outerLeft = horizontal(p.templeLeft, p.eyeLeftOuter) / averageEyeWidth;
  const outerRight = horizontal(p.eyeRightOuter, p.templeRight) / averageEyeWidth;
  const eyeGap = eyeGapPx / averageEyeWidth;
  return {
    upperThird: (upperPx / thirdsTotal) * 100,
    middleThird: (middlePx / thirdsTotal) * 100,
    lowerThird: (lowerPx / thirdsTotal) * 100,
    ...stopFeatures(p),
    outerLeft,
    leftEye: leftEyeWidth / averageEyeWidth,
    eyeGap,
    rightEye: rightEyeWidth / averageEyeWidth,
    outerRight,
    // Equal weight mean of the three spaces (left outer, between the eyes, right outer).
    openMeasure: mean(outerLeft, eyeGap, outerRight),
    noseWidth: (noseWidth / faceWidth) * 100,
    noseEyeGap: noseWidth / Math.max(1, eyeGapPx),
    philtrumLower: (philtrumPx / Math.max(1, lowerPx)) * 100,
    mouthNose: mouthWidth / Math.max(1, noseWidth),
    jawCheek: (jawWidth / faceWidth) * 100,
    foreheadFace: (foreheadWidth / faceWidth) * 100,
    faceRatio: (faceWidth / faceHeight) * 100,
    eyeTilt: mean(signedEyeTilt(p.eyeLeftOuter, p.eyeLeftInner), signedEyeTilt(p.eyeRightOuter, p.eyeRightInner)),
    mouthLift: ((mouthCenterY - cornerY) / Math.max(1, mouthWidth)) * 100,
    noseDepth: ((cheekPlaneZ - p.noseTip.z) / faceWidth) * 100,
    bridgeDepth: ((cheekPlaneZ - p.noseBridge.z) / faceWidth) * 100,
    chinDepth: ((cheekPlaneZ - p.chin.z) / faceWidth) * 100,
    symmetry: calculateSymmetry(p, faceWidth, faceHeight, leftEyeWidth, rightEyeWidth),
    cheekAsym: cheekAsymmetry(p),
    ...detailFeatures(p, { faceWidth, faceHeight, jawWidth, averageEyeWidth, leftEyeWidth, rightEyeWidth, mouthWidth, eyeGapPx }),
    faceHeightPx: faceHeight,
    ...sizeFeatures(p, { faceWidth, faceHeight, averageEyeWidth, mouthWidth, noseWidth }),
  };
}

/** Real sizes in millimetres, from the iris ruler (empty when there are no iris points). */
function sizeFeatures(p, m) {
  if (!(p.irisLeftA && p.irisLeftB && p.irisRightA && p.irisRightB)) return {};
  const iris = mean(horizontal(p.irisLeftA, p.irisLeftB), horizontal(p.irisRightA, p.irisRightB));
  if (!(iris > 0)) return {};
  const mm = IRIS_MM / iris;
  return {
    faceWidthMm: m.faceWidth * mm,
    faceHeightMm: m.faceHeight * mm,
    eyeWidthMm: m.averageEyeWidth * mm,
    noseWidthMm: m.noseWidth * mm,
    mouthWidthMm: m.mouthWidth * mm,
  };
}

/**
 * Part-level ratios added for the part cards (2026-11-08). Each one is a
 * comparison a visitor can picture, inside their own face.
 */
function detailFeatures(p, m) {
  const safe = (v) => (Number.isFinite(v) ? v : NaN);
  const out = {};
  // Eyebrows. Brow length is compared with the eye, the classic "眉長過目" rule.
  if (p.browLeftOuter && p.browLeftInner && p.browRightOuter && p.browRightInner) {
    const leftBrow = distance(p.browLeftOuter, p.browLeftInner);
    const rightBrow = distance(p.browRightOuter, p.browRightInner);
    out.browLength = safe(mean(leftBrow, rightBrow) / m.averageEyeWidth);
    // Positive when the brow tail sits higher than the brow head.
    out.browTilt = safe(mean(signedEyeTilt(p.browLeftOuter, p.browLeftInner), signedEyeTilt(p.browRightOuter, p.browRightInner)));
    if (p.browLeftTop && p.browRightTop) {
      out.browArch = safe(mean(browArch(p.browLeftOuter, p.browLeftInner, p.browLeftTop), browArch(p.browRightOuter, p.browRightInner, p.browRightTop)));
      // Brow to eye distance (전택궁), as a share of the face length.
      out.browEyeGap = safe((mean(vertical(p.browLeftTop, p.eyeLeftTop), vertical(p.browRightTop, p.eyeRightTop)) / m.faceHeight) * 100);
    }
    // Space between the brow heads (미간, 명궁), in eye widths.
    out.browInnerGap = safe(horizontal(p.browLeftInner, p.browRightInner) / m.averageEyeWidth);
  }
  // Eyes.
  out.eyeSize = safe((m.averageEyeWidth / m.faceWidth) * 100);
  out.eyeOpen = safe(mean(vertical(p.eyeLeftTop, p.eyeLeftBottom) / m.leftEyeWidth, vertical(p.eyeRightTop, p.eyeRightBottom) / m.rightEyeWidth));
  out.eyeAsym = safe((Math.abs(m.leftEyeWidth - m.rightEyeWidth) / m.averageEyeWidth) * 100);
  // Mouth and lips.
  out.mouthFace = safe((m.mouthWidth / m.faceWidth) * 100);
  // Mouth width against the distance between the eye centres (about the pupils):
  // above 1 the mouth corners reach past a line dropped from the pupils.
  const eyeCentreGap = horizontal(
    { x: mean(p.eyeLeftOuter.x, p.eyeLeftInner.x) },
    { x: mean(p.eyeRightOuter.x, p.eyeRightInner.x) },
  );
  out.mouthPupil = safe(m.mouthWidth / Math.max(1e-6, eyeCentreGap));
  if (p.upperLipInner && p.lowerLipInner) {
    const upper = vertical(p.upperLip, p.upperLipInner);
    const lower = vertical(p.lowerLipInner, p.lowerLip);
    out.lipFull = safe(((upper + lower) / m.mouthWidth) * 100);
    out.lipRatio = safe(upper / Math.max(1e-6, lower));
  }
  // Chin tip against the jaw, and the face width against the upper face (fWHR).
  if (p.chinLeft && p.chinRight) out.chinWidth = safe((horizontal(p.chinLeft, p.chinRight) / m.jawWidth) * 100);
  out.fwhr = safe(m.faceWidth / Math.max(1e-6, vertical(p.glabella, p.upperLip)));
  return out;
}
