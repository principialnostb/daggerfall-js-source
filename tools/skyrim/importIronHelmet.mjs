// SKYRIM'S IRON HELMET AS THE HORNED STEEL HELM, from the owner's own install, in one command.
//
//     SKYRIM_PATH="D:/Steam/steamapps/common/Skyrim Special Edition" node tools/skyrim/importIronHelmet.mjs
//
// MW-HORN5 (2026-10-27, the owner: "может вообще из 5го скайрима их и выгрузить адаптировав?", Skyrim Special Edition
// installed for it, for his personal, non-commercial fork). Every attempt to MAKE the helm (MW-HORN1-4) was judged
// foreign in the game; this takes the real one. Like ARENA2, Skyrim's data is the player's and never the repository's:
// this reads the helmet out of the install's BSAs into scratch/skyrim/ (ignored), Blender re-bakes its painting with its
// normal map's light in it at the set's 128 (tools/skyrim/adaptIronHelmet.py), and tools/bakeHornedHelm.mjs makes the
// NIF and DDS - all four outputs ignored by git (.gitignore, MW-HORN5), so nothing of Bethesda's is ever committed.
//
// The fit (FIT): the helmet is moved WITH THE HEAD IT WAS MADE FOR. Skyrim's male head (HEAD) is read from the same
// install, and the helmet is carried by the map that puts that head's nose tip and crown on the Morrowind head's
// (SCENE_BODY.head - Mac's Breton, which the game's head stands HELM_LIFT over), shrunk by `scale`. Its first fits went
// by the closed helm's shell instead: unscaled it read too big beside the closed helm ("слишком большой размер"), and
// shrunk round its collar the mask fell 0.8 behind the face, which stood out through it once the head was shown
// ("оригинальное ебло со шлемом совместить"). `ahead` keeps the mask a little clear of a longer-nosed race.
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

/** The helmet's plate as an OBJ, fitted. Its other shape - "shades", a see-through dark card behind the eye holes in
 *  an effect shader - is left out: painted solid it hid the wearer's eyes (the owner: "фронтально черные глазницы"),
 *  and the face under the mask is the wearer's own now. */
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
execFileSync(process.execPath, ['tools/lookThumbs.mjs'], { stdio: 'inherit' });   // LOOK-THUMBS: the horned look's picture
