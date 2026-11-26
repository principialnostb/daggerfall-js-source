import { morrowindWorldVisualEnabled } from '../systems/dungeonDecor.js';
import { trs } from '../world/mat4.js';
import { createMeshKit } from '../world/eliteGates/meshKit.js';
import { lootPaints } from './foodLootModel.js';
import { buildLootPouch, TreasurePaintBank } from '../world/treasureModel.js';

const models = new WeakMap();
const pouches = new WeakMap();
const POUCH_ART = 'ground-loot-pouch';

function acquirePouch(renderer) {
  let pouch = pouches.get(renderer);
  if (!pouch) {
    const data = buildLootPouch(POUCH_ART);
    const paints = new TreasurePaintBank();
    const records = [...new Set(data.slots.map(slot => slot.record))];
    for (const record of records) renderer.uploadTexture(POUCH_ART, record, paints.get(record));
    pouch = { mesh: renderer.createMesh(data), records, users: 0 };
    pouches.set(renderer, pouch);
  }
  pouch.users++;
  return pouch.mesh;
}

function buildCoins(picture, archive, record, count) {
  const paint = lootPaints(picture);
  if (!paint.length) return null;
  const kit = createMeshKit();
    const coins = Math.max(1, Math.min(12, Math.floor(count) || 1));
    for (let i = 0; i < coins; i++) {
      const angle = i * 2.39996, radius = Math.sqrt(i / coins) * .35;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      const y = i % 4 === 0 ? .18 : 0;
      kit.lathe(record, [[0, y], [.11, y], [.125, y + .05], [.12, y + .17], [0, y + .17]], 12, { centre: [x, 0, z] });
    }
  const mesh = kit.pack(archive);
  for (let i = 0; i < mesh.uvs.length; i += 6) {
    const shade = mesh.normals[i / 2 * 3 + 1] > .45 ? .72 : .43;
    const uv = paint[Math.floor((paint.length - 1) * shade)].uv;
    for (let j = 0; j < 6; j += 2) mesh.uvs.set(uv, i + j);
  }
  return mesh;
}

export function markGroundLoot(batch, picture, record, yaw = 0, item = null) {
  if (!picture?.colors) return;
  models.set(batch, { picture, record, yaw, mesh: null, actual: null, gold: item?.group === 'Currency', count: item?.stackCount });
}

export function setLootModel(batch, actual) {
  const entry = models.get(batch);
  if (!entry || batch._dead) { actual?.release(); return; }
  entry.actual?.release();
  entry.actual = actual;
}

export async function loadItemLootModel(item) {
  const { fpArm } = await import('../combat/fpArm.js');
  return fpArm.groundLootModel(item);
}

export function releaseLootModel(renderer, batch) {
  const entry = models.get(batch);
  if (!entry) return;
  models.delete(batch);
  if (entry.pouch) {
    const pouch = pouches.get(renderer);
    if (--pouch.users === 0) {
      renderer.destroyMesh(pouch.mesh);
      for (const record of pouch.records) renderer.releaseTexture(POUCH_ART, record);
      pouches.delete(renderer);
    }
  } else if (entry.mesh) renderer.destroyMesh(entry.mesh);
  entry.actual?.release();
}

export function drawGroundLoot(renderer, batches) {
  if (!morrowindWorldVisualEnabled('enhancedGroundLoot')) return batches;
  let flats = null;
  for (const [i, batch] of batches.entries()) {
    const entry = models.get(batch);
    if (!entry || batch.castOnly || batch._dead) { flats?.push(batch); continue; }
    if (!entry.actual && entry.mesh === null) {
      const data = entry.gold ? buildCoins(entry.picture, batch.archive, entry.record, entry.count) : null;
      entry.pouch = !data;
      entry.mesh = data ? renderer.createMesh(data) : acquirePouch(renderer);
    }
    if (!entry.actual && !entry.mesh) { flats?.push(batch); continue; }
    flats ??= batches.slice(0, i);
    const [x, y, z] = batch.origin ?? [0, 0, 0];
    const { w, h } = batch.size;
    if (entry.actual) entry.actual.draw(x, y, z, entry.yaw);
    else if (entry.pouch) {
      entry.mesh.pixelKind = 'objects';
      const scale = batch.archive === 216 ? .65 : .34;
      renderer.drawMesh(entry.mesh, trs(x, y, z, 0, entry.yaw, 0, scale, scale, scale));
    }
    else {
      entry.mesh.pixelKind = 'objects';
      const width = entry.gold ? .22 : Math.min(.45, Math.max(.16, w));
      const height = entry.gold ? .08 : Math.min(.35, h);
      renderer.drawMesh(entry.mesh, trs(x, y, z, 0, entry.yaw, 0, width, height, width));
    }
  }
  return flats ?? batches;
}

