// Vercel function: the couple picture at the end (dist/talk/couple.js). The page sends the visitor's
// photos (one to three, only after the visitor chose to) and {partner, age, pole}; the prompt is built
// here, so the address cannot be used with another prompt. The photos are passed on to OpenAI and not stored or
// logged here. OPENAI_API_KEY is set in the Vercel project, never in the repo.
import { couplePrompt, PARTNERS, AGES, MAX_PHOTOS } from "../dist/talk/couple.js";

const ALLOWED_ORIGINS = ["https://taegyu831.github.io", "http://127.0.0.1:8001", "http://localhost:8001"];
const MODELS = (process.env.IMAGE_MODEL || "gpt-image-2,gpt-image-1.5,gpt-image-1").split(",").filter(Boolean);
const SIZE = process.env.COUPLE_SIZE || "1024x1536";
const QUALITY = process.env.COUPLE_QUALITY || "medium";
const MAX_PHOTO_CHARS = 1_000_000; // per picture; the page sends 800x1000 JPEGs, far below this
const POLES = ["drive+", "drive-", "social+", "social-", "feel+", "feel-", "steady+", "steady-"];

// Per server instance only, so the OpenAI monthly limit is still the real cap.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const seen = new Map();
function tooMany(ip, now = Date.now()) {
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  seen.set(ip, recent);
  if (seen.size > 500) for (const [key, times] of seen) if (!times.some((t) => now - t < WINDOW_MS)) seen.delete(key);
  return recent.length > MAX_PER_WINDOW;
}

function jpegBytes(photo) {
  if (typeof photo !== "string" || photo.length > MAX_PHOTO_CHARS) return null;
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  return bytes.length >= 1000 && bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : null;
}

/** Checks what the page sent; returns {images, spec} or null. The front picture comes first. */
export function cleanRequest(body) {
  const photos = body?.photos;
  const spec = body?.spec;
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > MAX_PHOTOS || !spec || typeof spec !== "object") return null;
  const images = photos.map(jpegBytes);
  if (images.includes(null)) return null;
  const pole = spec.pole ?? null;
  if (!PARTNERS.includes(spec.partner) || !AGES.includes(Number(spec.age)) || (pole !== null && !POLES.includes(pole))) return null;
  return { images, spec: { partner: spec.partner, age: Number(spec.age), pole } };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" || !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: "not allowed" });

  const request = cleanRequest(req.body);
  if (!request) return res.status(400).json({ error: "send {photos: [jpeg data URL, ...], spec: {partner, age, pole}}" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return res.status(429).json({ error: "too many requests" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "server has no key" });

  const prompt = couplePrompt({ ...request.spec, shots: request.images.length });
  for (const model of MODELS) {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", prompt);
    const field = request.images.length > 1 ? "image[]" : "image";
    request.images.forEach((bytes, i) => form.append(field, new Blob([bytes], { type: "image/jpeg" }), `face-${i + 1}.jpg`));
    form.set("size", SIZE);
    form.set("quality", QUALITY);
    form.set("n", "1");
    form.set("output_format", "jpeg");
    form.set("output_compression", "85");
    if (model.startsWith("gpt-image-1")) form.set("input_fidelity", "high"); // later models always keep it high
    const reply = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
    if (!reply.ok) {
      const detail = await reply.text();
      console.error(`OpenAI ${reply.status} (${model}): ${detail.slice(0, 300)}`);
      // This account cannot use that model: try the next one.
      if ([400, 403, 404].includes(reply.status) && detail.includes("model")) continue;
      return res.status(502).json({ error: `OpenAI answered ${reply.status}` });
    }
    const image = (await reply.json())?.data?.[0]?.b64_json;
    if (image) return res.status(200).json({ image: `data:image/jpeg;base64,${image}` });
    return res.status(502).json({ error: "no image" });
  }
  return res.status(502).json({ error: "no usable image model" });
}
