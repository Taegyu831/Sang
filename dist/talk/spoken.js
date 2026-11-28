// What the character says, in the voice "~분으로 보여요 → ~을 보니 ~할 수 있어요 → 그래서 ~".
// The substance comes from the app's own readings (facets, the kinds of person, who fits); this file
// only turns it into speech.
// ARTIFICIAL: every sentence frame below is written for this prototype, and so are the pieces of
// advice ("그래서 ..."), which are built around the readings' own cautions. For the team to review.
import { readParts, classifyFaceShape } from "../parts.js";
import { composeStory, sayingsOf } from "../story.js";
import { extrasOf } from "../extras.js";
import { facetsOf } from "../facets.js";

export const TOPICS = [
  { id: "self", ask: "나는 어떤 사람?", note: "성격" },
  { id: "work", ask: "일이랑 돈", note: "일과 재물" },
  { id: "love", ask: "사람과 사랑", note: "사람과 사랑" },
  { id: "time", ask: "내 때는 언제?", note: "시기" },
  { id: "bond", ask: "잘 맞는 사람", note: "인연" },
];

/** The particle that fits the last syllable: josa("코", "을", "를") → "코를". */
export function josa(word, withFinal, without) {
  const code = word.trim().replace(/[)\]'"⟦⟧]+$/, "").charCodeAt(word.trim().replace(/[)\]'"⟦⟧]+$/, "").length - 1) - 0xac00;
  return `${word}${code >= 0 && code % 28 === 0 ? without : withFinal}`;
}
const mark = (text) => `⟦${text}⟧`;
const ENDINGS = [[/쪽입니다\./g, "쪽으로 보여요."], [/편입니다\./g, "편으로 보여요."], [/됩니다\./g, "돼요."], [/쉽습니다\./g, "쉬워요."], [/닫힙니다\./g, "닫혀요."], [/길어집니다\./g, "길어져요."], [/또렷해집니다\./g, "또렷해져요."]];
export const soften = (text) => ENDINGS.reduce((t, [from, to]) => t.replace(from, to), text);

/** Everything needed to answer any question about one face. */
export function readingFor(values, age, content) {
  const parts = readParts(values, content);
  const extras = extrasOf(values, parts.all, age);
  const story = composeStory(parts.all, classifyFaceShape(values), extras, { alone: true });
  // The standing-out parts first; only parts that lean one way have readings of their own.
  const read = [...parts.top, ...parts.rest].filter((p) => p.dir !== "middle").map((p) => ({ name: p.name, part: p.part, facets: facetsOf(p) })).filter((p) => p.facets);
  return { read, say: sayingsOf(story.poles), poles: story.poles, headline: story.headline };
}

