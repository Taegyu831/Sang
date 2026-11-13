// Part cards: one card per face part a visitor can picture ("미간", "코 폭").
//
// For each card the engine works out, from the measured ratios,
//   1. which way the part leans (high, low or middle) and how strongly,
//   2. a sentence about the visitor's own face in picturable units,
//   3. the popular readings collected for that shape (dist/parts.json),
// and ranks the cards so the most distinctive parts come first.
//
// Texts and thresholds live in parts.json so the team can edit them without code.

import { CALIBRATION, RELIABILITY_WEIGHT, zScore } from "./calibration.js";

export const PART_RULES = {
  // Below this many typical steps a part reads as middle (보통).
  sideAt: 0.5,
  // Strength words: 살짝 below clearAt, plain up to strongAt, 꽤 above.
  clearAt: 1.0,
  strongAt: 1.8,
  // How many cards are shown first, as "가장 두드러진 곳".
  topCount: 3,
  // A face shape other than 계란형 needs at least this many typical steps of pull.
  shapeAt: 0.6,
};

const finite = Number.isFinite;

// How easily a visitor can see this on their own face in a mirror. A tiny
// difference in eye gap or philtrum is real but nobody can check it, so those
// cards rank lower and the plainly visible parts (face shape, eye size, nose,
// mouth, jaw) come first.
const VISIBILITY = {
  eyeGap: 0.5, browInnerGap: 0.6, browEyeGap: 0.6, philtrum: 0.6,
  thirds: 0.6, symmetry: 0.5, eyeAsym: 0.5, forehead: 0.85, noseLength: 0.85,
};

// The parts a visitor knows by name. Every card belongs to exactly one.
export const FACE_GROUP = { id: "face", name: "얼굴 전체", ids: ["faceShape", "cheek", "thirds", "symmetry"] };
export const GROUPS = [
  { id: "eyes", name: "눈", ids: ["eyeSize", "eyeOpen", "eyeTilt", "eyeGap", "eyeAsym"] },
  { id: "brows", name: "눈썹", ids: ["browLength", "browTilt", "browArch", "browEyeGap", "browInnerGap"] },
  { id: "nose", name: "코", ids: ["noseWidth", "noseLength"] },
  { id: "mouth", name: "입", ids: ["mouthFace", "lipFull", "lipRatio", "mouthLift", "philtrum"] },
  { id: "forehead", name: "이마", ids: ["forehead"] },
  { id: "jaw", name: "턱", ids: ["jaw", "chin"] },
];
const GROUP_OF = Object.fromEntries([FACE_GROUP, ...GROUPS].flatMap((g) => g.ids.map((id) => [id, g.id])));

function direction(z, rules) {
  if (!finite(z)) return null;
  if (z >= rules.sideAt) return "high";
  if (z <= -rules.sideAt) return "low";
  return "middle";
}

function strengthWord(z, rules) {
  const m = Math.abs(z);
  if (m < rules.sideAt) return "";
  if (m < rules.clearAt) return "살짝 ";
  if (m < rules.strongAt) return "";
  return "꽤 ";
}

/**
 * Fill {tokens} in a sentence.
 *   {v0} {v1} {v2}   value of the card's main key with that many digits
 *   {c0} {c1}        the typical (centre) value
 *   {p0} {cp0}       value or centre times 100 (ratios shown as percent)
 *   {a0} {ca0}       absolute value or centre
 *   {f}              value in percent as a simple fraction ("4분의 1")
 *   {k:key:1}        value of another key; {ck:key:1} its centre
 *   {s:up:down}      first word when the value is positive, second otherwise
 */
export function fillTokens(text, key, values, calibration = CALIBRATION) {
  if (!text) return "";
  const value = values[key];
  const center = calibration[key]?.center;
  const fmt = (v, d) => (finite(v) ? Number(v).toFixed(Number(d)) : "-");
  return text
    .replace(/\{ck:([A-Za-z]+):(\d)\}/g, (_, k, d) => fmt(calibration[k]?.center, d))
    .replace(/\{k:([A-Za-z]+):(\d)\}/g, (_, k, d) => fmt(values[k], d))
    .replace(/\{s:([^:}]*):([^}]*)\}/g, (_, up, down) => (value > 0 ? up : down))
    .replace(/\{cp(\d)\}/g, (_, d) => fmt(center * 100, d))
    .replace(/\{p(\d)\}/g, (_, d) => fmt(value * 100, d))
    .replace(/\{ca(\d)\}/g, (_, d) => fmt(Math.abs(center), d))
    .replace(/\{a(\d)\}/g, (_, d) => fmt(Math.abs(value), d))
    .replace(/\{c(\d)\}/g, (_, d) => fmt(center, d))
    .replace(/\{v(\d)\}/g, (_, d) => fmt(value, d))
    .replace(/\{f\}/g, () => (finite(value) && value > 0 ? `${Math.max(2, Math.round(100 / value))}분의 1` : "-"));
}

