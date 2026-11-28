// The couple picture: prompt, request checks and the relay, with a fake OpenAI (nothing is sent).
import test from "node:test";
import assert from "node:assert/strict";
import handler, { cleanRequest } from "../api/couple.mjs";
import { couplePrompt, coupleEndpoint, VARIETY } from "../dist/talk/couple.js";

const jpeg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(2000)]).toString("base64")}`;
const spec = { partner: "male", age: 20, pole: "feel-" };

function call(body, { origin = "https://taegyu831.github.io", method = "POST" } = {}) {
  const res = { headers: {}, code: 0, data: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(d) { this.data = d; return this; }, end() { return this; } };
  return handler({ method, headers: { origin }, body }, res).then(() => res);
}

test("the prompt keeps the visitor and invents an adult partner", () => {
  const text = couplePrompt(spec);
  assert.match(text, /person in the input photo/);
  assert.match(text, /fictional Korean man in their 20s/);
  assert.match(text, /non-sexual/);
  assert.match(text, /Never give the first person glasses/);
  assert.match(couplePrompt({ partner: "female", age: 15 }), /woman in their 20s/); // never below the adult groups
});

test("the partner's looks change from picture to picture", () => {
  const seen = new Set(Array.from({ length: 200 }, () => couplePrompt(spec)));
  assert.ok(seen.size > 190);
  for (const partner of ["female", "male"]) {
    const first = couplePrompt({ ...spec, partner }, () => 0);
    const last = couplePrompt({ ...spec, partner }, () => 0.999999);
    assert.ok(first.includes(VARIETY.hair[partner][0]));
    assert.ok(last.includes(VARIETY.hair[partner].at(-1)));
    assert.doesNotMatch(first + last, /undefined/);
  }
});

test("only a JPEG and a known spec are accepted", () => {
  assert.ok(cleanRequest({ photos: [jpeg], spec }));
  assert.equal(cleanRequest({ photos: [jpeg, jpeg, jpeg], spec }).images.length, 3);
  assert.equal(cleanRequest({ photos: [jpeg, jpeg, jpeg, jpeg], spec }), null);
  assert.equal(cleanRequest({ photos: [], spec }), null);
  assert.equal(cleanRequest({ photos: [jpeg, "x"], spec }), null);
  assert.equal(cleanRequest({ photos: ["data:image/png;base64,AAAA"], spec }), null);
  assert.equal(cleanRequest({ photos: [jpeg], spec: { ...spec, age: 10 } }), null);
  assert.equal(cleanRequest({ photos: [jpeg], spec: { ...spec, partner: "x" } }), null);
  assert.equal(cleanRequest({ photos: [jpeg], spec: { ...spec, pole: "draw anything" } }), null);
});

test("the relay sends the photo to the edit address and returns the picture", async () => {
  process.env.OPENAI_API_KEY = "test";
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, options) => { sent.push([url, options.body]); return new Response(JSON.stringify({ data: [{ b64_json: "QUJD" }] }), { status: 200 }); };
  try {
    assert.equal((await call({ photos: [jpeg, jpeg, jpeg], spec }, { origin: "https://example.com" })).code, 403);
    assert.equal(sent.length, 0);
    const res = await call({ photos: [jpeg, jpeg, jpeg], spec });
    assert.equal(res.code, 200);
    assert.equal(res.data.image, "data:image/jpeg;base64,QUJD");
    assert.match(sent[0][0], /images\/edits$/);
    assert.equal(sent[0][1].getAll("image[]").length, 3);
    assert.match(sent[0][1].get("prompt"), /All 3 input photos show one and the same person/);
    assert.equal(sent[0][1].get("size"), "1024x1536");
    assert.equal(sent[0][1].get("input_fidelity"), null);
  } finally { globalThis.fetch = real; delete process.env.OPENAI_API_KEY; }
});

test("?couple=off offers nothing", () => {
  assert.equal(coupleEndpoint(new URLSearchParams("couple=off")), "");
  assert.match(coupleEndpoint(new URLSearchParams("")), /api\/couple$/);
});
