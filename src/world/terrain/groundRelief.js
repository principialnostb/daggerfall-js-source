import { cornerShare, groundEdgeWander, groundKindsOf, GROUND_KIND } from './groundEdge.js';

// DFU DaggerfallTerrain uses the heightmap alone. Small earth forms here follow
// its material corners and grade, so each climate keeps its own soil and turf art.
const EDGE = [
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
  [0, 0],
  [0.5, 0],
  [1, 0],
];
const clamp = (v) => Math.max(0, Math.min(1, v));
function noise(x, z, salt) {
  let h = Math.imul(x ^ salt, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

function patchField(x, z) {
  const u = x / 6,
    v = z / 6,
    a = Math.floor(u),
    b = Math.floor(v);
  const fx = u - a,
    fz = v - b;
  return (
    (1 - fz) * ((1 - fx) * noise(a, b, 37) + fx * noise(a + 1, b, 37)) +
    fz * ((1 - fx) * noise(a, b + 1, 37) + fx * noise(a + 1, b + 1, 37))
  );
}

// Every form has the same 8 rim vertices, 8 three-vertex ribs and peak.
const FORM_INDICES = (() => {
  const indices = [], peak = 32;
  for (let k = 0; k < 8; k++) {
    const j = (k + 1) % 8,
      a = 8 + 3 * k,
      b = 8 + 3 * j;
    if (k % 2 === 0) indices.push((k + 7) % 8, k, j);
    indices.push(
      k,
      a,
      j,
      j,
      a,
      b,
      a,
      a + 1,
      b,
      b,
      a + 1,
      b + 1,
      a + 1,
      a + 2,
      b + 1,
      b + 1,
      a + 2,
      b + 2,
      a + 2,
      peak,
      b + 2,
    );
  }
  return new Uint8Array(indices);
})();

function addForm(out, grid, tx, tz, wx, wz, kinds, strength) {
  const { positions, normals, width, cell } = grid;
  const base = tz * (width + 1) + tx,
    north = base + width + 1;
  const h = (i) => positions[i * 3 + 1];
  const sample = (u, v) =>
    h(base) * (1 - Math.max(u, v)) +
    h(north + 1) * Math.min(u, v) +
    (u > v ? h(base + 1) * (u - v) : h(north) * (v - u));
  const grass = (u, v) => {
    if (!kinds) return 1;
    const share = cornerShare(kinds.mask, u, v);
    return kinds.b === GROUND_KIND.grass ? share : 1 - share;
  };
  // Point the exposed face toward bare ground, or downhill within a meadow.
  let dx = kinds ? grass(0, 0.5) - grass(1, 0.5) : (h(base) - h(base + 1)) / cell;
  let dz = kinds ? grass(0.5, 0) - grass(0.5, 1) : (h(base) - h(north)) / cell;
  if (Math.hypot(dx, dz) < 0.06) {
    const angle = noise(wx, wz, 67) * 2 * Math.PI;
    dx = Math.cos(angle);
    dz = Math.sin(angle);
  }
  const length = Math.hypot(dx, dz);
  dx /= length;
  dz /= length;
  let cx = 0.5 - dx * 0.13 + (noise(wx, wz, 101) - 0.5) * 0.16;
  let cz = 0.5 - dz * 0.13 + (noise(wx, wz, 107) - 0.5) * 0.16;
  if (kinds) {
    // Anchor the lip on the grassy side of the same wandering line the GPU draws.
    let best = Infinity;
    for (const u of [0.25, 0.42, 0.58, 0.75])
      for (const v of [0.25, 0.42, 0.58, 0.75]) {
        const land = grass(u, v);
        const offset =
          groundEdgeWander(tx + u, tz + v) * (kinds.a === GROUND_KIND.water ? 2 * Math.abs(land - 0.5) : -1);
        const cost = Math.abs(land + offset - 0.63) + 0.18 * Math.hypot(u - 0.5, v - 0.5);
        if (cost < best) {
          best = cost;
          cx = u;
          cz = v;
        }
      }
  }
  const stony = kinds?.b === GROUND_KIND.stone;
  const height = (kinds ? 0.11 + 0.095 * strength : 0.05 + 0.07 * strength) * (0.8 + 0.2 * noise(wx, wz, 113));
  const pos = [],
    face = [];
  function vertex(u, v, rise, material, sod = 0) {
    const dry = kinds?.a === GROUND_KIND.water ? clamp((grass(u, v) - 0.52) * 5) : 1;
    pos.push((tx + u) * cell, sample(u, v) + rise * dry, (tz + v) * cell);
    out.sod.push(sod * dry);
    face.push(material * dry * (stony ? -1 : 1));
    return face.length - 1;
  }
  // Keep each original boundary as one edge so the coarse neighbour shares
  // both endpoints exactly, including at a streamed pixel boundary.
  for (const [k, [u, v]] of EDGE.entries()) {
    if (k % 2 === 0) {
      vertex(u + 0.12 * (cx - u), v + 0.12 * (cz - v), 0, 0);
    } else {
      const corner = 3 * (base + u + v * (width + 1));
      pos.push(positions[corner], positions[corner + 1], positions[corner + 2]);
      face.push(0);
      out.sod.push(0);
    }
  }
  for (const [k, [u, v]] of EDGE.entries()) {
    const x = u - cx,
      z = v - cz,
      dist = Math.hypot(x, z);
    const front = (x * dx + z * dz) / dist,
      flank = (z * dx - x * dz) / dist;
    const shape = 1 / Math.hypot(front / (stony ? 0.17 : 0.27), flank / (stony ? 0.49 : 0.41));
    const radius = Math.min(dist * 0.87, shape * (0.79 + 0.29 * noise(wx, wz, 127 + k)));
    const cut = clamp(0.45 + 0.8 * front) * (kinds ? 1 : 0.4);
    const point = (r, y, m, sod = 0) => vertex(cx + (x / dist) * r, cz + (z / dist) * r, y, m, sod);
    point(radius, 0, cut * 0.28);
    point(radius * (0.57 + 0.37 * cut), height * (0.58 + 0.3 * cut), cut * 0.84);
    point(radius * (0.49 + 0.26 * cut), height * (0.85 + 0.13 * noise(wx, wz, k + 151)), 0, kinds ? 0.88 : 0);
  }
  vertex(cx, cz, height, 0, kinds ? 0.97 : 0);
  const indices = FORM_INDICES;
  const ns = new Float32Array(pos.length);
  for (let n = 0; n < indices.length; n += 3) {
    const a = indices[n] * 3,
      b = indices[n + 1] * 3,
      c = indices[n + 2] * 3;
    const ax = pos[b] - pos[a],
      ay = pos[b + 1] - pos[a + 1],
      az = pos[b + 2] - pos[a + 2];
    const bx = pos[c] - pos[a],
      by = pos[c + 1] - pos[a + 1],
      bz = pos[c + 2] - pos[a + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    ns[a] += nx; ns[a + 1] += ny; ns[a + 2] += nz;
    ns[b] += nx; ns[b + 1] += ny; ns[b + 2] += nz;
    ns[c] += nx; ns[c + 1] += ny; ns[c + 2] += nz;
  }
  for (let k = 0; k < face.length; k++) {
    const i = k * 3;
    if (k < 8) {
      const [u, v] = EDGE[k];
      for (let d = 0; d < 3; d++)
        ns[i + d] =
          (1 - v) * ((1 - u) * normals[3 * base + d] + u * normals[3 * (base + 1) + d]) +
          v * ((1 - u) * normals[3 * north + d] + u * normals[3 * (north + 1) + d]);
    }
    const mag = Math.hypot(ns[i], ns[i + 1], ns[i + 2]) || 1;
    out.n.push(ns[i] / mag, ns[i + 1] / mag, ns[i + 2] / mag);
  }
  const first = (positions.length + out.p.length) / 3;
  out.p.push(...pos);
  out.face.push(...face);
  for (const i of indices) out.i.push(first + i);
}

function extend(source, extra, length = extra.length) {
  const result = new Float32Array(source.length + length);
  result.set(source);
  if (extra) result.set(extra, source.length);
  return result;
}

// Select one possible focal point per 4x4 tiles. Smooth six-tile fields group
// them into runs with quiet areas. Roads, buildings' paving and water stay clear.
export function groundRelief(positions, normals, indices, bankDepth, options) {
  const { width, height, tileDim, bytes, paths, originX = 0, originZ = 0 } = options;
  const cell = positions[3] - positions[0];
  if (cell <= 0 || positions.length < (width + 1) * (height + 1) * 3) return null;
  const grid = { positions, normals, width, cell },
    out = { p: [], n: [], face: [], sod: [], i: [] },
    chosen = new Set();
  // The first six indices of a base quad name its southwest corner. Bespoke
  // terrain can replace any quad entirely; visit only the base quads still drawn.
  const baseEnd = options.baseIndexCount ?? indices.length;
  for (let off = 0; off + 5 < baseEnd; off += 6) {
    const first = indices[off],
      tx = first % (width + 1),
      tz = Math.floor(first / (width + 1));
    if (tx >= width || tz >= height || indices[off + 1] !== first + width + 1) continue;
    const wx = originX + tx,
      wz = originZ + tz,
      bx = Math.floor(wx / 4),
      bz = Math.floor(wz / 4);
    const pick = noise(bx, bz, 193);
    if (wx - 4 * bx !== Math.floor(pick * 4) || wz - 4 * bz !== Math.floor(noise(bx, bz, 199) * 4)) continue;
    const ti = tz * tileDim + tx,
      byte = bytes[ti],
      rec = byte >> 2;
    if (paths?.[ti]) continue;
    const kinds = groundKindsOf(byte);
    if (rec !== GROUND_KIND.grass && kinds?.a !== GROUND_KIND.grass && kinds?.b !== GROUND_KIND.grass) continue;
    const field = patchField(wx, wz);
    if (field < (kinds?.a === GROUND_KIND.water ? 0.31 : kinds ? 0.4 : 0.58)) continue;
    const north = first + width + 1;
    const twist =
      positions[3 * first + 1] +
      positions[3 * (north + 1) + 1] -
      positions[3 * (first + 1) + 1] -
      positions[3 * north + 1];
    if (Math.abs(twist) > 0.35) continue; // Keep the existing crease on sharply folded tiles.
    chosen.add(off);
    addForm(out, grid, tx, tz, wx, wz, kinds, field);
  }
  if (!chosen.size) return null;
  const indexCount = indices.length - chosen.size * 6 + out.i.length;
  const merged = new Uint32Array(indexCount);
  let start = 0,
    end = 0;
  for (const off of chosen) {
    merged.set(indices.subarray(start, off), end);
    end += off - start;
    start = off + 6;
  }
  merged.set(indices.subarray(start), end);
  merged.set(out.i, end + indices.length - start);
  const shaped = extend(positions, out.p);
  const finish = new Float32Array(shaped.length);
  for (let i = 0; i < shaped.length / 3; i++) {
    const x = originX + shaped[3 * i] / cell,
      z = originZ + shaped[3 * i + 2] / cell;
    finish[3 * i] = i < positions.length / 3 ? 0 : out.face[i - positions.length / 3];
    finish[3 * i + 2] = i < positions.length / 3 ? 0 : out.sod[i - positions.length / 3];
    finish[3 * i + 1] = clamp((0.62 - patchField(x, z)) * 1.8);
  }
  return {
    positions: shaped,
    normals: extend(normals, out.n),
    indices: merged,
    finish,
    bankDepth: bankDepth ? extend(bankDepth, null, out.face.length) : null,
  };
}
