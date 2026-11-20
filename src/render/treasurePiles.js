import { buildTreasureModel, hasTreasureModel, treasurePaints, treasurePixelProfile, TREASURE_ART } from '../world/treasureModel.js';
import { buildDungeonChain, dungeonChainKind, isDungeonChainKind } from '../world/dungeonChainModel.js';
import { buildWaterRack, isWaterRack } from '../world/waterRack.js';
import { buildDungeonColumn, dungeonColumnKind, isDungeonColumnKind } from '../world/dungeonColumnModel.js';
import { buildBrokenDungeonCage } from '../world/dungeonCageModel.js';
import { buildDungeonSarcophagus, CLOSED_SARCOPHAGUS_SHELL, isVioletSarcophagusShell, VIOLET_SARCOPHAGUS_REMAINS } from '../world/dungeonSarcophagus.js';
import { buildDungeonWorkshop, workshopKind } from '../world/dungeonWorkshop.js';
import { dungeonPropMesh } from '../scenes/dungeonPropProfiles.js';
import { pixelWorldDraw } from './worldPixelLayer.js';
import { buildDungeonFurnishing, dungeonFurnishingKind, isDungeonFurnishing } from '../world/dungeonFurnishings.js';
import { buildDungeonCaveProp, isDungeonCaveProp } from '../world/dungeonCaveProps.js';
import { buildDungeonRemains, currentDungeonRemainsParts, dungeonRemainsKind, dungeonRemainsVariant } from '../world/dungeonRemainsModel.js';
import { multiply, trs } from '../world/mat4.js';
import { sphereInPlanes, spherePlanes } from './bounds.js';

import { RANDOM_TREASURE_ARCHIVE } from '../systems/loot/lootDataTables.js';
import { furnishingMorrowind, releaseFurnishingMorrowind } from './furnishingMorrowind.js';
import { dungeonDecorEnabled, morrowindWorldVisualEnabled } from '../systems/dungeonDecor.js';

const entries = new WeakMap();
const caches = new WeakMap();

/** Only scene-authored dungeon treasure opts in. The batch still owns pickup and visibility. */
export function markTreasurePile(batch, base, fittedYaw) {
  if (batch.archive === RANDOM_TREASURE_ARCHIVE && hasTreasureModel(batch.record)) {
    const yaw = fittedYaw ?? ((Math.round(base[0] * 17) ^ Math.round(base[2] * 31)) & 15) * 22.5;
    entries.set(batch, { base: [...base], yaw, mesh: null, record: batch.record });
  }
  return batch;
}

export function markDungeonProp(batch, centers, previewVariant = null) {
  const id = batch.archive + ':' + batch.record;
  const record = dungeonChainKind(batch.archive, batch.record) ?? dungeonColumnKind(batch.archive, batch.record)
    ?? dungeonRemainsKind(batch.archive, batch.record) ?? dungeonFurnishingKind(batch.archive, batch.record)
    ?? (isDungeonCaveProp(id) ? id : null);
  if (record) {
    entries.set(batch, { centers, mesh: null, record, variants: new Map(), previewVariant });
  }
  return batch;
}

export function markDungeonBurials(batch, burials) {
  entries.set(batch, { burials, record: 'burial-0', mesh: null });
  return batch;
}

export function markClassicDungeonPreview(batch, mesh, pose) {
  entries.set(batch, { classic: { mesh, pose } });
  return batch;
}

