// @ts-check
// The journal's pictures: worn paper, inked lettering in Jacquard 12, the headers each page opens with, and wax seals.
// Drawn in the Worker from code and one small font table (journalFont.js), so nothing here is game data. A picture's
// address carries its words and a signature (`artUrl`), so the service draws only what it handed out itself.
import { JOURNAL_FONT } from './journalFont.js';
import { crc32, zlibDeflate } from './pdaPng.js';

/** The journal's inks and papers, as 0xRRGGBB. */
export const INK = Object.freeze({
  sepia: 0x3b2a14,
  brown: 0x5c3d1e,
  faded: 0x7a5c38,
  red: 0x8a2a1c,
  wax: 0x8e1f1a,
  teal: 0x2f5d5a,
  ochre: 0x9a6a1a,
  gold: 0xa07818,
  blue: 0x34507a,
  paper: 0xdcc69a,
});

// ── The canvas ──────────────────────────────────────────────────────

/** @typedef {{ w: number, h: number, d: Uint8ClampedArray }} Canvas */
/** A clear canvas, four bytes a pixel. @param {number} w @param {number} h @returns {Canvas} */
export const canvas = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

/** One pixel blended over with `a` (0..1) of colour `c`. A clear pixel takes the colour at that cover. */
export function blend(/** @type {Canvas} */ c, x, y, /** @type {number} */ col, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = ((y | 0) * c.w + (x | 0)) * 4;
  const r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
  const da = c.d[i + 3] / 255;
  const oa = a + da * (1 - a);
  if (oa <= 0) return;
  c.d[i] = (r * a + c.d[i] * da * (1 - a)) / oa;
  c.d[i + 1] = (g * a + c.d[i + 1] * da * (1 - a)) / oa;
  c.d[i + 2] = (b * a + c.d[i + 2] * da * (1 - a)) / oa;
  c.d[i + 3] = oa * 255;
}

// ── Noise ───────────────────────────────────────────────────────────

/** A repeatable random number in [0, 1) for a lattice point and a seed. */
export function hash2(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1). */
export function vnoise(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Several octaves of value noise, in [0, 1). */
export function fbm(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s, octaves = 4) {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < octaves; i++) {
    t += amp * vnoise(x * f, y * f, s + i * 17);
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return t / n;
}
const smooth = (/** @type {number} */ e0, /** @type {number} */ e1, /** @type {number} */ x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** A seed from words, so the same words draw the same sheet. */
export function seedOf(/** @type {string} */ s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0) % 100000;
}

// ── Paper ───────────────────────────────────────────────────────────

/**
 * A sheet of worn paper over the whole canvas: its grain and fibres, blotches and a stain or two, a rim darkened by
 * age, and, `torn`, an edge torn unevenly, clear past the tear so the sheet lies on whatever Discord draws behind it.
 * @param {Canvas} c @param {{ seed?: number, torn?: boolean, tone?: number, rim?: number }} [o]
 */
export function paper(c, { seed = 7, torn = true, tone = 0, rim = 0 } = {}) {
  const { w, h, d } = c;
  const tear = torn ? Math.max(6, Math.min(w, h) * 0.05) : 0;
  const rimPx = rim || Math.max(18, Math.min(w, h) * 0.12);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // the tear: the sheet's edge pushed in by noise along each side
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const jag = torn ? tear * (0.35 + 0.65 * fbm(x * 0.045 + y * 0.045, (x - y) * 0.02, seed + 101, 3)) : 0;
      const inside = edge - jag;
      if (torn && inside < 0) {
        d[i + 3] = 0;
        continue;
      }
      const big = fbm(x / 150, y / 150, seed, 4);
      const grain = vnoise(x / 1.6, y / 1.6, seed + 7);
      const fibre = vnoise(x / 3, y / 26, seed + 13) * 0.6 + vnoise(x / 30, y / 2.5, seed + 19) * 0.4;
      const stain = smooth(0.6, 0.78, fbm(x / 70 + 40, y / 70, seed + 29, 3));
      let r = 222 - tone * 10, g = 202 - tone * 12, b = 156 - tone * 14;
      const shade = 0.86 + 0.18 * big + (grain - 0.5) * 0.07 + (fibre - 0.5) * 0.05;
      r *= shade;
      g *= shade;
      b *= shade;
      // a stain: a ring darker than its middle, as water dries on paper
      r -= stain * 26;
      g -= stain * 34;
      b -= stain * 40;
      // age: the rim browned and darkened, and the tear's own edge burnt a little
      const age = 1 - smooth(0, rimPx, Math.max(0, inside)) * (0.85 + 0.15 * big);
      r -= age * 52;
      g -= age * 64;
      b -= age * 66;
      const burnt = torn ? 1 - smooth(0, 3.2, inside) : 0;
      r -= burnt * 70;
      g -= burnt * 70;
      b -= burnt * 60;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = torn ? 255 * smooth(0, 1.2, inside) : 255;
    }
  }
  return c;
}

