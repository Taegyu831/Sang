// "어떻게 읽나요?": how the app measures, compares and words a reading, in plain words, with a small
// drawing for each step. Shown below the start screen (how-view.js on the big screen, scrolled on the
// phone page). Everything said here has to stay true to the code: when the measuring, the standards or
// the wording change, change this file too. The drawings are illustrations, not a visitor's data.

const INK = "#1f3b30"; const LIME = "#d6f26a"; const SOFT = "#e9f6b6"; const WHITE = "#fcfcf8"; const GREEN = "#3f9a6c"; const SKIN = "#ffdcc2";
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" aria-hidden="true">${body}</svg>`;
const text = (x, y, words, { size = 17, fill = INK, anchor = "middle", weight = 800 } = {}) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${words}</text>`;
const box = (x, y, w, h, fill, r = 16, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
/** A simple face; `turn` slides the features, as a head turned to one side shows them. */
function face(cx, cy, s, { turn = 0, mood = "calm" } = {}) {
  const t = turn * 20;
  const mouth = mood === "smile" ? `M${t - 18} 30 Q${t} 52 ${t + 18} 30` : `M${t - 16} 36 Q${t} 40 ${t + 16} 36`;
  return `<g transform="translate(${cx} ${cy}) scale(${s})"><ellipse rx="62" ry="78" fill="${SKIN}" stroke="${INK}" stroke-width="5"/>
    <g fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"><path d="M${t - 34} -24 q12 -8 24 0 M${t + 10} -24 q12 -8 24 0"/><path d="M${t} -8 q${6 + turn * 8} 20 -4 24"/><path d="${mouth}"/></g>
    <circle cx="${t - 22}" cy="-8" r="5" fill="${INK}"/><circle cx="${t + 22}" cy="-8" r="5" fill="${INK}"/></g>`;
}
/** Dots on rings inside the face: the idea of the points, not their real places. */
function dots(cx, cy) {
  let out = "";
  for (const [ring, count] of [[1, 34], [0.8, 28], [0.6, 20], [0.4, 14], [0.2, 8]]) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + ring;
      out += `<circle class="how-dot" style="--i:${i}" cx="${(cx + Math.cos(a) * 80 * ring).toFixed(1)}" cy="${(cy + Math.sin(a) * 102 * ring).toFixed(1)}" r="3" fill="${INK}"/>`;
    }
  }
  return out;
}
const arrow = (x, y, w = 44) => `<path d="M${x} ${y} h${w} m-14 -12 l14 12 l-14 12" fill="none" stroke="${GREEN}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
const badge = (x, y, ok) => `<circle cx="${x}" cy="${y}" r="17" fill="${ok ? LIME : WHITE}" stroke="${INK}" stroke-width="4"/><path d="${ok ? `M${x - 7} ${y} l5 6 l10 -11` : `M${x - 6} ${y - 6} l12 12 M${x + 6} ${y - 6} l-12 12`}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
const measure = (x1, y1, x2, y2, color) => {
  const flat = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const end = (x, y) => (flat ? `M${x} ${y - 9} v18` : `M${x - 9} ${y} h18`);
  return `<path d="M${x1} ${y1} L${x2} ${y2} ${end(x1, y1)} ${end(x2, y2)}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`;
};

export const HOW_TITLE = "어떻게 읽나요?";
export const HOW_LEAD = "카메라에 비친 얼굴이 풀이 문장이 되기까지, 일곱 걸음이에요.";

