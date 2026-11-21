import { morrowindDataGeneration, morrowindDataCount } from '../scenes/dataSource.js';
import { getPref } from '../systems/uiPrefs.js';
import { multiply, trs } from '../world/mat4.js';
import { sphereInPlanes, spherePlanes } from './bounds.js';
import { TOWN_CLUTTER, TOWN_CLUTTER_ARCHIVE, TOWN_ITEMS } from '../world/townStandIns.js';
import { DET_FLAT_STAND_INS } from '../world/detStandIns.js';
import { isWaterRack, rackFootHeights } from '../world/waterRack.js';
import { isPlacedWaterSource, WELL_RIM_RADIUS } from '../world/placedWaterSources.js';
import { MEADOW_REACH, MEADOW_WIND_REACH } from './grassMeadow.js';
import { heightFloor, heightSpan } from './labGrass.js';
import { LAB_WIND_RATE, WIND_SLIDER_MAX } from '../systems/wind/windDrive.js';

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
const placedModels = new Map([
  ['200:3', ['m/misc_com_metal_goblet_01.nif', false]],
  ['205:0', ['o/contain_barrel_01.nif', false]],
  ['205:8', ['m/misc_com_basket_01.nif', false]],
  ['205:9', ['m/misc_com_basket_02.nif', false]],
  ['205:20', ['o/contain_com_sack_02.nif', false]],
  ['205:30', ['m/misc_com_bucket_01.nif', false]],
  ['200:4', ['m/misc_com_metal_goblet_02.nif', false]],
  ['200:6', ['m/misc_de_goblet_01.nif', false]],
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
  ['205:32', ['m/misc_com_bottle_05.nif', false]],
  ['205:33', ['m/misc_potion_quality_01.nif', false]],
  ['205:34', ['m/misc_potion_bargain_01.nif', false]],
  ['205:43', ['m/misc_potion_fresh_01.nif', false]],
  ['209:2', ['m/text_quarto_01.nif', false]],
  ['209:3', ['m/text_quarto_02.nif', false]],
  ['209:4', ['m/text_quarto_04.nif', false]],
  ['209:5', ['m/text_scroll_02.nif', false]],
  ['209:7', ['m/text_parchment_01.nif', false]],
  ['209:8', ['m/text_parchment_02.nif', false]],
  ['209:9', ['m/text_quarto_open_02.nif', false]],
  ['211:31', ['n/ingred_bread_01.nif', false]],
]);

// Alternatives keep the same role and fit the same authored bounds.
const placedAlternates = new Map([
  ['205:0', 'o/contain_barrel10.nif'],
]);

// The authored TEXTURE.200 record 0 goblet stands 0.45 m tall in the scene.
// A quarto's long side is two thirds of that height.
const QUARTO_MAX_LENGTH = .45 * 2 / 3;

// Maximum longest dimension in scene metres. The classic cards include
// space for exaggerated silhouette and perspective, especially for books.
const tabletopLengths = new Map([
  ['205:32', .21], ['205:33', .23], ['205:34', .21], ['205:36', .22],
  ['209:2', QUARTO_MAX_LENGTH], ['209:3', QUARTO_MAX_LENGTH], ['209:4', QUARTO_MAX_LENGTH], ['209:5', .29],
  ['205:43', .12], ['209:7', .30], ['209:8', .30], ['209:9', QUARTO_MAX_LENGTH], ['211:31', .25],
]);

// ARCH3D 41822 is a 0.777 m barrel. The small 41818 crate spans
// 0.577 m, the maximum footprint length for these portable baskets.
const storageLengths = new Map([
  ['205:0', .78],
  ['205:8', .58],
  ['205:9', .58],
]);

