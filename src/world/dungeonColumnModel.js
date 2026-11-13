import { MeshBench, prism } from './ships/galleonMesh.js';

export function dungeonColumnKind(archive, record) {
  if (archive !== 203) return null;
  if (record === 5) return 'column-fluted';
  if (record === 6) return 'column-slim';
  return null;
}

export const isDungeonColumnKind = kind => kind === 'column-fluted' || kind === 'column-slim';

export function buildDungeonColumn(archive, kind) {
  const b = new MeshBench(archive);
  const fluted = kind === 'column-fluted';
  const stone = 10, molding = 11;
  const profile = fluted
    ? [[0, .49], [.022, .49], [.037, .42], [.063, .42], [.08, .33]]
    : [[0, .45], [.020, .45], [.036, .34], [.068, .34], [.08, .285]];
  for (let i = 1; i < profile.length; i++) {
    const [a, ra] = profile[i - 1], [c, rc] = profile[i];
    prism(b, molding, [0, a, 0], [0, c, 0], ra, rc, 12, { caps: [i === 1, false] });
    prism(b, molding, [0, 1 - c, 0], [0, 1 - a, 0], rc, ra, 12, { caps: [false, i === 1] });
  }
  const sides = 24;
  const shaft = (i, top) => {
    const a = i * Math.PI * 2 / sides;
    const r = (fluted ? .34 - (i % 2) * .049 : .287) * (top ? .92 : 1);
    return [Math.cos(a) * r, top ? .92 : .08, Math.sin(a) * r];
  };
  for (let i = 0; i < sides; i++) {
    const a = (i + .5) * Math.PI * 2 / sides;
    const u = i / 3, v = (i + 1) / 3;
    b.quad(stone, shaft(i, false), shaft(i + 1, false), shaft(i + 1, true), shaft(i, true),
      [[u, 0], [v, 0], [v, 3], [u, 3]], [Math.cos(a), 0, Math.sin(a)]);
  }
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: mesh.slots[i].record }));
  return mesh;
}
