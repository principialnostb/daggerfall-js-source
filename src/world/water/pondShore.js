import { MeshBench, prism } from '../ships/galleonMesh.js';
import { TREASURE_ART, FURNISHING_PAINT } from '../treasureModel.js';
import { roadEdgeHash } from '../road/roadEdge.js';
import { TILE_UNITS } from './waterBed.js';
import { WATER_DRAW_MASK_TABLE } from './waterCorners.js';
import { clearPondBank, POND_SIDE } from './pondSites.js';

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
    const y = ground - .025, height = (.64 + .36 * Math.sin(i * 1.7 + seed) + .22 * (1 - spread)) * (.88 + .23 * Math.cos(seed));
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
  const base = [], shoulder = [];
  for (let i = 0; i < 7; i++) {
    const a = seed + i * Math.PI * 2 / 7, r = radius * (.87 + .13 * Math.sin(i * 3.7 + seed));
    const dx = Math.cos(a) * r, dz = Math.sin(a) * r * .77;
    const bx = x + dx, bz = z + dz, sx = x + dx * .82, sz = z + dz * .82;
    // Seat the footprint around the stone, including its uphill side.
    base.push([bx, (floor(bx, bz) ?? ground) - .07 * radius, bz]);
    shoulder.push([sx, (floor(sx, sz) ?? ground) + (.34 + .08 * Math.cos(i + seed)) * radius, sz]);
  }
  const cx = x + radius * .13, cz = z - radius * .09;
  const cap = [cx, (floor(cx, cz) ?? ground) + radius * .68, cz];
  for (let i = 0; i < 7; i++) {
    const j = (i + 1) % 7;
    mesh.quad(shoreStone, base[i], shoulder[i], shoulder[j], base[j], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    mesh.tri(shoreStone, shoulder[i], cap, shoulder[j], ...uv, [0, 1, 0]);
  }
}

// Small tufts break the upper silhouette where the earth drops in the next
// half metre. Their roots sit on the same triangles that shade the cut.
function turfTufts(mesh, floor, waterY, bounds, site) {
  const [west, south, east, north] = bounds;
  const spacing = 1.05;
  for (let j = Math.ceil(south / spacing); j * spacing < north; j++) {
    for (let i = Math.ceil(west / spacing); i * spacing < east; i++) {
      const seed = roadEdgeHash(i, j, 673);
      if (seed < .39) continue;
      const x = (i + .75 * roadEdgeHash(i, j, 677)) * spacing;
      const z = (j + .75 * roadEdgeHash(i, j, 683)) * spacing;
      if (!clearPondBank(site, x / TILE_UNITS, z / TILE_UNITS, .45 / TILE_UNITS)) continue;
      const y = floor(x, z);
      if (y == null || y < waterY + .17 || y > waterY + .55) continue;
      const toe = Math.min(...[[.62, 0], [-.62, 0], [0, .62], [0, -.62]].map(([dx, dz]) => floor(x + dx, z + dz) ?? y));
      if (y - toe < .13) continue;
      const count = 14 + Math.floor(seed * 4);
      for (let blade = 0; blade < count; blade++) {
        const a = blade * 2.4 + seed * 19, dx = Math.cos(a), dz = Math.sin(a);
        const spread = Math.sqrt(blade / count);
        const bx = x + .10 * spread * dx, bz = z + .09 * spread * dz;
        const h = floor(bx, bz);
        if (h == null || h < waterY + .08) continue;
        const width = .029 + .012 * roadEdgeHash(i, j, blade + 701);
        const rise = (.28 + .18 * (1 - spread) + .09 * seed) * (.85 + .3 * roadEdgeHash(i, j, blade + 719));
        const lean = .06 + .17 * spread;
        const lx = bx - dz * width, lz = bz + dx * width;
        const rx = bx + dz * width, rz = bz - dx * width;
        const left = [lx, floor(lx, lz) ?? h, lz], right = [rx, floor(rx, rz) ?? h, rz];
        const mx = bx + dx * lean * .30, mz = bz + dz * lean * .30;
        const tx = bx + dx * lean, tz = bz + dz * lean;
        const bend = [mx, Math.max(h, floor(mx, mz) ?? h) + rise * .62, mz];
        const tip = [tx, Math.max(h, floor(tx, tz) ?? h) + rise, tz];
        const paint = blade % 7 === 0 ? dryReeds : greenReeds;
        const side = [bend[0] + dz * width * .70, bend[1], bend[2] - dx * width * .70];
        const far = [bend[0] - dz * width * .70, bend[1], bend[2] + dx * width * .70];
        for (const [p, q, r] of [[left, right, side], [left, side, far], [far, side, tip]]) {
          mesh.tri(paint, p, q, r, ...uv);
          mesh.tri(paint, r, q, p, uv[2], uv[1], uv[0]);
        }
      }
    }
  }
}

function dressBank(mesh, site, anchors, bounds) {
  const { floor, waterY } = site;
  for (const [index, [tx, tz, angle, kind]] of anchors.entries()) {
    const start = floor(tx * TILE_UNITS, tz * TILE_UNITS);
    if (start == null || start >= waterY) continue;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    for (let d = 0; d < 18; d += .16) {
      const x = tx * TILE_UNITS + dx * d, z = tz * TILE_UNITS + dz * d;
      const y = floor(x, z);
      if (y == null) break;
      if (y < waterY + (kind === 'stone' ? .10 : .055)) continue;
      if (!clearPondBank(site, x / TILE_UNITS, z / TILE_UNITS, 1.7 / TILE_UNITS)) break;
      if (kind === 'rush') {
        rush(mesh, floor, x, z, index);
        rush(mesh, floor, x + dz * .62, z - dx * .62, index + 3);
      } else {
        stone(mesh, floor, x, z, .57 + .10 * Math.cos(index), index);
        stone(mesh, floor, x + dz * .58 + dx * .16, z - dx * .58 + dz * .16, .27 + .07 * Math.sin(index), index + 2);
      }
      break;
    }
  }
  turfTufts(mesh, floor, waterY, bounds, site);
}

function shoreAnchors(site, bytes, px, py) {
  const rim = site.cells.filter(i => WATER_DRAW_MASK_TABLE[bytes[i]] !== 15);
  const start = roadEdgeHash(px + site.west, py + site.south, 97);
  const count = Math.min(rim.length, Math.ceil(Math.sqrt(rim.length)));
  const anchors = [];
  for (let j = 0; j < count; j++) {
    const i = rim[Math.floor((j + start) * rim.length / count)];
    const mask = WATER_DRAW_MASK_TABLE[bytes[i]], corner = [0, 1, 2, 3].find(k => mask & (1 << k));
    const u = corner & 1, v = corner >> 1;
    const x = i % POND_SIDE + .05 + .9 * u, z = Math.floor(i / POND_SIDE) + .05 + .9 * v;
    anchors.push([x, z, Math.atan2(.5 - v, .5 - u), j % 2 ? 'stone' : 'rush']);
  }
  return anchors;
}

export function pondShoreMesh(sites, bytes, px, py) {
  const mesh = new MeshBench(TREASURE_ART);
  for (const site of sites) {
    const bounds = [site.west, site.south, site.east, site.north].map(n => n * TILE_UNITS);
    dressBank(mesh, site, site.pilot ? banks : shoreAnchors(site, bytes, px, py), bounds);
  }
  const model = mesh.finish();
  if (model) {
    model.subMeshes.forEach((part, i) => Object.assign(part, { textureArchive: TREASURE_ART, textureRecord: model.slots[i].record }));
    model.pixelBlockScale = 1;
  }
  return model;
}
