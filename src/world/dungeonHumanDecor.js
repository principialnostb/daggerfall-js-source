import { MeshBench, prism } from './ships/galleonMesh.js';
import { transformPoint, trs } from './mat4.js';
import { parseNif } from '../formats/morrowind/mwNifFile.js';
import { flattenNif } from '../formats/morrowind/mwNifMesh.js';
import { correctTexturePath, decodeTextureImage } from '../formats/morrowind/mwTexture.js';

export const dungeonHeadFiles = ['head_02', 'hair_02'].map(part => 'meshes/b/b_n_imperial_m_' + part + '.nif');

export function dungeonHumanAssetReader(archives) {
  return async path => {
    const archive = archives.find(candidate => candidate.has(path));
    if (!archive) throw new Error('Missing dungeon head asset: ' + path);
    await archive.load?.(path);
    return archive.get(path);
  };
}

export async function loadDungeonHead(archives) {
  const read = dungeonHumanAssetReader(archives);
  const files = await Promise.all(dungeonHeadFiles.map(read));
  const shapes = files.flatMap(bytes => flattenNif(parseNif(bytes)));
  if (!shapes.length) return null;
  const textures = [...new Set(shapes.map(shape => shape.material.textureFile))];
  const paints = new Map(await Promise.all(textures.map(async (name, index) => {
    const path = correctTexturePath(name, candidate => archives.some(archive => archive.has(candidate)));
    const { width, height, rgba } = decodeTextureImage(path, await read(path), { levels: 1 }).mips[0];
    return [80 + index, { width, height, colors: rgba }];
  })));
  return { parts: shapes.map(shape => ({ shape, slot: 80 + textures.indexOf(shape.material.textureFile) })), paints };
}

export function dungeonHumanAssets(load) {
  let generation, source, loading, assets;
  return () => {
    if (source && source.morrowindDataGeneration() === generation) return assets;
    if (!loading) {
      loading = import('../scenes/dataSource.js').then(async module => {
        source = module;
        const next = source.morrowindDataGeneration();
        generation = next;
        assets = null;
        const loaded = await load(await source.loadMorrowindArchives());
        if (source.morrowindDataGeneration() === next) assets = loaded;
      }).catch(() => { assets = null; }).finally(() => { loading = null; });
    }
    return null;
  };
}

export const currentDungeonHead = dungeonHumanAssets(loadDungeonHead);

export function buildDungeonHeadStake(archive, parts) {
  const b = new MeshBench(archive);
  prism(b, 3, [-.20, 0, .05], [-.04, 1.81, 0], .046, .031, 5);
  prism(b, 3, [-.04, 1.81, 0], [-.03, 1.98, 0], .031, .003, 5);
  for (let i = 0; i < 3; i++) {
    prism(b, 5, [-.051 + i * .002, 1.68 + i * .026, 0],
      [-.050 + i * .002, 1.699 + i * .026, 0], .039, .039, 7);
  }
  const pose = trs(-.027, 1.94, .022, 11, -14, -13, .020, .020, .020);
  for (const { shape, slot } of parts) {
    const { positions, indices, uvs } = shape;
    for (let i = 0; i < indices.length; i += 3) {
      const corners = [indices[i], indices[i + 1], indices[i + 2]];
      const points = corners.map(v => transformPoint(pose, positions[3 * v], positions[3 * v + 2], -positions[3 * v + 1]));
      const uv = corners.map(v => [uvs[2 * v], uvs[2 * v + 1]]);
      b.tri(slot, ...points, ...uv, null);
    }
  }
  const model = b.finish();
  model.subMeshes = model.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: model.slots[i].record }));
  return model;
}
