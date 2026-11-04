import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { decodeDds } from '../../src/formats/morrowind/mwDdsFile.js';
import { mipChain, writeDds } from '../meshTexture.mjs';
import { wolfArmorModel } from '../../src/characters/ownModels/wolfArmorPalette.js';
import { isMain } from '../lib/isMain.mjs';

// Warm chroma approximates leather on the body atlases. The helmet is explicitly
// protected: its warm regions are horn, not leather. Metal/horn retain RGB identity.
export function palettePixel(r, g, b, palette, surface = 'mixed') {
  if (palette === 'classic') return [r, g, b];
  const l = .2126 * r + .7152 * g + .0722 * b;
  const warm = surface === 'helmet' ? 0 : Math.max(0, Math.min(1, ((r - b) / Math.max(24, r, g, b) - .08) / .20));
  const metal = [r, g, b].map((v) => palette === 'white' ? v * .96 + 12 : v * .92);
  const leather = palette === 'white' ? [l * .78 + 65, l * .77 + 63, l * .73 + 58] : [l * .34 + 6, l * .30 + 5, l * .25 + 4];
  return metal.map((v, i) => Math.round(Math.max(0, Math.min(255, v * (1 - warm) + leather[i] * warm))));
}

// Only replace length-prefixed external texture strings. All mesh, skeleton,
// normal, UV and material bytes stay exactly as in the accepted NIF.
export function replaceNifTexture(bytes, from, to) {
  const old = Buffer.from(from, 'latin1'), next = Buffer.from(to, 'latin1');
  let out = Buffer.from(bytes), at = 0, count = 0;
  while ((at = out.indexOf(old, at)) >= 0) {
    if (at < 4 || out.readUInt32LE(at - 4) !== old.length) { at += old.length; continue; }
    const size = Buffer.alloc(4); size.writeUInt32LE(next.length);
    out = Buffer.concat([out.subarray(0, at - 4), size, next, out.subarray(at + old.length)]);
    at += next.length; count++;
  }
  if (!count) throw new Error(`Texture reference not found: ${from}`);
  return out;
}

export function buildWolfArmorPalettes() {
  const root = 'src/assets/mw', done = new Set();
  const models = readdirSync(`${root}/meshes`).filter((name) => /^(iron_.*|steel_plate_helm_horned)\.nif$/i.test(name));
  if (!models.includes('steel_plate_helm_horned.nif')) throw new Error('Import the accepted Skyrim iron set first');
  for (const model of models) for (const palette of ['white', 'black']) {
    let bytes = readFileSync(`${root}/meshes/${model}`);
    const textures = parseNif(new Uint8Array(bytes)).records.filter((r) => r.type === 'NiSourceTexture' && r.fileName);
    for (const { fileName } of textures) {
      const source = fileName.replaceAll('\\', '/').split('/').pop();
      const target = `wolf_armor_${palette}_${source}`;
      if (!done.has(target)) {
        const top = decodeDds(new Uint8Array(readFileSync(`${root}/textures/${source}`)), { levels: 1 }).mips[0];
        const data = Uint8Array.from(top.rgba);
        const surface = source === 'steel_plate_helm_horned.dds' ? 'helmet' : 'mixed';
        for (let i = 0; i < data.length; i += 4) data.set(palettePixel(data[i], data[i + 1], data[i + 2], palette, surface), i);
        writeFileSync(`${root}/textures/${target}`, writeDds(mipChain({ width: top.width, height: top.height, data })));
        done.add(target);
      }
      bytes = replaceNifTexture(bytes, fileName, target);
    }
    writeFileSync(`${root}/meshes/${wolfArmorModel(model, palette)}`, bytes);
  }
  return { sourceModels: models.length, themedModels: models.length * 2, textures: done.size };
}
if (isMain(import.meta.url)) console.log(buildWolfArmorPalettes());
