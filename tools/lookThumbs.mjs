// Run node tools/lookThumbs.mjs to render equipment NIFs and DDS textures into src/assets/mw/looks/. Keep the
// three-quarter view and lighting consistent. Skip looks whose source files are absent.
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

/** Draw both halves of paired equipment using each part's own material. */
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
