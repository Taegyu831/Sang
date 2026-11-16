// What each reading says, split by what it is about, so a region can be told as
// one connected paragraph instead of a stack of separate lines.
//
//   traits   성격과 기질      work    일과 재물     people  사람과 가정
//   early / mid / late        초년, 중년, 말년      caution 조심할 점
//
// Every entry is a short noun phrase so entries from different parts join
// cleanly ("예민함, 집중력, 감수성이 읽힙니다"). Written from the same
// collected readings as the summaries in parts.json; keys are "<card>.<dir>",
// or "<card>.<key>.<dir>" for cards that measure several things.
export const FACETS = {
  "forehead.high": { traits: ["지적임", "넓은 대인관계", "강한 생활력"], work: ["학업과 출세운"], early: ["부모의 덕"], caution: ["이상만 좇는 경향"] },
  "forehead.low": { traits: ["판단력", "깊은 정", "한 분야에 깊이 집중하는 성향"], early: ["부모의 도움이 적은 어린 시절"] },
  "thirds.upperThird.high": { work: ["학업운"], early: ["부모 복", "든든한 바탕"], caution: ["다소 부족한 현실 감각"] },
  "thirds.upperThird.low": { traits: ["풍부한 감성", "예체능 감각"], early: ["고르지 않은 운"], late: ["스스로 여는 길"] },
  "thirds.middleThird.high": { work: ["활발한 사회 활동", "이른 자리 잡기"], mid: ["힘이 실리는 운"] },
  "thirds.middleThird.low": { mid: ["어려움을 겪을 수 있는 운"], early: ["더 두드러지는 초년의 풀이"], late: ["더 두드러지는 말년의 풀이"] },
  "thirds.lowerThird.high": { traits: ["강한 인내심", "뛰어난 공감 능력"], late: ["안정된 노후", "든든한 뒷심"] },
  "thirds.lowerThird.low": { traits: ["순발력", "빠른 결정", "사교성"], caution: ["약한 인내심", "아랫사람을 이끄는 힘의 부족"] },
  "eyeGap.high": { traits: ["넓은 마음", "사람을 받아 주는 너그러움", "느긋함"], work: ["복이 많은 재물운"], caution: ["돈을 헤프게 쓰는 버릇"] },
  "eyeGap.low": { traits: ["예민한 감정", "집중력", "섬세함", "눈앞의 일을 먼저 챙기는 성향"], caution: ["부부 사이의 다툼"] },
  "eyeSize.high": { traits: ["풍부한 감수성", "솔직한 표현", "사교성"], caution: ["빨리 내는 싫증", "유혹에 약한 면"] },
  "eyeSize.low": { traits: ["이성적인 판단", "신중함", "끈기", "대기만성의 기질"], people: ["적게 사귀고 깊이 사귀는 관계"] },
  "eyeOpen.high": { traits: ["명랑함", "예리한 감각", "따뜻함"], caution: ["분위기에 약한 면"] },
  "eyeOpen.low": { traits: ["진중함", "강한 책임감", "통찰력"], people: ["좁고 깊은 인간관계"] },
  "eyeTilt.high": { traits: ["강한 자존심", "의지", "승부욕", "실행력"], caution: ["남과 부딪히기 쉬운 성격"] },
  "eyeTilt.low": { traits: ["많은 정", "온화함", "깊은 배려심"], people: ["좋은 결혼운과 인덕"], caution: ["거절하지 못해 보는 손해"] },
  "eyeAsym.high": { traits: ["재치"], people: ["고르지 않은 부모운과 부부운"], caution: ["겉과 속이 다를 수 있는 면"] },
  "noseWidth.high": { traits: ["일을 주도하는 실천력"], work: ["재물을 담는 큰 그릇", "경제 감각"] },
  "noseWidth.low": { traits: ["뛰어난 자기 관리"], work: ["재물이 새기 쉬운 흐름"], caution: ["경제적인 소심함"] },
  "noseLength.high": { traits: ["강한 자존심과 책임감", "기품", "한 우물을 파는 성향"], caution: ["적은 융통성", "보수적인 태도"] },
  "noseLength.low": { traits: ["융통성", "용기", "몸으로 하는 부지런함"], work: ["재물이 모이기 어려운 흐름"] },
  "mouthFace.high": { traits: ["대담함", "행동력", "결단력"], work: ["큰일을 벌이는 리더십", "좋은 재물운과 장래성"] },
  "mouthFace.low": { traits: ["여린 마음", "신중함", "꼼꼼함", "성실함", "창의력과 예술성"] },
  "lipFull.high": { traits: ["깊은 애정", "넉넉한 정", "꾸준한 노력"], work: ["풍족한 생활"] },
  "lipFull.low": { traits: ["명랑함", "순발력", "논리력", "말솜씨"], caution: ["차갑고 타산적인 면"] },
  "lipRatio.high": { traits: ["깊은 애정", "감수성", "풍부한 언어 능력"], caution: ["감정에 앞서는 오지랖"] },
  "lipRatio.low": { traits: ["욕구에 충실한 태도", "좋은 건강"], caution: ["강한 방어심"] },
  "mouthLift.high": { traits: ["낙천성", "사교성"], people: ["많은 인기"], work: ["복을 담는 운"], caution: ["사치와 유혹"] },
  "mouthLift.low": { traits: ["강한 신념", "신중함", "진지함"], caution: ["복을 놓치게 하는 고집"] },
  "philtrum.high": { traits: ["강한 인내심", "느긋함"], work: ["재복"], late: ["안정된 노후", "자식복", "장수"] },
  "philtrum.low": { traits: ["활발함", "애교", "호기심"], caution: ["앞서는 말과 행동", "쉽게 내는 싫증"] },
  "cheek.high": { traits: ["야망", "추진력", "강한 자립심"], people: ["강한 기"], caution: ["줄어드는 부부 사이의 타협"] },
  "cheek.low": { traits: ["온순함", "실질적인 태도", "조화로운 인상"] },
  "jaw.high": { traits: ["강한 의지", "인내심", "목표를 끝까지 이루는 성실함"], late: ["든든한 말년운", "아랫사람 복"], caution: ["센 고집"] },
  "jaw.low": { traits: ["정열", "날렵한 인상"], late: ["턱이 받쳐 주는 힘이 덜한 말년"] },
  "chin.high": { traits: ["깊은 배려심", "친절함"], late: ["안정된 노후", "아랫사람 복"] },
  "chin.low": { traits: ["열정", "목표 지향성", "리더의 기질"], people: ["불안할 수 있는 애정운"], late: ["불안할 수 있는 노후"] },
  "symmetry.high": { traits: ["안정된 마음", "일관성"] },
  "symmetry.low": { traits: ["성격의 기복"], people: ["고르지 않은 부모운"] },
};

