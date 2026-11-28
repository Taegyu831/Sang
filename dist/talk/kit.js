// Small helpers of the exhibition page: elements, the cropped photo, and a drawn face for
// development (?dev=1) when there is no camera.
import { LANDMARK } from "../features.js";
import { CALIBRATION } from "../calibration.js";

export function h(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
export function button(className, onClick, ...children) {
  const node = h("button", className, ...children);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}
// ---------- sample face (no camera) ----------
const SAMPLE_POINTS = {
  meshTop: [50, 18], glabella: [50, 39], noseBase: [50, 59], chin: [50, 82], faceLeft: [22, 50], faceRight: [78, 50], templeLeft: [25, 40], templeRight: [75, 40],
  foreheadLeft: [30, 27], foreheadRight: [70, 27], jawLeft: [30, 70], jawRight: [70, 70], eyeLeftOuter: [29, 44], eyeLeftInner: [43, 44], eyeRightInner: [57, 44], eyeRightOuter: [71, 44],
  noseBridge: [50, 39], noseTip: [50, 56], upperLip: [50, 65], lowerLip: [50, 71], noseLeft: [43, 57], noseRight: [57, 57], mouthLeft: [38, 67], mouthRight: [62, 67],
  upperLipInner: [50, 67], lowerLipInner: [50, 68], eyeLeftTop: [36, 41.5], eyeLeftBottom: [36, 46.5], eyeRightTop: [64, 41.5], eyeRightBottom: [64, 46.5],
  browLeftOuter: [27, 38], browLeftInner: [45, 37], browLeftTop: [36, 35], browRightOuter: [73, 38], browRightInner: [55, 37], browRightTop: [64, 35], cheekLeft: [24, 58], cheekRight: [76, 58], chinLeft: [43, 80], chinRight: [57, 80],
};
export function sampleFace() {
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 100 125"><rect width="100" height="125" fill="#8f9bd8"/><g transform="scale(1 1.25)"><path d="M14 100c4-14 20-17 36-17s32 3 36 17z" fill="#2b2a4a"/><ellipse cx="50" cy="50" rx="29" ry="33" fill="#f3c6a5"/><path d="M20 48C16 20 36 10 52 12c18 1 33 14 28 38-4-12-6-17-12-20-12 7-30 8-40 4-4 3-6 7-8 14z" fill="#2b2a4a"/><path d="M28 38q8-5 16-1M56 37q8-4 16 1" stroke="#2b2a4a" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="36" cy="44" rx="6.5" ry="2.8" fill="#fff"/><ellipse cx="64" cy="44" rx="6.5" ry="2.8" fill="#fff"/><circle cx="36" cy="44" r="2.4" fill="#2b2a4a"/><circle cx="64" cy="44" r="2.4" fill="#2b2a4a"/><path d="M50 44q-2 10-7 13 7 4 14 0" stroke="#bd7a60" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M38 66q12 11 24 0-12 3-24 0z" fill="#d2506a"/></g></svg>`;
  const base = Object.fromEntries(Object.entries(CALIBRATION).map(([k, c]) => [k, c.center]));
  const values = { ...base, leftEye: 1, rightEye: 1, outerLeft: 1.27, outerRight: 1.27, eyeGap: 1.43, noseDepth: 64, bridgeDepth: 50, chinDepth: 44, stopMiddle: 33.5, stopLower: 46.9, jawCheek: 88, noseWidth: 28.5, eyeSize: 25, mouthFace: 41 };
  const points = Object.fromEntries(Object.entries(SAMPLE_POINTS).map(([k, [x, y]]) => [k, { x, y }]));
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art)}`, points, dots: Object.values(points), values, sample: true };
}

export function cropFace(canvas, { found, values }) {
  const w = canvas.width; const ht = canvas.height;
  const xs = found.map((m) => m.x * w); const ys = found.map((m) => m.y * ht);
  const fh = Math.max(...ys) - Math.min(...ys); const fw = Math.max(...xs) - Math.min(...xs);
  const ch = Math.min(ht, Math.max(fh * 1.55, (fw * 1.45) / 0.8)); const cw = Math.min(w, ch * 0.8);
  const cx = Math.max(0, Math.min(w - cw, (Math.max(...xs) + Math.min(...xs)) / 2 - cw / 2));
  const cy = Math.max(0, Math.min(ht - ch, (Math.max(...ys) + Math.min(...ys)) / 2 - fh * 0.05 - ch / 2));
  const out = document.createElement("canvas");
  out.width = 800; out.height = 1000;
  const g = out.getContext("2d");
  g.translate(800, 0); g.scale(-1, 1); // a mirror, as the visitor saw it
  g.drawImage(canvas, cx, cy, cw, ch, 0, 0, 800, 1000);
  const at = (m) => ({ x: 100 - ((m.x * w - cx) / cw) * 100, y: ((m.y * ht - cy) / ch) * 100 });
  return { src: out.toDataURL("image/jpeg", 0.9), points: Object.fromEntries(Object.entries(LANDMARK).map(([k, i]) => [k, at(found[i])])), dots: found.map(at), values };
}

/** The photo of the closing card. */
export function photoCard(face) {
  const img = h("img", ""); img.src = face.src; img.alt = "촬영한 얼굴";
  return h("div", "photo", img);
}
