// Node test for the parallax depth fit: synthetic faces with known depth.
import { canonicalPoints, estimatePose } from "../dist/pose.js";
import { fitParallax, measureDepths, splitHalves, PAIRS } from "../dist/lab/depth-analysis.js";

let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed += 1; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`); };
const rad = (d) => (d * Math.PI) / 180;
let seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

// Same yaw convention as pose.js tests: x' = x cos - z sin, z negative toward the camera.
const rotRoll = (p, a) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a), z: p.z });
const rotYaw = (p, a) => ({ x: p.x * Math.cos(a) - p.z * Math.sin(a), y: p.y, z: p.x * Math.sin(a) + p.z * Math.cos(a) });
const base = canonicalPoints(14);
// Cheek bump points are not in the canonical set; take them from the outline points at their depth.
base.cheekBumpLeft = { ...base.faceLeft };
base.cheekBumpRight = { ...base.faceRight };

function frames(count, noise, nose = 0, tilt = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const yaw = 22 * Math.sin((i / count) * Math.PI * 4); // two sweeps left and right
    const pts = {};
    for (const [k, p] of Object.entries(base)) {
      const q = rotRoll(rotYaw(k === "noseTip" ? { ...p, z: p.z - nose } : p, rad(yaw)), rad(tilt * Math.sin((i / count) * Math.PI * 4)));
      pts[k] = { x: q.x + 640 + (rnd() - 0.5) * noise, y: q.y + 360, z: q.z };
    }
    const pose = estimatePose(pts);
    out.push({ t: i, yaw: pose.yaw, pitch: 0, roll: pose.roll, pts });
  }
  return out;
}

{
  // a flat fit: dx = 3 cos + 2 sin
  const s = [];
  for (let y = -20; y <= 20; y += 2) s.push({ yaw: y, dx: 3 * Math.cos(rad(y)) + 2 * Math.sin(rad(y)) });
  const fit = fitParallax(s);
  check("fit recovers dX and dZ", Math.abs(fit.a - 3) < 1e-6 && Math.abs(fit.b - 2) < 1e-6);
  check("no fit without enough yaw spread", fitParallax(s.filter((v) => Math.abs(v.yaw) < 4)) === null);
}
{
  const clean = measureDepths(frames(200, 0));
  const nose = clean.pairs.noseEyes;
  // truth from the canonical model: noseTip against the eye outer midpoint
  const zTrue = (-(base.noseTip.z) - -((base.eyeLeftOuter.z + base.eyeRightOuter.z) / 2));
  const eyeW = Math.abs(base.eyeRightOuter.x - base.eyeLeftOuter.x);
  check("nose sticks out, positive depth", nose.parallax > 0, `parallax ${nose.parallax?.toFixed(2)}`);
  check("clean parallax matches the true depth", Math.abs(nose.parallax - (zTrue / eyeW) * 100) < 1.5, `got ${nose.parallax.toFixed(2)} true ${((zTrue / eyeW) * 100).toFixed(2)}`);
  const longer = measureDepths(frames(200, 0, 30)).pairs.noseEyes.parallax;
  check("a longer nose reads more depth", longer > nose.parallax + 10, `${nose.parallax.toFixed(1)} -> ${longer.toFixed(1)}`);
}
{
  const noisy = measureDepths(frames(300, 2)); // 2 px of landmark noise
  const [h1, h2] = splitHalves(frames(300, 2));
  const diff = Math.abs(h1.pairs.noseEyes.parallax - h2.pairs.noseEyes.parallax);
  check("2 px of noise keeps both halves close", diff < 4, `halves ${h1.pairs.noseEyes.parallax.toFixed(1)} / ${h2.pairs.noseEyes.parallax.toFixed(1)}`);
  check("every pair reports a number", PAIRS.every((p) => noisy.pairs[p.id].parallax !== null));
  const straight = measureDepths(frames(120, 0).map((f) => ({ ...f, yaw: 0.5 * Math.sign(f.yaw) })));
  check("a face that never turns gives no depth", straight.pairs.noseEyes === undefined && straight.scale === null);
}
{
  // a head that tilts while it turns (roll follows yaw): the chin, far below the eyes, would pick up a false depth
  const clean = measureDepths(frames(300, 0)).pairs.chinEyes.parallax;
  const tilted = frames(300, 0, 0, 8);
  const fixed = measureDepths(tilted).pairs.chinEyes.parallax;
  const raw = measureDepths(tilted, { deroll: false }).pairs.chinEyes.parallax;
  check("without tilt correction the chin reads wrong", Math.abs(raw - clean) > 3, `clean ${clean.toFixed(1)} raw ${raw.toFixed(1)}`);
  check("with tilt correction the chin reads right again", Math.abs(fixed - clean) < 1.5, `fixed ${fixed.toFixed(1)}`);
}
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