// Each row lists component record, model length, X/Z offset and yaw.
const placedAssemblies = new Map([
  ['209:0', { stack: true, parts: [
    ['209:4', QUARTO_MAX_LENGTH, 0, 0, 0],
    ['209:3', QUARTO_MAX_LENGTH * .8, .014, .01, 8],
    ['209:2', QUARTO_MAX_LENGTH * .68, -.01, .007, -7],
  ] }],
  ['209:1', { stack: true, parts: [
    ['209:2', QUARTO_MAX_LENGTH, 0, 0, 0],
    ['209:3', QUARTO_MAX_LENGTH * .88, .012, -.008, -6],
  ] }],
  ['209:6', { parts: [
    ['209:5', .27, 0, -.049, 3],
    ['209:5', .24, .012, .043, -4],
  ] }],
  ['209:10', { stack: true, parts: [
    ['209:7', .30, 0, 0, 0],
    ['209:8', .29, .006, -.009, 5],
    ['209:7', .27, -.009, .004, -8],
  ] }],
  ['205:31', { parts: [
    ['205:35', .17, -.035, -.06, 0],
    ['205:33', .13, -.105, -.022, 17],
    ['205:32', .15, .04, -.043, 25],
    ['205:34', .12, -.034, .04, -8],
    ['205:43', .095, .111, .028, 0],
  ] }],
]);

function drawAssembly(parts, stack, x, y, z) {
  for (const { model, dx, dz, yaw } of parts) {
    model.draw(x + dx, y, z + dz, yaw);
    if (stack) y += model.height;
  }
}

// Reuse the corresponding dungeon meshes for authored town props.
const placedLowPoly = new Set([
  '200:0', '205:0', '205:2', '205:12', '205:17', '205:19', '205:20',
  '205:27', '205:29', '205:35', '205:36', '211:15', '211:16', '212:1',
  '214:2', '214:6', '214:13', '214:14', '214:15',
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
        draw: (x, y, z, yaw) => model.draw(x, y, z, yaw, entry.length ?? length, entry.tabletopPixels),
        height: model.heightAt(entry.length ?? length),
        release: model.release,
      };
      else model?.release();
    }).catch(() => {});
  }
  return entry.morrowind.model;
}

export function placedFurnishingModels(batch) {
  const standIn = batch.archive === TOWN_CLUTTER_ARCHIVE
    ? TOWN_CLUTTER[batch.record]
    : TOWN_ITEMS[batch.archive]?.[batch.record] ?? DET_FLAT_STAND_INS[batch.archive]?.[batch.record];
  const [archive, index] = standIn ?? [batch.archive, batch.record];
  const record = `${archive}:${index}`;
  return {
    spec: placedModels.get(record) ?? furnishings.get(record),
    lowPoly: placedLowPoly.has(record) || isWaterRack(record) || isPlacedWaterSource(record) ? record : null,
    alternate: placedAlternates.get(record),
    maxLength: tabletopLengths.get(record) ?? storageLengths.get(record),
    tabletopPixels: tabletopLengths.has(record),
    assembly: placedAssemblies.get(record),
  };
}

export function markPlacedFurnishing(batch, centers, readPondFloor = null) {
  const { spec, lowPoly, alternate, maxLength, tabletopPixels, assembly } = placedFurnishingModels(batch);
  if (spec || lowPoly || assembly) {
    if (readPondFloor && isWaterRack(lowPoly)) batch.pondRack = () => {
      const floor = readPondFloor();
      return floor && centers.some(([x, , z]) => floor(x, z) != null);
    };
    const authoredLength = Math.max(batch.size.w, batch.size.h);
    const length = Math.min(authoredLength, maxLength ?? Infinity);
    const fit = maxLength && authoredLength > maxLength ? maxLength / authoredLength : 1;
    const placements = centers.map(([x, y, z]) => {
      // Use authored coordinates so camera motion and floating origins never reroll a prop.
      const hash = Math.imul(Math.round(x * 64), 73856093)
        ^ Math.imul(Math.round(y * 64), 19349663) ^ Math.imul(Math.round(z * 64), 83492791);
      return { x, y, z, alternate: !!alternate && ((hash >>> 8) & 3) === 0 };
    });
    const assemblyParts = assembly?.parts.map(([record, length, dx, dz, yaw]) => ({
      spec: placedModels.get(record) ?? furnishings.get(record), length, dx, dz, yaw, tabletopPixels: true,
    }));
    placedFurnishings.set(batch, {
      readPondFloor: isWaterRack(lowPoly) ? readPondFloor : null,
      spec, lowPoly, placements, length, fit, tabletopPixels, assemblyParts, stack: assembly?.stack,
      alternate: placements.some(p => p.alternate) ? { spec: [alternate, false], length, tabletopPixels } : null,
    });
  }
  return batch;
}

