import { prepareWolfCage } from './wolfCloakCage.mjs';
import { execFileSync } from 'node:child_process';
// Local Pelts o Plenty -> static Morrowind wolf cloak. Run: node tools/skyrim/importWolfCloak.mjs
// Source: qIp / Pelts o Plenty; heavy collar credit: NordwarUA; fur technique: FrankBlack.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { plateBind } from '../bakeSteelPlate.mjs';
import { FEMALE_SKELETON } from './mwBody.mjs';
import { smoothNormals } from './importIronCuirass.mjs';
import { skinnedMeshesToNif } from '../nifWrite.mjs';
import { decodeDds } from '../../src/formats/morrowind/mwDdsFile.js';
import { mipChain, writeDds } from '../meshTexture.mjs';
import { resampleRgba } from '../../src/systems/dfmodTextures.js';
import { drawLook, thumbFile } from '../lookThumbs.mjs';
import { readPng, writePng } from '../pngIO.mjs';
import { isMain } from '../lib/isMain.mjs';

export const SOURCE_ROOT = process.env.PELTS_PATH ?? "Mods/Textures/Pelts 'o' Plenty - Fur Pelt Cloaks";
const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
export const WOLF_COLOURS = ['brown', 'white', 'black'];
export const wolfModel = (colour) => `wolf_pelt_${colour}.nif`;

