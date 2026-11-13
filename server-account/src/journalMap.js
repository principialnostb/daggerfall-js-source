// @ts-check
// The journal's map of Tamriel, on worn paper. The land and its coast are the owner's heightmap as the game ships it
// (src/world/tamriel/tamrielReliefData.js: fitted and warped onto the trace of Daggerfall's own map, shipped by the
// owner's permission), so the coast reads as the game's traced map does; nothing of the player's game files is drawn.
// The provinces, borders, rivers, capitals and names are our own authored geography (tamrielGeography.js) on the same
// grid. The relief's Inner Sea is filled where Daggerfall's own map has land round Vvardenfell. The authored rivers are
// not drawn: they were laid on the authored coast, not this one, and the heightmap carries the Niben itself.
import { RELIEF_DATA } from '../../src/world/tamriel/tamrielReliefData.js';
import { decodeRelief } from '../../src/world/tamriel/tamrielRelief.js';
import { PROVINCES, BORDERS, CITIES, SEAS, pts } from '../../src/world/tamriel/tamrielGeography.js';
import { PICTURE_W, PICTURE_H } from '../../src/world/tamriel/tamrielFrame.js';
import { canvas, paper, blend, ink, line, disc, ring, flourish, journalFont, encodeRgba, vnoise, INK } from './journalArt.js';
import { loreName } from './pdaUi.js';

/** Map pixels a picture unit; the relief holds two cells a unit. */
export const MAP_PX = 4;
export const CHART_W = PICTURE_W * MAP_PX;
export const CHART_H = PICTURE_H * MAP_PX;
/** The relief's sea: a cell at or under this is water. */
export const SEA_LEVEL = 8.5;
/** Daggerfall's own map has land where the relief has the Inner Sea: Morrowind's water this far from its own coast is land. */
export const INNER_SEA_FILL = 1.5;
/** How far from the Inner Sea's authored name its water is sought, in picture units. */
export const INNER_SEA_REACH = 34;

const RW = RELIEF_DATA.w, RH = RELIEF_DATA.h;
const CELL = MAP_PX / RELIEF_DATA.scale;

/** Each province's wash: a faint earth tone of its own. */
const WASH = Object.freeze({
  HighRock: 0x6a7a4a,
  Hammerfell: 0xa06a3a,
  Skyrim: 0x7a8a9a,
  Imperial: 0x8a7a4a,
  Morrowind: 0x8a4a3a,
  BlackMarsh: 0x4a6a4a,
  Elsweyr: 0xb08a4a,
  Valenwood: 0x4a7a3a,
  Sumurset: 0x8a8a5a,
});

/** The relief's heights, each Inner Sea cell of Morrowind's raised to land, once an isolate. @type {Float32Array | null} */
let heights = null;
function reliefHeights() {
  if (heights) return heights;
  const cells = decodeRelief(RELIEF_DATA);
  const h = new Float32Array(cells.length);
  for (let i = 0; i < cells.length; i++) h[i] = cells[i];
  // the Inner Sea: the water round Vvardenfell, flooded from its authored name outward through water inside Morrowind's
  // authored ring and near that name, is land on Daggerfall's map; the open sea outside the ring is never reached
  const mw = PROVINCES.find((p) => p.key === 'Morrowind');
  const named = SEAS.find((x) => x.name === 'Inner Sea');
  if (mw && named) {
    const k = RELIEF_DATA.scale;
    const rings = mw.rings.map((r) => pts(r).map((p) => [p.x * k, p.y * k]));
    const inside = new Uint8Array(cells.length);
    for (let y = 0; y < RH; y++) {
      const sy = y + 0.5;
      const xs = [];
      for (const r of rings)
        for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length];
          if (a[1] <= sy === b[1] <= sy) continue;
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.max(0, Math.ceil(xs[i] - 0.5)); x <= Math.min(RW - 1, Math.floor(xs[i + 1] - 0.5)); x++) inside[y * RW + x] = 1;
    }
    const fromEdge = chamfer(inside, 1); // inside the ring: the distance to its edge
    const [cx, cy] = [named.at[0] * k, named.at[1] * k];
    const near = (/** @type {number} */ i) => Math.hypot((i % RW) - cx, Math.floor(i / RW) - cy) <= INNER_SEA_REACH * k;
    const open = (/** @type {number} */ i) => inside[i] && fromEdge[i] > INNER_SEA_FILL * k && h[i] <= SEA_LEVEL && near(i);
    let edge = [];
    for (let i = 0; i < h.length; i++) if (open(i) && Math.hypot((i % RW) - cx, Math.floor(i / RW) - cy) <= 12 * k) edge.push(i);
    const seen = new Uint8Array(h.length);
    for (const i of edge) seen[i] = 1;
    while (edge.length) {
      const next = [];
      for (const i of edge) {
        h[i] = 14;
        for (const j of [i - 1, i + 1, i - RW, i + RW]) if (j >= 0 && j < h.length && !seen[j] && open(j)) {
          seen[j] = 1;
          next.push(j);
        }
      }
      edge = next;
    }
  }
  heights = h;
  return h;
}