const GRASS_SWAY_REACH = (heightFloor() + heightSpan()) * (MEADOW_REACH + MEADOW_WIND_REACH * LAB_WIND_RATE * WIND_SLIDER_MAX);

// Take the same authored centres and width as the drawn replacement.
export function placedWaterSourceGrass(batches) {
  const bowls = [];
  for (const batch of batches) {
    const entry = placedFurnishings.get(batch);
    const rim = entry?.lowPoly === '212:0' ? WELL_RIM_RADIUS
      : entry?.lowPoly === '212:2' || entry?.lowPoly === '212:3' ? .5 : 0;
    if (!rim) continue;
    const radius = rim * batch.size.w * entry.fit + GRASS_SWAY_REACH;
    for (const { x, z } of entry.placements) bowls.push({ x, z, radius2: radius * radius });
  }
  return bowls.length ? (x, z) => bowls.some(bowl => (x - bowl.x) ** 2 + (z - bowl.z) ** 2 <= bowl.radius2) : null;
}

export function markDroppedTorchModel(batch, item) {
  placedFurnishings.set(batch, { item, placements: [{ x: 0, y: 0, z: 0 }] });
}

export function releasePlacedFurnishing(renderer, batch, releaseModel) {
  const entry = placedFurnishings.get(batch);
  if (!entry) return;
  placedFurnishings.delete(batch);
  releaseFurnishingMorrowind(entry);
  if (entry.alternate) releaseFurnishingMorrowind(entry.alternate);
  for (const part of entry.assemblyParts ?? []) releaseFurnishingMorrowind(part);
  for (const p of entry.placements) if (p.rackMesh) releaseModel(renderer, p.variant);
  if (entry.mesh) releaseModel(renderer, entry.lowPoly);
}

function fittedRack(renderer, p, id, floor, w, h, acquire, release) {
  if (floor !== p.floor) {
    if (p.rackMesh) release(renderer, p.variant);
    const feet = floor && rackFootHeights(id, p, w, h, floor);
    p.variant = feet ? { rackId: id, feet } : null;
    p.rackMesh = p.variant ? acquire(renderer, p.variant) : null;
    p.floor = floor;
  }
  return p.rackMesh;
}

export function drawPlacedFurnishings(renderer, batches, acquireModel, releaseModel) {
  if (getPref('enhancedGroundLoot') === false) return batches;
  let remaining = null, planes = null;
  for (const [i, batch] of batches.entries()) {
    const entry = placedFurnishings.get(batch);
    if (!entry || !batch.vao || batch.castOnly || batch._dead) {
      remaining?.push(batch);
      continue;
    }
    const model = furnishingMorrowind(entry);
    const alternate = entry.alternate ? furnishingMorrowind(entry.alternate) : null;
    const parts = entry.assemblyParts?.map(part => ({ ...part, model: furnishingMorrowind(part) }));
    if ((!model && !entry.lowPoly && !parts) || parts?.some(part => !part.model)) {
      remaining?.push(batch);
      continue;
    }
    remaining ??= batches.slice(0, i);
    const [ox, oy, oz] = batch.origin ?? [0, 0, 0];
    const { h, w } = batch.size;
    planes ??= !renderer._bbCullOff && renderer._proj && renderer._view
      ? spherePlanes(multiply(renderer._proj, renderer._view)) : null;
    const floor = entry.readPondFloor?.();
    for (const placement of entry.placements) {
      const { x: px, y: py, z: pz, alternate: useAlternate } = placement;
      const x = px + ox, y = py + oy, z = pz + oz;
      if (planes && !sphereInPlanes(planes, x, y + h / 2, z, Math.hypot(w, h))) continue;
      const placedModel = useAlternate ? alternate ?? model : model;
      if (parts) drawAssembly(parts, entry.stack, x, y, z);
      else if (placedModel) placedModel.draw(x, y, z, 0);
      else {
        const rack = entry.readPondFloor && fittedRack(renderer, placement, entry.lowPoly, floor, w * entry.fit, h * entry.fit, acquireModel, releaseModel);
        const mesh = rack ?? (entry.mesh ??= acquireModel(renderer, entry.lowPoly));
        renderer.drawMesh(mesh, trs(x, y, z, 0, 0, 0, w * entry.fit, h * entry.fit, w * entry.fit));
      }
    }
  }
  return remaining ?? batches;
}
