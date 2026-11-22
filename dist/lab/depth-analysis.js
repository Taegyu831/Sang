// Depth from head turn ("parallax") for the depth lab (tests/depth-lab.html).
//
// Idea. When the head turns by yaw psi, a point that sits nearer the camera than a
// reference point moves sideways on the screen by a different amount. For two points
// A (reference) and B (the part to judge), seen in a frame with yaw psi:
//     x_B - x_A  =  dX * cos(psi)  +  dZ * sin(psi)
// dX is their horizontal gap when the face looks straight at the camera, dZ is how much
// nearer to the camera B is than A (positive: B sticks out). Over many frames with
// different yaw, dX and dZ come out of a small least squares fit. No depth value from the
// model is used, only where the two points are drawn on the screen, and the yaw.
//
// What this does not do: it ignores camera perspective and pitch (frames with a nod are
// left out), and the yaw itself comes from the face model (a global angle averaged over
// many points). The depth lab exists to find out whether the numbers are steady enough.

const RAD = Math.PI / 180;

/** Named point or midpoint of two named points ("a+b"), in pixels. */
export function pointOf(pts, name) {
  if (name.includes("+")) {
    const [a, b] = name.split("+").map((n) => pointOf(pts, n));
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  }
  return pts[name] ?? null;
}

/**
 * Pairs to judge. depth = how much nearer to the camera `to` is than `from`.
 * Left and right follow features.js, which calls the point on the image left "Left" (the
 * subject's own right side).
 */
export const PAIRS = [
  { id: "noseEyes", label: "코끝이 눈보다 나온 정도", from: "eyeLeftOuter+eyeRightOuter", to: "noseTip" },
  { id: "noseCheeks", label: "코끝이 광대 앞면보다 나온 정도", from: "cheekBumpLeft+cheekBumpRight", to: "noseTip" },
  { id: "cheekEyesL", label: "화면 왼쪽 광대가 눈 옆보다 나온 정도", from: "eyeLeftOuter", to: "cheekBumpLeft" },
  { id: "cheekEyesR", label: "화면 오른쪽 광대가 눈 옆보다 나온 정도", from: "eyeRightOuter", to: "cheekBumpRight" },
  { id: "chinEyes", label: "턱끝이 눈보다 나온 정도", from: "eyeLeftOuter+eyeRightOuter", to: "chin" },
];

/**
 * Horizontal gap between two points with the head tilt (roll) taken out. A tilted head
 * turns the vertical gap between the points into a sideways gap; without this a nose
 * or chin far below the eyes picks up a false depth whenever the head tilts while it turns.
 */
function gapX(frame, a, b, deroll) {
  const r = deroll ? (frame.roll ?? 0) * RAD : 0;
  return (b.x - a.x) * Math.cos(r) + (b.y - a.y) * Math.sin(r);
}

const SCALE_PAIR = { from: "eyeLeftOuter", to: "eyeRightOuter" };

/**
 * Least squares for dx_i = a cos(psi_i) + b sin(psi_i).
 * @returns {{a:number,b:number,rms:number,n:number,yawMin:number,yawMax:number}|null}
 */
export function fitParallax(samples, minSpread = 15) {
  if (samples.length < 12) return null;
  let cc = 0, cs = 0, ss = 0, cy = 0, sy = 0;
  let yawMin = Infinity, yawMax = -Infinity;
  for (const { yaw, dx } of samples) {
    const c = Math.cos(yaw * RAD), s = Math.sin(yaw * RAD);
    cc += c * c; cs += c * s; ss += s * s; cy += c * dx; sy += s * dx;
    yawMin = Math.min(yawMin, yaw); yawMax = Math.max(yawMax, yaw);
  }
  if (yawMax - yawMin < minSpread) return null;
  const det = cc * ss - cs * cs;
  if (Math.abs(det) < 1e-9) return null;
  const a = (cy * ss - sy * cs) / det;
  const b = (sy * cc - cy * cs) / det;
  let sq = 0;
  for (const { yaw, dx } of samples) {
    const e = dx - (a * Math.cos(yaw * RAD) + b * Math.sin(yaw * RAD));
    sq += e * e;
  }
  return { a, b, rms: Math.sqrt(sq / samples.length), n: samples.length, yawMin, yawMax };
}

/** Frames usable for the fit: a face, a small nod, within the range the model keeps steady. */
export function usable(frames, { yawLimit = 35, pitchLimit = 12 } = {}) {
  return frames.filter((f) => f.pts && Number.isFinite(f.yaw) && Math.abs(f.yaw) <= yawLimit && Math.abs(f.pitch ?? 0) <= pitchLimit);
}

/**
 * Depth of each pair, as a share (percent) of the outer eye width, by parallax and by
 * the model's own z for comparison.
 * @param frames [{ yaw, pitch, pts }] with pts in pixels (x, y, z as features.js getPoints gives)
 */
export function measureDepths(frames, { pairs = PAIRS, yawKey = "yaw", deroll = true } = {}) {
  const good = usable(frames.map((f) => ({ ...f, yaw: f[yawKey] })));
  const scaleFit = fitParallax(good.flatMap((f) => {
    const a = pointOf(f.pts, SCALE_PAIR.from), b = pointOf(f.pts, SCALE_PAIR.to);
    return a && b ? [{ yaw: f.yaw, dx: gapX(f, a, b, deroll) }] : [];
  }));
  const out = { frames: good.length, scale: scaleFit?.a ?? null, yawMin: scaleFit?.yawMin ?? null, yawMax: scaleFit?.yawMax ?? null, pairs: {} };
  if (!scaleFit || !(scaleFit.a > 0)) return out;
  const eyeWidth = scaleFit.a;
  for (const pair of pairs) {
    const samples = [];
    const zs = [];
    for (const f of good) {
      const a = pointOf(f.pts, pair.from), b = pointOf(f.pts, pair.to);
      if (!a || !b) continue;
      samples.push({ yaw: f.yaw, dx: gapX(f, a, b, deroll) });
      // The model's z, from nearly straight-on frames only (smaller z is nearer the camera).
      if (Math.abs(f.yaw) <= 8) zs.push(a.z - b.z);
    }
    const fit = fitParallax(samples);
    const zMean = zs.length ? zs.reduce((s, v) => s + v, 0) / zs.length : null;
    out.pairs[pair.id] = {
      parallax: fit ? (fit.b / eyeWidth) * 100 : null,
      fitRms: fit ? (fit.rms / eyeWidth) * 100 : null,
      modelZ: zMean === null ? null : (zMean / eyeWidth) * 100,
      n: samples.length,
    };
  }
  return out;
}

/**
 * Steadiness: the same measurement from the first and the second half of the frames
 * (by time). A usable measure gives nearly the same number in both halves.
 */
export function splitHalves(frames, options) {
  const sorted = [...frames].sort((x, y) => x.t - y.t);
  const mid = Math.floor(sorted.length / 2);
  return [measureDepths(sorted.slice(0, mid), options), measureDepths(sorted.slice(mid), options)];
}
