import { consoleLog, gateConsoleCommand, registerCommand } from '../systems/consoleCommands.js';
import { markClassicDungeonPreview, markDungeonProp, markTreasurePile } from '../render/treasurePiles.js';
import { trs } from '../world/mat4.js';
import { dungeonPropMesh } from './dungeonPropProfiles.js';
import { billboardSize } from '../world/rmbFlats.js';
import { mountTorchBatch, torchMountAt } from '../world/torchMount.js';
import { isWallTorch, torchKind } from '../world/torchModel.js';
import { RANDOM_TREASURE_ARCHIVE } from '../systems/loot/lootDataTables.js';
import { decorPreviewGroups, isVioletSarcophagusPreview } from './dungeonPropCatalog.js';
import { bindDungeonPropPanel } from '../ui/dungeonPropPanel.js';
import { planDungeonPropSet } from './dungeonPropSet.js';
import { addDungeonFurniture, addDungeonFurnitureCollision, dungeonBurialBatches, previewVioletSarcophagus } from './dungeonFurniture.js';
import { woodenCoffinLids } from '../world/dungeonWoodenCoffin.js';
import { workshopKind } from '../world/dungeonWorkshop.js';
import { TORTURE_TABLE_ID } from '../world/dungeonTortureTable.js';
import { CLASSIC_PRESS_ID } from '../world/dungeonPressDetail.js';

const usage = 'prop_preview <archive:record|arch3d:model> [distance] [lift] | prop_preview clear';
const command = 'prop_preview';
const catalog = new Set(decorPreviewGroups.flatMap(([, entries]) => entries.map(([id]) => id)));
let current = null;

async function loadClassicPreview(context, id) {
  const number = Number(id.slice(7));
  const mesh = await context.getGpuMesh(number);
  const cpu = context.cpuModels.get(number);
  if (!mesh || !cpu) throw new Error('Недоступна модель ' + number);
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < cpu.positions.length; i++) {
    const axis = i % 3;
    low[axis] = Math.min(low[axis], cpu.positions[i]);
    high[axis] = Math.max(high[axis], cpu.positions[i]);
  }
  const w = Math.hypot(high[0] - low[0], high[2] - low[2]);
  return { id, mesh: dungeonPropMesh(number, mesh), cpu, size: { w, h: w }, low, high };
}

function makePreview(context, { id, archive, record, variant, size, base, mesh, cpu, low, high }) {
  if (isVioletSarcophagusPreview(id)) {
    const key = 'decor-preview:' + ++context.previewSerial;
    const batch = previewVioletSarcophagus(context.renderer, base, context.collider, key, Number(id.slice(7)));
    context.previewColliders.set(batch, key);
    return batch;
  }
  if (mesh) {
    const pose = trs(base[0] - (low[0] + high[0]) / 2, base[1] - low[1],
      base[2] - (low[2] + high[2]) / 2, 0, 0, 0);
    if (cpu.subMeshes) {
      const preview = {};
      const modelId = Number(id.slice(7));
      addDungeonFurniture({ add() {} }, preview, modelId, cpu, pose);
      const [replacement] = dungeonBurialBatches(context.renderer, preview);
      if (replacement) {
        if (context.collider.addMesh && (woodenCoffinLids.has(modelId) || ['cage', 'frame', 'slab', 'press'].includes(workshopKind(modelId))
          || modelId === TORTURE_TABLE_ID || modelId === CLASSIC_PRESS_ID)) {
          const key = 'decor-preview:' + ++context.previewSerial;
          addDungeonFurnitureCollision(context.collider, cpu, pose, key);
          context.previewColliders.set(replacement, key);
        }
        return replacement;
      }
    }
    return markClassicDungeonPreview(context.renderer.createBillboardBatch(206, 0, size, [base]), mesh, pose);
  }
  context.uploadRecord(archive, record);
  const batch = context.renderer.createBillboardBatch(archive, record, size, [base]);
  try {
    if (archive === RANDOM_TREASURE_ARCHIVE) return markTreasurePile(batch, base);
    mountTorchBatch(batch, [base], context.collider, { only: ['dungeon'] });
    return markDungeonProp(batch, [base], variant);
  } catch (error) {
    context.renderer.destroyBatch(batch);
    throw error;
  }
}

function removePreviews(context, previews) {
  for (const batch of previews.splice(0)) {
    const index = context.batches.indexOf(batch);
    if (index >= 0) context.batches.splice(index, 1);
    const key = context.previewColliders.get(batch);
    if (key) context.collider.removeBucket?.(key);
    context.previewColliders.delete(batch);
    context.renderer.destroyBatch(batch);
  }
}