// A card may watch several keys (삼정 watches three); it is read by the one
// farthest from typical. Texts for such cards are keyed "key.direction".
function pickKey(card, values, calibration) {
  let best = null;
  for (const key of card.keys) {
    const z = zScore(key, values[key], calibration);
    if (!finite(z)) continue;
    if (!best || Math.abs(z) > Math.abs(best.z)) best = { key, z };
  }
  return best;
}

function slot(map, card, key, dir) {
  if (!map) return undefined;
  return card.keys.length > 1 ? (map[`${key}.${dir}`] ?? map[dir]) : map[dir];
}

export function readPart(card, values, calibration = CALIBRATION, rules = PART_RULES) {
  const picked = pickKey(card, values, calibration);
  if (!picked) return null;
  const { key, z } = picked;
  let dir = direction(z, rules);
  // Some parts have no "low" side (for example eye asymmetry); treat it as middle.
  if (!slot(card.names, card, key, dir)) dir = "middle";
  const name = slot(card.names, card, key, dir);
  if (!name) return null;
  const reliability = calibration[key]?.reliability ?? "medium";
  const readings = slot(card.readings, card, key, dir) ?? [];
  return {
    id: card.id,
    part: card.part,
    key,
    z,
    dir,
    reliability,
    // Ranking weight: how unusual, discounted when the landmark is less trustworthy.
    score: Math.abs(z) * RELIABILITY_WEIGHT[reliability] * (VISIBILITY[card.id] ?? 1),
    name: `${dir === "middle" ? "" : strengthWord(z, rules)}${name}`,
    mine: [fillTokens(card.mine, key, values, calibration), fillTokens(card.typical, key, values, calibration)].filter(Boolean).join(" "),
    readings: readings.map((r) => ({ text: r.text, domain: r.domain ?? "" })),
    summary: slot(card.summary, card, key, dir) ?? "",
    gist: slot(card.gist, card, key, dir) ?? "",
    about: card.about ?? "",
    draw: card.draw ?? [],
  };
}

/**
 * A rough overall reading without any API: which life areas the readings of
 * the three most distinctive parts share most (재물, 일, 사람 ...), plus each
 * part's one-line gist. Texts live in parts.json under "synthesis".
 */
