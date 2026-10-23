/**
 * Three-dimensional cloak/body contact primitives.
 *
 * The broad phase indexes triangle AABBs in XYZ cells; the narrow phase computes
 * an actual closest point on each candidate triangle. Unlike cloakSheet's X/Z
 * height field, this can represent folded or steep parts of the cloak.
 */

/** Closest point on triangle ABC to P. Returns {x,y,z,distanceSq,u,v,w}. */
export function closestPointOnTriangle3d(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let u, v, w;

  if (d1 <= 0 && d2 <= 0) { u = 1; v = 0; w = 0; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { u = 0; v = 1; w = 0; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        v = d1 / (d1 - d3); u = 1 - v; w = 0;
      } else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz;
        const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { u = 0; v = 0; w = 1; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            w = d2 / (d2 - d6); u = 1 - w; v = 0;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); v = 1 - w; u = 0;
            } else {
              const sum = va + vb + vc;
              if (Math.abs(sum) < 1e-20) {
                // Degenerate triangle: choose the nearest of its three segments.
                const segment = (x0, y0, z0, x1, y1, z1, i0, i1) => {
                  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
                  const den = dx * dx + dy * dy + dz * dz;
                  const t = den > 1e-20 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy + (pz - z0) * dz) / den)) : 0;
                  const x = x0 + t * dx, y = y0 + t * dy, z = z0 + t * dz;
                  return { x, y, z, t, i0, i1, distanceSq: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
                };
                const candidates = [
                  segment(ax, ay, az, bx, by, bz, 0, 1),
                  segment(bx, by, bz, cx, cy, cz, 1, 2),
                  segment(cx, cy, cz, ax, ay, az, 2, 0),
                ];
                candidates.sort((a, b) => a.distanceSq - b.distanceSq);
                const q = candidates[0], weights = [0, 0, 0];
                weights[q.i0] = 1 - q.t; weights[q.i1] = q.t;
                return { x: q.x, y: q.y, z: q.z, u: weights[0], v: weights[1], w: weights[2], distanceSq: q.distanceSq };
              }
              const inv = 1 / sum;
              v = vb * inv; w = vc * inv; u = 1 - v - w;
            }
          }
        }
      }
    }
  }

  const x = u * ax + v * bx + w * cx;
  const y = u * ay + v * by + w * cy;
  const z = u * az + v * bz + w * cz;
  return { x, y, z, u, v, w, distanceSq: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
}

const cellKey = (x, y, z) => `${x},${y},${z}`;

/** Build a 3D uniform grid. Each list item is an index-buffer offset (0,3,6...). */
export function buildTriangleGrid3d(positions, indices, cellSize = 2) {
  if (!(cellSize > 0) || !Number.isFinite(cellSize)) throw new RangeError('cellSize must be finite and positive');
  const cells = new Map();
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const x0 = Math.floor(Math.min(positions[a], positions[b], positions[c]) / cellSize);
    const x1 = Math.floor(Math.max(positions[a], positions[b], positions[c]) / cellSize);
    const y0 = Math.floor(Math.min(positions[a + 1], positions[b + 1], positions[c + 1]) / cellSize);
    const y1 = Math.floor(Math.max(positions[a + 1], positions[b + 1], positions[c + 1]) / cellSize);
    const z0 = Math.floor(Math.min(positions[a + 2], positions[b + 2], positions[c + 2]) / cellSize);
    const z1 = Math.floor(Math.max(positions[a + 2], positions[b + 2], positions[c + 2]) / cellSize);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const key = cellKey(x, y, z), list = cells.get(key);
      if (list) list.push(t); else cells.set(key, [t]);
    }
  }
  return { positions, indices, cellSize, cells, queryMark: new Uint32Array(Math.ceil(indices.length / 3)), queryId: 0 };
}

/** Collect candidate triangle offsets in a sphere's enclosing XYZ cell box, deduplicated. */
export function queryTriangleGrid3d(grid, x, y, z, radius, out = []) {
  out.length = 0;
  if (!(radius >= 0) || !Number.isFinite(radius)) return out;
  const { cellSize, cells } = grid;
  let queryId = grid.queryId + 1;
  if (queryId >= 0xffffffff) { grid.queryMark.fill(0); queryId = 1; }
  grid.queryId = queryId;
  const x0 = Math.floor((x - radius) / cellSize), x1 = Math.floor((x + radius) / cellSize);
  const y0 = Math.floor((y - radius) / cellSize), y1 = Math.floor((y + radius) / cellSize);
  const z0 = Math.floor((z - radius) / cellSize), z1 = Math.floor((z + radius) / cellSize);
  for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
    for (const t of cells.get(cellKey(ix, iy, iz)) ?? []) {
      const triangle = t / 3;
      if (grid.queryMark[triangle] === queryId) continue;
      grid.queryMark[triangle] = queryId;
      out.push(t);
    }
  }
  return out;
}

/** Find the nearest point among local candidates; returns null outside the query radius. */
export function nearestTrianglePoint3d(grid, x, y, z, radius, candidates = []) {
  queryTriangleGrid3d(grid, x, y, z, radius, candidates);
  const { positions: p, indices: ix } = grid;
  const maxSq = radius * radius;
  let best = null;
  for (const t of candidates) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const q = closestPointOnTriangle3d(x, y, z,
      p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]);
    if (q.distanceSq <= maxSq && (!best || q.distanceSq < best.distanceSq)) best = { ...q, triangleOffset: t };
  }
  return best;
}
