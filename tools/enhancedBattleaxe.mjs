// Local derivatives retain each axe's own geometry, UVs and original material files.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MwBsaFile } from '../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../src/formats/morrowind/mwNifMesh.js';
import { weaponRecords } from '../src/formats/morrowind/mwFirstPerson.js';
import { enhancedAxeShapes } from '../src/characters/ownModels/enhancedAxeShapes.js';
export { enhancedAxeShapes };
import { enhancedAxeModel } from '../src/characters/ownModels/enhancedBattleaxe.js';
import { meshesToNif } from './nifWrite.mjs';
import { isMain } from './lib/isMain.mjs';

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
