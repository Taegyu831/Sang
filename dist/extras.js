// Sentences from the posed shots (jaw clenched, smiling) and from the iris ruler.
//
// The thresholds below are first guesses: nobody has recorded the clench and
// smile shots yet. Record visitors with ?debug=1 (jawFlex, smileLift are in the
// measurement) and move center and scale to the measured values, as was done
// for CALIBRATION.
import { zScore } from "./calibration.js";
import { judgeSanjeong, sanjeongText } from "./sanjeong.js";
import { classifyOhaeng, ohaengLines } from "./ohaeng.js";
import { ageLines, agePicked, AGE_STAGES } from "./age.js";
import { judgePairs, pairLines } from "./pairs.js";

export const POSED_CALIBRATION = {
  jawFlex: { label: "힘줄 때 턱 폭 변화", unit: "%p", center: 1.0, scale: 1.0, from: "guess" },
  smileLift: { label: "웃을 때 입꼬리 올라감", unit: "%p", center: 4.0, scale: 2.0, from: "guess" },
};

const em = (text) => `⟦${text}⟧`;

/** { lines, stop, frame, form, formLines, ageLines } to add to the story (first page, and the 시기 page for ageLines). */
export function extrasOf(values = {}, parts = [], age = null) {
  const lines = [];
  const lineBasis = []; // the part of the face behind each of those lines
  const dirOf = (key) => parts.find((p) => p.key === key)?.dir ?? "middle";

  const zj = zScore("jawFlex", values.jawFlex, POSED_CALIBRATION);
  if (Number.isFinite(zj)) {
    if (Math.abs(zj) >= 0.8) lineBasis.push(["힘줄 때의 턱선"]);
    if (zj >= 0.8) {
      lines.push(dirOf("jawCheek") === "high"
        ? `각진 턱이 힘을 줄수록 더 뚜렷해집니다. ${em("고집과 끈기")}가 한결 분명한 얼굴입니다.`
        : `평소에는 턱선이 부드럽지만 힘을 주면 각이 서는 턱입니다. 겉은 순해 보여도 마음먹으면 끝까지 밀고 가는 ${em("뒷심")}이 있다고 봅니다.`);
    } else if (zj <= -0.8) {
      lines.push(`턱에 힘을 줘도 선이 거의 달라지지 않습니다. 겉모습 그대로 ${em("한결같은")} 골격의 턱입니다.`);
    }
  }

  const zs = zScore("smileLift", values.smileLift, POSED_CALIBRATION);
  if (Number.isFinite(zs)) {
    if (Math.abs(zs) >= 0.8) lineBasis.push(["웃을 때의 입꼬리"]);
    if (zs >= 0.8) {
      lines.push(dirOf("mouthLift") === "low"
        ? `평소에는 진지해 보이지만 웃으면 입꼬리가 시원하게 올라가 인상이 ${em("확 달라지는")} 사람입니다. 가까워질수록 인기가 따르는 얼굴로 읽습니다.`
        : `웃으면 입꼬리가 시원하게 올라가 인상이 ${em("한층 환해지는")} 얼굴입니다. 사람을 끌어당기는 인기운으로 읽습니다.`);
    } else if (zs <= -0.8) {
      lines.push(`웃어도 입꼬리가 크게 움직이지 않는 절제된 표정입니다. 감정을 ${em("쉽게 드러내지 않는")} 신중한 사람으로 읽습니다.`);
    }
  }

  // The frame (삼정) is told before the parts, so it is kept apart from the posed-shot lines.
  const stop = judgeSanjeong(values);
  const form = classifyOhaeng(values);
  const pair = judgePairs(values);
  const pairBasis = { fortune: ["이마 폭", "턱 폭"], eyes: ["두 눈 길이"], cheeks: ["두 광대 폭"], balanced: ["이마와 턱", "두 눈", "두 광대"] }[pair?.kind] ?? [];
  const stageIds = AGE_STAGES[age]?.ids ?? [];
  const picked = agePicked(parts, age);
  const ageBasis = picked.length ? picked.map((p) => p.part) : [...new Set(parts.filter((p) => stageIds.includes(p.id)).map((p) => p.part))];
  return {
    lines, lineBasis, stop, frame: stop ? [sanjeongText(stop)] : [], frameBasis: ["중정과 하정 길이"],
    form, formLines: ohaengLines(form), formBasis: ["얼굴 폭과 길이", "이마와 턱 폭"],
    pair, pairLines: pairLines(pair), pairBasis,
    ageLines: ageLines(parts, age), ageBasis,
  };
}
