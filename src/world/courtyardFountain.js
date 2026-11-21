import { createMeshKit } from './eliteGates/meshKit.js';
import { courtyardStonePaint, mapCourtyardStone } from './courtyardFountainStone.js';

const SANDSTONE = 129, COPING = 130, PLINTH = 131, POOL = 132, STREAM = 133;
const SIDES = 8;
const STEP = Math.PI * 2 / SIDES;
const WATER_Y = .295;
const POOL_RADIUS = .405;

export const COURTYARD_PAINT = Object.freeze({ stone: SANDSTONE, water: POOL });

export function courtyardFountainPaints() {
  return [
    [SANDSTONE, courtyardStonePaint()],
    [POOL, { width: 1, height: 1, colors: Uint8Array.of(46, 69, 67, 255) }],
  ];
}

const point = (radius, y, side) => [radius * Math.cos(side * STEP), y, radius * Math.sin(side * STEP)];

// Leave narrow joints between coping stones over a continuous basin wall.
function coping(kit) {
  const profile = [[.473, .326], [.5, .35], [.5, .398], [.481, .421],
    [.414, .421], [.4, .404], [.4, .326]];
  for (let side = 0; side < SIDES; side++) {
    const rows = profile.map(([radius, y]) => {
      const a = point(radius, y, side), b = point(radius, y, side + 1);
      const along = t => a.map((value, axis) => value + (b[axis] - value) * t);
      return [along(.016), along(.984)];
    });
    const [dx, , dz] = point(1, 0, side + .5);
    for (let row = 1; row < rows.length; row++) {
      const [a, b] = rows[row - 1], [c, d] = rows[row];
      const [r0, y0] = profile[row - 1], [r1, y1] = profile[row];
      const out = [dx * (y1 - y0), r0 - r1, dz * (y1 - y0)];
      kit.quad(COPING, a, b, d, c, out, true);
    }
    for (const [end, sign] of [[0, -1], [1, 1]]) {
      const edge = rows.map(row => row[end]);
      for (let j = 1; j < edge.length - 1; j++) {
        kit.tri(SANDSTONE, edge[0], edge[j], edge[j + 1], [-dz * sign, 0, dx * sign]);
      }
    }
  }
}

export function buildCourtyardFountain(archive, { dry = false } = {}) {
  const kit = createMeshKit();
  kit.lathe(PLINTH, [[0, 0], [.477, 0], [.5, .025], [.5, .088], [.477, .108]], SIDES, { uvScale: 7 });
  kit.lathe(SANDSTONE, [[.477, .108], [.451, .139], [.451, .305], [.467, .331],
    [.467, .386], [.407, .386], [POOL_RADIUS, .31], [POOL_RADIUS, .10], [0, .10]], SIDES, { uvScale: 5 });
  coping(kit);

  kit.lathe(SANDSTONE, [[.181, .10], [.181, .315], [.169, .346], [.146, .363],
    [.116, .426], [.088, .561], [.074, .714], [.092, .747]], SIDES, { uvScale: 5 });
  kit.lathe(COPING, [[.092, .747], [.119, .76], [.133, .793], [.133, .826], [.117, .848],
    [.051, .848], [.036, .865], [.035, .89], [.062, .915], [.062, .93], [.013, .995], [0, 1]],
  SIDES, { uvScale: 7 });

  if (!dry) {
    for (let side = 0; side < SIDES; side++) {
      const a = point(POOL_RADIUS, WATER_Y, side), b = point(POOL_RADIUS, WATER_Y, side + 1);
      kit.tri(POOL, [0, WATER_Y, 0], a, b, [0, 1, 0], true, [0, 0],
        [a[0] / POOL_RADIUS, a[2] / POOL_RADIUS], [b[0] / POOL_RADIUS, b[2] / POOL_RADIUS]);
    }
  }
  // The pool shader puts the splash where the mesh crosses the waterline.
  let impact;
  const profile = [[.009, 0], [0, .009], [-.009, 0], [0, -.009]];
  for (const side of [.5, 4.5]) {
    const socket = point(.114, .782, side), outlet = point(.153, .785, side);
    kit.sweep(COPING, [[.025, 0], [0, .025], [-.025, 0], [0, -.025]], [socket, outlet]);
    if (dry) continue;
    const path = [0, .25, .5, .75, 1].map(t =>
      point(.153 + .126 * t, .785 + .11 * t - .605 * t * t, side));
    kit.sweep(STREAM, profile, path, { uvScale: 3 });
    if (!impact) {
      const [a, b] = path.slice(-2);
      const t = (WATER_Y - a[1]) / (b[1] - a[1]);
      impact = [0, 2].map(axis => (a[axis] + t * (b[axis] - a[axis])) / POOL_RADIUS);
    }
  }
  const mesh = kit.pack(archive);
  for (const slot of mesh.subMeshes) {
    const record = slot.textureRecord;
    if (record === POOL || record === STREAM) {
      slot.fountainWater = record === POOL ? 1 : -1;
      slot.fountainImpact = impact;
      slot.textureRecord = POOL;
    } else {
      const part = record === PLINTH ? 'foot' : record === COPING ? 'coping' : 'wall';
      mapCourtyardStone(mesh, slot, part, SIDES, { dry });
      slot.textureRecord = SANDSTONE;
    }
  }
  return mesh;
}
