// Vercel function: stores one anonymous measurement (see dist/collect.js) in the
// Supabase table "measurements" (tools/measurements.sql). The page can only
// add rows; it can never read them. SUPABASE_URL and SUPABASE_SERVICE_KEY are
// set in the Vercel project (Settings > Environment Variables), never in the repo.
// No address, no browser details and no picture are kept.
const ALLOWED_ORIGINS = ["https://taegyu831.github.io", "http://127.0.0.1:8001", "http://localhost:8001"];
const GENDERS = ["female", "male"];
const AGES = [20, 30, 40, 50];

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const seen = new Map();
function tooMany(ip, now = Date.now()) {
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  seen.set(ip, recent);
  if (seen.size > 500) for (const [key, times] of seen) if (!times.some((t) => now - t < WINDOW_MS)) seen.delete(key);
  return recent.length > MAX_PER_WINDOW;
}

/** Checks the record from the page; returns a clean row or null. */
export function cleanRecord(record) {
  if (!record || typeof record !== "object") return null;
  if (!GENDERS.includes(record.gender) || !AGES.includes(Number(record.age))) return null;
  const values = {};
  const entries = Object.entries(record.values && typeof record.values === "object" ? record.values : {});
  if (entries.length < 5 || entries.length > 80) return null;
  for (const [key, value] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key) || typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 100000) return null;
    values[key] = value;
  }
  const confidence = Number(record.confidence);
  const frames = Number(record.frames);
  if (!(confidence >= 0 && confidence <= 100) || !(frames >= 0 && frames <= 100000)) return null;
  return {
    gender: record.gender,
    age: Number(record.age),
    values,
    confidence: Math.round(confidence),
    frames: Math.round(frames),
    app_version: String(record.appVersion ?? "").slice(0, 20),
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" || !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: "not allowed" });

  const row = cleanRecord(req.body?.record);
  if (!row) return res.status(400).json({ error: "send {record: {gender, age, values, confidence, frames}}" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return res.status(429).json({ error: "too many requests" });
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "server has no database" });

  const reply = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/measurements`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!reply.ok) return res.status(502).json({ error: `database answered ${reply.status}` });
  return res.status(204).end();
}
