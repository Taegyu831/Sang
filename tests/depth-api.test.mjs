// Checks api/depth.mjs with a fake database: numbering, returning participants, bad input.
import handler, { cleanRecord } from "../api/depth.mjs";
let failed = 0;
const ok = (name, cond, info = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name} ${info}`); if (!cond) failed++; };

const POINTS = ["eyeLeftOuter", "eyeRightOuter", "noseTip", "cheekBumpLeft", "cheekBumpRight", "chin"];
const frames = Array.from({ length: 150 }, (_, i) => ({ t: i / 6, yaw: 0, pitch: 0, roll: 0, pts: Object.fromEntries(POINTS.map((k) => [k, [1, 2, 3]])) }));
const record = { camera: { label: "x", width: 1280, height: 720 }, browser: "Safari", rating: { nose: "보통", cheek: "x" }, frames };

let seq = 1, rows = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("rpc/next_depth_participant")) return { ok: true, json: async () => ++seq };
  if (u.includes("depth_runs") && init.method === "POST") { rows.push(JSON.parse(init.body)); return { ok: true }; }
  if (u.includes("depth_runs") && init.method === "HEAD") { const n = Number(/eq\.(\d+)/.exec(u)[1]); return { ok: true, headers: { get: () => `0-0/${rows.filter((r) => r.participant_no === n).length}` } }; }
  if (u.includes("depth_runs")) { const n = Number(/eq\.(\d+)/.exec(u)[1]); return { ok: true, json: async () => rows.filter((r) => r.participant_no === n).map(() => ({ id: 1 })) }; }
  return { ok: false, status: 404 };
};
process.env.SUPABASE_URL = "http://db"; process.env.SUPABASE_SERVICE_KEY = "k";
const call = async (body, origin = "http://127.0.0.1:8001") => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ method: "POST", headers: { origin, "x-forwarded-for": "ip" + Math.random() }, body }, res);
  return res;
};

let r = await call({ record });
ok("first newcomer gets 2", r.code === 200 && r.body.participantNo === 2 && r.body.take === 1, JSON.stringify(r.body));
r = await call({ record });
ok("second newcomer gets 3", r.body.participantNo === 3, JSON.stringify(r.body));
r = await call({ participantNo: 2, record });
ok("returning participant keeps number, take 2", r.body.participantNo === 2 && r.body.take === 2, JSON.stringify(r.body));
r = await call({ participantNo: 77, record });
ok("unknown number is not trusted, new number given", r.body.participantNo === 4, JSON.stringify(r.body));
r = await call({ participantNo: 1, record });
ok("owner number 1 accepted", r.body.participantNo === 1, JSON.stringify(r.body));
r = await call({ record: { ...record, frames: frames.slice(0, 10) } });
ok("too few frames rejected", r.code === 400);
r = await call({ record }, "https://evil.example");
ok("other origin refused", r.code === 403);
ok("invalid rating is blanked", cleanRecord(record).rating.cheek === "" && cleanRecord(record).rating.nose === "보통");
ok("no extra fields kept", Object.keys(cleanRecord({ ...record, name: "a" })).join() === "camera,rating,frames");
console.log(failed ? "FAILED" : "ALL PASSED"); process.exit(failed ? 1 : 0);
