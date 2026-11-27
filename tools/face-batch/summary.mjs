// Reads the page dump of batch.html and prints: failures, each ratio against its calibration centre,
// and how often each part reads high, low or middle. A part that reads the same way on nearly every
// face is either a real feature of the group or an off-centre calibration; this cannot tell which.
import fs from "fs";
const [dom, calPath] = process.argv.slice(2);
const { CALIBRATION } = await import(new URL(calPath, "file://" + process.cwd() + "/"));
const m = fs.readFileSync(dom, "utf8").match(/<pre id="out">(DONE|RUNNING|ERR)([\s\S]*?)<\/pre>/);
if (!m || m[1] !== "DONE") { console.log("the batch did not finish:", m?.[1], m?.[2]?.slice(0, 200)); process.exit(1); }
const rows = JSON.parse(m[2].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
const ok = rows.filter((r) => !r.error);
console.log(`pictures ${rows.length}, measured ${ok.length}, failed ${rows.length - ok.length}`);
for (const r of rows.filter((x) => x.error)) console.log("  failed:", r.name, r.error);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
console.log("\nratio vs calibration centre (z of the group mean, spread in scales)");
for (const [k, c] of Object.entries(CALIBRATION)) {
  const v = ok.map((r) => r.values[k]).filter(Number.isFinite);
  if (v.length < 5) continue;
  const mu = mean(v); const sd = Math.sqrt(mean(v.map((x) => (x - mu) ** 2)));
  console.log(`${k.padEnd(14)} mean ${mu.toFixed(2).padStart(7)}  centre ${String(c.center).padStart(6)}  zmean ${((mu - c.center) / c.scale).toFixed(2).padStart(5)}  spread ${(sd / c.scale).toFixed(2)}`);
}
const cnt = {};
for (const r of ok) for (const p of r.parts) (cnt[p.id] ??= { high: 0, low: 0, middle: 0 })[p.dir]++;
console.log("\nparts (high / low / middle)");
for (const [k, c] of Object.entries(cnt).sort((a, b) => b[1].high + b[1].low - a[1].high - a[1].low)) console.log(`${k.padEnd(14)} ${c.high} / ${c.low} / ${c.middle}`);
console.log("\ndistinct headlines:", new Set(ok.map((r) => r.headline)).size, "of", ok.length);
