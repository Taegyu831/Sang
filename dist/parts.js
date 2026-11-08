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
};

const finite = Number.isFinite;

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
    score: Math.abs(z) * RELIABILITY_WEIGHT[reliability],
    name: `${dir === "middle" ? "" : strengthWord(z, rules)}${name}`,
    mine: [fillTokens(card.mine, key, values, calibration), fillTokens(card.typical, key, values, calibration)].filter(Boolean).join(" "),
    readings: readings.map((r) => ({ text: r.text, domain: r.domain ?? "" })),
    so: slot(card.so, card, key, dir) ?? "",
    about: card.about ?? "",
    draw: card.draw ?? [],
  };
}

/** All cards for a face, most distinctive first. */
export function readParts(values, partsContent, calibration = CALIBRATION, rules = PART_RULES) {
  const cards = partsContent.cards
    .map((card) => readPart(card, values, calibration, rules))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return {
    top: cards.slice(0, rules.topCount),
    rest: cards.slice(rules.topCount),
    all: cards,
  };
}
