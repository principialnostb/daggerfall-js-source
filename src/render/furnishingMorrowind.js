import { morrowindDataGeneration, morrowindDataCount } from '../scenes/dataSource.js';
import { morrowindWorldVisualEnabled } from '../systems/dungeonDecor.js';
import { multiply } from '../world/mat4.js';
import { sphereInPlanes, spherePlanes } from './bounds.js';
import { TOWN_CLUTTER, TOWN_CLUTTER_ARCHIVE, TOWN_ITEMS } from '../world/townStandIns.js';

const placedFurnishings = new WeakMap();

const furnishings = new Map([
  ['200:1', ['m/misc_com_metal_goblet_01.nif', false]],
  ['200:5', ['m/misc_com_metal_goblet_02.nif', false]],
  ['205:2', ['m/misc_flask_01.nif', false]],
  ['205:12', ['m/misc_com_bottle_15.nif', false]],
  ['205:35', ['m/misc_com_bottle_12.nif', false]],
  ['214:2', ['m/misc_muck_shovel_01.nif', true, 1.1]],
  ['214:6', ['w/w_pickaxe.nif', true]],
  ['214:13', ['m/misc_prongs00.nif', true]],
]);

// Town tableware uses unwrapped glass, including both sizes of labelled
// bottles. Dungeon furnishings keep their established selections.
const placedTableware = new Map([
  ['200:0', ['m/misc_com_metal_goblet_01.nif', false]],
  ['200:2', ['m/misc_com_metal_goblet_02.nif', false]],
  ['205:1', ['m/misc_flask_01.nif', false]],
  ['205:2', ['m/misc_pot_glass_peach_01.nif', false]],
  ['205:3', ['m/misc_pot_glass_peach_02.nif', false]],
  ['205:4', ['m/misc_pot_glass_peach_02.nif', false]],
  ['205:5', ['m/misc_pot_redware_02.nif', false]],
  ['205:6', ['m/misc_pot_redware_01.nif', false]],
  ['205:7', ['m/misc_pot_mottled_01.nif', false]],
  ['205:11', ['m/misc_com_bottle_02.nif', false]],
  ['205:12', ['m/misc_com_bottle_03.nif', false]],
  ['205:13', ['m/misc_com_bottle_03.nif', false]],
  ['205:14', ['m/misc_com_bottle_02.nif', false]],
  ['205:15', ['m/misc_com_bottle_08.nif', false]],
  ['205:16', ['m/misc_com_bottle_08.nif', false]],
]);

export function releaseFurnishingMorrowind(entry) {
  entry.morrowind?.model?.release();
  entry.morrowind = null;
}

export function furnishingMorrowind(entry) {
  const spec = entry.spec ?? furnishings.get(entry.record);
  const generation = morrowindDataGeneration();
  if (entry.morrowind?.generation !== generation) releaseFurnishingMorrowind(entry);
  if ((!spec && !entry.item) || !morrowindDataCount()) return null;
  if (!entry.morrowind || entry.morrowind.retry <= Date.now()) {
    const state = entry.morrowind = { generation, model: null, retry: Infinity };
    const [path, tool, length] = spec ?? [];
    import('../combat/fpArm.js').then(async ({ fpArm }) => {
      if (fpArm.mountPictureStamp() == null) {
        state.retry = Date.now() + 2000;
        return;
      }
      const model = await fpArm.groundLootModel(entry.item ?? (tool ? { group: 'Weapons' } : {}), path ?? null);
      if (entry.morrowind === state) state.model = model && {
        draw: (x, y, z, yaw) => model.draw(x, y, z, yaw, entry.length ?? length),
        release: model.release,
      };
      else model?.release();
    }).catch(() => {});
  }
  return entry.morrowind.model;
}

export function markPlacedFurnishing(batch, centers) {
  const standIn = batch.archive === TOWN_CLUTTER_ARCHIVE
    ? TOWN_CLUTTER[batch.record]
    : TOWN_ITEMS[batch.archive]?.[batch.record];
  const [archive, index] = standIn ?? [batch.archive, batch.record];
  const record = `${archive}:${index}`;
  const spec = placedTableware.get(record) ?? furnishings.get(record);
  if (spec) {
    placedFurnishings.set(batch, { record, spec, centers, length: Math.max(batch.size.w, batch.size.h) });
  }
  return batch;
}

export function markDroppedTorchModel(batch, item) {
  placedFurnishings.set(batch, { item, centers: [[0, 0, 0]] });
}

export function releasePlacedFurnishing(batch) {
  const entry = placedFurnishings.get(batch);
  if (!entry) return;
  placedFurnishings.delete(batch);
  releaseFurnishingMorrowind(entry);
}

export function drawPlacedFurnishings(renderer, batches) {
  if (!morrowindWorldVisualEnabled('enhancedGroundLoot')) return batches;
  let remaining = null, planes = null;
  for (const [i, batch] of batches.entries()) {
    const entry = placedFurnishings.get(batch);
    const model = entry && batch.vao && !batch.castOnly && !batch._dead ? furnishingMorrowind(entry) : null;
    if (!model) {
      remaining?.push(batch);
      continue;
    }
    remaining ??= batches.slice(0, i);
    const [ox, oy, oz] = batch.origin ?? [0, 0, 0];
    const { h, w } = batch.size;
    planes ??= !renderer._bbCullOff && renderer._proj && renderer._view
      ? spherePlanes(multiply(renderer._proj, renderer._view)) : null;
    for (const [px, py, pz] of entry.centers) {
      const x = px + ox, y = py + oy, z = pz + oz;
      if (planes && !sphereInPlanes(planes, x, y + h / 2, z, Math.hypot(w, h))) continue;
      model.draw(x, y, z, 0);
    }
  }
  return remaining ?? batches;
}
