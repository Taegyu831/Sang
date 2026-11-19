// A photo of the imagined 인연, made by an image API.
//
// The browser never holds the API key. It sends only a prompt to a small relay
// (tools/portrait-proxy.py for local tests, tools/portrait-worker.js for a
// public site) and gets a picture back. With no relay set, nothing is sent and
// the line drawing from avatar.js stays.
//
// The prompt is built from three things:
//   1. who: the partner's gender (the visitor's opposite, fixed for now)
//   2. what kind of person: the pole from story.js ("drive+", ... or null)
//   3. which role: "fit" (잘 맞는 인연) or "clash" (조심할 인연)
// plus the same face-feature parameters the line drawing uses (avatar.js), so
// the photo and the drawing describe the same face.
import { paramsOf } from "./avatar.js";

// ---------- settings ----------

// Change these to change every picture.
export const LOOK = "Korean";

// The visitor picks an age group (20s to 50s); the partner is drawn in the same one.
export const AGES = [20, 30, 40, 50];
const AGE_LOOK = {
  20: "smooth youthful skin",
  30: "healthy natural skin",
  40: "natural skin with subtle fine lines",
  50: "natural skin with visible fine lines and a few gray hairs",
};

const STORAGE_KEY = "sang.portrait";

/** Relay address: ?portrait=<url> (remembered), ?portrait=off to forget it. */
export function portraitEndpoint(search = window.location.search) {
  const asked = new URLSearchParams(search).get("portrait");
  try {
    if (asked === "off") { localStorage.removeItem(STORAGE_KEY); return ""; }
    if (asked) { localStorage.setItem(STORAGE_KEY, asked); return asked; }
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return asked && asked !== "off" ? asked : "";
  }
}

/** The partner is the opposite gender (fixed for now). */
export function partnerOf(myGender) {
  if (myGender === "male") return "female";
  if (myGender === "female") return "male";
  return "any";
}

// ---------- prompt parts ----------

const PERSON = { female: "woman", male: "man", any: "person" };
const HAIR = {
  female: "shoulder-length natural hair",
  male: "short neat natural hair",
  any: "natural hair",
};

// What each kind of person looks and feels like in a photo (story.js POLES).
const MOOD = {
  "drive+": "strong straight eyebrows, a steady direct gaze, a confident slight smile, upright posture",
  "drive-": "soft calm eyes, relaxed eyebrows, a thoughtful and observant expression, gentle closed-lip smile",
  "social+": "a bright open smile, lively eyes, a warm and approachable face",
  "social-": "a quiet reserved expression, a small gentle smile, calm deep eyes",
  "feel+": "soft expressive eyes, a tender warm expression, gently rounded features",
  "feel-": "a cool composed expression, sharp analytical eyes, a tidy and neat appearance",
  "steady+": "an even calm expression, a grounded dependable look, a simple clean style",
  "steady-": "an alert quick look, slightly raised eyebrows, a lively dynamic expression, a trendy style",
};
const EVEN_MOOD = "a balanced, pleasant, neutral expression";

// The light carries the role: warm for 잘 맞는 인연, cooler and more guarded for 조심할 인연.
const ROLE = {
  fit: "Warm soft daylight, a friendly and inviting feeling.",
  clash: "Cooler neutral light, a slightly guarded and distant feeling, still a respectful and natural portrait.",
};

const WORDS = [
  ["eye", "large expressive eyes", "small narrow eyes"],
  ["open", "wide open eyes", "calm heavy-lidded eyes"],
  ["tilt", "upturned outer eye corners", "gently downturned outer eye corners"],
  ["gap", "widely spaced eyes", "closely set eyes"],
  ["mouth", "a wide mouth", "a small mouth"],
  ["lift", "slightly upturned mouth corners", "slightly downturned mouth corners"],
  ["lip", "full lips", "thin lips"],
  ["jaw", "a strong angular jaw", "a narrow soft jaw"],
  ["chin", "a rounded chin", "a pointed chin"],
  ["fore", "a broad forehead", "a narrow forehead"],
  ["cheek", "full cheeks", "slim cheeks"],
  ["nose", "a broad nose", "a slim nose"],
  ["noseLen", "a long nose", "a short nose"],
];

/** Face features of this kind of person as plain words (only the clear ones). */
export function featureWords(pole, threshold = 0.5) {
  const params = paramsOf(pole);
  const words = [];
  for (const [name, high, low] of WORDS) {
    if (params[name] >= threshold) words.push(high);
    else if (params[name] <= -threshold) words.push(low);
  }
  return words;
}

/**
 * The prompt for one picture.
 * @param {{pole: string|null, kind: "fit"|"clash", gender: "female"|"male"|"any", age?: 20|30|40|50}} spec
 */
export function portraitPrompt({ pole, kind, gender, age = 20 }) {
  const decade = AGES.includes(age) ? age : 20;
  const person = PERSON[gender] ?? PERSON.any;
  const hair = HAIR[gender] ?? HAIR.any;
  const features = featureWords(pole ?? null);
  const parts = [
    `A photorealistic head-and-shoulders portrait of an invented ${LOOK} ${person} in their ${decade}s, facing the camera, with ${hair}. ${AGE_LOOK[decade]}.`,
    `Expression and presence: ${MOOD[pole] ?? EVEN_MOOD}.`,
    features.length ? `Face: ${features.join(", ")}.` : "",
    ROLE[kind] ?? ROLE.fit,
    "Plain soft studio background, simple plain clothing, no glasses, no text, no watermark.",
    "This is a fictional person, not a real individual and not a celebrity.",
  ];
  return parts.filter(Boolean).join(" ");
}

// ---------- request ----------

/**
 * Ask the relay for a picture. The spec is for the Vercel function (it builds
 * its own prompt); the prompt is for the local relay. Resolves to an image URL
 * (data URL) or throws.
 */
export async function requestPortrait(endpoint, spec, { timeoutMs = 90000 } = {}) {
  const prompt = portraitPrompt(spec);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec, prompt }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`portrait relay answered ${response.status}`);
    const data = await response.json();
    if (!data.image) throw new Error("portrait relay sent no image");
    return data.image;
  } finally {
    clearTimeout(timer);
  }
}
