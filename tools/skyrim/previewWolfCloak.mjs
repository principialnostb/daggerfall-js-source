// Render input made from the actual runtime-bound NIF meshes, not the Blender authoring mesh.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assembleFirstPersonArm, poseAssembly } from '../../src/formats/morrowind/mwFirstPerson.js';
import { decodeDds } from '../../src/formats/morrowind/mwDdsFile.js';
import { writePng } from '../pngIO.mjs';
import { BETTER_BODY, FEMALE_SKELETON } from './mwBody.mjs';
const out = 'scratch/wolf-preview'; mkdirSync(out, { recursive: true });
const colour = process.argv[2] ?? 'brown';
if (!['brown', 'white', 'black'].includes(colour)) throw new Error('Unknown cloak colour');
const models = ['iron_cuirass', 'iron_skirt', 'iron_pauldron_left', 'iron_pauldron_right', 'iron_gauntlet_left', 'iron_gauntlet_right', 'iron_boot_left', 'iron_boot_right', 'iron_greave_left', 'iron_greave_right', 'steel_plate_helm_horned', `wolf_pelt_${colour}`];
const parts = models.map((file) => ({ slot: file, bones: [], bytes: new Uint8Array(readFileSync(`src/assets/mw/meshes/${file}.nif`)) }));
parts.push({ slot: 'body', bones: [], bytes: new Uint8Array(readFileSync(BETTER_BODY())) });
const rig = await assembleFirstPersonArm({ skeletonBytes: new Uint8Array(readFileSync(FEMALE_SKELETON)), parts });
if (!rig.ok) throw new Error(rig.error);
poseAssembly(rig);
const shapes = rig.pieces.filter((p) => p.positions?.length).map((p) => {
  const texture = p.material?.textureFile ?? p.batch?.material?.textureFile;
  let png = null;
  if (texture && existsSync(`src/assets/mw/textures/${texture}`)) {
    const d = decodeDds(new Uint8Array(readFileSync(`src/assets/mw/textures/${texture}`)), { levels: 1 }).mips[0];
    png = resolve(`${out}/${texture}.png`); writeFileSync(png, writePng({ width: d.width, height: d.height, data: d.rgba }));
  }
  return { name: p.slot, positions: Array.from(p.positions), indices: Array.from(p.indices), uvs: Array.from(p.uvs ?? []), png, alpha: p.material?.alphaTest ?? p.batch?.material?.alphaTest ?? false };
});
writeFileSync(`${out}/scene.json`, JSON.stringify(shapes));
console.log(`Runtime posed: ${shapes.length} shapes; run Blender with tools/skyrim/renderWolfCloak.py`);
