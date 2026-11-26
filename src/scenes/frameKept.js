import { identity, multiply } from '../world/mat4.js';

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

/** The camera and culler keep their double-precision origin. Version what the model matrix actually stores. */
export function pixelFrameMatrix(pixel, origin) {
  const matrix = pixel._pixelMatrix ??= identity();
  const x = Math.fround(origin[0]), y = Math.fround(origin[1]), z = Math.fround(origin[2]);
  if (pixel._worldGen === undefined || matrix[12] !== x || matrix[13] !== y || matrix[14] !== z) {
    matrix[12] = x;
    matrix[13] = y;
    matrix[14] = z;
    pixel._worldGen = (pixel._worldGen ?? 0) + 1;
  }
  return matrix;
}

// Only the owner of a newly built, fixed placement marks it. Other inputs can change in place.
const fixedPixelLocals = new WeakSet();
export function markFixedPixelLocal(local) {
  fixedPixelLocals.add(local);
}

/** A placed model can supply a replacement pose or edit its current pose in place. */
export function modelWorldMatrix(pixel, model) {
  const local = model.local, frame = pixel._pixelMatrix;
  if (model._world && model._worldFrame === frame && model._worldGen === pixel._worldGen && model._worldInput === local) {
    const prior = model._worldLocal;
    if (!prior) return model._world;
    let i = 0;
    while (i < 16 && prior[i] === local[i]) i++;
    if (i === 16) return model._world;
  }
  model._world = multiply(frame, local, model._world ?? new Float32Array(16));
  if (fixedPixelLocals.has(local)) model._worldLocal = null;
  else (model._worldLocal ??= new Float64Array(16)).set(local);
  model._worldInput = local;
  model._worldFrame = frame;
  model._worldGen = pixel._worldGen;
  return model._world;
}