// ── Lettering ───────────────────────────────────────────────────────

/** @type {Promise<{ px: number, ascent: number, descent: number, map: Map<number, { at: number, w: number, h: number, left: number, top: number, adv: number }>, pack: Uint8Array }> | null} */
let fontHeld = null;
/** The font table, its pack inflated once an isolate. */
export function journalFont() {
  if (!fontHeld) {
    fontHeld = (async () => {
      const bin = globalThis.atob(JOURNAL_FONT.pack);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const { Blob, DecompressionStream } = /** @type {any} */ (globalThis);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      const pack = new Uint8Array(await new Response(stream).arrayBuffer());
      const map = new Map();
      for (const [code, at, w, h, left, top, adv] of JOURNAL_FONT.glyphs) map.set(code, { at, w, h, left, top, adv });
      return { px: JOURNAL_FONT.px, ascent: JOURNAL_FONT.ascent, descent: JOURNAL_FONT.descent, map, pack };
    })();
  }
  return fontHeld;
}

/** How wide words stand at `px`. @param {any} font @param {string} s @param {number} px */
export function measure(font, s, px) {
  const k = px / font.px;
  let w = 0;
  for (const ch of String(s)) w += (font.map.get(ch.codePointAt(0) ?? 63)?.adv ?? font.px * 0.5) * k;
  return w;
}
/** Words cut, with an ellipsis, to fit `max` pixels. */
export function fitWords(font, /** @type {string} */ s, /** @type {number} */ px, /** @type {number} */ max) {
  let t = String(s);
  if (measure(font, t, px) <= max) return t;
  while (t.length > 1 && measure(font, `${t}…`, px) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * Words inked on the canvas, their baseline at `y`. Each glyph is sampled from the master shape, and the ink is laid
 * a little unevenly, as a quill lays it.
 * @param {Canvas} c @param {any} font @param {string} s @param {number} x @param {number} y
 * @param {{ px?: number, color?: number, align?: 'left'|'center'|'right', alpha?: number, seed?: number, halo?: number }} [o]
 */
export function ink(c, font, s, x, y, { px = 24, color = INK.sepia, align = 'left', alpha = 0.92, seed = 3, halo = 0 } = {}) {
  const k = px / font.px;
  const width = measure(font, s, px);
  let pen = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  for (const ch of String(s)) {
    const g = font.map.get(ch.codePointAt(0) ?? 63);
    if (!g) {
      pen += font.px * 0.5 * k;
      continue;
    }
    if (g.w && g.h) {
      const gx0 = pen + g.left * k, gy0 = y + g.top * k;
      const x0 = Math.floor(gx0) - 1, y0 = Math.floor(gy0) - 1;
      const x1 = Math.ceil(gx0 + g.w * k) + 1, y1 = Math.ceil(gy0 + g.h * k) + 1;
      for (let py = y0; py < y1; py++) {
        for (let px2 = x0; px2 < x1; px2++) {
          // area sampling: the cover of this pixel's footprint on the master shape
          const sx = (px2 + 0.5 - gx0) / k - 0.5, sy = (py + 0.5 - gy0) / k - 0.5;
          const cov = sampleCover(font.pack, g, sx, sy, Math.max(1, 1 / k));
          if (cov <= 0.01) continue;
          if (halo) blend(c, px2, py, INK.paper, Math.min(1, cov * halo));
          const uneven = 0.86 + 0.14 * vnoise(px2 / 2.2, py / 2.2, seed);
          blend(c, px2, py, color, cov * alpha * uneven);
        }
      }
    }
    pen += g.adv * k;
  }
  return width;
}

/** A glyph's cover at a master point, averaged over a `foot`-wide footprint. */
function sampleCover(pack, g, sx, sy, foot) {
  const n = foot > 1.5 ? 2 : 1;
  let t = 0;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const ux = sx + (n > 1 ? (i - 0.5) * foot * 0.5 : 0), uy = sy + (n > 1 ? (j - 0.5) * foot * 0.5 : 0);
      t += bilinear(pack, g, ux, uy);
    }
  return t / (n * n) / 255;
}
function bilinear(pack, g, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const at = (/** @type {number} */ a, /** @type {number} */ b) => (a < 0 || b < 0 || a >= g.w || b >= g.h ? 0 : pack[g.at + b * g.w + a]);
  return (at(xi, yi) * (1 - xf) + at(xi + 1, yi) * xf) * (1 - yf) + (at(xi, yi + 1) * (1 - xf) + at(xi + 1, yi + 1) * xf) * yf;
}

// ── Lines and marks ─────────────────────────────────────────────────

/** A line inked from one point to another, `width` wide, its ends round. */
export function line(/** @type {Canvas} */ c, x0, y0, x1, y1, { width = 1.5, color = INK.sepia, alpha = 0.9 } = {}) {
  const r = width / 2;
  const minX = Math.floor(Math.min(x0, x1) - r - 1), maxX = Math.ceil(Math.max(x0, x1) + r + 1);
  const minY = Math.floor(Math.min(y0, y1) - r - 1), maxY = Math.ceil(Math.max(y0, y1) + r + 1);
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / len2));
      const dist = Math.hypot(x + 0.5 - (x0 + t * dx), y + 0.5 - (y0 + t * dy));
      const cov = Math.min(1, Math.max(0, r - dist + 0.5));
      if (cov > 0) blend(c, x, y, color, cov * alpha);
    }
}
/** A filled disc, its edge smooth. */
export function disc(/** @type {Canvas} */ c, cx, cy, rad, { color = INK.sepia, alpha = 1 } = {}) {
  for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++)
    for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
      const cov = Math.min(1, Math.max(0, rad - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5));
      if (cov > 0) blend(c, x, y, color, cov * alpha);
    }
}
/** A ring: a circle's line. */
export function ring(/** @type {Canvas} */ c, cx, cy, rad, { width = 1.5, color = INK.sepia, alpha = 0.9 } = {}) {
  for (let y = Math.floor(cy - rad - width - 1); y <= Math.ceil(cy + rad + width + 1); y++)
    for (let x = Math.floor(cx - rad - width - 1); x <= Math.ceil(cx + rad + width + 1); x++) {
      const dist = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - rad);
      const cov = Math.min(1, Math.max(0, width / 2 - dist + 0.5));
      if (cov > 0) blend(c, x, y, color, cov * alpha);
    }
}
/** A rule with a diamond at its middle: the line a page's heading stands over. */
export function flourish(/** @type {Canvas} */ c, x0, x1, y, { color = INK.brown, alpha = 0.8 } = {}) {
  const mid = (x0 + x1) / 2;
  line(c, x0, y, mid - 12, y, { width: 1.4, color, alpha });
  line(c, mid + 12, y, x1, y, { width: 1.4, color, alpha });
  for (const [dx, dy] of [[-9, 0], [0, -5], [9, 0], [0, 5]]) line(c, mid, y, mid + dx, y + dy, { width: 1.6, color, alpha });
  disc(c, x0, y, 2, { color, alpha });
  disc(c, x1, y, 2, { color, alpha });
}

