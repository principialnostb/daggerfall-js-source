import { flattenNif } from '../formats/morrowind/mwNifMesh.js';
import { parseNif } from '../formats/morrowind/mwNifFile.js';
import { hairColorMips, hairGeometryKey, selectHairBatches } from './hairColor.js';

export function describeHair(bytes) {
  const batches = flattenNif(parseNif(bytes));
  const selected = selectHairBatches(batches, 'hair');
  return { key: hairGeometryKey(batches, selected), textures: selected.map(batch => batch.material?.textureFile) };
}

export function prepareHair(job) {
  if (job.kind === 'geometry') return describeHair(job.bytes);
  return hairColorMips(job.mips, 'hair', job.color);
}
