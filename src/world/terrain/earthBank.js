const FINISH_REACH = 5.5; // detail fades across the dry approach to the bank
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Locate sub-cell intersections with the level sheet. Only nearby vertices
// need distances; the unmodified bowl, street and perimeter keep their heights.
export function bankFinishWeights(depth, width, height, step, waterline, distance = new Float32Array(depth.length)) {
  distance.fill(FINISH_REACH);
  function mark(x, z, dx, dz, a, b) {
    if ((a < waterline) === (b < waterline)) return;
    const t = (waterline - a) / (b - a);
    const cx = x + dx * t, cz = z + dz * t, r = FINISH_REACH / step;
    for (let j = Math.max(0, Math.ceil(cz - r)); j <= Math.min(height - 1, Math.floor(cz + r)); j++) {
      for (let i = Math.max(0, Math.ceil(cx - r)); i <= Math.min(width - 1, Math.floor(cx + r)); i++) {
        const k = j * width + i;
        distance[k] = Math.min(distance[k], step * Math.hypot(i - cx, j - cz));
      }
    }
  }
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x;
    if (x + 1 < width) mark(x, z, 1, 0, depth[i], depth[i + 1]);
    if (z + 1 < height) mark(x, z, 0, 1, depth[i], depth[i + width]);
  }
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x;
    const border = step * Math.min(x, z, width - 1 - x, height - 1 - z);
    distance[i] = smooth(0, 1.0, border) * (depth[i] > waterline ? 1 : 1 - smooth(2.0, FINISH_REACH, distance[i]));
  }
  return distance;
}
