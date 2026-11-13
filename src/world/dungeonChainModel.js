import { MeshBench } from './ships/galleonMesh.js';

const IRON = 2;

const chainRecords = new Map([
  ['211:4', 'chain'], ['211:7', 'chain'], ['100:5', 'chain'], ['100:8', 'chain'],
  ['211:5', 'chain-pair'], ['100:6', 'chain-pair'],
  ['211:6', 'chain-staggered'], ['100:7', 'chain-staggered'],
]);

export function dungeonChainKind(archive, record) {
  return chainRecords.get(archive + ':' + record) ?? null;
}

export const isDungeonChainKind = kind => kind === 'chain' || kind === 'chain-pair' || kind === 'chain-staggered';
export const dungeonChainRecords = () => [...chainRecords];

export function addDungeonChainLink(bench, center, width, height, thickness, turned, axis, widthScale, verticalThickness = thickness) {
  const segments = 8, section = 4;
  const point = (i, j) => {
    const a = i * Math.PI * 2 / segments, b = j * Math.PI * 2 / section + Math.PI / 4;
    const offset = thickness * Math.cos(b);
    const x = (width + offset) * Math.cos(a);
    const y = center + (height + verticalThickness * Math.cos(b)) * Math.sin(a);
    const z = thickness * Math.sin(b);
    return turned ? [axis + z * widthScale, y, x * widthScale] : [axis + x * widthScale, y, z * widthScale];
  };
  for (let i = 0; i < segments; i++) for (let j = 0; j < section; j++) {
    const a = i / segments, b = j / section;
    const uvs = [[a, b], [a + 1 / segments, b], [a + 1 / segments, b + 1 / section], [a, b + 1 / section]];
    const quad = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];
    // Link planes alternate by 90 degrees, with a consistent outward winding.
    if (turned) { quad.reverse(); uvs.reverse(); }
    bench.quad(IRON, ...quad, uvs, null);
  }
}

function strand(bench, axis, links, widthScale, phase = 0) {
  const first = (10 - links) * .089;
  // Standalone chains use the flat's narrow width and tall height as separate units.
  // Keep the stock close to square in world space so the eye of each link stays open.
  const stock = .085, verticalStock = stock * widthScale * .19;
  addDungeonChainLink(bench, .076 + first, .36, .061, .105, false, axis, widthScale, verticalStock * 1.24);
  for (let i = 0; i < links; i++) {
    addDungeonChainLink(bench, .155 + first + i * .089, .225, .053, stock, (i + phase) % 2 === 0, axis, widthScale, verticalStock);
  }
}

export function buildDungeonChain(archive, kind = 'chain') {
  const bench = new MeshBench(archive);
  if (kind === 'chain') strand(bench, 0, 10, 1);
  else {
    strand(bench, -.235, 10, .62);
    strand(bench, .235, kind === 'chain-staggered' ? 7 : 10, .62, 1);
  }
  const model = bench.finish();
  // The archive keeps its original flat width and height. Shift the mesh to its base.
  const bottom = model.aabb.center[1] - model.aabb.extent[1];
  const height = model.aabb.extent[1] * 2;
  for (let i = 1; i < model.positions.length; i += 3) model.positions[i] = (model.positions[i] - bottom) / height;
  model.aabb.center[1] = .5;
  model.aabb.extent[1] = .5;
  model.subMeshes = model.subMeshes.map(sub => ({ ...sub, textureArchive: archive, textureRecord: IRON }));
  return model;
}
