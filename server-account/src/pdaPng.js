// @ts-check
// A small raster and its PNG, drawn in the Worker with no canvas: filled polygons, lines, dots and rings, a 3 x 5 pixel
// font of our own, and an indexed PNG encoded by hand (CRC-32 and the zlib stream from CompressionStream). The PDA's
// map is drawn with it. Pure but for the deflate, which may be handed in.

/** @typedef {{ w: number, h: number, px: Uint8Array }} Raster */

/** A raster of palette indices, every pixel `fill`. */
export function raster(/** @type {number} */ w, /** @type {number} */ h, fill = 0) {
  return { w, h, px: new Uint8Array(w * h).fill(fill) };
}
/** A copy, to draw over without touching the original. @param {Raster} r */
export const copyRaster = (r) => ({ w: r.w, h: r.h, px: r.px.slice() });

/** One pixel, clipped. @param {Raster} r */
export function dot(r, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ c) {
  const xi = Math.round(x),
    yi = Math.round(y);
  if (xi >= 0 && yi >= 0 && xi < r.w && yi < r.h) r.px[yi * r.w + xi] = c;
}

/**
 * Rings filled even-odd, sampled at each pixel's centre, so a shared edge between two filled shapes leaves no gap.
 * @param {Raster} r @param {ReadonlyArray<ReadonlyArray<readonly number[]>>} rings points in raster units @param {number} c
 */
export function fillRings(r, rings, c) {
  let y0 = Infinity,
    y1 = -Infinity;
  for (const ring of rings)
    for (const p of ring) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
  const from = Math.max(0, Math.floor(y0)),
    to = Math.min(r.h - 1, Math.ceil(y1));
  for (let y = from; y <= to; y++) {
    const sy = y + 0.5;
    /** @type {number[]} */
    const xs = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        if (a[1] <= sy === b[1] <= sy) continue;
        xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5)),
        xb = Math.min(r.w - 1, Math.floor(xs[i + 1] - 0.5));
      if (xb >= xa) r.px.fill(c, y * r.w + xa, y * r.w + xb + 1);
    }
  }
}

/** A filled disc. @param {Raster} r */
export function disc(r, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ rad, /** @type {number} */ c) {
  const r2 = rad * rad;
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) dot(r, x, y, c);
}

/** A ring `width` pixels thick. @param {Raster} r */
export function circle(r, cx, cy, rad, c, width = 1) {
  const outer = rad * rad,
    inner = Math.max(0, rad - width) ** 2;
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d <= outer && d > inner) dot(r, x, y, c);
    }
}

/**
 * A line through points, `width` pixels thick; `dash` > 0 draws that many pixels and skips as many.
 * @param {Raster} r @param {ReadonlyArray<readonly number[]>} pts @param {number} c
 * @param {{ width?: number, dash?: number, closed?: boolean }} [o]
 */
export function strokePath(r, pts, c, { width = 1, dash = 0, closed = false } = {}) {
  let run = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let s = 0; s <= steps; s++, run++) {
      if (dash > 0 && Math.floor(run / dash) % 2 === 1) continue;
      const x = a[0] + ((b[0] - a[0]) * s) / steps,
        y = a[1] + ((b[1] - a[1]) * s) / steps;
      if (width <= 1) dot(r, x, y, c);
      else disc(r, x, y, (width - 1) / 2, c);
    }
  }
}

/** The PDA's own pixel font: 3 x 5, each glyph its five rows of three, `#` lit. Our own drawing, from no game file. */
const FONT = Object.freeze({
  A: '.#. #.# ### #.# #.#',
  B: '##. #.# ##. #.# ##.',
  C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###',
  F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##',
  H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###',
  J: '..# ..# ..# #.# .#.',
  K: '#.# #.# ##. #.# #.#',
  L: '#.. #.. #.. #.. ###',
  M: '#.# ### #.# #.# #.#',
  N: '##. #.# #.# #.# #.#',
  O: '.#. #.# #.# #.# .#.',
  P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##',
  R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.',
  T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###',
  V: '#.# #.# #.# #.# .#.',
  W: '#.# #.# #.# ### #.#',
  X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.',
  Z: '### ..# .#. #.. ###',
  0: '### #.# #.# #.# ###',
  1: '.#. ##. .#. .#. ###',
  2: '##. ..# .#. #.. ###',
  3: '##. ..# .#. ..# ##.',
  4: '#.# #.# ### ..# ..#',
  5: '### #.. ##. ..# ##.',
  6: '.## #.. ### #.# ###',
  7: '### ..# .#. .#. .#.',
  8: '### #.# ### #.# ###',
  9: '### #.# ### ..# ##.',
  ' ': '... ... ... ... ...',
  '-': '... ... ### ... ...',
  '.': '... ... ... ... .#.',
  "'": '.#. .#. ... ... ...',
  ':': '... .#. ... .#. ...',
});
/** A glyph's 15 cells, row by row; an unknown character is a space. */
const glyph = (/** @type {string} */ ch) =>
  (/** @type {Record<string, string>} */ (FONT)[ch] ?? FONT[' ']).replace(/ /g, '');
/** A text's width in pixels at `scale`. */
export const textWidth = (/** @type {string} */ s, scale = 1) => Math.max(0, String(s).length * 4 * scale - scale);
/** Text in the PDA's font, upper case, its top-left at (x, y). @param {Raster} r */
export function drawText(r, /** @type {string} */ s, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ c, scale = 1) {
  const str = String(s).toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const g = glyph(str[i]);
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 3; col++)
        if (g[row * 3 + col] === '#')
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) dot(r, x + (i * 4 + col) * scale + dx, y + row * scale + dy, c);
  }
}

// ── PNG ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
/** CRC-32, as PNG's chunks carry it. @param {Uint8Array} bytes */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zlib stream of `bytes`, from the runtime's CompressionStream ('deflate' is zlib's own wrapping). */
export async function zlibDeflate(/** @type {Uint8Array} */ bytes) {
  const { Blob, CompressionStream } = /** @type {any} */ (globalThis);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One chunk: length, type, data, CRC over type and data. */
function chunk(/** @type {string} */ type, /** @type {Uint8Array} */ data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * An indexed PNG, 8 bits a pixel, its palette at most 256 colours.
 * @param {Raster} r @param {ReadonlyArray<readonly number[]>} palette `[r, g, b]` each
 * @param {(b: Uint8Array) => Promise<Uint8Array>} [deflate]
 */
export async function encodePng(r, palette, deflate = zlibDeflate) {
  if (!palette.length || palette.length > 256) throw new RangeError('a palette holds 1 to 256 colours');
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, r.w);
  v.setUint32(4, r.h);
  ihdr.set([8, 3, 0, 0, 0], 8);
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => plte.set([c[0], c[1], c[2]], i * 3));
  const rows = new Uint8Array(r.h * (r.w + 1));
  for (let y = 0; y < r.h; y++) rows.set(r.px.subarray(y * r.w, (y + 1) * r.w), y * (r.w + 1) + 1);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', await deflate(rows)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A colour as `[r, g, b]` from 0xRRGGBB. */
export const rgb = (/** @type {number} */ hex) => /** @type {const} */ ([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
/** FNV-1a over a string, as a short hex word: a map's state named for its address. */
export function fnvHex(/** @type {string} */ s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