/** Parts that have something for these fields, with what they say there. */
function pick(read, fields, count, used) {
  const out = [];
  for (const p of read) {
    const items = [...new Set(fields.flatMap((f) => p.facets[f] ?? []))].filter((i) => !used.has(i));
    if (!items.length) continue;
    items.slice(0, 2).forEach((i) => used.add(i));
    out.push({ ...p, items: items.slice(0, 2) });
    if (out.length === count) break;
  }
  return out;
}
// ARTIFICIAL: several wordings for the same thing, so that visitors with similar faces do not hear
// the same sentences. Only the wording differs: what is said, how carefully it is said ("~수 있어요",
// "~보여요") and the order of the ⟦marked⟧ words stay the same, because the notebook keeps those words.
export const FRAMES = {
  self: [
    (who, x) => `${who}님은 ${x} 분으로 보여요.`,
    (who, x) => `제가 보기에 ${who}님은 ${x} 분 같아요.`,
    (who, x) => `한마디로 ${who}님은 ${x} 분으로 읽혀요.`,
    (who, x) => `첫눈에 ${who}님은 ${x} 분처럼 보여요.`,
  ],
  work: [
    (who, s) => `${who}님은 일에서는 ${s}`,
    (who, s) => `일 쪽을 보면, ${who}님은 ${s}`,
    (who, s) => `일하는 모습을 그려 보면, ${who}님은 ${s}`,
    (who, s) => `먼저 일 이야기예요. ${who}님은 ${s}`,
  ],
  love: [
    (who, s) => `${who}님은 사랑에서는 ${s}`,
    (who, s) => `사랑 쪽을 보면, ${who}님은 ${s}`,
    (who, s) => `사람 만나는 모습을 보면, ${who}님은 ${s}`,
    (who, s) => `마음 이야기를 해 볼게요. ${who}님은 ${s}`,
  ],
  time: [
    (who, s) => `${who}님은 흐름으로 보면 ${s}`,
    (who, s) => `시기를 짚어 보면, ${who}님은 ${s}`,
    (who, s) => `${who}님의 흐름은요, ${s}`,
    (who, s) => `길게 놓고 보면, ${who}님은 ${s}`,
  ],
  /** "코를 보니": how a part is brought up. */
  seen: [
    (n) => `${josa(n, "을", "를")} 보니`,
    (n) => `${josa(n, "을", "를")} 살펴보니`,
    (n) => `${josa(n, "을", "를")} 보면`,
    (n) => `${n} 쪽을 짚어 보면`,
  ],
  also: ["또", "그리고", "여기에", "하나 더,"],
  but: ["다만", "한 가지,", "그런데", "그래도"],
  one: [
    (a) => `${a} 같은 면이 있을 수 있어요.`,
    (a) => `${josa(a, "이", "가")} 보일 수 있어요.`,
    (a) => `${josa(a, "이", "가")} 느껴질 수 있어요.`,
    (a) => `${josa(a, "이", "가")} 있는 편일 수 있어요.`,
  ],
  two: [
    (a, b) => `${a} 같은 면이 있을 수 있고, ${b} 쪽으로 기우는 경향이 있을 수 있어요.`,
    (a, b) => `${josa(a, "과", "와")} ${josa(b, "이", "가")} 함께 보일 수 있어요.`,
    (a, b) => `${a} 같은 면과 더불어 ${josa(b, "이", "가")} 있을 수 있어요.`,
    (a, b) => `${a}도, ${b}도 엿보일 수 있어요.`,
  ],
  minus: [
    (a) => `${josa(a, "은", "는")} 조금 살펴볼 필요가 있어 보여요.`,
    (a) => `${josa(a, "은", "는")} 한 번쯤 챙겨 보면 좋겠어요.`,
    (a) => `${josa(a, "은", "는")} 마음에 담아 두면 좋을 수 있어요.`,
    (a) => `${josa(a, "은", "는")} 조금 신경 써 두면 좋아 보여요.`,
  ],
  // advice sentences start with 그래서 or 그러니: the page sets them apart by that word
  watch: [
    (x) => `그래서 ${x}만 한 번씩 살펴 주면 좋을 수 있어요.`,
    (x) => `그러니 ${x}만 가끔 돌아보면 좋을 수 있어요.`,
    (x) => `그래서 ${x}만큼은 미리 챙겨 두면 좋을 수 있어요.`,
    (x) => `그러니 ${x} 하나만 기억해 두면 좋을 수 있어요.`,
  ],
  balance: [
    () => "그래서 지금의 균형을 편하게 지켜 가면 좋을 수 있어요.",
    () => "그러니 지금처럼 고르게 가도 좋을 수 있어요.",
    () => "그래서 내 속도를 믿고 가면 좋을 수 있어요.",
  ],
  strength: [
    (a) => `그래서 ${josa(a, "을", "를")} 살릴 수 있는 자리를 고르면 좋을 수 있어요.`,
    (a) => `그러니 ${josa(a, "을", "를")} 쓸 기회가 많은 쪽을 눈여겨보면 좋을 수 있어요.`,
    (a) => `그래서 ${josa(a, "이", "가")} 통하는 일을 찾아보면 좋을 수 있어요.`,
    (a) => `그러니 ${josa(a, "을", "를")} 앞세워 보면 좋을 수 있어요.`,
  ],
  ownWay: [
    () => "그래서 내 방식이 통하는 자리를 고르면 좋을 수 있어요.",
    () => "그러니 내 방식대로 해 볼 수 있는 곳을 찾으면 좋을 수 있어요.",
  ],
  pace: [
    () => "그래서 상대의 속도도 함께 살피면 좋을 수 있어요.",
    () => "그러니 상대의 걸음에도 한 번 맞춰 보면 좋을 수 있어요.",
  ],
  period: [
    (label, a) => `${label}에는 ${josa(a, "이", "가")} 따를 수 있어요.`,
    (label, a) => `${label}에 ${josa(a, "이", "가")} 찾아올 수 있어요.`,
    (label, a) => `${label}에는 ${josa(a, "이", "가")} 보일 수 있어요.`,
    (label, a) => `${label}에 ${josa(a, "이", "가")} 함께할 수 있어요.`,
  ],
  evenTime: [
    () => "어느 한 시기에 크게 몰리지 않고 고르게 흘러갈 수 있어요.",
    () => "특별히 한 때에 쏠리기보다 두루 이어질 수 있어요.",
  ],
  build: [
    () => "그래서 지금 할 수 있는 것부터 차근차근 쌓아 두면 좋을 수 있어요.",
    () => "그러니 때를 기다리며 오늘 할 일을 쌓아 두면 좋을 수 있어요.",
    () => "그래서 서두르기보다 하나씩 준비해 두면 좋을 수 있어요.",
    () => "그러니 지금의 작은 준비를 이어 가면 좋을 수 있어요.",
  ],
  fit: [
    (who, x) => `${who}님은 ${x} 사람과 잘 맞는 분으로 보여요.`,
    (who, x) => `${who}님 곁에는 ${x} 사람이 잘 어울려 보여요.`,
    (who, x) => `${who}님과 합이 좋아 보이는 건 ${x} 사람이에요.`,
    (who, x) => `${who}님은 ${x} 사람을 만나면 잘 맞을 수 있어요.`,
  ],
  clash: [
    (x, why) => `반대로 ${x} 사람과는 부딪힐 수 있어요. ${why}`,
    (x, why) => `한편 ${x} 사람과는 삐걱거릴 수 있어요. ${why}`,
    (x, why) => `조심할 쪽도 있어요. ${x} 사람과는 엇갈릴 수 있어요. ${why}`,
  ],
  start: [
    () => "그래서 처음에는 서로의 속도부터 맞춰 보면 좋을 수 있어요.",
    () => "그러니 초반에는 서로의 걸음을 천천히 맞춰 보면 좋을 수 있어요.",
    () => "그래서 만나면 서로 편한 빠르기를 먼저 찾아보면 좋을 수 있어요.",
  ],
};
/** One of a list, not the same one again until all were used (per reading, so per visitor). */
export function draw(reading, key, list, random = Math.random) {
  const bags = (reading.bags ??= {});
  if (!bags[key]?.length) bags[key] = [...list];
  return bags[key].splice(Math.min(bags[key].length - 1, Math.floor(random() * bags[key].length)), 1)[0];
}

