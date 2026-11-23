// Set SKYRIM_PATH to the owner's local installation and run node tools/skyrim/importIronHelmet.mjs. Fit the
// helmet by aligning the source head's crown and nose to the target head, then bake the lighting at 128 pixels.
// Keep the mask clear of the face. The extracted source and outputs stay local and are ignored by Git.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { writePng } from '../pngIO.mjs';
import { decodeDds } from '../../src/formats/morrowind/mwDdsFile.js';
import { listBsa, extract } from './bsa.mjs';
import { readSseNif } from './sseNif.mjs';
import { SCENE_BODY } from '../bakeSteelPlate.mjs';

const SKYRIM = process.env.SKYRIM_PATH ?? 'D:/Steam/steamapps/common/Skyrim Special Edition';
const BLENDER = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
export const OUT = 'scratch/skyrim/out';
export const MESH = 'meshes\\armor\\iron\\male\\helmet.nif';
export const HEAD = 'meshes\\actors\\character\\character assets\\malehead.nif';
export const FIT = Object.freeze({ scale: 0.9, ahead: 1.0 });

/** The map from Skyrim's frame to the scene's: Skyrim's head's nose tip (its front) and crown onto the Morrowind
 *  head's, `ahead` further forward, everything shrunk by `scale` from there. `head` - the Skyrim head's shapes. */
export function headFit(head) {
  const pts = head.shapes.flatMap((s) => s.verts.map((v) => v.pos.map((c, k) => c + s.T[k])));
  const from = [0, Math.max(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[2]))];
  const to = [0, SCENE_BODY.head.max[1] + FIT.ahead, SCENE_BODY.head.max[2]];
  return (p) => p.map((c, k) => +(to[k] + FIT.scale * (c - from[k])).toFixed(5));
}

function fromBsa(archives, path) {
  for (const a of archives) {
    const bsa = listBsa(join(SKYRIM, 'Data', a));
    const e = bsa.entries.find((x) => x.path === path.toLowerCase());
    if (e) return extract(bsa, e);
  }
  throw new Error(`${path} is in none of ${archives.join(', ')}`);
}

/** Exclude the translucent eye-hole effect from the opaque helmet plate. */
export function helmetObj(nif, fit) {
  let obj = '', base = 1;
  for (const s of nif.shapes) {
    if (s.shader !== 'BSLightingShaderProperty') continue;
    obj += `o ${s.name}\n`;
    for (const v of s.verts) obj += `v ${fit(v.pos.map((c, k) => c + s.T[k])).join(' ')}\n`;
    for (const v of s.verts) obj += `vt ${v.uv[0]} ${1 - v.uv[1]}\n`;
    for (const v of s.verts) obj += `vn ${v.n.join(' ')}\n`;
    for (const t of s.tris) obj += `f ${t.map((k) => `${k + base}/${k + base}/${k + base}`).join(' ')}\n`;
    base += s.verts.length;
  }
  return obj;
}

const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };

const meshArchives = ['Skyrim - Meshes0.bsa', 'Skyrim - Meshes1.bsa'];
const nif = readSseNif(fromBsa(meshArchives, MESH));
save(join(OUT, 'helmet.obj'), helmetObj(nif, headFit(readSseNif(fromBsa(meshArchives, HEAD)))));
const textures = nif.shapes.find((s) => s.textures)?.textures.slice(0, 2) ?? [];
const textureArchives = Array.from({ length: 9 }, (_, i) => `Skyrim - Textures${i}.bsa`);
for (const [k, path] of textures.entries()) {
  const d = decodeDds(new Uint8Array(fromBsa(textureArchives, path)), { levels: 1 }).mips[0];
  save(join(OUT, k ? 'normal.png' : 'diffuse.png'), writePng({ width: d.width, height: d.height, data: d.rgba }));
}
console.log(`  ${MESH}: ${nif.shapes.map((s) => `${s.name} ${s.tris.length} tris`).join(', ')}; ${textures.join(', ')}`);
execFileSync(BLENDER, ['-b', '--factory-startup', '--python', 'tools/skyrim/adaptIronHelmet.py'], { stdio: ['ignore', 'ignore', 'inherit'] });
execFileSync(process.execPath, ['tools/bakeHornedHelm.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tools/lookThumbs.mjs'], { stdio: 'inherit' });   // The horned look's picture