/** Each cell's distance, in cells, to the nearest cell whose `mask` is not `inside` (a two-pass chamfer). */
function chamfer(/** @type {Uint8Array} */ mask, inside = 1) {
  const INF = 1e9;
  const d = new Float32Array(mask.length).fill(INF);
  for (let i = 0; i < mask.length; i++) if (mask[i] !== inside) d[i] = 0;
  const A = 1, B = Math.SQRT2;
  for (let y = 0; y < RH; y++)
    for (let x = 0; x < RW; x++) {
      const i = y * RW + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + A);
      if (y > 0) {
        d[i] = Math.min(d[i], d[i - RW] + A);
        if (x > 0) d[i] = Math.min(d[i], d[i - RW - 1] + B);
        if (x < RW - 1) d[i] = Math.min(d[i], d[i - RW + 1] + B);
      }
    }
  for (let y = RH - 1; y >= 0; y--)
    for (let x = RW - 1; x >= 0; x--) {
      const i = y * RW + x;
      if (x < RW - 1) d[i] = Math.min(d[i], d[i + 1] + A);
      if (y < RH - 1) {
        d[i] = Math.min(d[i], d[i + RW] + A);
        if (x < RW - 1) d[i] = Math.min(d[i], d[i + RW + 1] + B);
        if (x > 0) d[i] = Math.min(d[i], d[i + RW - 1] + B);
      }
    }
  return d;
}

/** A field sampled between its cells, at a map pixel's centre. */
function sample(/** @type {Float32Array} */ f, /** @type {number} */ mx, /** @type {number} */ my) {
  const x = Math.min(RW - 1.001, Math.max(0, (mx + 0.5) / CELL - 0.5));
  const y = Math.min(RH - 1.001, Math.max(0, (my + 0.5) / CELL - 0.5));
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const i = yi * RW + xi;
  return (f[i] * (1 - xf) + f[i + 1] * xf) * (1 - yf) + (f[i + RW] * (1 - xf) + f[i + RW + 1] * xf) * yf;
}

/** Each relief cell's province, by its authored ring; land outside every ring takes the nearest province's. */
function provinceCells(/** @type {Float32Array} */ h) {
  const id = new Int16Array(RW * RH).fill(-1);
  PROVINCES.forEach((prov, n) => {
    const rings = prov.rings.map((r) => pts(r).map((p) => [p.x * RELIEF_DATA.scale, p.y * RELIEF_DATA.scale]));
    for (let y = 0; y < RH; y++) {
      const sy = y + 0.5;
      const xs = [];
      for (const r of rings)
        for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length];
          if (a[1] <= sy === b[1] <= sy) continue;
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.max(0, Math.ceil(xs[i] - 0.5)); x <= Math.min(RW - 1, Math.floor(xs[i + 1] - 0.5)); x++) id[y * RW + x] = n;
    }
  });
  // land the authored rings leave out: the nearest ring's province, spread outward a ring of cells at a time
  let edge = [];
  for (let i = 0; i < id.length; i++) if (id[i] >= 0) edge.push(i);
  while (edge.length) {
    const next = [];
    for (const i of edge) {
      const x = i % RW;
      for (const j of [i - 1, i + 1, i - RW, i + RW]) {
        if (j < 0 || j >= id.length || id[j] >= 0) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === RW - 1)) continue;
        if (h[j] <= SEA_LEVEL) continue;
        id[j] = id[i];
        next.push(j);
      }
    }
    edge = next;
  }
  return id;
}

