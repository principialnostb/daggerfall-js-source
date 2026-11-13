import { MeshBench, box, prism } from './ships/galleonMesh.js';
import { SLAB_STONE, slabStonePaint } from './dungeonSlabStone.js';

export const TORTURE_TABLE_ID = 41301;
export const STAINED_TABLE_STONE = 123;
export const STAINED_PRESS_IRON = 124;

export function stainedTablePaint(iron = false) {
  const paint = slabStonePaint();
  const patches = [[18, 24, 10, 5], [31, 29, 9, 3], [43, 40, 8, 5], [13, 44, 4, 3],
    ...(iron ? [[24, 33, 13, 4], [52, 19, 6, 3], [35, 53, 9, 4]] : [])];
  for (let y = 0; y < paint.height; y++) for (let x = 0; x < paint.width; x++) {
    const edge = Math.sin(x * 1.8 + y * 2.4) * .19;
    const i = (y * paint.width + x) * 4;
    const shade = paint.colors[i] / 96;
    const stained = patches.some(([cx, cy, w, h]) => ((x - cx) / w) ** 2 + ((y - cy) / h) ** 2 + edge < 1);
    if (stained) paint.colors.set([68 * shade, 39 * shade, 32 * shade, 255], i);
    else if (iron) paint.colors.set([64 * shade, 68 * shade, 69 * shade, 255], i);
  }
  return paint;
}

export function buildDungeonTortureTable(archive) {
  const b = new MeshBench(archive);
  // 93:6 fixes the bed's original height and footprint in ARCH3D 41301.
  box(b, SLAB_STONE, [.199, -1.825, .272], [.565, .099, 1.14], { tile: [.65, .55] });
  box(b, SLAB_STONE, [.199, -1.45, .272], [.532, .375, 1.15], { tile: [.68, .58] });
  box(b, SLAB_STONE, [.199, -1.035, .272], [.625, .061, 1.425], { tile: [.62, .53], skip: [2] });
  box(b, STAINED_TABLE_STONE, [.199, -1.035, .272], [.625, .061, 1.425], {
    skip: [0, 1, 3, 4, 5], uvFace: (_, i) => [[0, 0], [1, 0], [1, 1], [0, 1]][i],
  });
  // Loose cord and scattered bones read as separate objects under torchlight.
  for (let i = 0; i < 15; i++) {
    const p = j => [-.17 + Math.cos(j * Math.PI / 9) * .115, -.957, -.67 + Math.sin(j * Math.PI / 9) * .085];
    prism(b, 5, p(i), p(i + 1), .014, .014, 6);
  }
  for (const [a, c] of [
    [[.27, -.944, .74], [.42, -.944, 1.05]],
    [[.31, -.946, .72], [.48, -.946, 1.01]],
    [[-.13, -.949, .25], [-.05, -.949, .43]],
  ]) {
    prism(b, 114, a, c, .022, .014, 6);
    prism(b, 114, [a[0], a[1], a[2] - .025], a, .013, .028, 6);
  }
  const mesh = b.finish();
  mesh.pixelBlockScale = 1;
  mesh.subMeshes = mesh.subMeshes.map((part, i) => ({
    ...part, textureArchive: archive, textureRecord: mesh.slots[i].record,
  }));
  return mesh;
}
