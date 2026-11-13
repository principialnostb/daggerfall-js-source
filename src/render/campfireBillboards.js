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
    entries.set(batch, { centers: centers.map(p => [...p]), visual: previous?.visual ?? null });
  }
  return batch;
}

export function releaseCampfireBatch(batch) {
  entries.get(batch)?.visual?.destroy();
  entries.delete(batch);
}

export function drawCampfireBillboards(renderer, batches, time = performance.now() / 1000) {
  if (!canDrawCampfire(renderer)) return batches;
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
    if (wallTorch && !entry.centers.some((_, n) => torchMountAt(batch, n))) {
      remaining?.push(batch);
      continue;
    }
    remaining ??= batches.slice(0, i);
    const origin = batch.origin ?? [0, 0, 0];
    for (let n = 0; n < entry.centers.length; n++) {
      const mount = wallTorch ? torchMountAt(batch, n) : null;
      if (wallTorch && !mount) {
        remaining.push(torchSpriteView(batch, n));
        continue;
      }
      const pos = entry.centers[n].map((v, axis) => v + origin[axis]);
      const height = batch.size.h * (batch._scales?.[n] ?? 1);
      const gap = fixtureCeilingGap(batch, n);
      if (typeof kind === 'number' && cullFixtures) {
        fixturePlanes ??= spherePlanes(multiply(renderer._proj, renderer._view));
        if (!sphereInPlanes(fixturePlanes, pos[0], pos[1] + height / 2, pos[2], height + gap)) continue;
      }
      entry.visual ??= kind !== null ? createTorchVisual(renderer, kind) : createCampfireVisual(renderer);
      if (kind !== null) entry.visual.draw(pos, height, time, mount, origin, gap);
      else entry.visual.draw({ rec: { pos, yaw: 0 } }, true, time);
    }
  }
  return remaining ?? batches;
}


// A read-only draw range of the original VAO. The batch still owns the indices.
function torchSpriteView(batch, index) {
  const indexCount = 6;
  const offset = index * indexCount * Uint32Array.BYTES_PER_ELEMENT;
  return { ...batch, indexCount, _ibOff: (batch._ibOff ?? 0) + offset, noShadow: true };
}