/** The map without its pins, drawn once an isolate. @type {Promise<import('./journalArt.js').Canvas> | null} */
let baseHeld = null;
/** Tests stand fresh isolates. */
export const _resetJournalMapForTests = () => {
  baseHeld = null;
  heights = null;
};

/** The worn-paper map of Tamriel, without pins. */
export function mapBase() {
  if (!baseHeld) baseHeld = drawBase();
  return baseHeld;
}

async function drawBase() {
  const font = await journalFont();
  const h = reliefHeights();
  const land = new Uint8Array(RW * RH);
  for (let i = 0; i < land.length; i++) land[i] = h[i] > SEA_LEVEL ? 1 : 0;
  const toCoast = chamfer(land, 0); // in the sea: the distance to land
  const prov = provinceCells(h);
  const c = paper(canvas(CHART_W, CHART_H), { seed: 1513, torn: true, rim: 46 });
  const { d } = c;
  for (let y = 0; y < CHART_H; y++) {
    for (let x = 0; x < CHART_W; x++) {
      const i = (y * CHART_W + x) * 4;
      if (d[i + 3] === 0) continue;
      const f = sample(h, x, y) - SEA_LEVEL;
      const e = sample(h, x + 1, y), w = sample(h, x - 1, y), s2 = sample(h, x, y + 1), n = sample(h, x, y - 1);
      const fx = e - w;
      const fy = s2 - n;
      // the coast is drawn only where the land truly meets the water here, never where shallows near the level
      const crosses = Math.min(e, w, s2, n, f + SEA_LEVEL) <= SEA_LEVEL && Math.max(e, w, s2, n, f + SEA_LEVEL) > SEA_LEVEL;
      const grad = Math.hypot(fx, fy) / 2 + 1e-4;
      const across = f / grad; // map pixels from the coast, signed: land is positive
      if (across < 0) {
        // the sea: the paper washed darker and cooler, and the water's lines drawn along the shore
        const dist = sample(toCoast, x, y) * CELL;
        const wash = 0.86 - Math.min(0.06, dist / 900);
        d[i] *= wash * 0.96;
        d[i + 1] *= wash * 0.98;
        d[i + 2] *= wash * 1.02;
        for (const [at, a] of [[7, 0.32], [15, 0.22], [27, 0.13]]) {
          const off = Math.abs(dist - at);
          if (off < 1.1) blend(c, x, y, INK.faded, a * (1.1 - off));
        }
      } else {
        // the land: the province's wash, and the hills lit from the north-west
        const id = prov[Math.min(RH - 1, Math.floor(y / CELL)) * RW + Math.min(RW - 1, Math.floor(x / CELL))];
        const wash = id >= 0 ? WASH[/** @type {keyof typeof WASH} */ (PROVINCES[id].key)] : null;
        if (wash) blend(c, x, y, wash, 0.13);
        const lit = (-fx - fy) * 0.035;
        if (lit < 0) blend(c, x, y, INK.brown, Math.min(0.42, -lit * (0.6 + 0.4 * vnoise(x / 3, y / 3, 5))));
        else blend(c, x, y, 0xf4e6c0, Math.min(0.22, lit * 0.8));
      }
      // the coast: an ink line where the land meets the water
      const a = crosses ? Math.min(1, Math.max(0, 1.25 - Math.abs(across))) : 0;
      if (a > 0) blend(c, x, y, INK.sepia, a * 0.92);
    }
  }
  const isLand = (/** @type {number} */ mx, /** @type {number} */ my) => sample(h, mx, my) > SEA_LEVEL + 0.4;
  // the borders: the authored lines, dashed, drawn only over land
  for (const b of Object.values(BORDERS)) {
    const run = pts(b.run).map((p) => [p.x * MAP_PX, p.y * MAP_PX]);
    let along = 0;
    for (let k = 0; k + 1 < run.length; k++) {
      const [x0, y0] = run[k], [x1, y1] = run[k + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let s = 0; s < len; s += 2) {
        const t = s / len, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        if ((along + s) % 14 < 8 && isLand(x, y)) disc(c, x, y, 1.1, { color: INK.red, alpha: 0.75 });
      }
      along += len;
    }
  }
  // the capitals, and the other great towns as dots; every name lettered keeps its box, so no other name lies on it
  /** @type {number[][]} */
  const taken = [];
  for (const city of CITIES) {
    const [x, y] = [city.at[0] * MAP_PX, city.at[1] * MAP_PX];
    if (city.capital) {
      ring(c, x, y, 4.5, { width: 1.6, color: INK.sepia });
      disc(c, x, y, 2, { color: INK.sepia });
      const w = ink(c, font, loreName(city.name), x + 8, y + 5, { px: 18, color: INK.sepia, alpha: 0.9, halo: 0.55 });
      taken.push([x - 6, y - 14, x + 10 + w, y + 8]);
    } else disc(c, x, y, 1.8, { color: INK.brown, alpha: 0.8 });
  }
  // the provinces' and the seas' names
  for (const p of PROVINCES) {
    const [x, y] = [p.label[0] * MAP_PX, p.label[1] * MAP_PX];
    const w = ink(c, font, loreName(p.name), x, y, { px: 30, color: INK.brown, align: 'center', alpha: 0.85, halo: 0.6 });
    taken.push([x - w / 2, y - 26, x + w / 2, y + 8]);
  }
  // the title's cartouche and the compass first, so no sea's name is lettered over them
  ink(c, font, 'Tamriel', 64, 96, { px: 60, color: INK.sepia });
  flourish(c, 60, 300, 112, { color: INK.brown, alpha: 0.8 });
  ink(c, font, 'The Third Era', 64, 140, { px: 22, color: INK.faded, alpha: 0.9 });
  compass(c, font, CHART_W - 120, CHART_H - 120, 52);
  taken.push([50, 40, 310, 150], [CHART_W - 190, CHART_H - 210, CHART_W - 50, CHART_H - 50]);
  // a sea's name in open water near its authored place, whole on the sheet; the Inner Sea is land on this map
  const seas = [...SEAS.filter((x) => x.name !== 'Inner Sea').map((x) => ({ ...x, px: 22, reach: 240 })), { name: 'Iliac Bay', at: [76, 62], px: 16, reach: 72, pad: 2 }];
  for (const s of seas) {
    const name = loreName(s.name);
    const at = openWater(font, name, s.px, s.at[0] * MAP_PX, s.at[1] * MAP_PX, isLand, taken, s.reach, /** @type {any} */ (s).pad ?? 16);
    if (!at) continue;
    const w = ink(c, font, name, at[0], at[1], { px: s.px, color: INK.faded, align: 'center', alpha: 0.9 });
    taken.push([at[0] - w / 2, at[1] - s.px, at[0] + w / 2, at[1] + 6]);
  }
  return c;
}

