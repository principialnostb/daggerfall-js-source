// @ts-check
// The journal's materials, drawn once at opening rather than shipped as pictures: worn paper (fibres, foxing, a
// browned rim), the cover's leather, and the desk's dark wood. Each is a tile set as a CSS variable, so the pages
// and the desk wear them at no further cost.

/** A small seeded hash: a cell's value in [0, 1). */
function hash(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Value noise, smoothly interpolated, wrapping at `p` cells so a tile meets itself. */
function noise(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s, /** @type {number} */ p) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (/** @type {number} */ a) => ((a % p) + p) % p;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s, /** @type {number} */ p, octaves = 5) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f, y * f, s + o * 17, p * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** A tile drawn pixel by pixel into a canvas, answered as an object URL (or a data URL where blobs are not kept). */
async function tile(/** @type {number} */ size, /** @type {(x: number, y: number) => [number, number, number, number]} */ px) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, gg, b, a] = px(x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  g.putImageData(img, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return blob ? URL.createObjectURL(/** @type {Blob} */ (blob)) : c.toDataURL('image/png');
}

/** Worn paper: warm, uneven, fibred and foxed; the tile wraps. */
export function paperTile(size = 384, seed = 7) {
  const P = 8;
  return tile(size, (x, y) => {
    const u = (x / size) * P, v = (y / size) * P;
    const cloud = fbm(u, v, seed, P);
    // every layer wraps at the tile's edge (whole-number scales of the period), so no seam shows
    const fibre = noise(u * 8, v * 8, seed + 5, P * 8) * 0.5 + noise(u * 16, v * 16, seed + 9, P * 16) * 0.5;
    const fox = Math.max(0, fbm(u + 3, v, seed + 31, P) - 0.64) * 3;
    const grain = hash(x, y, seed) - 0.5;
    const t = 0.92 - cloud * 0.12 - fox * 0.18 + (fibre - 0.5) * 0.05 + grain * 0.03;
    return [Math.round(232 * t + fox * 10), Math.round(212 * t - fox * 4), Math.round(168 * t - fox * 14), 255];
  });
}

/** The cover's leather: a deep oxblood, pebbled and rubbed pale where hands have held it. */
export function leatherTile(size = 256, seed = 3) {
  const P = 6;
  return tile(size, (x, y) => {
    const u = (x / size) * P, v = (y / size) * P;
    const pebble = noise(u * 7, v * 7, seed, P * 7);
    const rub = fbm(u, v, seed + 4, P);
    const t = 0.55 + pebble * 0.25 + rub * 0.3 + (hash(x, y, seed) - 0.5) * 0.06;
    return [Math.round(96 * t), Math.round(38 * t), Math.round(30 * t), 255];
  });
}

/** The desk: dark oak, its grain running across. */
export function woodTile(size = 512, seed = 11) {
  const P = 4;
  return tile(size, (x, y) => {
    const u = (x / size) * P, v = (y / size) * P;
    const warp = fbm(u, v * 0.5, seed, P) * 6;
    const ring = Math.sin((v * 22 + warp) * Math.PI) * 0.5 + 0.5;
    const streak = noise(u * 24, v * 1.5, seed + 3, P * 24);
    const t = 0.32 + ring * 0.12 + streak * 0.1 + (hash(x, y, seed) - 0.5) * 0.04;
    return [Math.round(120 * t), Math.round(78 * t), Math.round(46 * t), 255];
  });
}

/** Every material set on the page's root as CSS variables. */
export async function dressMaterials(/** @type {HTMLElement} */ root) {
  // one tile at a time, the page free between them: the frame stays quick to answer Discord and the hand
  const rest = () => new Promise((r) => setTimeout(r, 0));
  await rest();
  const paper = await paperTile(320);
  root.style.setProperty('--paper', `url("${paper}")`);
  await rest();
  const leather = await leatherTile(192);
  await rest();
  const wood = await woodTile(384);
  root.style.setProperty('--leather', `url("${leather}")`);
  root.style.setProperty('--wood', `url("${wood}")`);
}