/** The answer to one topic: sentences to say, and a few words for the notebook. */
export function answer(reading, topic, who, random = Math.random) {
  const { read, say } = reading;
  const used = new Set();
  const lines = [];
  const frame = (key, ...args) => draw(reading, key, FRAMES[key], random)(...args);
  const word = (key) => draw(reading, key, FRAMES[key], random);
  const seen = (p) => frame("seen", mark(p.name).replace(/^⟦(?:살짝 |꽤 )/, "⟦"));
  /** One or two things read from a part. */
  const told = (p, k) => {
    const [a, b] = p.items;
    const lead = k ? `${word("also")} ` : "";
    return `${lead}${seen(p)} ${b ? frame("two", mark(a), mark(b)) : frame("one", mark(a))}`;
  };
  const minus = (p) => `${word("but")} ${seen(p)} ${frame("minus", mark(p.items[0]))}`;
  const caution = () => {
    const c = pick(read, ["caution"], 1, used)[0];
    const what = c?.items[0] ?? say.watch;
    return what ? frame("watch", mark(what)) : frame("balance");
  };
  const body = (fields, minusFields, from = read) => {
    const plus = pick(from, fields, 2, used);
    plus.forEach((p, i) => lines.push(told(p, i)));
    const low = minusFields ? pick(from, minusFields, 1, used)[0] : null;
    if (low) lines.push(minus(low));
    return plus.length + (low ? 1 : 0);
  };
  if (topic === "self") {
    lines.push(frame("self", who, mark(say.adn)));
    body(["traits"]);
    lines.push(caution());
  } else if (topic === "work") {
    lines.push(frame("work", who, soften(say.work)));
    if (!body(["work"], ["workMinus"])) body(["traits"]);
    const strength = [...used][0];
    lines.push(strength ? frame("strength", mark(strength)) : frame("ownWay"));
  } else if (topic === "love") {
    lines.push(frame("love", who, soften(say.love)));
    // Without anything about people the temperament is told, from other parts than the first topic uses.
    if (!body(["people"], ["peopleMinus"])) body(["traits"], null, read.length > 3 ? read.slice(2) : read);
    lines.push(say.watch ? frame("watch", mark(say.watch)) : frame("pace"));
  } else if (topic === "time") {
    lines.push(frame("time", who, soften(say.stage)));
    let any = 0;
    for (const [label, field] of [["젊을 때", "early"], ["중년", "mid"], ["나중", "late"]]) {
      const p = pick(read, [field], 1, used)[0];
      if (!p) continue;
      any += 1;
      lines.push(`${seen(p)} ${frame("period", label, mark(p.items[0]))}`);
    }
    if (!any) lines.push(frame("evenTime"));
    lines.push(frame("build"));
  } else {
    lines.push(frame("fit", who, mark(say.fit.desc)));
    lines.push(soften(say.fit.why));
    lines.push(frame("clash", mark(say.clash.desc), soften(say.clash.why)));
    lines.push(frame("start"));
  }
  const memo = topic === "bond" ? [`찰떡: ${say.fit.desc} 사람`, `조심: ${say.clash.desc} 사람`] : [...lines.join(" ").matchAll(/⟦([^⟧]+)⟧/g)].map((m) => m[1]).slice(0, 4);
  if (topic === "self") memo[0] = `${say.adn} 사람`;
  return { lines, memo };
}
