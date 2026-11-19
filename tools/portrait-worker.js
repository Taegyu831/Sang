// Public relay for the 인연 portraits, as a Cloudflare Worker (free plan is enough).
// Same job as tools/portrait-proxy.py: the browser sends {"prompt": "..."}, the
// worker adds the API key and returns {"image": "data:image/jpeg;base64,..."}.
//
// Setup (README, "Portraits"):
//   1. Create a Worker, paste this file.
//   2. Settings > Variables: add secret OPENAI_API_KEY.
//   3. Open the app with  ?portrait=https://<your-worker>.workers.dev
const ALLOWED = ["https://taegyu831.github.io", "http://127.0.0.1:8001", "http://localhost:8001"];
const MODEL = "gpt-image-1";
const SIZE = "1024x1024";
const QUALITY = "low";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = {
      "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST" || !ALLOWED.includes(origin)) return json(403, { error: "not allowed" });

    let prompt = "";
    try { prompt = String((await request.json()).prompt || "").trim(); } catch { /* falls through */ }
    if (!prompt || prompt.length > 2000) return json(400, { error: "prompt missing or too long" });

    const reply = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, size: SIZE, quality: QUALITY, n: 1, output_format: "jpeg", output_compression: 82 }),
    });
    if (!reply.ok) return json(502, { error: `OpenAI answered ${reply.status}` });
    const data = await reply.json();
    const image = data?.data?.[0]?.b64_json;
    return image ? json(200, { image: `data:image/jpeg;base64,${image}` }) : json(502, { error: "no image" });
  },
};
