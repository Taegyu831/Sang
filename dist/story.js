// The whole-person reading: one story told in connected pages.
//
//   이 사람은 ... 합니다, 그리고 ... 합니다, 그래서 ... 합니다.
//
// Every part that leans away from the average adds its readings (facets.js).
// The readings are folded into four axes, the strongest two axes name the kind
// of person, and that kind decides which people fit and which clash. Nothing
// here calls a service; the sentences are written in advance and chosen by the
// measurements.
import { FACETS, AXES, LOOKS, entryKey } from "./facets.js";
import { josa } from "./parts.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const STRONG = 1.2;

const POLES = {
  "drive+": {
    adn: "앞에 서서 밀고 나가는", conn: "앞에 서서 밀고 나가며",
    work: "맡은 일을 먼저 잡아 끌고 가며 자기 자리를 만드는 쪽입니다.",
    love: "마음을 정하면 먼저 다가가는 편입니다.",
    stage: "젊은 시기부터 일에서 힘을 쓰는 쪽입니다.",
    watch: "남의 속도를 기다려 주지 못하는 순간",
  },
  "drive-": {
    adn: "한 걸음 물러서서 살피는", conn: "한 걸음 물러서서 살피며",
    work: "서두르지 않고 준비를 마친 뒤 움직여 실수가 적은 쪽입니다.",
    love: "천천히 다가가 한번 마음을 주면 오래 가는 편입니다.",
    stage: "뒤로 갈수록 쌓은 것이 힘이 되는 쪽입니다.",
    watch: "결정을 미루다 때를 놓치는 일",
  },
  "social+": {
    adn: "사람 사이에서 환하게 어울리는", conn: "사람 사이에서 환하게 어울리며",
    work: "사람을 통해 일이 풀리고, 소개와 인연으로 기회가 오는 쪽입니다.",
    love: "분위기를 이끌어 인연이 끊이지 않는 편입니다.",
    stage: "어느 시기든 주변 사람이 도움이 되는 쪽입니다.",
    watch: "넓은 관계 속에서 마음을 쓰다 지치는 일",
  },
  "social-": {
    adn: "적게 사귀고 깊게 아끼는", conn: "적게 사귀고 깊게 아끼며",
    work: "혼자 깊이 파고드는 일에서 성과를 내는 쪽입니다.",
    love: "많은 사람보다 한 사람과 오래 깊어지는 편입니다.",
    stage: "나이 들수록 가까운 사람이 큰 힘이 되는 쪽입니다.",
    watch: "속마음을 말하지 않아 생기는 오해",
  },
  "feel+": {
    adn: "마음이 먼저 움직이는", conn: "마음이 먼저 움직이며",
    work: "감각과 공감이 필요한 일에서 빛나는 쪽입니다.",
    love: "정이 깊고 표현이 솔직해 애정에 마음을 쏟는 편입니다.",
    stage: "마음 쓰는 일이 인생의 흐름을 크게 좌우하는 쪽입니다.",
    watch: "분위기와 감정에 휩쓸리는 순간",
  },
  "feel-": {
    adn: "머리로 따져 보고 움직이는", conn: "머리로 따져 보고 움직이며",
    work: "분석과 판단이 필요한 일에서 믿음을 얻는 쪽입니다.",
    love: "감정보다 조건과 맞음을 따져 신중하게 만나는 편입니다.",
    stage: "나이가 들수록 판단이 안정되는 쪽입니다.",
    watch: "차갑게 보여 오해받는 일",
  },
  "steady+": {
    adn: "오래 두고 꾸준히 가는", conn: "오래 두고 꾸준히 가며",
    work: "한 가지를 오래 붙들어 끝내 이루는 쪽입니다.",
    love: "서두르지 않고 오래 지켜 가는 편입니다.",
    stage: "뒤로 갈수록 든든해지는 쪽입니다.",
    watch: "바꿔야 할 때 고집으로 굳는 일",
  },
  "steady-": {
    adn: "빠르게 판단하고 움직이는", conn: "빠르게 판단하고 움직이며",
    work: "상황 변화에 빠르게 맞춰 기회를 잡는 쪽입니다.",
    love: "인연이 빨리 시작되지만 쉽게 식을 수 있는 편입니다.",
    stage: "젊은 시기에 힘이 앞서는 쪽입니다.",
    watch: "싫증이 먼저 오는 순간",
  },
};

