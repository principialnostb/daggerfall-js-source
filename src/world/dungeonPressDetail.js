import { MeshBench, box, prism } from './ships/galleonMesh.js';
import { SLAB_STONE } from './dungeonSlabStone.js';
import { STAINED_PRESS_IRON } from './dungeonTortureTable.js';

export const CLASSIC_PRESS_ID = 41302;

export function buildDungeonPress(archive) {
  const b = new MeshBench(archive);
  const iron = 2, dark = 11;
  const stoneTile = { tile: [.70, .65] };
  box(b, SLAB_STONE, [.015, -1.76, -.105], [.585, .10, 1.25], stoneTile);
  box(b, SLAB_STONE, [.015, -1.39, -.105], [.51, .27, 1.16], stoneTile);
  box(b, iron, [.015, -1.015, -.105], [.625, .105, 1.425], { ...stoneTile, skip: [2] });
  box(b, STAINED_PRESS_IRON, [.015, -1.015, -.105], [.625, .105, 1.425], {
    skip: [0, 1, 3, 4, 5], uvFace: (_, i) => [[0, 0], [1, 0], [1, 1], [0, 1]][i],
  });

  for (const z of [-1.38, 1.17]) {
    for (const x of [-.53, .56]) {
      box(b, dark, [x, -.40, z], [.078, 1.41, .074]);
      for (const y of [-1.69, .19, .99]) box(b, iron, [x, y, z], [.087, .052, .083]);
    }
    box(b, dark, [.015, 1.025, z], [.625, .077, .078]);
  }
  for (const x of [-.53, .56]) box(b, dark, [x, 1.025, -.105], [.075, .077, 1.28]);
  box(b, dark, [.015, 1.025, -.105], [.55, .084, .17]);
  box(b, STAINED_PRESS_IRON, [.015, .29, -.105], [.48, .145, 1.06], stoneTile);
  for (const z of [-.91, .70]) {
    box(b, iron, [.015, .29, z], [.498, .155, .049], { skip: [0, 1] });
    for (const x of [-.34, -.16, .015, .19, .37]) {
      box(b, dark, [x, .127, z], [.058, .026, .054]);
      prism(b, iron, [x, .105, z], [x, -.09, z], .038, .010, 5);
    }
    prism(b, dark, [.015, .44, z], [.015, .951, z], .044, .044, 8);
  }
  for (const z of [-.37, .16]) for (const x of [-.25, .015, .28]) {
    prism(b, iron, [x, .145, z], [x, -.052, z], .032, .009, 5);
  }

  for (let i = 0; i < 16; i++) {
    const p = j => [-.24 + Math.cos(j * .39) * .12, -.894, -.62 + Math.sin(j * .39) * .105];
    prism(b, 5, p(i), p(i + 1), .015, .015, 6);
  }
  for (let i = 0; i < 12; i++) {
    const p = j => [.35 + Math.cos(j * .45) * .086, -.894, -.81 + Math.sin(j * .45) * .08];
    prism(b, 5, p(i), p(i + 1), .013, .013, 6);
  }
  for (const [x, z, dx, dz] of [[.21, .54, .13, .23], [.28, .47, .15, .22], [-.13, .39, .10, .11]]) {
    prism(b, 114, [x, -.883, z], [x + dx, -.886, z + dz], .023, .017, 6);
    prism(b, 114, [x - .018, -.881, z - .02], [x, -.883, z], .025, .027, 6);
  }
  const mesh = b.finish();
  mesh.pixelBlockScale = 1;
  mesh.subMeshes = mesh.subMeshes.map((part, i) => ({
    ...part, textureArchive: archive, textureRecord: mesh.slots[i].record,
  }));
  return mesh;
}