// ── The PNG ─────────────────────────────────────────────────────────

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
 * The canvas as a PNG, eight bits a channel, with its clear parts kept clear. Each row is filtered by the up-or-left
 * rule that suits paper's grain best (Paeth), so the file stays small.
 * @param {Canvas} c @param {(b: Uint8Array) => Promise<Uint8Array>} [deflate]
 */
export async function encodeRgba(c, deflate = zlibDeflate) {
  const { w, h, d } = c;
  const stride = w * 4;
  const rows = new Uint8Array(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    rows[y * (stride + 1)] = 4;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? d[y * stride + i - 4] : 0;
      const b = y > 0 ? d[(y - 1) * stride + i] : 0;
      const cc = i >= 4 && y > 0 ? d[(y - 1) * stride + i - 4] : 0;
      const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
      rows[y * (stride + 1) + 1 + i] = (d[y * stride + i] - pred) & 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
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

// ── The journal's pictures ──────────────────────────────────────────

/** A page's heading picture's size: wide and short, as Discord draws a picture across a message. */
export const HEADER_W = 960;
export const HEADER_H = 200;

/**
 * A page's heading: a torn strip of worn paper, the page's name in blackletter, the character it is for beneath, and
 * a rule between.
 * @param {{ title: string, sub?: string, mark?: string }} o
 */
export async function drawHeader({ title, sub = '', mark = '' }) {
  const font = await journalFont();
  const c = paper(canvas(HEADER_W, HEADER_H), { seed: seedOf(`${title}|${sub}`), torn: true });
  const left = 44, right = HEADER_W - 44;
  if (mark) ink(c, font, fitWords(font, mark, 22, 320), right, 52, { px: 22, color: INK.faded, align: 'right', alpha: 0.85 });
  ink(c, font, fitWords(font, title, 72, right - left - (mark ? 200 : 0)), left, 104, { px: 72, color: INK.sepia });
  flourish(c, left, right, 124, { color: INK.brown, alpha: 0.75 });
  if (sub) ink(c, font, fitWords(font, sub, 30, right - left), left, 166, { px: 30, color: INK.brown, alpha: 0.9 });
  return c;
}

/** A wax seal's size: Discord draws a section's picture small and square. */
export const SEAL_PX = 160;
/** The seals' waxes: each a deep colour and its lighter rim. */
export const WAX = Object.freeze({
  red: [0x8e1f1a, 0xb8463a],
  green: [0x2e5a32, 0x4e8256],
  blue: [0x26406e, 0x4a68a0],
  black: [0x2a2622, 0x544a40],
  gold: [0x8a6a14, 0xc09a38],
  teal: [0x1f5f62, 0x45a3a0],
  violet: [0x4a3a78, 0x7e6ab8],
});

/** A wax seal pressed with a letter, on a scrap of paper: a letter's sender, a companion's rank, a guild's mark. */
export async function drawSeal({ letter = '?', wax = 'red' } = {}) {
  const font = await journalFont();
  const s = seedOf(`${letter}|${wax}`);
  const c = paper(canvas(SEAL_PX, SEAL_PX), { seed: s, torn: true, rim: 26 });
  const [deep, light] = WAX[/** @type {keyof typeof WAX} */ (wax)] ?? WAX.red;
  const cx = SEAL_PX / 2, cy = SEAL_PX / 2, base = SEAL_PX * 0.36;
  for (let y = 0; y < SEAL_PX; y++)
    for (let x = 0; x < SEAL_PX; x++) {
      const ang = Math.atan2(y - cy, x - cx);
      const wob = base * (1 + 0.07 * (vnoise(Math.cos(ang) * 3 + 9, Math.sin(ang) * 3 + 9, s) - 0.5) * 2);
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = Math.min(1, Math.max(0, wob - r + 0.5));
      if (cov <= 0) continue;
      // the wax pooled thick at the rim and pressed flat inside, lit from the upper left
      const lift = smooth(wob * 0.72, wob * 0.86, r) * (1 - smooth(wob * 0.9, wob, r));
      const lit = 0.5 + 0.5 * Math.cos(ang + 2.4);
      blend(c, x, y, deep, cov);
      blend(c, x, y, light, cov * (0.25 * lift + 0.35 * lift * lit));
    }
  ring(c, cx, cy, base * 0.7, { width: 2, color: light, alpha: 0.55 });
  const ch = String(letter).slice(0, 2);
  ink(c, font, ch, cx + 2, cy + 22, { px: 64, color: 0x000000, align: 'center', alpha: 0.35 });
  ink(c, font, ch, cx, cy + 20, { px: 64, color: light, align: 'center', alpha: 0.95 });
  return c;
}

// ── Signed addresses ────────────────────────────────────────────────

/** The path every journal picture is served at: `/v1/journal/art/<kind>.png?p=<words>&s=<signature>`. */
export const ART_PATH = '/v1/journal/art/';
/** The pictures the service draws, and the words each takes. */
export const ART_KINDS = Object.freeze(['header', 'seal']);

// A picture's address is signed as the page is drawn, inside the PDA's own answer, so the signature is computed here in
// plain code (SHA-256 and HMAC, FIPS 180-4 and RFC 2104) rather than through the runtime's asynchronous crypto.
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
/** SHA-256 of bytes. @param {Uint8Array} msg */
export function sha256(msg) {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(msg);
  m[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(total - 4, bits >>> 0);
  const W = new Uint32Array(64);
  const rot = (/** @type {number} */ x, /** @type {number} */ n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rot(W[i - 15], 7) ^ rot(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rot(W[i - 2], 17) ^ rot(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + W[i]) >>> 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
  return out;
}
/** HMAC-SHA-256. @param {Uint8Array} key @param {Uint8Array} msg */
export function hmac256(key, msg) {
  const k = key.length > 64 ? sha256(key) : key;
  const pad = (/** @type {number} */ x) => {
    const b = new Uint8Array(64);
    b.set(k);
    for (let i = 0; i < 64; i++) b[i] ^= x;
    return b;
  };
  const inner = new Uint8Array(64 + msg.length);
  inner.set(pad(0x36));
  inner.set(msg, 64);
  const outer = new Uint8Array(96);
  outer.set(pad(0x5c));
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

/** @type {Map<string, Uint8Array>} */
const keys = new Map();
const utf8 = (/** @type {string} */ s) => new TextEncoder().encode(s);
/** The key art addresses are signed with, drawn from the service's own identity key and nothing else. */
function artKey(/** @type {any} */ env) {
  const root = String(env?.IDENTITY_PRIVATE_KEY ?? '');
  if (!root) return null;
  if (!keys.has(root)) keys.set(root, sha256(utf8(`dfo-journal-art1\n${root}`)));
  return keys.get(root) ?? null;
}
const b64url = (/** @type {Uint8Array} */ b) =>
  globalThis.btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (/** @type {string} */ s) => {
  const bin = globalThis.atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
};
function sign(env, kind, p) {
  const key = artKey(env);
  return key ? b64url(hmac256(key, utf8(`${kind}\n${p}`)).subarray(0, 12)) : null;
}

/** The longest words a picture's address carries. */
export const ART_WORDS_MAX = 120;
/**
 * A picture's address, its words signed: the service's own origin, the kind, the words. Null with no key to sign.
 * @param {any} env @param {string} origin @param {string} kind @param {Record<string, string>} words
 */
export function artUrl(env, origin, kind, words) {
  if (!ART_KINDS.includes(kind) || !/^https?:\/\//.test(String(origin))) return null;
  const clean = Object.fromEntries(Object.entries(words).map(([k, v]) => [k, String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, ART_WORDS_MAX)]));
  const p = b64url(utf8(JSON.stringify(clean)));
  const s = sign(env, kind, p);
  return s ? `${origin}${ART_PATH}${kind}.png?p=${p}&s=${s}` : null;
}

/** The words of a signed address, or null for one the service did not sign. */
export function artWords(env, /** @type {string} */ kind, /** @type {string} */ p, /** @type {string} */ s) {
  if (!ART_KINDS.includes(kind) || typeof p !== 'string' || typeof s !== 'string' || p.length > 1200) return null;
  const want = sign(env, kind, p);
  if (!want || want.length !== s.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
  if (diff) return null;
  try {
    const w = JSON.parse(new TextDecoder().decode(fromB64url(p)));
    return w && typeof w === 'object' && !Array.isArray(w) ? w : null;
  } catch {
    return null;
  }
}

/** Pictures drawn in this isolate, by address: a few, the newest kept. */
const drawn = new Map();
export const ART_KEPT = 16;
/** Tests stand fresh isolates. */
export const _resetArtForTests = () => drawn.clear();

/** A picture's bytes for its words. @param {string} kind @param {Record<string, string>} w */
export async function artBytes(kind, w) {
  const key = `${kind}|${JSON.stringify(w)}`;
  const kept = drawn.get(key);
  if (kept) return kept;
  const c =
    kind === 'header'
      ? await drawHeader({ title: w.t ?? '', sub: w.s ?? '', mark: w.m ?? '' })
      : await drawSeal({ letter: w.l ?? '?', wax: w.w ?? 'red' });
  const bytes = await encodeRgba(c);
  drawn.set(key, bytes);
  while (drawn.size > ART_KEPT) drawn.delete(drawn.keys().next().value);
  return bytes;
}