export function acquireTreasureModel(renderer, record, remains = null, authored = null) {
  let cache = caches.get(renderer);
  if (!cache) {
    const paints = treasurePaints();
    paints.forEach((paint, i) => renderer.uploadTexture(TREASURE_ART, i, paint));
    cache = { meshes: new Map(), users: 0, materials: Object.keys(paints).map(Number), remainsPaints: new Set() };
    caches.set(renderer, cache);
  }
  if (remains) for (const [slot, paint] of remains.paints) {
    if (cache.remainsPaints.has(slot)) continue;
    renderer.uploadTexture(TREASURE_ART, slot, paint);
    cache.remainsPaints.add(slot);
  }
  let entry = cache.meshes.get(record);
  if (!entry) {
    const data = authored ?? (record.rackId ? buildWaterRack(TREASURE_ART, record.rackId, record.feet)
      : workshopKind(record) ? buildDungeonWorkshop(TREASURE_ART, record)
      : isDungeonChainKind(record) ? buildDungeonChain(TREASURE_ART, record)
      : isDungeonColumnKind(record) ? buildDungeonColumn(TREASURE_ART, record)
      : record === 'broken-cage' ? buildBrokenDungeonCage(TREASURE_ART)
      : isVioletSarcophagusShell(record) ? buildDungeonSarcophagus(TREASURE_ART, record)
      : record === 'coffin-shell' ? buildDungeonSarcophagus(TREASURE_ART)
      : isWaterRack(record) ? buildWaterRack(TREASURE_ART, record)
      : isDungeonFurnishing(record) ? buildDungeonFurnishing(TREASURE_ART, record)
      : isDungeonCaveProp(record) ? buildDungeonCaveProp(TREASURE_ART, record)
      : typeof record === 'string' ? buildDungeonRemains(TREASURE_ART, record, remains.parts) : buildTreasureModel(record));
    const mesh = dungeonPropMesh(record, renderer.createMesh(data));
    if (typeof record === 'number' && !workshopKind(record)) mesh.pixelFootprint = { bounds: data.aabb, ...treasurePixelProfile(record) };
    // Stone burial shells keep the selected object grid as the camera approaches.
    if (record === 'coffin-shell') mesh.pixelFootprint = { bounds: data.aabb, area: .028, maxScale: 1.9 };
    if (isVioletSarcophagusShell(record) || record === VIOLET_SARCOPHAGUS_REMAINS) mesh.pixelBlockScale = 1.5;
    if (authored) mesh.pixelBlockScale = authored.pixelBlockScale ?? 1.35;
    mesh.pixelKind = 'objects';
    entry = { mesh, users: 0 };
    cache.meshes.set(record, entry);
  }
  entry.users++;
  cache.users++;
  return entry.mesh;
}

export function releaseTreasurePile(renderer, batch) {
  const entry = entries.get(batch);
  entries.delete(batch);
  if (!entry) return;
  releaseFurnishingMorrowind(entry);
  if (entry.mesh) releaseTreasureModel(renderer, entry.record);
  for (const record of entry.variants?.keys() ?? []) releaseTreasureModel(renderer, record);
}

export function releaseTreasureModel(renderer, record) {
  const cache = caches.get(renderer);
  const model = cache.meshes.get(record);
  if (--model.users === 0) {
    renderer.destroyMesh(model.mesh);
    cache.meshes.delete(record);
  }
  if (--cache.users === 0) {
    caches.delete(renderer);
    for (const slot of cache.materials) renderer.releaseTexture(TREASURE_ART, slot);
    for (const slot of cache.remainsPaints) renderer.releaseTexture(TREASURE_ART, slot);
  }
}