/** The margin no name crosses: the sheet's torn edge and its browned rim. */
const LABEL_MARGIN = 70;
/**
 * Where a sea's name stands: the nearest point to its authored place, searched outward, where the name lies whole on
 * open water and inside the sheet's margin. Null when no such point is near.
 */
function openWater(font, /** @type {string} */ name, /** @type {number} */ px, /** @type {number} */ cx, /** @type {number} */ cy, isLand, /** @type {number[][]} */ taken, reach = 240, pad = 16) {
  const half = (measureWords(font, name, px) + pad) / 2;
  const clear = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (x - half < LABEL_MARGIN || x + half > CHART_W - LABEL_MARGIN || y - px < LABEL_MARGIN || y + 8 > CHART_H - LABEL_MARGIN) return false;
    if (taken.some(([a, b, c2, d2]) => x + half > a && x - half < c2 && y + 8 > b && y - px < d2)) return false;
    for (let k = 0; k <= 8; k++) for (const dy of [-px * 0.7, -px * 0.3, 2]) if (isLand(x - half + (k / 8) * half * 2, y + dy)) return false;
    return true;
  };
  for (let r = 0; r <= reach; r += 8)
    for (let k = 0; k < Math.max(1, Math.round(r / 4)); k++) {
      const ang = (k / Math.max(1, Math.round(r / 4))) * Math.PI * 2;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.6;
      if (clear(x, y)) return [x, y];
    }
  return null;
}
const measureWords = (font, s, px) => {
  let w = 0;
  for (const ch of s) w += (font.map.get(ch.codePointAt(0))?.adv ?? font.px / 2) * (px / font.px);
  return w;
};

