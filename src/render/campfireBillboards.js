import { withFixtureDepth } from './fixtureDepth.js';
import { streetLanternCenter, streetLanternYaw } from '../world/streetLanternPlacement.js';
// @ts-check
import { canDrawCampfire, createCampfireVisual } from '../scenes/campfireVisual.js';
import { FIRE_FLAT } from '../systems/survival/camp.js';

import { multiply } from '../world/mat4.js';
import { sphereInPlanes, spherePlanes } from './bounds.js';
import { fixtureRecord } from '../world/lightFixtureModel.js';
import { fixtureCeilingGap, torchMountAt } from '../world/torchMount.js';
import { isWallTorch, torchKind } from '../world/torchModel.js';
import { createTorchVisual } from '../scenes/torchVisual.js';

const entries = new WeakMap();

// Keep the billboard as the light/interaction owner and classic fallback.
export function rememberCampfireBatch(batch, centers) {
  if ((batch.archive === FIRE_FLAT.archive && batch.record === FIRE_FLAT.record) || torchKind(batch.archive, batch.record) || fixtureRecord(batch.archive, batch.record) !== null) {
    const previous = entries.get(batch);
    entries.set(batch, { centers: centers.map(p => streetLanternCenter(p, [...p])), visual: previous?.visual ?? null });
  }
  return batch;
}

export function releaseCampfireBatch(batch) {
  entries.get(batch)?.visual?.destroy();
  entries.delete(batch);
}

export function drawCampfireBillboards(renderer, batches, time = performance.now() / 1000) {
  if (!canDrawCampfire(renderer)) return batches;
  return withFixtureDepth(renderer, () => drawFixtures(renderer, batches, time));
}

function drawFixtures(renderer, batches, time) {
  let remaining = null;
  let fixturePlanes = null;
  const cullFixtures = !renderer._bbCullOff && renderer._proj && renderer._view;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i], entry = entries.get(batch);
    if (!entry || batch._dead || !batch.vao || batch.castOnly) {
      remaining?.push(batch);
      continue;
    }
    const kind = torchKind(batch.archive, batch.record) ?? fixtureRecord(batch.archive, batch.record);
    const wallTorch = isWallTorch(kind);
    remaining ??= batches.slice(0, i);
    const origin = batch.origin ?? [0, 0, 0];
    for (let n = 0; n < entry.centers.length; n++) {
      const mount = wallTorch ? torchMountAt(batch, n) : null;
      const pos = entry.centers[n].map((v, axis) => v + origin[axis]);
      const height = batch.size.h * (batch._scales?.[n] ?? 1);
      const gap = fixtureCeilingGap(batch, n);
      if (kind !== null && cullFixtures) {
        fixturePlanes ??= spherePlanes(multiply(renderer._proj, renderer._view));
        // A wall mount can move the body away from the flat. Bound the
        // rendered position and allow for the bracket, lean, and flame.
        const x = mount ? mount.base[0] + origin[0] : pos[0];
        const y = mount ? mount.base[1] + origin[1] : pos[1];
        const z = mount ? mount.base[2] + origin[2] : pos[2];
        const radius = typeof kind === 'number' ? height + gap : 1.5 * (height || 1) + (mount?.depth ?? 0);
        if (!sphereInPlanes(fixturePlanes, x, y + height / 2, z, radius)) continue;
      }
      entry.visual ??= kind !== null ? createTorchVisual(renderer, kind) : createCampfireVisual(renderer);
      if (kind !== null) entry.visual.draw(pos, height, time, mount, origin, gap, streetLanternYaw(entry.centers[n]));
      else entry.visual.draw({ rec: { pos, yaw: 0 } }, true, time);
    }
  }
  return remaining ?? batches;
}
