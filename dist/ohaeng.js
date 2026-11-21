// 형 (오행형): the first step of the reading. The old text sorts every face into one of
// five forms (木 火 土 金 水) by its outline before it looks at any part. Here the
// outline is read from the front face ratios.
//
// What the text says (마의상법류, as told by the 관상학자 in 투데이신문 2014-02-12;
// 木瘦金方水主肥, 上尖下闊名爲火):
//   木 forehead wide, face long, jaw narrow     火 narrow above, wide below
//   土 squarish with rounded edges               金 forehead and jaw both square
//   水 round all over
// The older school (철관도류) calls a round face 金 where this school calls it 水.
//
// What is OURS, not the text's (record kept in docs/READING_ENGINE.md, "형"):
//  1. The text also uses the body, the voice and the gait. Only the face outline is used.
//  2. The weights in SCORES and TU_BASE are chosen so that the five forms come out at
//     about 16 to 24% each on a random face. The text gives no numbers.
//  3. "Rounded" is not measured directly. The chin tip width (chinWidth) stands in for it.
//  4. Forehead and jaw widths are compared as a difference (every measured face has the
//     forehead wider than the jaw), against FOREHEAD_OVER_JAW below, not as raw widths.
//  5. The sentences about each form's character are from popular readings, not the text.
import { zScore } from "./calibration.js";

export const FOREHEAD_OVER_JAW = { center: 5.31, scale: 2.0 };
export const OHAENG_RULES = { tuBase: 1.6, tuDiffWeight: 0.5, mixWithin: 0.3 };

export const FORMS = {
  wood: {
    name: "목형",
    look: "이마가 넓고 얼굴이 세로로 길며 턱이 좁은 얼굴",
    trait: "착하고 부드럽고 진취적인 면이 있습니다. 한편 쉽게 화를 낼 수 있다는 풀이도 있습니다.",
  },
  fire: {
    name: "화형",
    look: "위쪽이 좁고 아래쪽이 넓은 얼굴",
    trait: "정열적이고 몸 쓰는 것을 좋아합니다. 한편 저돌적일 수 있다는 풀이도 있습니다.",
  },
  earth: {
    name: "토형",
    look: "네모진 듯하면서 가장자리가 둥근 얼굴",
    trait: "판단이 분명하고 믿음직합니다. 한편 때로 고지식하고 답답해 보일 수 있다는 풀이도 있습니다.",
  },
  metal: {
    name: "금형",
    look: "이마와 턱이 모두 네모지게 각이 진 얼굴",
    trait: "규칙적이고 솔선수범하며 리더십이 있습니다. 한편 비관적이거나 독단적이 될 수 있다는 풀이도 있습니다.",
  },
  water: {
    name: "수형",
    look: "전체적으로 둥근 얼굴",
    trait: "사근사근하고 참을성이 많으며 지혜롭습니다. 집중력과 지구력도 강하다고 봅니다. 한편 반대 의견을 내기 좋아한다는 풀이도 있습니다.",
  },
};

const finite = Number.isFinite;
const num = (v) => (finite(v) ? v : 0);

/** The five scores, from z values against the measured people (calibration.js). */
export function ohaengScores(values = {}, calibration, rules = OHAENG_RULES) {
  const zR = zScore("faceRatio", values.faceRatio, calibration);
  const zJ = zScore("jawCheek", values.jawCheek, calibration);
  const zF = zScore("foreheadFace", values.foreheadFace, calibration);
  if (!finite(zR) || !finite(zJ) || !finite(zF)) return null;
  const zC = num(zScore("chinWidth", values.chinWidth, calibration));
  const zD = (values.foreheadFace - values.jawCheek - FOREHEAD_OVER_JAW.center) / FOREHEAD_OVER_JAW.scale;
  return {
    wood: -zR + zD,
    fire: -zD,
    metal: zJ + zF,
    water: zR - zC,
    earth: rules.tuBase - Math.abs(zR) - rules.tuDiffWeight * Math.abs(zD),
  };
}

/** @returns {{id, blend, scores}|null} id is the form, blend the runner up when it is close. */
export function classifyOhaeng(values, calibration, rules = OHAENG_RULES) {
  const scores = ohaengScores(values, calibration, rules);
  if (!scores) return null;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const blend = ranked[0][1] - ranked[1][1] <= rules.mixWithin ? ranked[1][0] : null;
  return { id: ranked[0][0], blend, scores };
}

const em = (text) => `⟦${text}⟧`;

/** The sentences told first, before the frame (삼정) and the parts. */
export function ohaengLines(form) {
  if (!form) return [];
  const f = FORMS[form.id];
  const lines = [`얼굴의 윤곽은 ${f.look}으로, 관상에서 말하는 ${em(f.name)}에 가깝습니다. ${f.trait}`];
  if (form.blend) lines.push(`다만 ${em(FORMS[form.blend].name)}의 모습도 함께 보여, 한 가지 형으로 딱 자르기보다 두 형이 섞인 얼굴로 봅니다.`);
  return lines;
}