export const STEPS = [
  {
    title: "얼굴에 점을 찍어요",
    lines: [
      "카메라 그림에서 얼굴의 점 478곳을 찾아요. 눈꼬리, 콧방울, 입꼬리, 턱선 같은 자리예요.",
      "이 계산은 이 기기 안에서 해요. 촬영 영상은 어디에도 올리지 않아요.",
    ],
    art: () => svg(`<ellipse cx="200" cy="150" rx="92" ry="116" fill="${SKIN}" stroke="${INK}" stroke-width="5"/>${dots(200, 150)}${box(298, 36, 88, 38, LIME, 19)}${text(342, 61, "점 478개")}`),
  },
  {
    title: "바로 세우고, 좋은 순간만 모아요",
    lines: [
      "고개가 돌아가면 길이가 달라 보여요. 고개 각도를 계산해 정면을 본 모습으로 되돌려요.",
      "너무 돌렸거나, 웃거나, 눈을 감은 순간은 빼고 여러 장면의 가운뎃값을 써요. 왼쪽과 오른쪽도 살짝 돌려 달라고 하는 이유예요.",
    ],
    art: () => svg(`${face(88, 112, 0.9, { turn: 1 })}${arrow(176, 112)}${face(308, 112, 0.9)}
      ${[0, 1, 2, 3].map((i) => `${box(40 + i * 84, 214, 68, 62, WHITE, 14, `stroke="${INK}" stroke-width="3"`)}${face(74 + i * 84, 245, 0.28, { turn: i === 2 ? 1.2 : 0, mood: i === 1 ? "smile" : "calm" })}${badge(100 + i * 84, 218, i === 0 || i === 3)}`).join("")}`),
  },
  {
    title: "크기가 아니라 비율을 재요",
    lines: [
      "카메라와의 거리에 따라 크기는 달라지니, 서로 나눈 값을 써요. 예를 들면 코 폭 ÷ 얼굴 폭, 눈 사이 ÷ 눈 길이예요.",
      "이마, 눈, 코, 입, 광대, 턱, 얼굴의 위아래 구간처럼 19가지 항목을 살펴요. 눈썹은 머리카락과 화장에 가려져서 읽지 않아요.",
    ],
    art: () => svg(`<ellipse cx="150" cy="150" rx="94" ry="120" fill="${SKIN}" stroke="${INK}" stroke-width="5"/>
      <g fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"><path d="M104 112 q16 -10 32 0 M164 112 q16 -10 32 0"/><path d="M150 132 q10 34 -2 44"/><path d="M124 214 q26 12 52 0"/></g><circle cx="120" cy="134" r="7" fill="${INK}"/><circle cx="180" cy="134" r="7" fill="${INK}"/>
      ${measure(58, 164, 242, 164, GREEN)}${measure(120, 188, 180, 188, "#e2703a")}
      ${box(262, 98, 126, 40, GREEN, 20)}${text(325, 124, "얼굴 폭", { fill: WHITE })}${box(262, 152, 126, 40, "#e2703a", 20)}${text(325, 178, "코 폭", { fill: WHITE })}${text(325, 230, "코 ÷ 얼굴", { size: 21 })}`),
  },
  {
    title: "평균에서 얼마나 다른지 봐요",
    lines: [
      "항목마다 보통 값과, 사람마다 흔히 벌어지는 한 칸의 크기를 정해 두었어요. 반 칸 안이면 '보통', 벗어날수록 '살짝', 그냥, '꽤'로 나눠요.",
      "지금의 보통 값은 적은 인원의 측정(주요 항목은 7명)과 표준 얼굴로 잡은 임시값이에요. 더 모이면 다시 맞춰요.",
    ],
    art: () => svg(`${box(30, 128, 340, 44, WHITE, 22, `stroke="${INK}" stroke-width="4"`)}${box(150, 132, 100, 36, SOFT, 18)}${box(300, 132, 66, 36, LIME, 18)}
      <path d="M200 110 v18 M200 172 v18" stroke="${INK}" stroke-width="4" stroke-dasharray="6 8"/>${text(200, 100, "보통 값")}${text(200, 156, "보통")}
      ${text(86, 212, "좁은 편", { fill: GREEN })}${text(314, 212, "넓은 편", { fill: GREEN })}
      <g class="how-you"><path d="M322 118 l-12 -22 h24 z" fill="${INK}"/>${box(284, 52, 76, 38, INK, 19)}${text(322, 77, "내 값", { fill: WHITE })}</g>
      ${text(200, 258, "눈에 띄게 다른 곳일수록 먼저 말해요", { size: 16, weight: 700 })}`),
  },
  {
    title: "전통 관상의 풀이와 짝지어요",
    lines: [
      "'넓은 콧방울', '큰 눈'처럼 한쪽으로 기운 곳마다, 사람들이 흔히 말해 온 관상 풀이를 모아 정리해 두었어요.",
      "많이 다르고, 점이 안정적이며, 눈으로 알아보기 쉬운 곳을 앞에 세워요. 가장 앞의 세 곳은 서로 다른 부위에서 골라요.",
    ],
    art: () => svg(`${["큰 눈", "넓은 콧방울", "큰 입"].map((name, i) => `${box(22, 46 + i * 82, 148, 52, WHITE, 26, `stroke="${INK}" stroke-width="4"`)}${text(96, 79 + i * 82, name)}${arrow(188, 72 + i * 82, 34)}${box(244, 46 + i * 82, 138, 52, LIME, 26)}${text(313, 79 + i * 82, ["풍부한 감수성", "재물 그릇", "행동력"][i], { size: 16 })}`).join("")}`),
  },
  {
    title: "성향으로 묶어서 말해요",
    lines: [
      "부위의 풀이를 네 갈래(밀고 나감, 어울림, 감성, 꾸준함)에 더해 보고, 보통보다 가장 두드러진 쪽으로 '어떤 사람'인지 정해요. 일, 사랑, 시기, 인연 이야기가 여기에 맞춰져요.",
      "문장은 미리 써 둔 것을 골라 이어 붙여요. 말투는 몇 가지 중에서 무작위로 골라요. 풀이를 AI가 지어내지 않아요.",
    ],
    art: () => svg(`${[["밀고 나감", 118], ["어울림", 196], ["감성", 150], ["꾸준함", 62]].map(([name, w], i) => `${text(106, 56 + i * 44, name, { anchor: "end" })}${box(122, 38 + i * 44, 240, 24, WHITE, 12)}<rect class="how-bar" style="--i:${i}" x="122" y="${38 + i * 44}" width="${w}" height="24" rx="12" fill="${i === 1 ? LIME : GREEN}"/>`).join("")}
      <path d="M200 216 v24 m-10 -10 l10 10 l10 -10" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${box(66, 248, 268, 42, INK, 21)}${text(200, 275, "사람 사이에서 어울리는 사람", { fill: WHITE })}`),
  },
  {
    title: "이것만은 알아 두세요",
    lines: [
      "관상은 과학으로 확인된 것이 아니에요. 재미와 참고로만 들어 주세요.",
      "나이대와 성별은 풀이를 바꾸지 않아요. 사진과 이름은 저장하지 않고, 얼굴 비율 숫자만 나이대, 성별과 함께 이름 없이 통계로 모아요.",
      "전시 화면의 연인 사진은 직접 고른 경우에만, 얼굴 사진을 AI(OpenAI)에 보내 만들어요.",
    ],
    art: () => svg(`${face(112, 130, 1.05, { mood: "smile" })}
      ${[["얼굴 사진", false], ["이름", false], ["비율 숫자", true]].map(([name, kept], i) => `${box(216, 56 + i * 62, 164, 46, kept ? LIME : WHITE, 23, `stroke="${INK}" stroke-width="3"`)}${text(282, 85 + i * 62, name)}${badge(352, 79 + i * 62, kept)}`).join("")}${text(298, 266, "저장하는 것은 숫자뿐", { size: 16 })}`),
  },
];