export function synthesize(top, partsContent, rules = PART_RULES) {
  const s = partsContent.synthesis;
  if (!s || !top.length) return [];
  const groupOf = {};
  for (const [group, domains] of Object.entries(s.groups)) for (const d of domains) groupOf[d] = group;
  const counts = {};
  for (const part of top) for (const r of part.readings) {
    const group = groupOf[r.domain];
    if (group) counts[group] = (counts[group] ?? 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const names = top.map((p) => p.part);
  const gists = top.filter((p) => p.gist).map((p) => `${p.part}에서는 ${p.gist}`);
  const lines = [`이 얼굴에서 가장 눈에 띄는 곳은 ${names.join(", ")}입니다.`];
  // Each gist ends in a noun ("...두드러지는 얼굴"), so they read as one sentence.
  if (gists.length) lines.push(`${gists.join(", ")}로 읽힙니다.`);
  if (top.every((p) => Math.abs(p.z) < rules.clearAt)) lines.push(s.balanced);
  else if (ranked.length) {
    lines.push(s.lines[ranked[0][0]]);
    if (ranked[1] && ranked[1][1] >= ranked[0][1] * 0.6) lines.push(s.second.replace("{group}", s.secondNames[ranked[1][0]]));
  } else lines.push(s.lines["성격"]);
  return lines;
}

/**
 * All cards for a face, most distinctive first. The standout list takes the
 * best card of each region (eyes, mouth, jaw ...), so three standouts are three
 * different places instead of three eyebrow cards.
 */
export function readParts(values, partsContent, calibration = CALIBRATION, rules = PART_RULES) {
  const cards = partsContent.cards
    .map((card) => readPart(card, values, calibration, rules))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const seen = new Set();
  const top = [];
  for (const card of cards) {
    const group = GROUP_OF[card.id] ?? card.id;
    if (seen.has(group)) continue;
    seen.add(group);
    top.push(card);
    if (top.length === rules.topCount) break;
  }
  return {
    top,
    rest: cards.filter((c) => !top.includes(c)),
    all: cards,
    groups: GROUPS.map((g) => groupOf(g, cards)),
    face: groupOf(FACE_GROUP, cards),
  };
}

/** A region with its cards (most distinctive first) and the card that speaks for it. */
function groupOf(group, all) {
  const parts = all.filter((c) => group.ids.includes(c.id));
  const leaning = parts.filter((c) => c.dir !== "middle");
  return { id: group.id, name: group.name, parts, leaning, lead: leaning[0] ?? parts[0] ?? null };
}

// ---------- face shape ----------

export const FACE_SHAPES = {
  egg: {
    name: "계란형",
    text: "얼굴 가로세로와 턱 폭이 보통 범위에 있어 계란형에 가깝습니다. 관상에서는 균형이 잡힌 얼굴로 보고, 사람을 가리지 않고 두루 어울리며 무난하게 풀리는 상으로 읽습니다. 한쪽으로 치우친 풀이가 약한 대신 부위별 특징이 더 크게 작용한다고 봅니다.",
  },
  round: {
    name: "둥근형",
    text: "얼굴이 옆으로 넓고 턱선이 부드러워 둥근형에 가깝습니다. 관상에서는 복스럽고 정이 많아 사람이 따르는 얼굴로 보고, 먹을 복과 재물복이 있다고 풀이합니다. 한편 느긋해서 결단이 늦다는 말도 있습니다.",
  },
  square: {
    name: "각진형",
    text: "턱이 넓고 각이 잡혀 각진형에 가깝습니다. 관상에서는 의지가 굳고 책임감이 강하며 밀고 나가는 힘이 있는 얼굴로 봅니다. 한편 고집이 세고 양보가 적다는 풀이도 있습니다.",
  },
  long: {
    name: "긴형",
    text: "얼굴이 세로로 긴 편이라 긴형에 가깝습니다. 관상에서는 생각이 깊고 이지적이며 신중한 얼굴로 봅니다. 한편 시작이 더디고 중년 이후에 풀린다는 풀이도 있습니다.",
  },
  heart: {
    name: "갸름한 역삼각형",
    text: "턱이 갸름하고 위쪽이 상대적으로 넓은 역삼각형에 가깝습니다. 관상에서는 머리 회전이 빠르고 감각이 예민해 기획이나 예술 쪽 재능이 있는 얼굴로 봅니다. 한편 자존심이 강하고 예민하다는 풀이도 있습니다.",
  },
};

/**
 * One of five shapes everyone already knows (계란형, 둥근형, 각진형, 긴형,
 * 역삼각형), from three ratios: face width against length, jaw against cheek,
 * and how far each one sits from the average of the people measured.
 */
export function classifyFaceShape(values, calibration = CALIBRATION, rules = PART_RULES) {
  const f = zScore("faceRatio", values.faceRatio, calibration);
  const j = zScore("jawCheek", values.jawCheek, calibration);
  if (!finite(f) || !finite(j)) return null;
  const pull = { long: -f, wide: f, angular: j, narrow: -j };
  const [lead, strength] = Object.entries(pull).sort((a, b) => b[1] - a[1])[0];
  let id = "egg";
  if (strength >= rules.shapeAt) {
    if (lead === "long") id = "long";
    else if (lead === "wide") id = j >= 0.5 ? "square" : "round";
    else if (lead === "angular") id = "square";
    else id = "heart";
  }
  const c = (key) => calibration[key]?.center;
  return {
    id,
    ...FACE_SHAPES[id],
    mine: `광대 폭이 얼굴 길이의 ${values.faceRatio.toFixed(0)}%, 턱 폭이 광대 폭의 ${values.jawCheek.toFixed(0)}%입니다. 보통은 ${c("faceRatio").toFixed(0)}%와 ${c("jawCheek").toFixed(0)}%쯤입니다.`,
  };
}
