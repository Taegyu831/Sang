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
};

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
  }));
}

// Positive when the outer corner sits higher than the inner corner.
function signedEyeTilt(outer, inner) {
  return degrees(Math.atan2(inner.y - outer.y, Math.abs(inner.x - outer.x)));
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
    faceHeightPx: faceHeight,
  };
}
