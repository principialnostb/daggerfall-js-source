/**
 * The built pixels in map order, into `out` from its front, each given `_dist2` (grid distance squared from x, y).
 * A kept list's length changes only with its count: `length = 0` lets its storage go, so every push grows it again.
 * @param {any[]} out the caller's kept list
 * @param {Map<any, any>} built
 * @param {number} x
 * @param {number} y
 */
export function pixelsInto(out, built, x, y) {
  let count = 0;
  for (const pixel of built.values()) {
    pixel._dist2 = (pixel.px - x) ** 2 + (pixel.py - y) ** 2;
    out[count++] = pixel;
  }
  if (out.length !== count) out.length = count;
  return out;
}

/**
 * `first` and then `second`, written into `out` from its front: the list `[...first, ...second]` makes.
 * @param {any[]} out the caller's kept list
 * @param {ArrayLike<any>} first
 * @param {ArrayLike<any>} second
 * @returns {any[]} `out`, as long as the two together
 */
export function bothInto(out, first, second) {
  let count = 0;
  for (let i = 0; i < first.length; i++) out[count++] = first[i];
  for (let i = 0; i < second.length; i++) out[count++] = second[i];
  if (out.length !== count) out.length = count;
  return out;
}

/**
 * A colour's three channels times `scale`, written into `out`.
 * @param {Float32Array} out
 * @param {ArrayLike<number>} color
 * @param {number} scale
 * @returns {Float32Array} `out`
 */
export function scaledInto(out, color, scale) {
  out[0] = color[0] * scale;
  out[1] = color[1] * scale;
  out[2] = color[2] * scale;
  return out;
}

/**
 * A position's three values, written into `out`.
 * @param {number[]} out
 * @param {ArrayLike<number>} from
 * @returns {number[]} `out`
 */
export function copiedInto(out, from) {
  out[0] = from[0];
  out[1] = from[1];
  out[2] = from[2];
  return out;
}