const EVEN = {
  adn: "한쪽으로 치우치지 않고 고르게 어울리는", conn: "한쪽으로 치우치지 않고 고르게 어울리며",
  work: "어느 한쪽으로 쏠리지 않아 상황에 맞춰 역할을 바꾸는 쪽입니다.",
  love: "상대에 맞춰 속도를 조절하며 만나는 편입니다.",
  stage: "한 시기에 몰리지 않고 고르게 흘러가는 쪽입니다.",
  watch: "",
};

// Who fits and who clashes with each kind. "to" is the kind of person described.
const FIT = {
  "drive+": { to: "drive-", desc: "한 걸음 물러서서 살피는", why: "앞으로 나가는 속도를 받아 주면서 빠진 곳을 챙겨 주니, 한쪽이 달리고 한쪽이 받치는 조합이 됩니다." },
  "drive-": { to: "drive+", desc: "앞에서 끌어 주는", why: "망설이는 순간에 방향을 잡아 주니, 신중함이 실행으로 이어지는 조합이 됩니다." },
  "social+": { to: "social-", desc: "말을 끝까지 들어 주는 차분한", why: "많이 말하고 많이 나누는 쪽을 깊게 받아 주니, 이야기가 이어지는 조합이 됩니다." },
  "social-": { to: "social+", desc: "먼저 말을 걸어 주는 환한", why: "마음을 여는 데 시간이 걸리는 쪽에 문을 열어 주니, 관계가 조용히 깊어지는 조합이 됩니다." },
  "feel+": { to: "feel-", desc: "감정을 차분히 받아 주는 이성적인", why: "마음이 크게 움직일 때 중심을 잡아 주니, 정이 흔들림 없이 이어지는 조합이 됩니다." },
  "feel-": { to: "feel+", desc: "속마음을 열어 보여 주는 따뜻한", why: "따져 보느라 표현이 늦는 쪽에 온기를 더해 주니, 머리와 마음이 짝이 되는 조합이 됩니다." },
  "steady+": { to: "steady-", desc: "분위기를 가볍게 바꿔 주는 빠른", why: "한 길만 가기 쉬운 쪽에 새 바람을 넣어 주니, 굳기 쉬운 곳이 풀리는 조합이 됩니다." },
  "steady-": { to: "steady+", desc: "끝까지 붙들어 주는 꾸준한", why: "싫증이 오기 전에 마무리를 맡아 주니, 시작과 끝이 이어지는 조합이 됩니다." },
};
const CLASH = {
  "drive+": { to: "drive+", desc: "똑같이 앞서려는", why: "서로 양보하지 않아 작은 일에도 주도권 다툼이 생기기 쉽습니다." },
  "drive-": { to: "steady-", desc: "결정을 재촉하는 급한", why: "충분히 살핀 뒤 움직이려는 속도를 몰아붙이면 마음이 닫힙니다." },
  "social+": { to: "social+", desc: "똑같이 말이 많은", why: "서로 말하느라 들어 주는 사람이 없어, 마음 깊은 이야기는 놓치기 쉽습니다." },
  "social-": { to: "drive+", desc: "속도를 밀어붙이는 강한", why: "속마음을 꺼낼 시간을 주지 않으면 말없이 거리를 두게 됩니다." },
  "feel+": { to: "feel+", desc: "감정을 크게 쏟아 내는", why: "서로의 감정에 번갈아 흔들려 작은 다툼이 크게 번지기 쉽습니다." },
  "feel-": { to: "feel-", desc: "똑같이 따지기부터 하는", why: "속마음이 끝내 나오지 않아 서로 차갑다고 느끼기 쉽습니다." },
  "steady+": { to: "steady+", desc: "똑같이 고집이 센", why: "한번 정한 것을 서로 굽히지 않아 평행선이 길어집니다." },
  "steady-": { to: "steady-", desc: "똑같이 싫증이 빠른", why: "시작은 즐거워도 마무리를 맡을 사람이 없어 흐지부지되기 쉽습니다." },
};
const EVEN_FIT = { to: null, desc: "한 가지 색이 분명한", why: "고르게 균형 잡힌 사람은 대체로 누구와도 어울리지만, 뚜렷한 색을 가진 사람이 곁에 있을 때 자신의 색도 또렷해집니다." };
const EVEN_CLASH = { to: null, desc: "한쪽으로 몰아붙이는", why: "고르게 받아 주는 성격을 이용해 일방적으로 끌고 가려는 사람 앞에서는 지치기 쉽습니다." };

