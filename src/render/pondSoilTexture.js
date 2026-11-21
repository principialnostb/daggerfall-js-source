import { roadEdgeHash } from '../world/road/roadEdge.js';

const SIDE = 128;
const wrap = (x) => (x + SIDE) & (SIDE - 1);
const clamp = (x) => Math.max(0, Math.min(1, x));

// A periodic field in texture space. All four channels share the same clods.
// R is earth tone, G is turf nap, B is sparse grit, A is broken root fibre.
function field(x, y, cells, salt) {
  const px = x * cells / SIDE, py = y * cells / SIDE;
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const at = (dx, dy) => roadEdgeHash((ix + dx) % cells, (iy + dy) % cells, salt);
  const south = at(0, 0) * (1 - u) + at(1, 0) * u;
  const north = at(0, 1) * (1 - u) + at(1, 1) * u;
  return south * (1 - v) + north * v;
}

export function pondSoilPixels() {
  const pixels = new Uint8Array(SIDE * SIDE * 4);
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) {
    const patch = field(x, y, 4, 13), clod = field(x, y, 17, 31), grit = roadEdgeHash(x, y, 103);
    const k = 4 * (y * SIDE + x);
    pixels[k] = 255 * clamp(.49 + .38 * (clod - .5) + .26 * (patch - .5) + .15 * (grit - .5));
    pixels[k + 1] = 255 * clamp(.45 + .39 * (patch - .5) + .16 * (grit - .5));
  }
  function stamp(x, y, channel, value) {
    const k = 4 * (wrap(Math.round(y)) * SIDE + wrap(Math.round(x))) + channel;
    pixels[k] = Math.max(pixels[k], value);
  }
  for (let i = 0; i < 420; i++) {
    const rnd = (s) => roadEdgeHash(i, 7, s);
    const x = rnd(1) * SIDE, y = rnd(2) * SIDE;
    const lean = rnd(3) * 1.8 - .9, length = 2 + Math.floor(rnd(4) * 5);
    for (let j = 0; j < length; j++) {
      stamp(x + j * lean, y + j, 1, 115 + 73 * rnd(5));
      if (i % 13 === 0) stamp(x - .45 * j + .6 * Math.sin(j), y + j, 3, 112 + 72 * rnd(6));
    }
    if (rnd(8) < .26 && field(x, y, 4, 13) < .44) {
      stamp(x, y, 2, 125 + 70 * rnd(9));
      stamp(x + 1, y, 2, 75 + 45 * rnd(9));
    }
  }
  // Buried chips and shallow breaks in the packed earth. A broken dark side
  // and a short lit shoulder give structure without a carpet of bright stone.
  for (let i = 0; i < 140; i++) {
    const x = SIDE * roadEdgeHash(i, 11, 41), y = SIDE * roadEdgeHash(i, 11, 53);
    const size = 2 + 3.8 * roadEdgeHash(i, 11, 71), lean = roadEdgeHash(i, 11, 79) - .5;
    const strength = .35 + field(x, y, 5, 113);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -6; dx <= 6; dx++) {
      const u = (dx + lean * dy) / size, v = (dy - lean * dx) / (size * .52);
      const radius = u * u + v * v;
      if (radius >= 1) continue;
      const k = 4 * (wrap(Math.floor(y) + dy) * SIDE + wrap(Math.floor(x) + dx));
      const relief = v > .22 && u < .45 ? 25 : -34 * (1 - radius);
      pixels[k] = Math.max(0, Math.min(255, pixels[k] + strength * relief));
    }
  }
  return pixels;
}

export const MAX_GROUND_LAYERS = 128;
let original;
let lastLayer;

// Match the ground array's resolution while retaining the same world texel
// size. Supersample reductions so a classic 64-square archive keeps the nap.
export function pondSoilLayer(width, height) {
  original ??= pondSoilPixels();
  if (width === SIDE && height === SIDE) return original;
  if (lastLayer?.width === width && lastLayer.height === height) return lastLayer.pixels;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = Math.floor(x * SIDE / width), y0 = Math.floor(y * SIDE / height);
    const x1 = Math.max(x0 + 1, Math.floor((x + 1) * SIDE / width));
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * SIDE / height));
    const count = (x1 - x0) * (y1 - y0), dst = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) sum += original[(sy * SIDE + sx) * 4 + c];
      pixels[dst + c] = Math.round(sum / count);
    }
  }
  lastLayer = { width, height, pixels };
  return pixels;
}
