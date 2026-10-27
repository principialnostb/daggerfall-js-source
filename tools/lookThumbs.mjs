// THE LOOKS' THUMBNAILS, in one command.
//
//     node tools/lookThumbs.mjs
//         draw every own armour piece's looks (OWN_MW_ARMOR `styles`) from their NIFs and DDSs into
//         src/assets/mw/looks/<the look's NIF>.png
//
// LOOK-THUMBS (2026-10-27, the owner: "что б не текстовое название было а превьюшка предмета, я думаю так гораздо
// удобнее ориентироваться будет с развитием системы"). The pack's card shows a look as its picture, so each look has
// one: its parts' meshes, as baked, in their own paintings, turned three-quarters to the viewer and lit from above in
// front, on a clear ground - drawn here once rather than in the game, so the card costs one small PNG a look. A look
// whose NIF is not on disk (the horned helm before its import - tools/skyrim/importIronHelmet.mjs) is skipped, and the
// card shows its name instead.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { parseNif } from '../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../src/formats/morrowind/mwNifMesh.js';
import { decodeDds } from '../src/formats/morrowind/mwDdsFile.js';
import { OWN_MW_ARMOR } from '../src/characters/ownModels/ownArmorModels.js';
import { writePng } from './pngIO.mjs';
import { isMain } from './lib/isMain.mjs';

export const SIZE = 96, SUPER = 3;
export const LOOKS_DIR = 'src/assets/mw/looks';
export const thumbFile = (model) => `${LOOKS_DIR}/${model.replace(/\.nif$/i, '.png')}`;
const YAW = -32 * Math.PI / 180, PITCH = 12 * Math.PI / 180;
const LIGHT = (() => { const l = [0.35, 0.55, 0.75], n = Math.hypot(...l); return l.map((v) => v / n); })();

const textureCache = new Map();
function texture(file) {
  if (!textureCache.has(file)) {
    const path = `src/assets/mw/textures/${file.toLowerCase()}`;
    const d = existsSync(path) ? decodeDds(new Uint8Array(readFileSync(path)), { levels: 1 }).mips[0] : null;
    textureCache.set(file, d && { width: d.width, height: d.height, data: d.rgba });
  }
  return textureCache.get(file);
}

/** One look's picture: its NIFs' shapes, each in its own painting, z-buffered, SUPER-sampled down to SIZE. Pure but
 *  for the files it reads. */
