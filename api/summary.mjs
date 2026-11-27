// Vercel function: writes the whole-reading summary. The page sends only
// {spec: {keys, poles, age}}; the prompt is built here (dist/summary.js), so nobody can
// use this address to write something else. OPENAI_API_KEY is set in the Vercel
// project (Settings > Environment Variables), never in the repo.
import { readFileSync } from "node:fs";
import { cleanSummarySpec, summaryPrompt, cleanSummary } from "../dist/summary.js";

const partsContent = JSON.parse(readFileSync(new URL("../dist/parts.json", import.meta.url), "utf8"));
const ALLOWED_ORIGINS = ["https://taegyu831.github.io", "http://127.0.0.1:8001", "http://localhost:8001"];
// The first model this account can use is taken.
const MODELS = (process.env.SUMMARY_MODEL || "gpt-4.1-mini,gpt-4o-mini,gpt-5-mini").split(",").filter(Boolean);
const MODEL_WAIT_MS = 22000;

// Slows down one visitor asking again and again. Per server instance only, so the
// OpenAI monthly limit is still the real cap.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 40;
const seen = new Map();
function tooMany(ip, now = Date.now()) {
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  seen.set(ip, recent);
  if (seen.size > 500) for (const [key, times] of seen) if (!times.some((t) => now - t < WINDOW_MS)) seen.delete(key);
  return recent.length > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" || !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: "not allowed" });

  const spec = cleanSummarySpec(req.body?.spec);
  if (!spec) return res.status(400).json({ error: "send {spec: {keys, poles, age}}" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return res.status(429).json({ error: "too many requests" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "server has no key" });

  const { system, user } = summaryPrompt(spec, partsContent);
  for (const model of MODELS) {
    let reply;
    try {
      reply = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_completion_tokens: 3000, store: false }),
        signal: AbortSignal.timeout(MODEL_WAIT_MS),
      });
    } catch (error) {
      console.error(`OpenAI call failed (${model}): ${error.name}`);
      return res.status(502).json({ error: "no answer" });
    }
    if (!reply.ok) {
      const detail = await reply.text();
      console.error(`OpenAI ${reply.status} (${model}): ${detail.slice(0, 300)}`);
      // This account cannot use that model: try the next one.
      if ([400, 403, 404].includes(reply.status) && detail.includes("model")) continue;
      return res.status(502).json({ error: `OpenAI answered ${reply.status}` });
    }
    const paragraphs = cleanSummary((await reply.json())?.choices?.[0]?.message?.content);
    if (!paragraphs) return res.status(502).json({ error: "unusable answer" });
    return res.status(200).json({ summary: paragraphs.join("\n\n"), model });
  }
  return res.status(502).json({ error: "no usable text model" });
}
