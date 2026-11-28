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
const seen = (p) => `${josa(mark(p.name).replace(/^⟦(?:살짝 |꽤 )/, "⟦"), "을", "를")} 보니`;
/** One or two things read from a part. */
function told(p, k) {
  const [a, b] = p.items;
  if (k) return b ? `또 ${seen(p)} ${josa(mark(a), "과", "와")} ${josa(mark(b), "이", "가")} 함께 보이는 편일 수 있어요.` : `또 ${seen(p)} ${josa(mark(a), "이", "가")} 있는 편일 수 있어요.`;
  return b ? `${seen(p)} ${mark(a)} 같은 면이 있을 수 있고, ${mark(b)} 쪽으로 기우는 경향이 있을 수 있어요.` : `${seen(p)} ${mark(a)} 같은 면이 있을 수 있어요.`;
}
const minus = (p) => `다만 ${seen(p)} ${josa(mark(p.items[0]), "은", "는")} 조금 살펴볼 필요가 있어 보여요.`;

/** The answer to one topic: sentences to say, and a few words for the notebook. */
export function answer(reading, topic, who) {
  const { read, say } = reading;
  const used = new Set();
  const lines = [];
  const caution = (fallback) => {
    const c = pick(read, ["caution"], 1, used)[0];
    const what = c?.items[0] ?? say.watch;
    return what ? `그래서 ${mark(what)}만 한 번씩 살펴 주면 좋을 수 있어요.` : fallback;
  };
  const body = (fields, minusFields, from = read) => {
    const plus = pick(from, fields, 2, used);
    plus.forEach((p, i) => lines.push(told(p, i)));
    const low = minusFields ? pick(from, minusFields, 1, used)[0] : null;
    if (low) lines.push(minus(low));
    return plus.length + (low ? 1 : 0);
  };
  if (topic === "self") {
    lines.push(`${who}님은 ${mark(say.adn)} 분으로 보여요.`);
    body(["traits"]);
    lines.push(caution("그래서 지금의 균형을 편하게 지켜 가면 좋을 수 있어요."));
  } else if (topic === "work") {
    lines.push(`${who}님은 일에서는 ${soften(say.work)}`);
    if (!body(["work"], ["workMinus"])) body(["traits"]);
    const strength = [...used][0];
    lines.push(strength ? `그래서 ${josa(mark(strength), "을", "를")} 살릴 수 있는 자리를 고르면 좋을 수 있어요.` : "그래서 내 방식이 통하는 자리를 고르면 좋을 수 있어요.");
  } else if (topic === "love") {
    lines.push(`${who}님은 사랑에서는 ${soften(say.love)}`);
    // Without anything about people the temperament is told, from other parts than the first topic uses.
    if (!body(["people"], ["peopleMinus"])) body(["traits"], null, read.length > 3 ? read.slice(2) : read);
    lines.push(say.watch ? `그래서 ${mark(say.watch)}만 한 번씩 살펴 주면 좋을 수 있어요.` : "그래서 상대의 속도도 함께 살피면 좋을 수 있어요.");
  } else if (topic === "time") {
    lines.push(`${who}님은 흐름으로 보면 ${soften(say.stage)}`);
    let any = 0;
    for (const [label, field] of [["젊을 때", "early"], ["중년", "mid"], ["나중", "late"]]) {
      const p = pick(read, [field], 1, used)[0];
      if (!p) continue;
      any += 1;
      lines.push(`${seen(p)} ${label}에는 ${josa(mark(p.items[0]), "이", "가")} 따를 수 있어요.`);
    }
    if (!any) lines.push("어느 한 시기에 크게 몰리지 않고 고르게 흘러갈 수 있어요.");
    lines.push("그래서 지금 할 수 있는 것부터 차근차근 쌓아 두면 좋을 수 있어요.");
  } else {
    lines.push(`${who}님은 ${mark(say.fit.desc)} 사람과 잘 맞는 분으로 보여요.`);
    lines.push(soften(say.fit.why));
    lines.push(`반대로 ${mark(say.clash.desc)} 사람과는 부딪힐 수 있어요. ${soften(say.clash.why)}`);
    lines.push("그래서 처음에는 서로의 속도부터 맞춰 보면 좋을 수 있어요.");
  }
  const memo = topic === "bond" ? [`찰떡: ${say.fit.desc} 사람`, `조심: ${say.clash.desc} 사람`] : [...lines.join(" ").matchAll(/⟦([^⟧]+)⟧/g)].map((m) => m[1]).slice(0, 4);
  if (topic === "self") memo[0] = `${say.adn} 사람`;
  return { lines, memo };
}
