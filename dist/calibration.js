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

// from: "people" (2026-11-08): the centre is the mean of the first three real
// recordings (?debug=1, pose-corrected, inside the capture range). On real faces
// the canonical mesh was off in the same direction for most ratios (nose width
// 18% vs 26%, mouth 32% vs 37% of the face ...). Thirds keep the canonical centre,
// which matched. Scales are still first guesses; set them from more people.
export const CALIBRATION = {
  upperThird: { label: "상정 비율", unit: "%", digits: 1, center: 28.3, scale: 3.0, reliability: "low" },
  middleThird: { label: "중정 비율", unit: "%", digits: 1, center: 30.3, scale: 2.5, reliability: "medium" },
  lowerThird: { label: "하정 비율", unit: "%", digits: 1, center: 41.4, scale: 3.5, reliability: "medium" },
  openMeasure: { label: "오안 세 여백 평균", unit: "배", digits: 2, center: 1.12, scale: 0.12, reliability: "medium", from: "people" },
  eyeGap: { label: "눈 사이", unit: "배", digits: 2, center: 1.48, scale: 0.14, reliability: "high", from: "people" },
  noseWidth: { label: "코 너비 / 얼굴 너비", unit: "%", digits: 1, center: 25.94, scale: 1.6, reliability: "high", from: "people" },
  noseEyeGap: { label: "코 너비 / 눈 사이", unit: "배", digits: 2, center: 0.93, scale: 0.1, reliability: "high", from: "people" },
  mouthNose: { label: "입 너비 / 코 너비", unit: "배", digits: 2, center: 1.45, scale: 0.18, reliability: "medium", from: "people" },
  philtrumLower: { label: "인중 / 하정", unit: "%", digits: 1, center: 23.05, scale: 2.5, reliability: "medium", from: "people" },
  jawCheek: { label: "턱 너비 / 광대 너비", unit: "%", digits: 1, center: 81.52, scale: 4.0, reliability: "medium", from: "people" },
  foreheadFace: { label: "이마 너비 / 광대 너비", unit: "%", digits: 1, center: 86.45, scale: 4.0, reliability: "low", from: "people" },
  faceRatio: { label: "광대 너비 / 얼굴 길이", unit: "%", digits: 1, center: 81.97, scale: 5.0, reliability: "medium", from: "people" },
  eyeTilt: { label: "눈꼬리 기울기", unit: "°", digits: 1, center: 3.59, scale: 3.0, reliability: "low", from: "people" },
  mouthLift: { label: "입꼬리 높이", unit: "%", digits: 1, center: 1.34, scale: 1.5, reliability: "low", from: "people" },
  symmetry: { label: "좌우 상대 균형", unit: "점", digits: 1, center: 97.98, scale: 4.0, reliability: "medium", from: "people" },
  // Part-level ratios (2026-11-08). Centres are the canonical face (tests/canonical-values.html);
  // scales are first guesses until visitor recordings exist.
  browLength: { label: "눈썹 길이 / 눈 길이", unit: "배", digits: 2, center: 1.66, scale: 0.15, reliability: "medium", from: "people" },
  browTilt: { label: "눈썹 기울기", unit: "°", digits: 1, center: -11.84, scale: 4.0, reliability: "low", from: "people" },
  browArch: { label: "눈썹 휘어짐", unit: "%", digits: 1, center: 15.96, scale: 3.0, reliability: "low", from: "people" },
  browEyeGap: { label: "눈썹과 눈 사이 / 얼굴 길이", unit: "%", digits: 1, center: 13.16, scale: 1.5, reliability: "low", from: "people" },
  browInnerGap: { label: "미간 / 눈 길이", unit: "배", digits: 2, center: 1.22, scale: 0.12, reliability: "medium", from: "people" },
  eyeSize: { label: "눈 길이 / 얼굴 폭", unit: "%", digits: 1, center: 18.8, scale: 1.2, reliability: "high", from: "people" },
  eyeOpen: { label: "눈 높이 / 눈 길이", unit: "배", digits: 2, center: 0.27, scale: 0.04, reliability: "low", from: "people" },
  eyeAsym: { label: "두 눈 길이 차이", unit: "%", digits: 1, center: 2.4, scale: 4, reliability: "medium", from: "people" },
  mouthFace: { label: "입 폭 / 얼굴 폭", unit: "%", digits: 1, center: 37.65, scale: 2.5, reliability: "medium", from: "people" },
  mouthPupil: { label: "입 폭 / 두 눈 중심 사이", unit: "배", digits: 2, center: 0.8, scale: 0.07, reliability: "medium", from: "people" },
  lipFull: { label: "입술 두께 / 입 폭", unit: "%", digits: 1, center: 31.29, scale: 5, reliability: "low", from: "people" },
  lipRatio: { label: "윗입술 / 아랫입술", unit: "배", digits: 2, center: 0.78, scale: 0.15, reliability: "low", from: "people" },
  chinWidth: { label: "턱끝 폭 / 턱 폭", unit: "%", digits: 1, center: 42.19, scale: 5, reliability: "medium", from: "people" },
  fwhr: { label: "광대 폭 / 위쪽 얼굴 높이", unit: "배", digits: 2, center: 2.07, scale: 0.15, reliability: "medium", from: "people" },
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
