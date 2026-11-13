import { MeshBench, cross, dot, norm, sub, planarUv } from './ships/galleonMesh.js';

export const woodenCoffinLids = new Map([
  [41315, 4], [41316, 7], [41317, 4], [41318, 4],
  [41322, 7], [41323, 4], [41325, 7], [41326, 4],
]);

function cavityOutline(points) {
  const sorted = [...new Map(points.map(([x, , z]) =>
    [x.toFixed(4) + ',' + z.toFixed(4), [x, z]])).values()].sort(([x, z], [a, b]) => x - a || z - b);
  const half = list => {
    const hull = [];
    for (const p of list) {
      while (hull.length >= 2) {
        const [a, b] = hull.slice(-2);
        if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) > .00001) break;
        hull.pop();
      }
      hull.push(p);
    }
    return hull.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.toReversed())];
}

function buildBody(b, outline, floor, rim, closed) {
  const thickness = .085;
  const at = ([x, z], y) => [x, y, z];
  const outward = ([x, z], [a, c]) => {
    const length = Math.hypot(a - x, c - z);
    return [(c - z) / length, (x - a) / length];
  };
  const outer = outline.map((p, i) => {
    if (closed) return p;
    const a = outward(outline[(i + outline.length - 1) % outline.length], p);
    const c = outward(p, outline[(i + 1) % outline.length]);
    const scale = thickness / (1 + a[0] * c[0] + a[1] * c[1]);
    return [p[0] + (a[0] + c[0]) * scale, p[1] + (a[1] + c[1]) * scale];
  });
  const quad = (points, normal) => b.quad(5, ...points,
    points.map(p => planarUv(p, normal, [.55, .55])), normal);
  const cap = (ring, y, normal) => {
    const points = ring.map(p => at(p, y));
    b.poly(5, points, points.map(p => planarUv(p, normal, [.55, .55])), normal);
  };
  const base = closed ? floor : floor - .012;
  cap(outer, base, [0, -1, 0]);
  if (!closed) cap(outline, floor + .012, [0, 1, 0]);
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    const [nx, nz] = outward(outer[i], outer[j]);
    quad([at(outer[i], base), at(outer[j], base), at(outer[j], rim), at(outer[i], rim)], [nx, 0, nz]);
    if (closed) continue;
    quad([at(outline[i], floor + .012), at(outline[j], floor + .012), at(outline[j], rim), at(outline[i], rim)], [-nx, 0, -nz]);
    quad([at(outline[i], rim), at(outline[j], rim), at(outer[j], rim), at(outer[i], rim)], [0, 1, 0]);
  }
}

export function buildWoodenCoffin(cpu, lid, floorRecord) {
  const b = new MeshBench(92);
  const edges = new Map();
  const point = i => Array.from(cpu.positions.slice(i * 3, i * 3 + 3));
  const uv = i => Array.from(cpu.uvs.slice(i * 2, i * 2 + 2));
  const lidPart = cpu.subMeshes.find(part => part.textureRecord === lid);
  const [a, c, d] = Array.from(cpu.indices.slice(lidPart.startIndex, lidPart.startIndex + 3), point);
  const lidNormal = norm(cross(sub(c, a), sub(d, a)));
  const floorPart = cpu.subMeshes.find(part => part.textureRecord === floorRecord);
  const footprint = floorPart ?? lidPart;
  const points = Array.from(cpu.indices.slice(footprint.startIndex, footprint.startIndex + footprint.primitiveCount * 3), point);
  let baseY = Infinity;
  for (let i = 1; i < cpu.positions.length; i += 3) baseY = Math.min(baseY, cpu.positions[i]);
  const floor = floorPart ? points[0][1] : baseY;
  const rim = floorPart ? floor + .40 : points[0][1] - .075;
  buildBody(b, cavityOutline(points), floor, rim, !floorPart);

  for (let i = lidPart.startIndex; i < lidPart.startIndex + lidPart.primitiveCount * 3; i += 3) {
    const ids = Array.from(cpu.indices.slice(i, i + 3));
    const p = ids.map(point);
    const normal = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    if (dot(normal, lidNormal) < 0) continue;
    const coords = ids.map(uv);
    b.tri(lid, ...p, ...coords, lidNormal);
    const back = p.map(v => v.map((value, axis) => value - lidNormal[axis] * .075));
    b.tri(5, ...back, ...coords, lidNormal.map(v => -v));
    for (let j = 0; j < 3; j++) {
      const k = (j + 1) % 3;
      const key = [p[j], p[k]].map(v => v.map(n => n.toFixed(4)).join(',')).sort().join('/');
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [p[j], back[j], back[k], p[k]]);
    }
  }
  for (const [a, c, d, e] of edges.values()) {
    const width = Math.hypot(...sub(e, a));
    b.quad(5, a, c, d, e, [[0, 0], [0, .08], [width, .08], [width, 0]]);
  }
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((part, i) => ({
    ...part, textureArchive: 92, textureRecord: mesh.slots[i].record,
  }));
  return mesh;
}
