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
import { rasterLook, closePair, rotX } from '../src/render/lookThumbRaster.js';
import { isMain } from './lib/isMain.mjs';

export const SIZE = 96, SUPER = 3;
export const LOOKS_DIR = 'src/assets/mw/looks';
export const thumbFile = (model) => `${LOOKS_DIR}/${model.replace(/\.nif$/i, '.png')}`;

const textureCache = new Map();
function texture(file) {
  if (!textureCache.has(file)) {
    const path = `src/assets/mw/textures/${file.toLowerCase()}`;
    const d = existsSync(path) ? decodeDds(new Uint8Array(readFileSync(path)), { levels: 1 }).mips[0] : null;
    textureCache.set(file, d && { width: d.width, height: d.height, data: d.rgba });
  }
  return textureCache.get(file);
}

/** One look's picture: its parts' shapes, each in its own painting, drawn by the game's own look raster
 *  (src/render/lookThumbRaster.js - the same law the 3D tab's Morrowind cards are drawn by). LOOK-THUMBS-PAIRS (BLOODBATH,
 *  2026-11-08, the owner: "старые тоже нужно сделать парными"): a pair's two halves are both drawn, the left moved in
 *  beside the right (closePair) - at the bind they stand an arm's span apart. `parts` are { model, part } rows. */
export function drawLook(parts, { yaw, pitch = 0 } = {}) {
  // `pitch` tips the MODEL about X before it is viewed (the importers' shields and axe lie flat), as it always did;
  // a bare model path is a part with no side
  const tip = pitch ? rotX(pitch) : null;
  const copies = parts.map((p) => {
    const row = typeof p === 'string' ? { model: p, part: '' } : p;
    return {
      shapes: flattenNif(parseNif(new Uint8Array(readFileSync(`src/assets/mw/meshes/${row.model}`)))),
      ...(tip ? { matrix: tip } : {}),
      side: /^left /.test(row.part ?? '') ? 'left' : /^right /.test(row.part ?? '') ? 'right' : null,
    };
  });
  return rasterLook(closePair(copies), texture, { size: SIZE, supersample: SUPER, ...(yaw !== undefined ? { yaw } : {}) });
}

/** Every look of every own piece with looks: [{ piece, look, parts, models, file }] - a pair's both halves. */
export const allLooks = () => OWN_MW_ARMOR.filter((p) => p.styles).flatMap((p) =>
  Object.entries(p.styles).map(([look, parts]) => ({ piece: p.id, look, parts, models: parts.map((x) => x.model), file: thumbFile(parts[0].model) })));

if (isMain(import.meta.url)) {
  mkdirSync(LOOKS_DIR, { recursive: true });
  for (const l of allLooks()) {
    if (!l.models.every((m) => existsSync(`src/assets/mw/meshes/${m}`))) { console.log(`  ${l.piece} ${l.look}: no mesh yet - skipped`); continue; }
    writeFileSync(l.file, writePng(drawLook(l.parts)));
    console.log(`  ${l.piece} ${l.look} -> ${l.file}`);
  }
}
