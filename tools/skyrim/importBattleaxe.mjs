import { BATTLEAXE_REFERENCE, BATTLEAXE_TIP } from '../../src/characters/ownModels/battleaxeFit.js';
// Skyrim's steel double-bladed battleaxe, read only from the owner's install. Outputs are local game data.
// Uses the detailed first-person mesh for both views, through the existing Morrowind weapon rig.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fromBsa, MESHES, TEXTURES, save, BLENDER } from './importIronCuirass.mjs';
import { readSseNif } from './sseNif.mjs';
import { meshToNif } from '../nifWrite.mjs';
import { mipChain, writeDds } from '../meshTexture.mjs';
import { decodeDds } from '../../src/formats/morrowind/mwDdsFile.js';
import { readPng, writePng } from '../pngIO.mjs';
import { isMain } from '../lib/isMain.mjs';
import { drawLook } from '../lookThumbs.mjs';

export const AXE_SOURCE = 'meshes\\weapons\\steel\\1stpersonsteelbattleaxe.nif';
export const AXE_MODEL = 'skyrim_steel_battleaxe.nif';
const OUT = 'scratch/skyrim/battleaxe';
// Calibrated against the complete retail steel battleaxe, with Skyrim's proportions intact.
export const AXE_GRIP_BOUNDS = Object.freeze([BATTLEAXE_REFERENCE.pommel, BATTLEAXE_TIP]);
export function carryAxe(shape) {
  const points = shape.verts.map((v) => v.pos.map((p, k) => p * shape.S + shape.T[k]));
  const ys = points.map((p) => p[1]), lo = Math.min(...ys), hi = Math.max(...ys);
  if (!(hi > lo)) throw new Error('battleaxe has no handle length');
  const scale = (AXE_GRIP_BOUNDS[1] - AXE_GRIP_BOUNDS[0]) / (hi - lo);
  return {
    name: 'Skyrim Steel Battleaxe',
    positions: points.flatMap(([x, y, z]) => [x * scale, (y - lo) * scale + AXE_GRIP_BOUNDS[0], z * scale]),
    normals: shape.verts.flatMap((v) => v.n),
    uvs: shape.verts.flatMap((v) => v.uv), indices: shape.tris.flat(),
  };
}
export function importBattleaxe() {
  const nif = readSseNif(fromBsa(MESHES, AXE_SOURCE));
  // Blood overlay geometry is an effect, not a second opaque copy of the axe head.
  const shape = nif.shapes.find((s) => s.name === '1stPersonSteelBattleAxe:0' && s.textures?.[0]);
  if (!shape) throw new Error('Expected detailed steel battleaxe shape');
  const mesh = carryAxe(shape);
  const paths = ['diffuse.png', 'normal.png'];
  for (let i = 0; i < 2; i++) {
    const d = decodeDds(new Uint8Array(fromBsa(TEXTURES, shape.textures[i])), { levels: 1 }).mips[0];
    save(`${OUT}/${paths[i]}`, writePng({ width: d.width, height: d.height, data: d.rgba }));
  }
  let obj = '';
  // Bake in the source's upright presentation frame; weapon space has its handle along +Y.
  for (let i = 0; i < mesh.positions.length; i += 3) obj += `v ${mesh.positions[i]} ${-mesh.positions[i + 2]} ${mesh.positions[i + 1]}\n`;
  for (const v of shape.verts) obj += `vt ${v.uv[0]} ${1 - v.uv[1]}\n`;
  for (const t of shape.tris) obj += `f ${t.map((i) => `${i + 1}/${i + 1}`).join(' ')}\n`;
  save(`${OUT}/axe.obj`, obj);
  execFileSync(BLENDER, ['-b', '--factory-startup', '--python', 'tools/skyrim/bakePainting.py', '--', ...['axe.obj', ...paths, 'painting.png'].map((p) => resolve(OUT, p)), '512'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const png = readPng(readFileSync(`${OUT}/painting.png`));
  save('src/assets/mw/textures/skyrim_steel_battleaxe.dds', writeDds(mipChain(png)));
  save(`src/assets/mw/meshes/${AXE_MODEL}`, meshToNif(mesh, { texture: 'skyrim_steel_battleaxe.dds', keepV: true }));
  save('src/assets/mw/looks/skyrim_steel_battleaxe.png', writePng(drawLook([AXE_MODEL], { pitch: Math.PI / 2, yaw: 0 })));
  console.log(`${AXE_MODEL}: ${shape.verts.length} vertices, ${shape.tris.length} triangles, 512px painting`);
}
if (isMain(import.meta.url)) importBattleaxe();
