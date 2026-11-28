// The last present: a photo booth picture of the visitor with a matching, invented partner, made
// by an image API from the visitor's own photo.
//
// The photo leaves this browser only after the visitor chooses it (talk/app.js offer()). It goes to
// our relay (api/couple.mjs), which adds the key and sends it to OpenAI. We keep no copy; the
// result lives on the screen until the start screen comes back.
import { MOOD, featureWords } from "../portrait.js";

export const DEFAULT_COUPLE_ENDPOINT = "https://project-zek4t.vercel.app/api/couple";
export const PARTNERS = ["female", "male"];
export const AGES = [20, 30, 40, 50]; // all adults

/** ?couple=off turns the present off; ?couple=<url> uses another relay (for tests). */
export function coupleEndpoint(params) {
  const asked = params.get("couple");
  return asked === "off" ? "" : asked || DEFAULT_COUPLE_ENDPOINT;
}

/** The prompt. `pole` is the kind of person who fits (story.js sayingsOf().fit.to), or null.
 *  ARTIFICIAL: pose, light, backdrop and clothes. */
export function couplePrompt({ partner, age = 20, pole = null }) {
  const decade = AGES.includes(age) ? age : 20;
  const person = partner === "male" ? "man" : "woman";
  const features = featureWords(pole);
  return [
    "Make one natural, candid photograph taken in a Korean self photo booth, showing two adults who are a couple.",
    "The first person is the person in the input photo. Keep their face, facial features, face shape, hairstyle, glasses and skin tone faithful and clearly recognisable. Do not beautify them or change who they are.",
    `The second person is an invented, fictional Korean ${person} in their ${decade}s, not a real individual and not a celebrity. Presence: ${MOOD[pole] ?? "a balanced, pleasant, warm expression"}.${features.length ? ` Face: ${features.join(", ")}.` : ""}`,
    "They sit close side by side facing the camera, shoulders touching, with relaxed happy smiles and a playful friendly pose such as a V sign or a finger heart.",
    "Soft even flash light, a plain light backdrop, framed from the chest up, vertical picture, realistic skin texture, modest everyday clothes.",
    "Wholesome and non-sexual. No text, no logo, no frame, no watermark.",
  ].join(" ");
}

/** Resolves to the picture as a data URL, or throws. */
export async function requestCouple(endpoint, { photo, partner, age, pole }, { signal, timeoutMs = 180000 } = {}) {
  const timer = new AbortController();
  const stop = () => timer.abort();
  const id = setTimeout(stop, timeoutMs);
  signal?.addEventListener("abort", stop);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo, spec: { partner, age, pole } }),
      signal: timer.signal,
    });
    if (!response.ok) throw new Error(`couple relay answered ${response.status}`);
    const data = await response.json();
    if (!data.image) throw new Error("couple relay sent no picture");
    return data.image;
  } finally {
    clearTimeout(id);
  }
}
