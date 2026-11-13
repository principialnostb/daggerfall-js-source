import { searchableKind } from '../systems/searchables.js';
import { WORKSHOP_WOOD } from './dungeonWorkshopWood.js';

const crateWood = new Set([3, 12, 13, 14]);

export function dungeonStorageWood(id, cpu, archive) {
  const kind = searchableKind(id);
  if (kind !== 'crate' && kind !== 'chest') return null;
  const uvs = new Float32Array(cpu.uvs);
  let changed = false;
  const subMeshes = cpu.subMeshes.map(part => {
    if (part.textureArchive !== 90 || !(kind === 'chest' ? part.textureRecord === 2 : crateWood.has(part.textureRecord))) return part;
    changed = true;
    for (let i = part.startIndex; i < part.startIndex + part.primitiveCount * 3; i++) {
      const vertex = cpu.indices[i];
      const [x, y, z] = cpu.positions.subarray(vertex * 3, vertex * 3 + 3);
      const [nx, ny, nz] = cpu.normals.subarray(vertex * 3, vertex * 3 + 3).map(Math.abs);
      const horizontal = ny >= nx && ny >= nz;
      uvs[vertex * 2] = (horizontal || nz >= nx ? x : z) / .85;
      uvs[vertex * 2 + 1] = (horizontal ? z : y) / .72;
    }
    return { ...part, textureArchive: archive, textureRecord: WORKSHOP_WOOD.boards };
  });
  return changed ? { ...cpu, uvs, subMeshes, aabb: null, pixelBlockScale: 1.25 } : null;
}
