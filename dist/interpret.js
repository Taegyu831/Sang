// Rule engine. Reads content.json (themes, texts, cross links) and the measured
// ratios and returns everything the result screen needs.
//
// Layer 1, frames (reading.js): how it was measured. 삼정 / 오안 / 오악.
// Layer 2, themes (here): what it says. Each theme combines several ratios
// from different frames. A theme reads strongly only when at least two of its
// ratios point the same way; with a single supporting ratio it reads as a weak
// tendency, and near the average it reads as balanced. Every face therefore
// gets a sentence for every theme.

import { CALIBRATION, RELIABILITY_WEIGHT, zScore } from "./calibration.js";
import { classifyAxes } from "./reading.js";

export const THEME_RULES = {
  // Below this average pull (in typical steps) a theme reads as balanced.
  neutralBelow: 0.35,
  // A ratio counts as supporting when it is at least this far from typical, in the theme's direction.
  supportAt: 0.5,
  // Intensity tiers of the average pull.
  moderateAt: 0.7,
  clearAt: 1.1,
  // Ratios farther than this are treated as this far, so one outlier cannot decide a theme.
  clampAt: 2,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = Number.isFinite;

function fillTemplate(template, value, key, calibration) {
  const digits = calibration[key]?.digits ?? 1;
  return template.replace("{v}", finite(value) ? value.toFixed(digits) : "-");
}

function reliabilityLabel(average) {
  if (average >= 0.85) return "high";
  if (average >= 0.65) return "medium";
  return "low";
}

export function evaluateTheme(theme, values, content, calibration = CALIBRATION, rules = THEME_RULES) {
  const rows = [];
  let pull = 0;
  let totalWeight = 0;
  let reliabilitySum = 0;
  for (const feature of theme.features) {
    const raw = values[feature.key];
    const z = zScore(feature.key, raw, calibration);
    if (!finite(z) || feature.weight <= 0) continue;
    const reliability = calibration[feature.key]?.reliability ?? "medium";
    const weight = feature.weight * RELIABILITY_WEIGHT[reliability];
    const signed = clamp(feature.sign * z, -rules.clampAt, rules.clampAt);
    pull += weight * signed;
    totalWeight += weight;
    reliabilitySum += weight * RELIABILITY_WEIGHT[reliability];
    rows.push({
      key: feature.key,
      label: calibration[feature.key]?.label ?? feature.key,
      value: raw,
      z,
      signed,
      reliability,
      fact: fillTemplate(content.factTemplates[feature.key] ?? "{v}", raw, feature.key, calibration),
      relation: z >= rules.supportAt ? "above" : z <= -rules.supportAt ? "below" : "typical",
    });
  }
  const average = totalWeight > 0 ? pull / totalWeight : 0;
  const magnitude = Math.abs(average);
  const direction = average > 0 ? "pos" : "neg";
  const supporting = rows.filter((r) => (direction === "pos" ? r.signed >= rules.supportAt : r.signed <= -rules.supportAt));
  const neutral = magnitude < rules.neutralBelow || !rows.length;
  const state = neutral ? "neutral" : direction;
  const soft = !neutral && supporting.length < 2;
  const stateText = theme.states[state];
  for (const row of rows) row.supporting = !neutral && supporting.includes(row);
  return {
    id: theme.id,
    short: theme.short,
    title: theme.title,
    tag: theme.tag,
    area: theme.area,
    limit: theme.limit,
    state,
    soft,
    label: stateText.label,
    reading: soft ? stateText.soft : stateText.reading,
    tier: neutral ? null : magnitude >= rules.clearAt ? "clear" : magnitude >= rules.moderateAt ? "moderate" : "light",
    pull: average,
    supports: supporting.length,
    reliability: reliabilityLabel(totalWeight > 0 ? reliabilitySum / totalWeight : 0.5),
    near: Math.abs(magnitude - rules.neutralBelow) < 0.12 || (!neutral && supporting.length === 1),
    rows,
  };
}

function pickLinks(themes, links, limit = 2) {
  const byId = Object.fromEntries(themes.map((t) => [t.id, t]));
  const matches = [];
  for (const link of links) {
    const parts = link.when.map(([id, dir]) => ({ theme: byId[id], dir }));
    if (parts.some(({ theme, dir }) => !theme || theme.soft || theme.state !== dir)) continue;
    matches.push({ text: link.text, themes: link.when.map(([id]) => id), weight: parts.reduce((a, { theme }) => a + Math.abs(theme.pull), 0) });
  }
  return matches.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

export function buildTone(values, tone, calibration = CALIBRATION) {
  const level = (key) => {
    const z = zScore(key, values[key], calibration);
    if (!finite(z)) return null;
    return z > 0.6 ? "up" : z < -0.6 ? "down" : "flat";
  };
  const eye = level("eyeTilt");
  const mouth = level("mouthLift");
  if (!eye || !mouth) return null;
  return {
    eye,
    mouth,
    title: tone.title,
    intro: tone.intro,
    text: tone.joiner.replace("{eye}", tone.eye[eye]).replace("{mouth}", tone.mouth[mouth]),
    limit: tone.limit,
  };
}

/**
 * values: pose-corrected ratios (from features.js, pooled by capture.js).
 * Returns { frames, themes, links, tone }.
 */
export function interpret(values, content, calibration = CALIBRATION, rules = THEME_RULES) {
  const themes = content.themes.map((theme) => evaluateTheme(theme, values, content, calibration, rules));
  return {
    frames: classifyAxes(values),
    themes,
    links: pickLinks(themes, content.links),
    tone: buildTone(values, content.tone, calibration),
    nearThemes: themes.filter((t) => t.near).map((t) => t.id),
  };
}
