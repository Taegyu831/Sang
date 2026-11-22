// 예외 (the mismatched pair): after the form (오행형) and the frame (삼정), the old text
// looks for the place where two parts that should answer each other do not, and reads
// that place for the area of life and the age it governs.
//
// What the text says (마의상법 십이궁, 육부, as read on sajuforum.com 02 to 09):
//   福德宮  天地相朝, 德行須全五福        forehead and chin face each other
//           頦圓額窄, 須知苦在初年        round chin, narrow forehead: hard early years
//           額闊頦尖, 迍否還從晩景        wide forehead, pointed chin: trouble late in life
//   田宅宮  清秀分明一樣同                the two eyes alike in shape and size
//   六府    兩顴骨 ... 欲其充實相輔, 不欲支離孤露   the two cheekbones support each other
//   相貌宮  若還一處無均等, 好惡中間有改更   one unequal place changes good and bad
// For the eyes and the cheekbones the text only says what is good. It does not say what
// an uneven pair brings, so the sentences below do not invent a result for them.
//
// What is OURS, not the text's (record kept in docs/READING_ENGINE.md, "예외"):
//  1. How far apart is "mismatched": TELL_AT steps (a step is the spread among the measured
//     people, calibration.js; the cheek pair has no measured spread yet, PAIR_CALIBRATION is
//     a guess). Only the most mismatched pair is told, and only past TELL_AT.
//  2. The text's 福德宮 results are softened ("trouble" becomes "slower to open up").
//  3. The 兄弟宮 (two eyebrows) and 中嶽 (nose against the rest) pairs are left out: brows are
//     often hidden by a fringe or drawn on, and the nose needs the depth lab first.
//  4. The 福德宮 pair is the same measurement as the form's forehead and jaw comparison
//     (ohaeng.js). The form only tells the outline; the age reading is told here.
import { zScore, CALIBRATION } from "./calibration.js";
import { foreheadOverJawZ } from "./ohaeng.js";

export const PAIR_RULES = { tellAt: 1.0 };

// ARTIFICIAL. No person has been measured on this yet (see note 1).
export const PAIR_CALIBRATION = {
  cheekAsym: { label: "두 광대 폭 차이", unit: "%", center: 3.0, scale: 2.0, from: "guess" },
};

const finite = Number.isFinite;

/**
 * @returns {{kind: "fortune"|"eyes"|"cheeks"|"balanced", z: number, dir?: "wide"|"narrow"}|null}
 *   null when nothing could be measured.
 */
export function judgePairs(values = {}, calibration = CALIBRATION, rules = PAIR_RULES) {
  const zD = foreheadOverJawZ(values);
  const zEye = zScore("eyeAsym", values.eyeAsym, calibration);
  const zCheek = zScore("cheekAsym", values.cheekAsym, PAIR_CALIBRATION);
  const found = [];
  if (finite(zD)) found.push({ kind: "fortune", z: Math.abs(zD), dir: zD > 0 ? "wide" : "narrow" });
  if (finite(zEye)) found.push({ kind: "eyes", z: zEye });
  if (finite(zCheek)) found.push({ kind: "cheeks", z: zCheek });
  if (!found.length) return null;
  const top = found.sort((a, b) => b.z - a.z)[0];
  return top.z >= rules.tellAt ? top : { kind: "balanced", z: top.z };
}

const em = (text) => `⟦${text}⟧`;

/** The sentence told on the first page after the frame (삼정). */
export function pairLines(pair) {
  if (!pair) return [];
  if (pair.kind === "balanced") {
    return [`이마와 턱, 두 눈, 두 광대처럼 짝을 이루는 부위가 서로 잘 어울려, ${em("짝 부위가 고르게 맞는")} 얼굴입니다. 관상에서는 짝이 어긋나는 곳이 없을수록 일생의 흐름이 한쪽으로 기울지 않는다고 봅니다.`];
  }
  if (pair.kind === "fortune") {
    return pair.dir === "wide"
      ? [`이마는 넓은데 턱은 상대적으로 좁아, 이마와 턱이 서로 마주 보는 짝이 한쪽으로 기운 얼굴입니다. 관상에서는 이런 얼굴을 ${em("말년에 풀리는 속도가 더딜 수 있다")}고 풀이합니다.`]
      : [`이마는 상대적으로 좁은데 턱은 넓고 둥글어, 이마와 턱이 서로 마주 보는 짝이 한쪽으로 기운 얼굴입니다. 관상에서는 이런 얼굴을 ${em("초년에 힘든 시기를 먼저 지나기 쉽다")}고 풀이합니다.`];
  }
  if (pair.kind === "eyes") {
    return [`관상에서는 두 눈의 모양과 크기가 서로 같을수록 좋은 상으로 보는데, 이 얼굴은 ${em("두 눈의 길이 차이")}가 짝 부위 가운데 가장 눈에 띕니다.`];
  }
  return [`관상에서는 두 광대가 서로 받쳐 줄수록 좋은 상으로 보는데, 이 얼굴은 ${em("두 광대의 폭 차이")}가 짝 부위 가운데 가장 눈에 띕니다.`];
}
