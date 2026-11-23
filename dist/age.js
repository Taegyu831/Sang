// 지금의 나이: the visitor picks an age group (20대 ... 50대); the reading says which
// part of the face the old text reads for that decade, and what this face has there.
//
// The text (麻衣相法 流年運氣部位歌, read on quanxue.cn, zhouyi.cc, shenjige.cn) gives one
// place on the face for every year of age. 20s: 輔角 司空 邊城 中正 丘陵 冢墓 印堂 (forehead,
// between the brows); 30s: 山林 凌雲 紫氣 繁霞 彩霞 太陽 太陰 中陽 中陰 少陽 (brows, eyes);
// 40s: 少陰 山根 精舍 光殿 年上 壽上 兩顴 準頭 蘭臺 (eye tails, nose, cheekbones);
// 50s: 廷尉 人中 仙庫 食倉 祿倉 法令 虎耳 (under the nose, around the mouth, ears).
//
// What is OURS, not the text's (record kept in docs/READING_ENGINE.md, "나이"):
//  1. The text judges a year by the COLOUR of its place (氣色). Colour is not measured here;
//     the shape of the place (the part cards) is read as that decade's reading.
//  2. A decade is one block. The text gives one place per year.
//  3. 山林 (29 and 30) is put in the 30s. The text's 法令 and 虎耳 (ears) have no measure
//     here, so they are not read.
//  4. Left and right: the text says 男左女右 but not which age takes which side. Both
//     sides are pooled in the measurement, so the side is not used.

// "places" tells where the old map puts the age. "ids" are the measured parts that are read.
// The eyebrows (and the 인당 between the brow heads) are never read: bangs, tattoos and drawn
// brows make them unreliable (parts.js leaves those cards out), so 20s read the forehead only
// and 30s read the eyes only, though the map still names the brows as the place.
export const AGE_STAGES = {
  20: { places: "이마와 미간(인당)", ids: ["forehead"] },
  30: { places: "눈썹과 눈", ids: ["eyeGap", "eyeSize", "eyeOpen", "eyeAsym"] },
  40: { places: "눈꼬리, 산근에서 코끝까지의 코, 광대", ids: ["eyeTilt", "noseWidth", "noseLength", "cheek"] },
  50: { places: "인중과 입 둘레", ids: ["philtrum", "mouthFace", "lipFull", "lipRatio", "mouthLift"] },
};

const em = (text) => `⟦${text}⟧`;
// 은 after a final consonant, 는 after a vowel (a part name such as "눈 사이" or "코").
const topic = (word) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? `${word}은` : `${word}는`;
};

/** Sentences for the "시기" page. `parts` are the read cards (parts.all). */
export function ageLines(parts = [], age) {
  const stage = AGE_STAGES[age];
  if (!stage) return [];
  const lines = [`관상의 유년운기에서 ${age}대는 ${stage.places}를 차례로 지나는 시기입니다.`];
  const standing = parts
    .filter((p) => stage.ids.includes(p.id) && p.dir !== "middle")
    .sort((a, b) => b.score - a.score);
  const seen = new Set();
  const picked = [];
  for (const p of standing) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    picked.push(p);
    if (picked.length === 2) break;
  }
  if (!picked.length) {
    lines.push(`이 얼굴은 그 자리들이 크게 한쪽으로 치우치지 않아, ${age}대는 무난하게 흘러가는 시기로 봅니다.`);
    return lines;
  }
  for (const p of picked) {
    const gist = p.gist ? ` ${p.gist}으로 읽습니다.` : "";
    lines.push(`${topic(p.part)} ${em(p.name)}입니다. ${p.about}${gist}`.replace(/\s+/g, " ").trim());
  }
  return lines;
}
