// The last present: a photo booth picture of the visitor with a matching, invented partner, made
// by an image API from the visitor's own photo.
//
// The photo leaves this browser only after the visitor chooses it (talk/app.js offer()). It goes to
// our relay (api/couple.mjs), which adds the key and sends it to OpenAI. We keep no copy; the
// result lives on the screen until the start screen comes back.
import { MOOD } from "../portrait.js";

export const DEFAULT_COUPLE_ENDPOINT = "https://project-zek4t.vercel.app/api/couple";
export const PARTNERS = ["female", "male"];
export const AGES = [20, 30, 40, 50]; // all adults

/** ?couple=off turns the present off; ?couple=<url> uses another relay (for tests). */
export function coupleEndpoint(params) {
  const asked = params.get("couple");
  return asked === "off" ? "" : asked || DEFAULT_COUPLE_ENDPOINT;
}

// ARTIFICIAL: what changes from picture to picture, so that visitors whose readings point to the
// same kind of partner do not all meet the same person. None of it comes from physiognomy; only the
// mood (portrait.js MOOD) follows the reading. One entry of each list is drawn for every picture.
export const VARIETY = {
  hair: {
    female: ["a short bob", "long straight hair", "long soft waves", "a medium layered cut", "a tied-back ponytail", "a loose low bun", "a short pixie cut", "shoulder-length hair with curtain bangs"],
    male: ["a short crop", "a side-parted cut", "a soft two-block cut with bangs", "a loose natural perm", "medium-length swept-back hair", "a very short buzz cut", "a centre-parted cut", "short textured hair with the forehead showing"],
  },
  shape: ["an oval face", "a round face", "a square face with a defined jaw", "a long slim face", "a heart-shaped face", "a face with high cheekbones"],
  eyes: ["large double-lidded eyes", "long monolid eyes", "round bright eyes", "narrow smiling eyes", "softly downturned eyes", "slightly upturned eyes"],
  marks: ["thick eyebrows", "faint freckles", "dimples when smiling", "a small mole on the cheek", "a broad smile showing teeth", "full lips", "a straight high nose bridge", "a small rounded nose"],
  glasses: ["no glasses", "no glasses", "no glasses", "thin round metal glasses", "dark rimmed glasses"], // two in five wear them
  skin: ["a fair skin tone", "a medium skin tone", "a warm tanned skin tone"],
  clothes: ["a cream knit sweater", "a navy cardigan over a white T-shirt", "a light blue shirt", "a grey hoodie", "a black turtleneck", "a denim jacket", "a sage green sweatshirt", "a brown corduroy shirt", "a white blouse or shirt with a collar", "a striped long-sleeve T-shirt"],
  backdrop: ["a plain white backdrop", "a pale pink backdrop", "a sky blue backdrop", "a warm beige backdrop", "a soft grey backdrop", "a pale yellow curtain backdrop"],
  pose: ["both making a V sign", "making a heart shape together with one hand each", "each making a small finger heart", "cupping their own chins with their hands like a flower", "leaning their heads together", "laughing and looking at the camera with a thumbs up", "one resting a hand lightly on the other's shoulder"],
};
const draw = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/** The prompt. `pole` is the kind of person who fits (story.js sayingsOf().fit.to), or null.
 *  ARTIFICIAL: light, framing and everything in VARIETY. */
export function couplePrompt({ partner, age = 20, pole = null }, random = Math.random) {
  const decade = AGES.includes(age) ? age : 20;
  const gender = partner === "male" ? "male" : "female";
  const person = gender === "male" ? "man" : "woman";
  const own = (name) => draw(VARIETY[name], random);
  const looks = [draw(VARIETY.hair[gender], random), own("shape"), own("eyes"), own("marks"), own("skin"), own("glasses")];
  return [
    "Make one natural, candid photograph taken in a Korean self photo booth, showing two adults who are a couple.",
    "The first person is the person in the input photo. Keep their face, facial features, face shape, hairstyle, glasses and skin tone faithful and clearly recognisable. Do not beautify them or change who they are.",
    `The second person is an invented, fictional Korean ${person} in their ${decade}s, not a real individual and not a celebrity, an ordinary-looking person with their own distinct face, clearly different from the first person. Looks: ${looks.join(", ")}. Wearing ${own("clothes")}. Presence: ${MOOD[pole] ?? "a balanced, pleasant, warm expression"}.`,
    `They sit close side by side facing the camera with relaxed happy smiles, ${own("pose")}.`,
    `Soft even flash light, ${own("backdrop")}, framed from the chest up, vertical picture, realistic skin texture, modest everyday clothes.`,
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
