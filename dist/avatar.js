// A drawn face for a kind of person (잘 맞는 인연, 조심할 인연).
//
// The face is built from the same readings the story tells: each kind of
// person is carried most strongly by a few face features (facets.js, AXES),
// and those features move the parts below. It is a line drawing made of
// parts, so it needs no network and nobody's real face is imitated.
import { AXES } from "./facets.js";

// How one reading moves the drawing: eye size, outer-corner tilt, eye
// openness, eye gap, mouth width, mouth corners, lip fullness, jaw width,
// chin (-1 pointed, +1 round), forehead width, cheek, nose width and length.
const MOVES = {
  "eyeSize.high": { eye: 1 }, "eyeSize.low": { eye: -1 },
  "eyeOpen.high": { open: 1 }, "eyeOpen.low": { open: -1 },
  "eyeTilt.high": { tilt: 1 }, "eyeTilt.low": { tilt: -1 },
  "eyeGap.high": { gap: 1 }, "eyeGap.low": { gap: -1 },
  "mouthFace.high": { mouth: 1 }, "mouthFace.low": { mouth: -1 },
  "mouthLift.high": { lift: 1 }, "mouthLift.low": { lift: -1 },
  "lipFull.high": { lip: 1 }, "lipFull.low": { lip: -1 },
  "lipRatio.high": { lip: 1 },
  "jaw.high": { jaw: 1 }, "jaw.low": { jaw: -1 },
  "chin.high": { chin: 1 }, "chin.low": { chin: -1 },
  "forehead.high": { fore: 1 }, "forehead.low": { fore: -1 },
  "cheek.high": { cheek: 1 }, "cheek.low": { cheek: -1 },
  "noseWidth.high": { nose: 1 }, "noseWidth.low": { nose: -1 },
  "noseLength.high": { noseLen: 1 }, "noseLength.low": { noseLen: -1 },
};