const SHORT = {
  "drive+": "앞장서는 사람", "drive-": "차분히 살피는 사람",
  "social+": "환하게 어울리는 사람", "social-": "깊게 아끼는 사람",
  "feel+": "마음이 앞서는 사람", "feel-": "침착하게 따지는 사람",
  "steady+": "꾸준히 가는 사람", "steady-": "빠르게 움직이는 사람",
};

/** The imagined 인연: who they are in a few lines (`to` is a kind of person). */
function bondOf(kind, entry, even) {
  if (!entry.to) {
    return {
      kind, to: null,
      name: kind === "fit" ? "한 가지 색이 분명한 사람" : "한쪽으로 몰아붙이는 사람",
      lines: [kind === "fit"
        ? "연애 · 자기 색이 분명해 곁에서 기준이 되어 주는 편입니다."
        : "연애 · 한쪽으로 끌고 가려는 편이라, 맞춰 주기만 하면 지치기 쉽습니다."],
    };
  }
  const p = POLES[entry.to];
  return { kind, to: entry.to, name: SHORT[entry.to], lines: [`연애 · ${p.love}`, `일 · ${p.work}`] };
}

const AXIS_NAMES = ["drive", "social", "feel", "steady"];

/** Looks (face features) that carry a kind of person most strongly. */
export function looksOf(pole, limit = 3) {
  const axis = pole.slice(0, -1);
  const sign = pole.endsWith("+") ? 1 : -1;
  return Object.entries(AXES)
    .map(([key, axes]) => [key, (axes[axis] ?? 0) * sign])
    .filter(([key, v]) => v > 0 && LOOKS[key])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => LOOKS[key]);
}

function gather(entries, field, limit) {
  const seen = new Set();
  const items = [];
  const basis = [];
  for (const { part, facets } of entries) {
    const list = facets[field] ?? [];
    if (!list.length) continue;
    basis.push(part.part);
    for (const item of list) if (!seen.has(item)) { seen.add(item); items.push(item); }
  }
  return { items: items.slice(0, limit), basis: [...new Set(basis)] };
}

/** Which kinds of person this face leans toward, strongest first. */
export function leanings(entries) {
  const score = Object.fromEntries(AXIS_NAMES.map((a) => [a, 0]));
  for (const { part, key } of entries) {
    const weight = clamp(Math.abs(part.z), 0.6, 2.5);
    for (const [axis, value] of Object.entries(AXES[key] ?? {})) score[axis] += weight * value;
  }
  return Object.entries(score)
    .filter(([, v]) => Math.abs(v) >= STRONG)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([axis, v]) => `${axis}${v > 0 ? "+" : "-"}`);
}

