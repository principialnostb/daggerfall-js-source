import { isHangingFixture, fixtureRecord } from './lightFixtureModel.js';
import { isWallTorch, torchKind } from './torchModel.js';

const directions = Array.from({ length: 16 }, (_, i) => {
  const a = i * Math.PI / 8;
  return [Math.cos(a), 0, Math.sin(a)];
});
export const TORCH_COLLAR_Y = .44;
const MIN_CLEARANCE = .16;
const MAX_REACH = .55;

// RDB flats encode a position but no wall rotation. Use the actual static
// mesh face, including its facing when the original anchor is behind it.
export function findTorchMount(collider, base, height, filter) {
  if (!(height > 0)) return null;
  const y = base[1] + height * TORCH_COLLAR_Y;
  let best = null;
  for (const dir of directions) {
    const start = [base[0] - .025 * dir[0], y, base[2] - .025 * dir[2]];
    const hit = collider.raycastHit(start, dir, MAX_REACH * height + .025, filter);
    if (!Number.isFinite(hit.dist) || Math.abs(hit.normal[1]) > .12) continue;
    const wall = [start[0] + hit.dist * dir[0], y, start[2] + hit.dist * dir[2]];
    const distance = Math.hypot(base[0] - wall[0], base[2] - wall[2]);
    if (best && distance >= best.distance) continue;
    const sign = hit.back ? -1 : 1;
    const length = Math.hypot(hit.normal[0], hit.normal[2]);
    if (!length) continue;
    const nx = sign * hit.normal[0] / length;
    const nz = sign * hit.normal[2] / length;
    const depth = Math.max(MIN_CLEARANCE * height, (base[0] - wall[0]) * nx + (base[2] - wall[2]) * nz);
    best = { wall, depth, yaw: Math.atan2(nx, nz) * 180 / Math.PI, distance,
      base: [wall[0] + depth * nx, base[1], wall[2] + depth * nz] };
  }
  return best;
}

const batchMounts = new WeakMap();
const ceilingLinks = new WeakMap();

function ceilingGap(collider, base, height, filter) {
  // Start just below the authored loop so a ceiling touching it counts.
  const top = [base[0], base[1] + height - .04, base[2]];
  const hit = collider.raycastHit(top, [0, 1, 0], .52, filter);
  return hit.normal?.[1] < -.8 && !hit.back ? Math.max(0, hit.dist - .04) : 0;
}

export function fixtureCeilingGap(batch, index) {
  return ceilingLinks.get(batch)?.[index] ?? 0;
}

export function mountTorchBatch(batch, centers, collider, filter) {
  if (isWallTorch(torchKind(batch.archive, batch.record))) {
    batchMounts.set(batch, centers.map(base => findTorchMount(collider, base, batch.size.h, filter)));
  }
  const fixture = fixtureRecord(batch.archive, batch.record);
  if (fixture !== null && isHangingFixture(fixture)) {
    ceilingLinks.set(batch, centers.map(base => ceilingGap(collider, base, batch.size.h, filter)));
  }
  return batch;
}

export function torchMountAt(batch, index) {
  return batchMounts.get(batch)?.[index] ?? null;
}