export function drawTreasurePiles(renderer, batches, propsEnabled = dungeonDecorEnabled(), treasureEnabled = morrowindWorldVisualEnabled('enhancedTreasurePiles')) {
  let remaining = null, planes = null;
  for (const [i, batch] of batches.entries()) {
    const entry = entries.get(batch);
    if (entry?.classic) {
      remaining ??= batches.slice(0, i);
      if (!batch._dead) renderer.drawMesh(entry.classic.mesh, entry.classic.pose);
      continue;
    }
    if (entry?.burials && propsEnabled) {
      remaining ??= batches.slice(0, i);
      const parts = !batch._dead ? currentDungeonRemainsParts() : null;
      if (!batch._dead) {
        entry.variants ??= new Map();
        planes ??= renderer._proj && renderer._view ? spherePlanes(multiply(renderer._proj, renderer._view)) : null;
        for (const { position, pose, shell, object, local, mesh, bonesPose } of entry.burials) {
          if (!object && planes && !sphereInPlanes(planes, ...position, 2.1)) continue;
          if (mesh) {
            if (!entry.variants.has(shell)) entry.variants.set(shell, acquireTreasureModel(renderer, shell, null, mesh));
            const body = entry.variants.get(shell);
            if (parts && bonesPose && !entry.variants.has(entry.record)) {
              entry.variants.set(entry.record, acquireTreasureModel(renderer, entry.record, parts));
            }
            const draw = () => {
              renderer.drawMesh(body, pose);
              if (parts && bonesPose) renderer.drawMesh(entry.variants.get(entry.record), bonesPose);
            };
            if (!pixelWorldDraw(renderer, 'objects', body, pose, draw)) draw();
            continue;
          }
          if (shell === 'coffin-remains') continue;
          if (!entry.variants.has(shell)) entry.variants.set(shell, acquireTreasureModel(renderer, shell));
          renderer.drawMesh(entry.variants.get(shell), object ? multiply(object.matrix, local) : pose);
          if (parts && !mesh && !workshopKind(shell) && shell !== CLOSED_SARCOPHAGUS_SHELL) {
            const remains = isVioletSarcophagusShell(shell) ? VIOLET_SARCOPHAGUS_REMAINS : entry.record;
            if (!entry.variants.has(remains)) entry.variants.set(remains, acquireTreasureModel(renderer, remains, parts));
            renderer.drawMesh(entry.variants.get(remains), pose);
          }
        }
      }
      continue;
    }
    if (!entry || batch._dead || !batch.vao || batch.castOnly || (entry.centers ? !propsEnabled : !treasureEnabled)) {
      remaining?.push(batch);
      continue;
    }
    const remains = typeof entry.record === 'string' && entry.record !== 'broken-cage'
      && !isDungeonChainKind(entry.record) && !isDungeonColumnKind(entry.record)
      && !isDungeonFurnishing(entry.record) && !isDungeonCaveProp(entry.record);
    const parts = remains ? currentDungeonRemainsParts() : null;
    if (remains && !parts) {
      remaining?.push(batch);
      continue;
    }
    remaining ??= batches.slice(0, i);
    const origin = batch.origin ?? [0, 0, 0];
    if (entry.centers) {
      const furnishing = furnishingMorrowind(entry);
      planes ??= !renderer._bbCullOff && renderer._proj && renderer._view
        ? spherePlanes(multiply(renderer._proj, renderer._view)) : null;
      const { w, h } = batch.size;
      for (const [px, py, pz] of entry.centers) {
        const x = px + origin[0], y = py + origin[1], z = pz + origin[2];
        if (planes && !sphereInPlanes(planes, x, y + h / 2, z, Math.hypot(w, h))) continue;
        if (remains) {
          const variant = entry.previewVariant ?? dungeonRemainsVariant(entry.record, px, pz);
          if (!entry.variants.has(variant)) entry.variants.set(variant, acquireTreasureModel(renderer, variant, parts));
          const yaw = ((Math.round(px * 17) ^ Math.round(pz * 31)) & 15) * 22.5;
          renderer.drawMesh(entry.variants.get(variant), trs(x, y, z, 0, yaw, 0));
        } else if (furnishing) {
          furnishing.draw(x, y, z, 0);
        } else {
          entry.mesh ??= acquireTreasureModel(renderer, entry.record);
          renderer.drawMesh(entry.mesh, trs(x, y, z, 0, 0, 0, w, h, w));
        }
      }
      continue;
    }
    const [x, y, z] = entry.base.map((value, axis) => value + origin[axis]);
    const { w, h } = batch.size;
    if (!renderer._bbCullOff && renderer._proj && renderer._view) {
      planes ??= spherePlanes(multiply(renderer._proj, renderer._view));
      if (!sphereInPlanes(planes, x, y + h / 2, z, Math.hypot(w, h))) continue;
    }
    entry.mesh ??= acquireTreasureModel(renderer, entry.record);
    renderer.drawMesh(entry.mesh, trs(x, y, z, 0, entry.yaw, 0, w, h, w));
  }
  return remaining ?? batches;
}
