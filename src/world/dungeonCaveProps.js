import { MeshBench, prism } from './ships/galleonMesh.js';

const caveProps = new Map([
  ...[6, 7, 8, 9, 11, 12, 13, 14, 15].map(record => ['300:' + record, 'Натёк кальцита']),
  ...['213:7', '213:8', '213:9', '213:10', '100:20', '100:21'].map(id => [id, 'Свисающие корни']),
]);
export const dungeonCaveRecords = () => [...caveProps];
export const isDungeonCaveProp = id => caveProps.has(id);

function calcite(b, record) {
  const narrow = record === 6;
  const tall = [[.015, narrow ? .32 : .46], [.10, .31], [.23, .20], [.42, .135],
    [.65, .087], [.83, .043], [.99, .012]];
  const knotted = [[.015, .43], [.20, .26], [.38, .29], [.54, .15], [.67, .18], [.84, .10], [.97, .04]];
  const profile = [9, 12].includes(record) ? knotted : tall;
  const sides = 11;
  const point = (ring, side) => {
    const [y, r] = profile[ring];
    const a = (side % sides) * 2 * Math.PI / sides;
    const shape = 1 + .22 * Math.sin(a * 3 + record * .72) + .11 * Math.cos(a * 5 - ring * .27);
    const radius = r * shape;
    return [Math.cos(a) * radius + Math.sin(record * 2.1) * y * .07, y, Math.sin(a) * radius * .86 + y * .075];
  };
  for (let ring = 1; ring < profile.length; ring++) for (let side = 0; side < sides; side++) {
    const a = point(ring - 1, side), c = point(ring - 1, side + 1);
    const d = point(ring, side), e = point(ring, side + 1);
    b.quad(side % 4 === 0 ? 5 : 0, a, d, e, c, [[0, 0], [0, 1], [.35, 1], [.35, 0]], null);
  }
  for (let side = 0; side < sides; side++) {
    b.tri(0, point(profile.length - 1, side), point(profile.length - 1, side + 1),
      [Math.sin(record * 2.1) * .07, 1, .075], [0, 0], [1, 0], [.5, 1], [0, 1, 0]);
  }
}

function roots(b, record) {
  const count = 2 + record % 3;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * .23, phase = record + i * 2.36;
    const base = .03 + (i % 3) * .18;
    const root = (t, j) => [x + Math.sin(phase + j * 1.48) * .064 * t, 1 - (1 - base) * t,
      Math.cos(phase + j * 1.65) * .076 * t];
    for (let n = 0; n < 6; n++) {
      const a = root(n / 6, n), c = root((n + 1) / 6, n + 1);
      const width = .037 - n * .005;
      prism(b, n % 3 === 0 ? 5 : 3, a, c, width, width - .005, 5);
      if (n === 1 || n === 3) {
        const direction = n === 1 ? 1 : -1;
        const fork = [c[0] + direction * .12, c[1] - .115, c[2] + .055];
        prism(b, 3, c, fork, width * .55, width * .34, 5);
        prism(b, 5, fork, [fork[0] + direction * .025, fork[1] - .10, fork[2] - .04], width * .34, .002, 5);
      }
    }
  }
}

export function buildDungeonCaveProp(archive, id) {
  const b = new MeshBench(archive);
  const [source, record] = id.split(':').map(Number);
  if (source === 300) calcite(b, record);
  else roots(b, record);
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: mesh.slots[i].record }));
  return mesh;
}
