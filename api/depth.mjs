// Vercel function: stores one depth-lab recording (dist/lab/depth-lab.html) in the Supabase
// table "depth_runs" (tools/depth_runs.sql) and answers with the participant number.
// Numbers only: six face points per frame and the head angles. No picture, no name, no address.
// The page can only add rows, never read them. SUPABASE_URL and SUPABASE_SERVICE_KEY are set in
// the Vercel project, never in the repo. Without participant_no the server hands out the next number.
const ALLOWED_ORIGINS = ["https://taegyu831.github.io", "http://127.0.0.1:8001", "http://localhost:8001"];
const POINTS = ["eyeLeftOuter", "eyeRightOuter", "noseTip", "cheekBumpLeft", "cheekBumpRight", "chin"];
const MAX_FRAMES = 2000;
const RATINGS = {
  nose: ["", "낮고 평평하다", "보통", "높고 나왔다"],
  cheek: ["", "평평하다", "보통", "나와 있다"],
};

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 12;
const seen = new Map();
function tooMany(ip, now = Date.now()) {
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  seen.set(ip, recent);
  if (seen.size > 500) for (const [key, times] of seen) if (!times.some((t) => now - t < WINDOW_MS)) seen.delete(key);
  return recent.length > MAX_PER_WINDOW;
}

const num = (v, limit = 100000) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;

/** Checks the recording from the page; returns a clean row (without participant numbers) or null. */
export function cleanRecord(record) {
  if (!record || typeof record !== "object" || !Array.isArray(record.frames)) return null;
  if (record.frames.length < 100 || record.frames.length > MAX_FRAMES) return null;
  const frames = [];
  for (const f of record.frames) {
    if (!f || !num(f.t, 1000) || !num(f.yaw, 180) || !num(f.pitch, 180) || !num(f.roll, 180) || !f.pts || typeof f.pts !== "object") return null;
    const pts = {};
    for (const name of POINTS) {
      const p = f.pts[name];
      if (!Array.isArray(p) || p.length !== 3 || !p.every((v) => num(v))) return null;
      pts[name] = p;
    }
    frames.push({ t: f.t, yaw: f.yaw, pitch: f.pitch, roll: f.roll, pts });
  }
  const rating = {
    nose: RATINGS.nose.includes(record.rating?.nose ?? "") ? record.rating?.nose ?? "" : "",
    cheek: RATINGS.cheek.includes(record.rating?.cheek ?? "") ? record.rating?.cheek ?? "" : "",
  };
  const cam = record.camera && typeof record.camera === "object" ? record.camera : {};
  const camera = {
    label: String(cam.label ?? "").slice(0, 80),
    width: num(cam.width) ? cam.width : null,
    height: num(cam.height) ? cam.height : null,
    fps: num(cam.fps) ? cam.fps : null,
    // The browser family only, to tell Safari from Chrome. The full user agent is not kept.
    browser: String(record.browser ?? "").slice(0, 20),
  };
  return { camera, rating, frames };
}

async function rest(base, key, path, init = {}) {
  return fetch(`${base.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
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
  if (!row) return res.status(400).json({ error: "send {record: {camera, rating, frames}}" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return res.status(429).json({ error: "too many requests" });
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "server has no database" });

  let participant = Number(req.body?.participantNo);
  if (Number.isInteger(participant) && participant >= 1 && participant < 100000) {
    // A returning participant: the number must already exist (number 1 is the owner's, recorded locally).
    if (participant !== 1) {
      const check = await rest(SUPABASE_URL, SUPABASE_SERVICE_KEY, `depth_runs?participant_no=eq.${participant}&select=id&limit=1`);
      const rows = check.ok ? await check.json() : null;
      if (!rows?.length) participant = null;
    }
  } else participant = null;
  if (participant === null) {
    const next = await rest(SUPABASE_URL, SUPABASE_SERVICE_KEY, "rpc/next_depth_participant", { method: "POST", body: "{}" });
    if (!next.ok) return res.status(502).json({ error: `database answered ${next.status}` });
    participant = Number(await next.json());
  }
  const counted = await rest(SUPABASE_URL, SUPABASE_SERVICE_KEY, `depth_runs?participant_no=eq.${participant}&select=id`, { method: "HEAD", headers: { Prefer: "count=exact" } });
  const take = (Number((counted.headers.get("content-range") || "").split("/")[1]) || 0) + 1;

  const saved = await rest(SUPABASE_URL, SUPABASE_SERVICE_KEY, "depth_runs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ participant_no: participant, take, ...row }),
  });
  if (!saved.ok) return res.status(502).json({ error: `database answered ${saved.status}` });
  return res.status(200).json({ participantNo: participant, take });
}
