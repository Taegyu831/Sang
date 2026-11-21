// 삼정 (three zones) read the way the old text reads it: by how EQUAL they are.
//
// 마의상법 (as quoted on 사주포럼 and in 대전대 한의학연구소 논문집 21(2), 2013):
//   三停平等, 富貴榮顯, 三停不均, 孤夭貧賤      equal zones are the best sign
//   先觀五嶽盈滿 ... 次辯三停俱等               the frame is looked at before the parts
//   上停長老吉昌, 中停長近君王, 下停長少吉祥    what a long zone is read as
// Before this file the app only asked "is this zone longer than the average of the
// people measured" (parts.js, population relative) and said nothing for a face
// whose zones were equal, which is the case the text values most.
//
// What is OURS here, not the text's (record kept in docs/READING_ENGINE.md):
//  1. EVEN_WITHIN. The text gives no number for "equal". A face counts as equal
//     when its middle and lower zone differ by less than this share of their mean.
//     Measured on the canonical face the gap is -0.06 (lower zone slightly longer),
//     so the band is deliberately wider than that. Move it when real faces are in.
//  2. Only the middle and lower zone are compared. The upper zone starts at the
//     hairline in the text, but the camera sees the mesh top, which sits below
//     the hairline (features.js stopFeatures). The hair model is opt-in (?hair=1).
//     So the text's three-way "equal" is judged on two zones here.
//  3. Softening. The text says unequal zones mean 孤夭貧賤 (lonely, short life,
//     poor). The exhibit does not tell visitors that; an unequal face is told as
//     "that period stands out" in the plain terms of the popular readings.
//  4. 準頭 (nose tip) is cut at the lower edge of the nose, see features.js.

const finite = Number.isFinite;

export const STOP_RULES = {
  // ARTIFICIAL. See note 1 above.
  evenWithin: 0.12,
};

/**
 * @param values pooled measurement (features.js stopMiddle, stopLower in percent)
 * @returns {{state: "even"|"middleLong"|"lowerLong", gap: number, middle: number, lower: number}|null}
 *   gap > 0 when the middle zone is longer than the lower zone, as a share of their mean.
 */
export function judgeSanjeong(values = {}, rules = STOP_RULES) {
  const middle = values.stopMiddle;
  const lower = values.stopLower;
  if (!finite(middle) || !finite(lower) || middle <= 0 || lower <= 0) return null;
  const gap = (middle - lower) / ((middle + lower) / 2);
  const state = Math.abs(gap) <= rules.evenWithin ? "even" : gap > 0 ? "middleLong" : "lowerLong";
  return { state, gap, middle, lower };
}

// ⟦word⟧ is shown bold in the accent colour (see story.js).
const em = (text) => `⟦${text}⟧`;

/** The sentence told on the first page, before the part by part reading. */
export function sanjeongText(stop) {
  if (!stop) return "";
  if (stop.state === "even") {
    return `눈썹에서 코까지(중정)와 코에서 턱까지(하정)의 길이가 고르게 맞아, ${em("삼정의 균형이 잡힌")} 얼굴입니다. 관상에서는 삼정이 고르면 한 시기에 몰리지 않고 일생이 안정되게 흐른다고 풀이합니다.`;
  }
  if (stop.state === "middleLong") {
    return `눈썹에서 코까지(중정)가 코에서 턱까지(하정)보다 길어, 삼정이 한쪽으로 기운 얼굴입니다. 관상에서는 이럴 때 길게 자리한 시기의 힘이 도드라진다고 보고, ${em("중정이 길면 중년의 활동과 윗사람 인연이 두드러진다")}고 풀이합니다.`;
  }
  return `코에서 턱까지(하정)가 눈썹에서 코까지(중정)보다 길어, 삼정이 한쪽으로 기운 얼굴입니다. 관상에서는 이럴 때 길게 자리한 시기의 힘이 도드라진다고 보고, ${em("하정이 길면 말년 쪽에 힘이 실린다")}고 풀이합니다.`;
}

/**
 * The reading of a long zone, as a part in the same shape parts.js gives, so the
 * story can fold it in like any other part (facets.js "thirds.<zone>.high").
 * Nothing for an equal face: it is told by the sentence above.
 */
export function sanjeongParts(stop, rules = STOP_RULES) {
  if (!stop || stop.state === "even") return [];
  const key = stop.state === "middleLong" ? "middleThird" : "lowerThird";
  const name = stop.state === "middleLong" ? "중정이 긴 얼굴" : "하정이 긴 얼굴";
  // z is how far past the band the gap is, in bands (1 at the edge), like a part's steps.
  const z = Math.abs(stop.gap) / rules.evenWithin;
  return [{ id: "thirds", part: "삼정", key, dir: "high", z, reliability: "medium", score: z, name, mine: "", readings: [] }];
}
