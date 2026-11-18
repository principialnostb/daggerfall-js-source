import { BATTLEAXE_LENGTH } from './battleaxeFit.js';

export function enhancedAxeShapes(batches) {
  const points = batches.flatMap(b => Array.from(b.positions));
  const ys = points.filter((_, i) => i % 3 === 1), xs = points.filter((_, i) => i % 3 === 0);
  const lo = Math.min(...ys), hi = Math.max(...ys), width = Math.max(...xs) - Math.min(...xs);
  if (!(hi > lo && width > 0)) throw new Error('Degenerate axe mesh');
  const center = (Math.min(...xs) + Math.max(...xs)) / 2;
  const edges = ys.filter((_, i) => Math.abs(points[i * 3] - center) > width * 0.22);
  const shoulder = Math.min(...edges);
  if (!(shoulder > lo)) throw new Error('Cannot separate axe head from haft');
  const extension = Math.max(0, BATTLEAXE_LENGTH - (hi - lo));
  const scale = 1 + extension / (shoulder - lo);
  return batches.map(b => ({
    mesh: {
      name: b.name,
      positions: Array.from(b.positions, (v, i) => i % 3 === 1 ? v + extension * Math.min(1, (v - lo) / (shoulder - lo)) : v),
      normals: Array.from(b.normals ?? []), colors: b.colors, uvs: b.uvs, indices: b.indices,
    },
    texture: b.material?.textureFile ?? null, material: b.material,
  })).map((shape, index) => {
    const source = batches[index];
    for (let i = 0; i < shape.mesh.normals.length; i += 3) {
      if (source.positions[i + 1] >= shoulder) continue;
      const n = shape.mesh.normals.slice(i, i + 3);
      n[1] /= scale;
      const length = Math.hypot(...n) || 1;
      shape.mesh.normals.splice(i, 3, ...n.map(v => v / length));
    }
    return shape;
  });
}
