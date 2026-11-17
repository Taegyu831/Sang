// Where the hairline is, from a hair mask (MediaPipe hair segmenter), so the top
// third of the face can start at the real hairline instead of the mesh top
// (which sits below it). Pure functions; the app supplies the mask.

/**
 * @param mask     Uint8Array, one value per pixel, nonzero = hair
 * @param width    mask width in pixels
 * @param height   mask height in pixels
 * @param probe    { xs: [pixel x of each column to test], y: pixel y of the mesh top, reach: how far above it to look }
 * @returns { status: "found", y } | { status: "covered" } | { status: "none" }
 *   found    the first hair above the forehead, taken as the median of the columns
 *   covered  hair lies over the forehead itself (a fringe), so the hairline is hidden
 *   none     no hair found above the forehead (bald, hat, or a mask miss)
 */
export function findHairline(mask, width, height, { xs, y, reach }) {
  const at = (x, yy) => mask[Math.round(yy) * width + Math.round(x)] > 0;
  const found = [];
  let covered = 0;
  let tested = 0;
  for (const x of xs) {
    if (x < 1 || x >= width - 1 || y < 1 || y >= height) continue;
    tested += 1;
    // The mesh top is skin on a clear forehead; hair there means a fringe.
    if (at(x, y) && at(x, y + 2)) { covered += 1; continue; }
    const top = Math.max(1, Math.round(y - reach));
    let run = 0;
    let hit = null;
    for (let yy = Math.round(y); yy >= top; yy -= 1) {
      if (at(x, yy)) {
        run += 1;
        if (run >= 3) { hit = yy + run - 1; break; }
      } else run = 0;
    }
    if (hit !== null) found.push(hit);
  }
  if (tested && covered * 2 > tested) return { status: "covered" };
  if (found.length < Math.max(2, Math.ceil(tested / 2))) return { status: "none" };
  found.sort((a, b) => a - b);
  return { status: "found", y: found[Math.floor(found.length / 2)] };
}

/**
 * Hairline based thirds from one near-frontal frame.
 *   raw       the frame's points in pixels (meshTop, glabella)
 *   values    the capture's pose-corrected values (upperThird, middleThird, lowerThird, in percent)
 *   hairY     pixel y of the hairline
 * The hairline-to-brow distance is compared with the mesh-top-to-brow distance in the same
 * frame (so a small nod cancels out) and applied to the corrected upper third.
 * Returns null when the numbers do not make sense.
 */
export function hairThirds(raw, values, hairY) {
  const meshGap = raw.glabella.y - raw.meshTop.y;
  const hairGap = raw.glabella.y - hairY;
  if (!(meshGap > 0) || !(hairGap > 0)) return null;
  const ratio = hairGap / meshGap;
  // The hairline is above the mesh top; anything else is a bad read.
  if (ratio < 1.0 || ratio > 2.6) return null;
  const upper = values.upperThird * ratio;
  const total = upper + values.middleThird + values.lowerThird;
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    upperThirdHair: (upper / total) * 100,
    middleThirdHair: (values.middleThird / total) * 100,
    lowerThirdHair: (values.lowerThird / total) * 100,
    hairRatio: ratio,
  };
}