const NEUTRAL = { eye: 0, open: 0, tilt: 0, gap: 0, mouth: 0, lift: 0, lip: 0, jaw: 0, chin: 0, fore: 0, cheek: 0, nose: 0, noseLen: 0 };
const clamp = (v, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Face parameters for a kind of person such as "drive-" (null: an even face). */
export function paramsOf(pole, limit = 5) {
  const params = { ...NEUTRAL };
  if (!pole) return params;
  const axis = pole.slice(0, -1);
  const sign = pole.endsWith("+") ? 1 : -1;
  const carriers = Object.entries(AXES)
    .map(([key, axes]) => [key, (axes[axis] ?? 0) * sign])
    .filter(([key, v]) => v > 0 && MOVES[key])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  for (const [key] of carriers) for (const [name, delta] of Object.entries(MOVES[key])) params[name] += delta;
  for (const name of Object.keys(params)) params[name] = clamp(params[name]);
  return params;
}

const NS = "http://www.w3.org/2000/svg";
function node(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
const f = (n) => Math.round(n * 10) / 10;

function headPath(p) {
  const forehead = 72 + 9 * p.fore;
  const cheek = 78 + 8 * p.cheek + 5 * p.jaw;
  const jaw = 54 + 22 * p.jaw;
  const chin = 13 + 10 * p.chin;
  const right = [
    [100 + forehead / 2, 82],
    [100 + cheek / 2, 128],
    [100 + jaw / 2, 176],
    [100 + chin, 204],
  ];
  const left = right.map(([x, y]) => [200 - x, y]);
  return [
    `M100 24`,
    `Q${f(right[0][0] + 6)} 24 ${f(right[0][0])} ${right[0][1]}`,
    `Q${f(right[1][0] + 2)} 112 ${f(right[1][0])} ${right[1][1]}`,
    `Q${f(right[2][0] + 1)} 160 ${f(right[2][0])} ${right[2][1]}`,
    `Q${f(right[3][0] + 6)} 200 ${f(right[3][0])} ${right[3][1]}`,
    `Q100 216 ${f(left[3][0])} ${left[3][1]}`,
    `Q${f(left[3][0] - 6)} 200 ${f(left[2][0])} ${left[2][1]}`,
    `Q${f(left[2][0] - 1)} 160 ${f(left[1][0])} ${left[1][1]}`,
    `Q${f(left[1][0] - 2)} 112 ${f(left[0][0])} ${left[0][1]}`,
    `Q${f(left[0][0] - 6)} 24 100 24 Z`,
  ].join(" ");
}

// "female", "male" or "any": only the hair changes. Long hair goes behind the
// face, the fringe goes over it.
function hair(gender, p) {
  const edge = 100 + (72 + 9 * p.fore) / 2;
  const inner = 200 - edge;
  const behind = [];
  if (gender === "female") {
    behind.push(node("path", { d: `M${f(inner - 8)} 70 Q${f(inner - 24)} 150 ${f(inner - 8)} 216 L${f(inner + 14)} 150 Z`, class: "av-hair" }));
    behind.push(node("path", { d: `M${f(edge + 8)} 70 Q${f(edge + 24)} 150 ${f(edge + 8)} 216 L${f(edge - 14)} 150 Z`, class: "av-hair" }));
  }
  const d = gender === "male"
    ? `M${f(inner - 4)} 80 Q${f(inner - 4)} 14 100 14 Q${f(edge + 4)} 14 ${f(edge + 4)} 80 Q${f(edge - 6)} 48 100 52 Q${f(inner + 14)} 44 ${f(inner - 4)} 80 Z`
    : `M${f(inner - 6)} 92 Q${f(inner - 10)} 12 100 12 Q${f(edge + 10)} 12 ${f(edge + 6)} 92 Q${f(edge - 4)} 54 112 50 Q94 62 ${f(inner + 10)} 66 Q${f(inner + 2)} 70 ${f(inner - 6)} 92 Z`;
  return { behind, fringe: node("path", { d, class: "av-hair" }) };
}

/** An SVG face. `tone` is "fit" (warm) or "clash" (muted). */
export function avatarSvg(params, { gender = "any", tone = "fit" } = {}) {
  const p = { ...NEUTRAL, ...params };
  const svg = node("svg", { viewBox: "0 0 200 236", class: `avatar-svg is-${tone}`, role: "img", "aria-label": "가상의 인연 얼굴 그림" });
  const { behind, fringe } = hair(gender, p);
  svg.append(...behind, node("path", { d: headPath(p), class: "av-face" }), fringe);

  // eyes
  const gap = 27 + 6 * p.gap;
  const w = 21 + 6 * p.eye;
  const h = 8.5 + 3.5 * p.eye + 3 * p.open;
  for (const side of [-1, 1]) {
    const cx = 100 + side * gap;
    const g = node("g", { transform: `rotate(${f(-side * p.tilt * 13)} ${f(cx)} 110)` });
    g.append(node("ellipse", { cx: f(cx), cy: 110, rx: f(w / 2), ry: f(h / 2), class: "av-eye" }));
    g.append(node("circle", { cx: f(cx), cy: 110, r: f(Math.min(h / 2 - 0.6, 3.4)), class: "av-pupil" }));
    svg.append(g);
    svg.append(node("path", { d: `M${f(cx - w / 2 - 2)} ${f(100 - h / 2 - 1)} Q${f(cx)} ${f(95 - h / 2 - 2 - p.tilt * 2)} ${f(cx + w / 2 + 2)} ${f(100 - h / 2 + 1)}`, class: "av-brow" }));
  }
  // nose
  const nw = 7 + 5 * p.nose;
  const nl = 24 + 8 * p.noseLen;
  svg.append(node("path", { d: `M100 116 L99 ${f(116 + nl)}`, class: "av-line" }));
  svg.append(node("path", { d: `M${f(100 - nw)} ${f(116 + nl)} Q100 ${f(116 + nl + 7)} ${f(100 + nw)} ${f(116 + nl)}`, class: "av-line" }));
  // mouth
  const mw = 20 + 8 * p.mouth;
  const my = 168 + 4 * p.noseLen;
  const lift = p.lift * 5;
  svg.append(node("path", { d: `M${f(100 - mw)} ${f(my - lift)} Q100 ${f(my + 7)} ${f(100 + mw)} ${f(my - lift)}`, class: "av-mouth", style: `stroke-width:${f(2.4 + 1.4 * p.lip)}px` }));
  svg.append(node("path", { d: `M${f(100 - mw * 0.8)} ${f(my - lift * 0.8 - 2)} Q100 ${f(my - 3 - 2 * p.lip)} ${f(100 + mw * 0.8)} ${f(my - lift * 0.8 - 2)}`, class: "av-line", style: "opacity:0.55" }));
  return svg;
}