// ⟦word⟧ is shown bold in the accent colour, ⟪word⟫ bold in ink (see the app).
const em = (text) => `⟦${text}⟧`;
const strong = (text) => `⟪${text}⟫`;
// Only the first three are marked, so a long list keeps a rhythm.
const list = (items) => items.map((x, i) => (i < 3 ? em(x) : x)).join(", ");

// An entry pulls against the kind of person the face mostly is when it leans
// the other way on one of the two main axes. Its readings are told as "한편".
function opposes(key, poles) {
  const axes = AXES[key] ?? {};
  return poles.some((pole) => {
    const axis = pole.slice(0, -1);
    const sign = pole.endsWith("+") ? 1 : -1;
    return (axes[axis] ?? 0) * sign <= -1;
  });
}

/**
 * @param parts   every card read for this face (parts.all)
 * @param shape   { name, text } from classifyFaceShape, or null
 * @returns       { headline, pages: [{ title, lead, body: [], basis: [] }], closing }
 *                pages[0] is the first page; the closing page is built by the app.
 */
export function composeStory(parts, shape, extras = { lines: [], size: null }) {
  const entries = parts
    .filter((p) => p.dir !== "middle" && p.id !== "faceShape")
    .map((part) => ({ part, key: entryKey(part), facets: FACETS[entryKey(part)] }))
    .filter((e) => e.facets);

  const poles = leanings(entries).slice(0, 2);
  const [a, b] = poles.map((p) => POLES[p]);
  const main = a ?? EVEN;
  const headline = b ? `${em(a.conn)}, ${em(b.adn)} 사람입니다.` : `${em(main.adn)} 사람입니다.`;

  // 1. who this is
  const aligned = entries.filter((e) => !opposes(e.key, poles));
  const against = entries.filter((e) => opposes(e.key, poles));
  const traits = gather(aligned.length ? aligned : entries, "traits", 7);
  const first = { title: "이 사람은", lead: `이 사람은 ${headline}`, body: [], basis: traits.basis };
  if (shape) first.body.push((shape.text.match(/[^.]+\.\s*/g)?.slice(0, 2).join("").trim() ?? "").replace(shape.name, em(shape.name)));
  if (traits.items.length) first.body.push(`성격으로는 ${josa(list(traits.items), "이", "가")} 함께 두드러집니다.`);
  const other = aligned.length ? gather(against, "traits", 3) : { items: [], basis: [] };
  if (other.items.length) {
    first.body.push(`한편 ${list(other.items)} 같은 면도 함께 읽혀, 한 가지로만 단정하기 어려운 사람입니다.`);
    first.basis = [...new Set([...first.basis, ...other.basis])];
  }

  for (const line of extras.lines ?? []) first.body.push(line);
  if (extras.size) first.body.push(extras.size);

  // 2. work and money
  const work = gather(entries, "work", 5);
  const second = { title: "일과 재물", lead: `그리고 일과 재물에서는 ${main.work}`, body: [], basis: work.basis };
  const leak = gather(entries, "workMinus", 3);
  if (work.items.length) second.body.push(`${josa(list(work.items), "을", "를")} 꼽는 풀이가 이 얼굴에 모입니다.`);
  if (leak.items.length) {
    second.body.push(work.items.length
      ? `다만 ${josa(list(leak.items), "이라는", "라는")} 풀이도 함께 있어, 들어온 것을 지키는 관리가 관건입니다.`
      : `${josa(list(leak.items), "이라는", "라는")} 풀이가 있어, 들어온 것을 지키는 관리가 관건입니다.`);
    second.basis = [...new Set([...second.basis, ...leak.basis])];
  }
  if (b) second.body.push(`여기에 ${b.work}`);

  // 3. people and love
  const people = gather(entries, "people", 5);
  const third = { title: "사람과 사랑", lead: `이어서 사람과 사랑에서는 ${main.love}`, body: [], basis: people.basis };
  const peopleMinus = gather(entries, "peopleMinus", 3);
  if (people.items.length) third.body.push(`${josa(list(people.items), "이", "가")} 거론되는 얼굴입니다.`);
  if (peopleMinus.items.length) {
    third.body.push(`${people.items.length ? "한편으로는 " : ""}${josa(list(peopleMinus.items), "이라는", "라는")} 풀이도 있습니다.`);
    third.basis = [...new Set([...third.basis, ...peopleMinus.basis])];
  }
  if (b) third.body.push(`이와 함께 ${b.love}`);

  // 4. the life stages, together
  const early = gather(entries, "early", 4);
  const mid = gather(entries, "mid", 4);
  const late = gather(entries, "late", 4);
  const stages = [["초년", early], ["중년", mid], ["말년", late]].filter(([, g]) => g.items.length);
  const fourth = { title: "시기", lead: `그러다 보면 시기로는 ${main.stage}`, body: [], basis: [...new Set([...early.basis, ...mid.basis, ...late.basis])] };
  for (const [label, g] of stages) fourth.body.push(`${strong(label)}에는 ${list(g.items)}에 관한 풀이가 모입니다.`);
  for (const [label, field] of [["초년", "earlyMinus"], ["중년", "midMinus"], ["말년", "lateMinus"]]) {
    const g = gather(entries, field, 3);
    if (!g.items.length) continue;
    fourth.body.push(`하지만 ${strong(label)}에는 ${josa(list(g.items), "이라는", "라는")} 풀이도 있습니다.`);
    fourth.basis = [...new Set([...fourth.basis, ...g.basis])];
  }
  if (b) fourth.body.push(`아울러 ${b.stage}`);

  // 5. who fits
  const fits = (poles.length ? poles.map((p) => FIT[p]) : [EVEN_FIT]);
  const fifth = { title: "잘 맞는 인연", bond: bondOf("fit", fits[0]), lead: `그래서 잘 맞는 인연은 ${em(fits[0].desc)} 사람입니다.`, body: [fits[0].why], basis: [] };
  const fitLooks = fits[0].to ? looksOf(fits[0].to) : [];
  if (fitLooks.length) fifth.body.push(`관상으로는 ${list(fitLooks)} 쪽에서 이런 성향이 주로 읽힙니다.`);
  if (fits[1]) fifth.body.push(`이에 더해 ${em(fits[1].desc)} 사람과도 잘 어울립니다. ${fits[1].why}`);

  // 6. who to avoid, and what to watch in oneself
  const clashes = (poles.length ? poles.map((p) => CLASH[p]) : [EVEN_CLASH]);
  const cautions = gather(entries, "caution", 6);
  const watch = poles.map((p) => POLES[p].watch).filter(Boolean);
  const sixth = { title: "조심할 인연", bond: bondOf("clash", clashes[0]), lead: `다만 ${em(clashes[0].desc)} 사람과는 부딪히기 쉽습니다.`, body: [clashes[0].why], basis: cautions.basis };
  const clashLooks = clashes[0].to ? looksOf(clashes[0].to) : [];
  if (clashLooks.length) sixth.body.push(`관상으로는 ${list(clashLooks)} 쪽에서 이런 성향이 주로 읽힙니다.`);
  if (clashes[1]) sixth.body.push(`${em(clashes[1].desc)} 사람 앞에서도 마찬가지입니다. ${clashes[1].why}`);
  const own = [...cautions.items, ...watch].slice(0, 6);
  if (own.length) sixth.body.push(`스스로는 ${josa(list(own), "은", "는")} 조심하라는 풀이가 있습니다.`);

  // closing
  const fitText = em(fits[0].desc);
  const clashText = em(clashes[0].desc);
  const closing = `정리하면 ${headline.replace(/입니다\.$/, "입니다.")} ${fitText} 사람과 가장 잘 맞고, ${clashText} 사람과는 거리를 두면 좋습니다.`;

  return { headline, poles, pages: [first, second, third, fourth, fifth, sixth], closing };
}