function texturePath(relative) {
  let path = SOURCE_ROOT;
  for (const name of relative.replaceAll('\\', '/').split('/')) {
    const found = readdirSync(path).find((entry) => entry.toLowerCase() === name.toLowerCase());
    if (!found) throw new Error(`Missing local pelt resource: ${relative}`);
    path = join(path, found);
  }
  return path;
}
function painting(relative, colour, dense = false) {
  const path = texturePath(relative);
  const bytes = readFileSync(path);
  let d;
  if (bytes.toString('ascii', 84, 88) === 'DX10') {
    const png = readPng(execFileSync('python', ['-c', 'from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGBA").save(sys.stdout.buffer, format="PNG")', path], { maxBuffer: 64 * 1024 * 1024 }));
    d = { width: png.width, height: png.height, rgba: png.data };
  } else d = decodeDds(new Uint8Array(bytes), { levels: 1 }).mips[0];
  const size = Math.min(512, Math.max(d.width, d.height));
  const image = resampleRgba({ width: d.width, height: d.height, data: d.rgba }, size, size);
  // Skyrim's shell textures are very dark without its material response.
  // Normalize only visible texels; retain the authored alpha and the fur's detail.
  let sum = 0, count = 0;
  for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 3] > 128) {
    const x = (i / 4 % size) / size, y = Math.floor(i / 4 / size) / size;
    if (/FurCollar/i.test(relative) && (x < .64 || x > .96 || y < .025 || y > .585)) continue;
    sum += image.data[i] * .299 + image.data[i + 1] * .587 + image.data[i + 2] * .114; count++;
  }
  const snow = /IceWolf/i.test(relative);
  const dark = colour === 'black';
  const target = dark ? 34 : snow ? 165 : 92;
  const gain = target / Math.max(1, sum / Math.max(1, count));
  for (let i = 0; i < image.data.length; i += 4) {
    const l = image.data[i] * .299 + image.data[i + 1] * .587 + image.data[i + 2] * .114;
    for (let c = 0; c < 3; c++) image.data[i + c] = Math.min(245, Math.round((dark ? image.data[i + c] * .25 + l * .75 : colour === 'brown' ? image.data[i + c] * .3 + l * .7 : image.data[i + c]) * gain
      * (colour === 'brown' ? [1.12, .98, .88][c] : 1)
      * (.72 + .45 * Math.max(0, Math.min(1, ((Math.floor(i / 4 / size) / size) - .025) / .56)))));
  }
  if (dense) for (let i = 0; i < image.data.length; i += 4) {
    const x = (i / 4 % size) / size, y = Math.floor(i / 4 / size) / size;
    if (x < .64 || x > .96 || y < .025 || y > .585) continue;
    const t = Math.max(0, Math.min(1, (y - .025) / .56));
    // Fill the interior between fine hairs. Volume is carried by the cambered
    // mesh; only the final fringe retains the source's sparse strand cutout.
    if (image.data[i + 3] < 100) {
      const detail = .9 + .1 * Math.sin(x * 380 + y * 170);
      const shade = (dark ? 30 : snow ? 150 : 78) * (.65 + .6 * t) * detail;
      for (let c = 0; c < 3; c++) image.data[i + c] = Math.round(shade * (colour === 'brown' ? [1.14, .99, .83][c] : 1));
    }
    const u = (x - .64) / .32;
    const edge = Math.max(0, Math.min(1, Math.min(u, 1 - u) / .12));
    const core = t < .8 ? 255 : Math.round(255 * (1 - t) / .2);
    image.data[i + 3] = Math.max(image.data[i + 3], Math.round(core * edge));
  }
  if (dense) {
    // Match the iron set's softer painted detail without enlarging the atlas or
    // changing its cutout silhouette. Keep authored alpha at full resolution.
    const soft = resampleRgba(image, size / 2, size / 2);
    const detail = resampleRgba(soft, size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      for (let c = 0; c < 3; c++) image.data[i + c] = Math.round(image.data[i + c] * .7 + detail.data[i + c] * .3);
    }
  }
  return writeDds(mipChain(image));
}
export async function importWolfCloak() {
  const cage = await prepareWolfCage();
  const geometry = 'scratch/skyrim/wolf/rebuilt.json';
  const blender = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
  execFileSync(blender, ['-b', '--factory-startup', '--python', 'tools/skyrim/rebuildWolfCloak.py', '--', geometry, cage], { stdio: ['ignore', 'ignore', 'inherit'] });
  const bind = plateBind(readFileSync(FEMALE_SKELETON));
  const rebuilt = JSON.parse(readFileSync(geometry, 'utf8'));
  const shapes = rebuilt.map((s) => ({
    name: s.name, kind: s.kind, alphaTest: s.kind !== 'hide',
    mesh: { positions: s.positions.flat(), normals: smoothNormals(s.positions, s.indices).flat(), uvs: s.uvs.flat(), indices: s.indices },
    weights: s.positions.map(() => [['Bip01 Spine2', 1]]),
  }));
  for (const colour of WOLF_COLOURS) {
    const snow = colour === 'white';
    const base = 'Textures/Clothes/FurPeltCloaks/';
    const textures = {
      hide: `${base}FurPeltCloakHide.dds`,
      clumps: `${base}FurCollar/FurCollar${snow ? 'IceWolf' : 'Wolf'}.dds`,
    };
    for (const [kind, path] of Object.entries(textures)) save(`src/assets/mw/textures/wolf_pelt_${colour}_${kind}.dds`, painting(path, colour, kind === 'clumps'));
    const baked = shapes.map(({ kind, ...shape }) => ({ ...shape, texture: `wolf_pelt_${colour}_${kind}.dds` }));
    save(`src/assets/mw/meshes/${wolfModel(colour)}`, skinnedMeshesToNif(baked, { node: 'Wolf Pelt Cloak', bones: [{ name: 'Bip01 Spine2', bind: bind.get('Bip01 Spine2') }], keepV: true }));
    save(thumbFile(wolfModel(colour)), writePng(drawLook([wolfModel(colour)], { yaw: 148 * Math.PI / 180 })));
  }
  const report = shapes.map((s) => ({ shape: s.name, kind: s.kind, vertices: s.mesh.positions.length / 3, triangles: s.mesh.indices.length / 3 }));
  console.table(report);
  return report;
}
if (isMain(import.meta.url)) await importWolfCloak();