function spawn(args, report = consoleLog) {
  const context = current;
  if (!context?.active()) return 'Open an offline dungeon first.';
  if (args[0] === 'clear') {
    context.revision++;
    removePreviews(context, context.previews);
    removePreviews(context, context.set);
    return 'Decor previews cleared.';
  }
  const group = args[0] === 'set' ? decorPreviewGroups.find(([name]) => name === args[1]) : null;
  const [idArg, distanceArg, liftArg] = group ? args.slice(1) : args;
  const violet = isVioletSarcophagusPreview(idArg);
  const classic = idArg?.startsWith('arch3d:') && catalog.has(idArg);
  const match = /^(\d+):(\d+)(?:\/([a-z]+-\d+))?$/.exec(idArg ?? '');
  const distance = Number(distanceArg ?? 2.5), lift = Number(liftArg ?? 0);
  if ((!group && !match && !classic) || !Number.isFinite(distance) || distance < 1 || distance > 12 || !Number.isFinite(lift) || lift < 0 || lift > 6) return usage;
  const archive = Number(match?.[1]), record = Number(match?.[2]), variant = match?.[3];
  const id = archive + ':' + record + (variant ? '/' + variant : '');
  if (!group && !classic && !catalog.has(id)) {
    return 'No 3D dungeon decor for ' + match[0] + '.';
  }
  const view = context.renderer._view;
  if (!view) return 'Wait for the dungeon view before previewing.';
  const eye = [0, 1, 2].map(i => -(view[i * 4] * view[12] + view[i * 4 + 1] * view[13] + view[i * 4 + 2] * view[14]));
  const length = Math.hypot(view[2], view[10]);
  if (length < .05) return 'Look toward an open part of the room.';
  const forward = [-view[2] / length, 0, -view[10] / length];
  if (group) {
    const revision = context.revision, request = ++context.setRequest;
    const stillActive = () => current === context && context.active() && revision === context.revision && request === context.setRequest;
    const entries = group[1];
    const page = Number(args[4] ?? 0);
    const review = entries.length > 8 && entries.every(([id]) => id.startsWith('arch3d:'));
    if (review && (!Number.isInteger(page) || page < 0 || page * 8 >= entries.length)) return usage;
    const batch = review ? entries.slice(page * 8, page * 8 + 8) : entries;
    void planDungeonPropSet(context, batch, eye, forward, distance, lift).then(placements => {
      if (!stillActive()) return;
      const staged = [];
      try {
        for (const placement of placements) staged.push(makePreview(context, placement));
      } catch (error) {
        removePreviews(context, staged);
        throw error;
      }
      removePreviews(context, context.set);
      context.set = staged;
      context.batches.push(...staged);
      report(group[0] + ' · размещено ' + staged.length);
    }).catch(error => { if (stillActive()) report(error.message); });
    return 'Размещаю раздел «' + group[0] + '»…';
  }
  const wall = context.collider.raycastHit(eye, forward, distance);
  if (Number.isFinite(wall.dist)) return 'A wall blocks that spot. Try a shorter distance or another direction.';
  const target = [eye[0] + forward[0] * distance, eye[1], eye[2] + forward[2] * distance];
  const floor = context.collider.raycastHit(target, [0, -1, 0], 6);
  if (!Number.isFinite(floor.dist)) return 'No floor found in front of you.';
  const base = [target[0], target[1] - floor.dist + lift, target[2]];
  const revision = context.revision;
  if (classic) {
    const loaded = violet
      ? Promise.resolve(context.getGpuMesh?.(Number(idArg.slice(7)))).then(() => ({ id: idArg }))
      : loadClassicPreview(context, idArg);
    void loaded.then(prop => {
      if (current !== context || !context.active() || revision !== context.revision) return;
      const batch = makePreview(context, { ...prop, base });
      context.batches.push(batch);
      context.previews.push(batch);
      report('Preview placed: ' + idArg + '.');
    }).catch(error => { if (current === context && revision === context.revision) report(error.message); });
    return 'Loading decor ' + idArg + '…';
  }
  void Promise.resolve().then(() => context.getTexture(archive)).then(texture => {
    if (current !== context || !context.active() || revision !== context.revision) return;
    if (!texture || record >= texture.recordCount) {
      report('Could not load decor ' + match[0] + '.');
      return;
    }
    const batch = makePreview(context, { archive, record, variant, size: billboardSize(texture, record), base });
    if (isWallTorch(torchKind(archive, record)) && !torchMountAt(batch, 0)) {
      context.renderer.destroyBatch(batch);
      report('Place the wall torch closer to a wall.');
      return;
    }
    context.batches.push(batch);
    context.previews.push(batch);
    report('Preview placed: ' + match[0] + '.');
  }).catch(() => {
    if (current === context && context.active() && revision === context.revision) report('Could not place decor ' + match[0] + '.');
  });
  return 'Loading decor ' + match[0] + '…';
}

export function createDungeonPropPreviews(options) {
  const batches = dungeonBurialBatches(options.renderer, options.collider);
  current?.unbind?.();
  current = { ...options, batches, previews: [], set: [], setRequest: 0, revision: 0, previewSerial: 0, previewColliders: new Map(),
    loadClassicPreview: id => loadClassicPreview(options, id),
    unbind: import.meta.env?.DEV ? bindDungeonPropPanel(options.active, decorPreviewGroups, spawn, options.renderer.gl?.canvas) : null };
  registerCommand(command, 'Preview static 3D decor in an offline dungeon.', usage, args => spawn(args));
  gateConsoleCommand(command, () => !!current?.active());
  return batches;
}

export function closeDungeonPropPreviews(batches) {
  if (current?.batches === batches) {
    for (const key of current.previewColliders.values()) current.collider.removeBucket?.(key);
    const unbind = current.unbind;
    current = null;
    unbind?.();
  }
  return batches;
}
