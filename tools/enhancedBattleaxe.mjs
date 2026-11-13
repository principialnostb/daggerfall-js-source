// Local derivatives retain each axe's own geometry, UVs and original material files.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MwBsaFile } from '../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../src/formats/morrowind/mwNifMesh.js';
import { weaponRecords } from '../src/formats/morrowind/mwFirstPerson.js';
import { BATTLEAXE_LENGTH } from '../src/characters/ownModels/battleaxeFit.js';
import { enhancedAxeModel } from '../src/characters/ownModels/enhancedBattleaxe.js';
import { meshesToNif } from './nifWrite.mjs';
import { isMain } from './lib/isMain.mjs';

export function enhancedAxeShapes(batches) {
  const points = batches.flatMap(b => Array.from(b.positions));
  const ys = points.filter((_, i) => i % 3 === 1), xs = points.filter((_, i) => i % 3 === 0);
  const lo = Math.min(...ys), hi = Math.max(...ys), width = Math.max(...xs) - Math.min(...xs);
  if (!(hi > lo && width > 0)) throw new Error('Degenerate axe mesh');
  const center = (Math.min(...xs) + Math.max(...xs)) / 2;
  const edges = ys.filter((_, i) => Math.abs(points[i * 3] - center) > width * 0.22);
  const shoulder = Math.min(...edges);
  if (!(shoulder > lo)) throw new Error('Cannot separate axe head from haft');
  const extension = Math.max(0, BATTLEAXE_LENGTH - (hi - lo));
  const scale = 1 + extension / (shoulder - lo);
  return batches.map(b => ({
    mesh: {
      name: b.name,
      positions: Array.from(b.positions, (v, i) => i % 3 === 1 ? v + extension * Math.min(1, (v - lo) / (shoulder - lo)) : v),
      normals: Array.from(b.normals ?? []), colors: b.colors, uvs: b.uvs, indices: b.indices,
    },
    texture: b.material?.textureFile ?? null, material: b.material,
  })).map((shape, index) => {
    const source = batches[index];
    for (let i = 0; i < shape.mesh.normals.length; i += 3) {
      if (source.positions[i + 1] >= shoulder) continue;
      const n = shape.mesh.normals.slice(i, i + 3); n[1] /= scale;
      const length = Math.hypot(...n) || 1;
      shape.mesh.normals.splice(i, 3, ...n.map(v => v / length));
    }
    return shape;
  });
}

export function buildEnhancedBattleaxe() {
  const data = join(process.env.MORROWIND_PATH ?? 'D:/Steam/steamapps/common/Morrowind', 'Data Files');
  const files = readdirSync(data);
  const archives = files.filter(f => /\.bsa$/i.test(f)).map(f => new MwBsaFile(new Uint8Array(readFileSync(join(data, f)))));
  const models = new Set(files.filter(f => /\.es[mp]$/i.test(f)).flatMap(f => weaponRecords(new Uint8Array(readFileSync(join(data, f))))).filter(r => r.type === 8 && r.model).map(r => r.model.toLowerCase().replaceAll('\\', '/')));
  mkdirSync('src/assets/mw/meshes', { recursive: true });
  let count = 0;
  for (const model of models) {
    const archive = archives.find(a => a.has('meshes/' + model));
    if (!archive) { console.warn('No mesh for attached record:', model); continue; }
    const shapes = enhancedAxeShapes(flattenNif(parseNif(archive.get('meshes/' + model))));
    writeFileSync('src/assets/mw/meshes/' + enhancedAxeModel(model), meshesToNif(shapes, { keepV: true }));
    console.log(model, '->', enhancedAxeModel(model)); count++;
  }
  return count;
}
if (isMain(import.meta.url)) console.log('Enhanced two-handed axe models:', buildEnhancedBattleaxe());
