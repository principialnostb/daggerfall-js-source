import { MeshBench, prism } from '../ships/galleonMesh.js';
import { TREASURE_ART, FURNISHING_PAINT } from '../treasureModel.js';
import { TILE_UNITS } from './waterBed.js';

// DFU RMBLayout.AddNatureFlats reads the block's authored plants. This surveyed
// village adds sparse waterside clumps at the intersection of its floor and sheet.
const banks = [
  [67.65, 66.95, 2.65, 'rush'], [67.65, 66.95, -0.90, 'stone'],
  [70, 68.65, -1.15, 'rush'], [70, 68.65, -2.22, 'stone'],
  [70, 68.65, 0.30, 'rush'], [70, 68.65, 1.45, 'stone'],
  [70, 68.65, 2.72, 'rush'],
];
const uv = [[0, 0], [1, 0], [.5, 1]];
const { greenReeds, dryReeds, rackWood, shoreStone } = FURNISHING_PAINT;

function rush(mesh, floor, cx, cz, seed) {
  for (let i = 0; i < 33; i++) {
    const a = seed + i * 2.4, dx = Math.cos(a), dz = Math.sin(a);
    const spread = Math.sqrt(i / 33), x = cx + dx * spread * .48, z = cz + dz * spread * .36;
    const ground = floor(x, z);
    if (ground == null) continue;
    const y = ground - .08, height = (.64 + .36 * Math.sin(i * 1.7 + seed) + .22 * (1 - spread)) * (.88 + .23 * Math.cos(seed));
    const lean = .12 + .32 * spread, w = .035 + .013 * Math.cos(i);
    const left = [x - dz * w, y, z + dx * w], right = [x + dz * w, y, z - dx * w];
    const ridge = [x + dx * lean * .26, y + height * .55, z + dz * lean * .26];
    const tip = [x + dx * lean, y + height, z + dz * lean];
    const paint = i % 5 === 0 ? dryReeds : greenReeds;
    for (const [a, b, c] of [[left, right, ridge], [left, ridge, tip], [ridge, right, tip]]) {
      mesh.tri(paint, a, b, c, ...uv);
      mesh.tri(paint, c, b, a, uv[2], uv[1], uv[0]);
    }
    if (i % 11 === 0) {
      const stalk = [x + .05 * dx, y + height + .28, z + .05 * dz];
      prism(mesh, greenReeds, [x, y, z], stalk, .019, .012, 4);
      prism(mesh, rackWood, stalk, [stalk[0] + .014 * dx, stalk[1] + .16, stalk[2] + .014 * dz], .035, .027, 5);
    }
  }
}

function stone(mesh, floor, x, z, radius, seed) {
  const ground = floor(x, z);
  if (ground == null) return;
  const y = ground - .09 * radius;
  const base = [], shoulder = [];
  for (let i = 0; i < 7; i++) {
    const a = seed + i * Math.PI * 2 / 7, r = radius * (.87 + .13 * Math.sin(i * 3.7 + seed));
    const dx = Math.cos(a) * r, dz = Math.sin(a) * r * .77;
    base.push([x + dx, y - .25 * radius, z + dz]);
    shoulder.push([x + dx * .82, y + (.24 + .12 * Math.cos(i + seed)) * radius, z + dz * .82]);
  }
  const cap = [x + radius * .13, y + radius * .52, z - radius * .09];
  for (let i = 0; i < 7; i++) {
    const j = (i + 1) % 7;
    mesh.quad(shoreStone, base[i], shoulder[i], shoulder[j], base[j], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    mesh.tri(shoreStone, shoulder[i], cap, shoulder[j], ...uv, [0, 1, 0]);
  }
}

export function pondShoreMesh(floor, waterY) {
  const mesh = new MeshBench(TREASURE_ART);
  for (const [index, [tx, tz, angle, kind]] of banks.entries()) {
    const start = floor(tx * TILE_UNITS, tz * TILE_UNITS);
    if (start == null || start >= waterY) continue;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    for (let d = 0; d < 18; d += .16) {
      const x = tx * TILE_UNITS + dx * d, z = tz * TILE_UNITS + dz * d;
      const y = floor(x, z);
      if (y == null) break;
      if (y < waterY + (kind === 'stone' ? -.10 : -.025)) continue;
      if (kind === 'rush') {
        rush(mesh, floor, x, z, index);
        rush(mesh, floor, x + dz * .62, z - dx * .62, index + 3);
      } else {
        stone(mesh, floor, x, z, .57 + .10 * Math.cos(index), index);
        stone(mesh, floor, x + dz * .58 - dx * .20, z - dx * .58 - dz * .20, .27 + .07 * Math.sin(index), index + 2);
      }
      break;
    }
  }
  const model = mesh.finish();
  if (model) {
    model.subMeshes.forEach((part, i) => Object.assign(part, { textureArchive: TREASURE_ART, textureRecord: model.slots[i].record }));
    model.pixelBlockScale = 1;
  }
  return model;
}