/** A compass rose: four long points and four short, and the north named. */
function compass(c, font, cx, cy, r) {
  ring(c, cx, cy, r * 0.62, { width: 1.4, color: INK.brown, alpha: 0.7 });
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4 - Math.PI / 2;
    const len = k % 2 ? r * 0.55 : r;
    const tip = [cx + Math.cos(ang) * len, cy + Math.sin(ang) * len];
    const side = (k * Math.PI) / 4;
    const w = k % 2 ? 4 : 7;
    const l = [cx + Math.cos(side) * w, cy + Math.sin(side) * w];
    const rr = [cx - Math.cos(side) * w, cy - Math.sin(side) * w];
    line(c, l[0], l[1], tip[0], tip[1], { width: 1.4, color: INK.sepia, alpha: 0.85 });
    line(c, rr[0], rr[1], tip[0], tip[1], { width: 1.4, color: INK.sepia, alpha: 0.85 });
  }
  disc(c, cx, cy, 3, { color: INK.sepia });
  ink(c, font, 'N', cx, cy - r - 8, { px: 26, color: INK.sepia, align: 'center' });
}

/** The inks a family's pins are drawn in: the herald's colours, darkened to ink. */
export const PIN_INK = Object.freeze({ gate: 0x8a2a1c, serpent: 0x2f5d5a, abyss: 0x9a6a1a, spire: 0xa07818, ketch: 0x34507a, siege: 0x5a2a5a });

/**
 * The map with its pins: an inked disc for an event whose place is known, a dashed ring for one known only by its
 * province, a second ring round one live now, and each one's number on a scrap of paper beside it.
 * @param {{ n: number, x: number, y: number, exact: boolean, live: boolean, e: { family: string } }[]} pins in picture units
 */
export async function drawJournalMap(pins) {
  const base = await mapBase();
  const font = await journalFont();
  const c = { w: base.w, h: base.h, d: base.d.slice() };
  for (const p of pins) {
    const [x, y] = [p.x * MAP_PX, p.y * MAP_PX];
    const col = /** @type {Record<string, number>} */ (PIN_INK)[p.e.family] ?? INK.red;
    if (p.exact) {
      disc(c, x, y, 7, { color: col, alpha: 0.92 });
      ring(c, x, y, 7.5, { width: 1.5, color: INK.sepia, alpha: 0.9 });
    } else {
      for (let k = 0; k < 16; k += 2) {
        const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
        line(c, x + Math.cos(a0) * 11, y + Math.sin(a0) * 11, x + Math.cos(a1) * 11, y + Math.sin(a1) * 11, { width: 2, color: col, alpha: 0.9 });
      }
    }
    if (p.live) ring(c, x, y, p.exact ? 13 : 16, { width: 1.6, color: col, alpha: 0.75 });
    const label = String(p.n);
    disc(c, x + 16, y - 15, 11, { color: INK.paper, alpha: 0.95 });
    ring(c, x + 16, y - 15, 11, { width: 1.3, color: col, alpha: 0.9 });
    ink(c, font, label, x + 16, y - 7, { px: 22, color: INK.sepia, align: 'center' });
  }
  return encodeRgba(c);
}