export function facetsOf(part) {
  return FACETS[`${part.id}.${part.key}.${part.dir}`] ?? FACETS[`${part.id}.${part.dir}`] ?? null;
}

// How each reading leans on four axes (+ or -, 2 is strong) and how it looks on
// a face. The axes are what the whole-person story is built from:
//   drive  주도(+) 신중(-)     social 사교(+) 내향(-)
//   feel   감성(+) 이성(-)     steady 꾸준(+) 순발(-)
export const AXES = {
  "forehead.high": { social: 1, feel: -1 },
  "forehead.low": { steady: 1, feel: 1, social: -1 },
  "thirds.upperThird.low": { feel: 1, drive: 1 },
  "thirds.middleThird.high": { drive: 1, social: 1 },
  "thirds.lowerThird.high": { steady: 2, feel: 1 },
  "thirds.lowerThird.low": { steady: -2, social: 1 },
  "eyeGap.high": { social: 1, steady: 1 },
  "eyeGap.low": { feel: 2, drive: -1 },
  "eyeSize.high": { feel: 2, social: 2 },
  "eyeSize.low": { feel: -2, drive: -1, steady: 2, social: -1 },
  "eyeOpen.high": { social: 1, feel: 1 },
  "eyeOpen.low": { drive: -1, steady: 1, social: -1 },
  "eyeTilt.high": { drive: 2 },
  "eyeTilt.low": { feel: 2, social: 1, drive: -1 },
  "noseWidth.high": { drive: 2 },
  "noseWidth.low": { drive: -1, steady: 1 },
  "noseLength.high": { steady: 2, drive: -1 },
  "noseLength.low": { steady: -1, drive: 1 },
  "mouthFace.high": { drive: 2, social: 1 },
  "mouthFace.low": { drive: -2, steady: 1 },
  "lipFull.high": { feel: 2, steady: 1 },
  "lipFull.low": { feel: -2, social: 1, steady: -1 },
  "lipRatio.high": { feel: 2, social: 1 },
  "mouthLift.high": { social: 2 },
  "mouthLift.low": { drive: -1, steady: 1 },
  "philtrum.high": { steady: 2 },
  "philtrum.low": { steady: -2, social: 1 },
  "cheek.high": { drive: 2 },
  "cheek.low": { drive: -1 },
  "jaw.high": { drive: 1, steady: 2 },
  "jaw.low": { feel: 1 },
  "chin.high": { feel: 1, social: 1, steady: 1 },
  "chin.low": { drive: 2 },
  "symmetry.high": { steady: 1 },
};

export const LOOKS = {
  "forehead.high": "넓은 이마", "forehead.low": "좁은 이마",
  "thirds.upperThird.high": "긴 상정", "thirds.upperThird.low": "짧은 상정",
  "thirds.middleThird.high": "긴 중정", "thirds.middleThird.low": "짧은 중정",
  "thirds.lowerThird.high": "긴 하정", "thirds.lowerThird.low": "짧은 하정",
  "eyeGap.high": "먼 눈 사이", "eyeGap.low": "가까운 눈 사이",
  "eyeSize.high": "큰 눈", "eyeSize.low": "작은 눈",
  "eyeOpen.high": "동그랗게 열린 눈", "eyeOpen.low": "가늘고 긴 눈",
  "eyeTilt.high": "올라간 눈꼬리", "eyeTilt.low": "처진 눈꼬리",
  "eyeAsym.high": "크기가 다른 두 눈",
  "noseWidth.high": "넓은 콧방울", "noseWidth.low": "좁은 콧방울",
  "noseLength.high": "긴 코", "noseLength.low": "짧은 코",
  "mouthFace.high": "큰 입", "mouthFace.low": "작은 입",
  "lipFull.high": "도톰한 입술", "lipFull.low": "얇은 입술",
  "lipRatio.high": "도톰한 윗입술", "lipRatio.low": "도톰한 아랫입술",
  "mouthLift.high": "올라간 입꼬리", "mouthLift.low": "처진 입꼬리",
  "philtrum.high": "긴 인중", "philtrum.low": "짧은 인중",
  "cheek.high": "발달한 광대", "cheek.low": "도드라지지 않은 광대",
  "jaw.high": "넓고 각진 턱", "jaw.low": "갸름한 턱",
  "chin.high": "둥글고 넓은 턱끝", "chin.low": "뾰족한 턱끝",
  "symmetry.high": "좌우가 고른 얼굴", "symmetry.low": "좌우 차이가 있는 얼굴",
};

export function entryKey(part) {
  const long = `${part.id}.${part.key}.${part.dir}`;
  return long in FACETS ? long : `${part.id}.${part.dir}`;
}
