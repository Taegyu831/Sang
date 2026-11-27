// The whole-reading summary written by a text model (2026-11-27).
//
// Shared by the page and by api/summary.mjs. The page sends only ids of the readings
// ({keys: ["noseWidth.high", ...], poles: ["drive+"], age: 20}); the server looks the
// wordings up here and builds the prompt itself, so nobody can send their own text.
// No picture, no measurement numbers and no gender are sent. When the call fails the
// page shows the rule-made closing sentence instead.
import { FACETS } from "./facets.js";
import { outlineOf, POLE_IDS } from "./story.js";

export const DEFAULT_ENDPOINT = "https://project-zek4t.vercel.app/api/summary";
const STORAGE_KEY = "sang.summary";
const AGES = [20, 30, 40, 50];
// ARTIFICIAL: how many readings (strongest first) go into one summary, how long the page waits,
// and the length a usable answer must have (characters).
export const MAX_KEYS = 12;
export const WAIT_MS = 25000;
export const LENGTH = { min: 150, max: 900 };
// ARTIFICIAL: topics a summary must not bring up; an answer with one of these is thrown away.
export const BANNED = ["사망", "죽음", "죽을", "질병", "수명", "단명", "이혼", "사별", "범죄", "불임", "파산"];

const FIELDS = [
  ["traits", "성격"], ["work", "일과 재물"], ["workMinus", "일과 재물(다른 면)"],
  ["people", "사람과 사랑"], ["peopleMinus", "사람과 사랑(다른 면)"],
  ["early", "초년"], ["earlyMinus", "초년(다른 면)"], ["mid", "중년"], ["midMinus", "중년(다른 면)"],
  ["late", "말년"], ["lateMinus", "말년(다른 면)"], ["caution", "조심할 점"],
];

/** ?summary=<url> uses another address (remembered), ?summary=off turns it off, ?summary=default goes back. */
export function summaryEndpoint(search = window.location.search) {
  const asked = new URLSearchParams(search).get("summary");
  try {
    if (asked === "default") { localStorage.removeItem(STORAGE_KEY); return DEFAULT_ENDPOINT; }
    if (asked) { localStorage.setItem(STORAGE_KEY, asked); return asked === "off" ? "" : asked; }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved === "off" ? "" : saved;
  } catch {
    if (asked) return asked === "off" ? "" : asked === "default" ? DEFAULT_ENDPOINT : asked;
  }
  return DEFAULT_ENDPOINT;
}

/** Checks what the page sent; returns a clean spec or null. */
export function cleanSummarySpec(spec) {
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.keys) || !Array.isArray(spec.poles)) return null;
  const keys = [...new Set(spec.keys)];
  if (keys.length > MAX_KEYS || !keys.every((k) => typeof k === "string" && Object.hasOwn(FACETS, k))) return null;
  const poles = [...new Set(spec.poles)];
  if (poles.length > 2 || !poles.every((p) => POLE_IDS.includes(p))) return null;
  const age = Number(spec.age);
  return AGES.includes(age) ? { keys, poles, age } : null;
}

/** "noseWidth.high" -> "코 폭 (넓은 코)" using parts.json. */
function labelOf(key, partsContent) {
  const [id, ...rest] = key.split(".");
  const card = partsContent.cards.find((c) => c.id === id);
  if (!card) return id;
  const name = card.names?.[rest.join(".")] ?? card.names?.[rest.at(-1)];
  return name ? `${card.part} (${name})` : card.part;
}

export function summaryPrompt(spec, partsContent) {
  const outline = outlineOf(spec.poles);
  const facts = spec.keys.map((key) => {
    const said = FIELDS.filter(([f]) => FACETS[key][f]?.length).map(([f, label]) => `${label}: ${FACETS[key][f].join(", ")}`);
    return `- ${labelOf(key, partsContent)} | ${said.join(" | ")}`;
  });
  const system = [
    "당신은 전통 관상 풀이를 정리하는 한국어 글쓴이입니다. 아래에 주어진 항목만 엮어 전체 정리를 씁니다.",
    "규칙:",
    "1. 주어지지 않은 성격, 운, 부위, 해석을 새로 만들지 않습니다.",
    "2. 문단 세 개, 합쳐서 350자에서 500자. 첫 문단은 어떤 사람인지, 둘째 문단은 일과 재물 그리고 사람 관계, 셋째 문단은 잘 맞는 사람과 조언 한 가지입니다.",
    "3. 서로 엇갈리는 항목은 한 사람의 두 면으로 자연스럽게 잇습니다.",
    "4. 부위 이름을 줄줄이 나열하지 말고 두세 번만 언급합니다.",
    "5. 합니다체로 쓰고 사람은 '이 사람'이라고 부릅니다. 단정하지 말고 '~로 읽힙니다', '~한 편입니다'처럼 씁니다.",
    "6. 건강, 수명, 죽음, 질병, 이혼, 범죄 이야기는 하지 않습니다.",
    "7. 제목, 목록, 기호 꾸밈 없이 문장만 씁니다. 긴 줄표는 쓰지 않습니다. 문단 사이는 빈 줄 하나입니다.",
  ].join("\n");
  const user = [
    `나이대: ${spec.age}대`,
    `전체 성향: ${outline.person}`,
    `잘 맞는 사람: ${outline.fit}`,
    `부딪히기 쉬운 사람: ${outline.clash}`,
    "얼굴에서 읽은 항목 (뚜렷한 순서):",
    ...(facts.length ? facts : ["- 모든 부위가 보통 범위라 한쪽으로 치우친 풀이가 없습니다."]),
  ].join("\n");
  return { system, user };
}

/** The model's answer as paragraphs, or null when it must not be shown. */
export function cleanSummary(text) {
  if (typeof text !== "string") return null;
  const plain = text.replace(/\s*[\u2013\u2014]\s*/g, ", ").replace(/[*#`⟦⟧⟪⟫§]/g, "").trim();
  if (plain.length < LENGTH.min || plain.length > LENGTH.max || BANNED.some((w) => plain.includes(w))) return null;
  return plain.split(/\n+/).map((p) => p.trim()).filter(Boolean);
}

export async function requestSummary(endpoint, spec, { timeoutMs = WAIT_MS, fetcher = fetch } = {}) {
  const reply = await fetcher(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec }), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!reply.ok) throw new Error(`summary ${reply.status}`);
  const paragraphs = cleanSummary((await reply.json())?.summary);
  if (!paragraphs) throw new Error("summary unusable");
  return paragraphs;
}
