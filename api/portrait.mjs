// Vercel function: makes the 인연 portrait. The page sends only
// {spec: {pole, kind, gender, age}}; the prompt is built here, so nobody can
// use this address to draw something else. OPENAI_API_KEY is set in the Vercel
// project (Settings > Environment Variables), never in the repo.
import { portraitPrompt } from "../dist/portrait.js";

const ALLOWED_ORIGINS = ["https://taegyu831.github.io", "http://127.0.0.1:8001", "http://localhost:8001"];
const MODELS = (process.env.IMAGE_MODEL || "gpt-image-2,gpt-image-1.5,gpt-image-1").split(",").filter(Boolean);
const SIZE = process.env.IMAGE_SIZE || "1024x1024";
const QUALITY = process.env.IMAGE_QUALITY || "low";

const POLES = ["drive+", "drive-", "social+", "social-", "feel+", "feel-", "steady+", "steady-"];
const KINDS = ["fit", "clash"];
const GENDERS = ["female", "male"];
const AGES = [20, 30, 40, 50];

// Slows down one visitor asking again and again. Per server instance only, so the
// OpenAI monthly limit is still the real cap.
const WINDOW_MS = 10 * 60 * 1000;
// An exhibition computer (or a whole school network) shares one address, and a visitor asks twice.
const MAX_PER_WINDOW = 40;
const seen = new Map();
function tooMany(ip, now = Date.now()) {
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  seen.set(ip, recent);
  if (seen.size > 500) for (const [key, times] of seen) if (!times.some((t) => now - t < WINDOW_MS)) seen.delete(key);
  return recent.length > MAX_PER_WINDOW;
}

/** Checks the spec from the page; returns a clean spec or null. */
export function cleanSpec(spec) {
  if (!spec || typeof spec !== "object") return null;
  const pole = spec.pole ?? null;
  if (pole !== null && !POLES.includes(pole)) return null;
  if (!KINDS.includes(spec.kind) || !GENDERS.includes(spec.gender) || !AGES.includes(Number(spec.age))) return null;
  return { pole, kind: spec.kind, gender: spec.gender, age: Number(spec.age) };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" || !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: "not allowed" });

  const spec = cleanSpec(req.body?.spec);
  if (!spec) return res.status(400).json({ error: "send {spec: {pole, kind, gender, age}}" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return res.status(429).json({ error: "too many requests" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "server has no key" });

  const prompt = portraitPrompt(spec);
  for (const model of MODELS) {
    const reply = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size: SIZE, quality: QUALITY, n: 1, output_format: "jpeg", output_compression: 82 }),
    });
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
