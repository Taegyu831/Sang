// Typical values and spread for every ratio, in one place.
//
// `center` is the value measured on MediaPipe's canonical (average) face with
// the same landmarks, so a typical face reads as "typical". `scale` is a first
// guess of one step of normal variation between people. Both are starting
// points: record real visitors with ?debug=1 and adjust here.
//
// Why not the old 33.3% / 1.0 / 76-87% bands: the mesh top is below the real
// hairline, so the canonical face has thirds of 28 / 30 / 41 percent, and the
// five-eye spaces average 1.33 of an eye width with these landmarks. Fixed
// textbook values would read the average face as "long lower third" and
// "wide-set eyes".
//
// reliability: how far the landmark behind the number can be trusted.
//   high   inner face points, stable under head turn
//   medium contour points or ratios that depend on the estimated mesh top
//   low    estimated or expression-sensitive values

export const CALIBRATION = {
  upperThird: { label: "상정 비율", unit: "%", digits: 1, center: 28.3, scale: 3.0, reliability: "low" },
  middleThird: { label: "중정 비율", unit: "%", digits: 1, center: 30.3, scale: 2.5, reliability: "medium" },
  lowerThird: { label: "하정 비율", unit: "%", digits: 1, center: 41.4, scale: 3.5, reliability: "medium" },
  openMeasure: { label: "오안 세 여백 평균", unit: "배", digits: 2, center: 1.33, scale: 0.12, reliability: "medium" },
  eyeGap: { label: "눈 사이", unit: "배", digits: 2, center: 1.43, scale: 0.14, reliability: "high" },
  noseWidth: { label: "코 너비 / 얼굴 너비", unit: "%", digits: 1, center: 18.3, scale: 1.6, reliability: "high" },
  noseEyeGap: { label: "코 너비 / 눈 사이", unit: "배", digits: 2, center: 0.76, scale: 0.1, reliability: "high" },
  mouthNose: { label: "입 너비 / 코 너비", unit: "배", digits: 2, center: 1.75, scale: 0.18, reliability: "medium" },
  philtrumLower: { label: "인중 / 하정", unit: "%", digits: 1, center: 18.0, scale: 2.5, reliability: "medium" },
  jawCheek: { label: "턱 너비 / 광대 너비", unit: "%", digits: 1, center: 77.5, scale: 4.0, reliability: "medium" },
  foreheadFace: { label: "이마 너비 / 광대 너비", unit: "%", digits: 1, center: 81.9, scale: 4.0, reliability: "low" },
  faceRatio: { label: "광대 너비 / 얼굴 길이", unit: "%", digits: 1, center: 86.8, scale: 5.0, reliability: "medium" },
  eyeTilt: { label: "눈꼬리 기울기", unit: "°", digits: 1, center: 1.7, scale: 3.0, reliability: "low" },
  mouthLift: { label: "입꼬리 높이", unit: "%", digits: 1, center: 0.9, scale: 1.5, reliability: "low" },
  symmetry: { label: "좌우 상대 균형", unit: "점", digits: 1, center: 93, scale: 4.0, reliability: "medium" },
};

export const RELIABILITY_WEIGHT = { high: 1, medium: 0.75, low: 0.5 };

/** How many typical steps a value is away from the typical face. */
export function zScore(key, value, calibration = CALIBRATION) {
  const c = calibration[key];
  if (!c || !Number.isFinite(value)) return NaN;
  return (value - c.center) / c.scale;
}

export function formatValue(key, value, calibration = CALIBRATION) {
  const c = calibration[key];
  if (!Number.isFinite(value)) return "측정 제외";
  const digits = c?.digits ?? 1;
  return `${value.toFixed(digits)}${c?.unit ?? ""}`;
}