export function drawLook(models) {
  const shapes = models.flatMap((m) => flattenNif(parseNif(new Uint8Array(readFileSync(`src/assets/mw/meshes/${m}`)))));
  const view = (p) => {   // turned round Z by YAW, then tipped by PITCH: x right, y up, z toward the viewer
    const x1 = p[0] * Math.cos(YAW) - p[1] * Math.sin(YAW), y1 = p[0] * Math.sin(YAW) + p[1] * Math.cos(YAW);
    return [x1, p[2] * Math.cos(PITCH) - y1 * Math.sin(PITCH), y1 * Math.cos(PITCH) + p[2] * Math.sin(PITCH)];
  };
  const all = shapes.flatMap((s) => Array.from({ length: s.positions.length / 3 }, (_, i) => view(s.positions.slice(i * 3, i * 3 + 3))));
  const mn = [0, 1].map((k) => Math.min(...all.map((p) => p[k]))), mx = [0, 1].map((k) => Math.max(...all.map((p) => p[k])));
  const S = SIZE * SUPER, span = Math.max(mx[0] - mn[0], mx[1] - mn[1]) * 1.08, c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2];
  const toPx = (p) => [(p[0] - c[0]) / span * S + S / 2, S / 2 - (p[1] - c[1]) / span * S, p[2]];
  const rgba = new Float32Array(S * S * 4), depth = new Float32Array(S * S).fill(-Infinity);
  for (const s of shapes) {
    const tex = texture(s.material?.textureFile ?? '');
    const P = Array.from({ length: s.positions.length / 3 }, (_, i) => toPx(view(s.positions.slice(i * 3, i * 3 + 3))));
    const N = Array.from({ length: s.positions.length / 3 }, (_, i) => view(s.normals?.slice(i * 3, i * 3 + 3) ?? [0, 0, 1]));
    for (let t = 0; t < s.indices.length; t += 3) {
      const [a, b, d] = [s.indices[t], s.indices[t + 1], s.indices[t + 2]];
      const [pa, pb, pd] = [P[a], P[b], P[d]];
      const area = (pb[0] - pa[0]) * (pd[1] - pa[1]) - (pd[0] - pa[0]) * (pb[1] - pa[1]);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pd[0]))), x1 = Math.min(S - 1, Math.ceil(Math.max(pa[0], pb[0], pd[0])));
      const y0 = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pd[1]))), y1 = Math.min(S - 1, Math.ceil(Math.max(pa[1], pb[1], pd[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w1 = ((pd[0] - pa[0]) * (py - pa[1]) - (px - pa[0]) * (pd[1] - pa[1])) / -area;
        const w2 = ((pb[0] - pa[0]) * (py - pa[1]) - (px - pa[0]) * (pb[1] - pa[1])) / area;
        const w0 = 1 - w1 - w2;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * pa[2] + w1 * pb[2] + w2 * pd[2], o = y * S + x;
        if (z <= depth[o]) continue;
        depth[o] = z;
        const n = [0, 1, 2].map((k) => w0 * N[a][k] + w1 * N[b][k] + w2 * N[d][k]);
        const nl = Math.hypot(...n) || 1;
        const lit = 0.45 + 0.75 * Math.abs((n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / nl);
        let col = [150, 150, 150];
        if (tex && s.uvs) {
          const u = w0 * s.uvs[a * 2] + w1 * s.uvs[b * 2] + w2 * s.uvs[d * 2], v = w0 * s.uvs[a * 2 + 1] + w1 * s.uvs[b * 2 + 1] + w2 * s.uvs[d * 2 + 1];
          const tx = ((Math.floor(u * tex.width) % tex.width) + tex.width) % tex.width, ty = ((Math.floor(v * tex.height) % tex.height) + tex.height) % tex.height;
          const q = (ty * tex.width + tx) * 4;
          col = [tex.data[q], tex.data[q + 1], tex.data[q + 2]];
        }
        for (let k = 0; k < 3; k++) rgba[o * 4 + k] = Math.min(255, col[k] * lit);
        rgba[o * 4 + 3] = 255;
      }
    }
  }
  const out = new Uint8Array(SIZE * SIZE * 4);   // the box filter down, colour weighted by coverage
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const acc = [0, 0, 0, 0];
    for (let j = 0; j < SUPER; j++) for (let i = 0; i < SUPER; i++) {
      const o = ((y * SUPER + j) * S + x * SUPER + i) * 4, a = rgba[o + 3] / 255;
      for (let k = 0; k < 3; k++) acc[k] += rgba[o + k] * a;
      acc[3] += a;
    }
    const q = (y * SIZE + x) * 4;
    for (let k = 0; k < 3; k++) out[q + k] = acc[3] ? Math.round(acc[k] / acc[3]) : 0;
    out[q + 3] = Math.round(acc[3] / (SUPER * SUPER) * 255);
  }
  return { width: SIZE, height: SIZE, data: out };
}

/** Every look of every own piece with looks: [{ piece, look, models, file }]. A pair (gauntlets, boots) is drawn by
 *  its right half alone - both stand an arm's span apart at the bind, and together they shrink to specks. */
export const allLooks = () => OWN_MW_ARMOR.filter((p) => p.styles).flatMap((p) =>
  Object.entries(p.styles).map(([look, parts]) => {
    const drawn = parts.some((x) => /^right /.test(x.part)) ? parts.filter((x) => !/^left /.test(x.part)) : parts;
    return { piece: p.id, look, models: drawn.map((x) => x.model), file: thumbFile(parts[0].model) };
  }));

if (isMain(import.meta.url)) {
  mkdirSync(LOOKS_DIR, { recursive: true });
  for (const l of allLooks()) {
    if (!l.models.every((m) => existsSync(`src/assets/mw/meshes/${m}`))) { console.log(`  ${l.piece} ${l.look}: no mesh yet - skipped`); continue; }
    writeFileSync(l.file, writePng(drawLook(l.models)));
    console.log(`  ${l.piece} ${l.look} -> ${l.file}`);
  }
}
