import { dungeonDecorEnabled } from '../systems/dungeonDecor.js';
import { multiply, transformPoint, trs } from '../world/mat4.js';
import { markDungeonBurials, markTreasurePile } from '../render/treasurePiles.js';
import { buildTreasureModel, hasTreasureModel, TREASURE_ART } from '../world/treasureModel.js';
import { dungeonStorageWood } from '../world/dungeonStorageWood.js';
import { buildDungeonTortureTable, TORTURE_TABLE_ID } from '../world/dungeonTortureTable.js';
import { buildDungeonPress, CLASSIC_PRESS_ID } from '../world/dungeonPressDetail.js';
import { getPref } from '../systems/uiPrefs.js';
import { RANDOM_TREASURE_ARCHIVE } from '../systems/loot/lootDataTables.js';
import { buildDungeonWorkshop, workshopKind } from '../world/dungeonWorkshop.js';
import { restraintChairSize } from '../world/dungeonWorkshopVariants.js';
import { dungeonPropMesh, hasDungeonPropProfile } from './dungeonPropProfiles.js';
import { buildWoodenCoffin, woodenCoffinLids } from '../world/dungeonWoodenCoffin.js';
import { buildDungeonSarcophagus, CLOSED_SARCOPHAGUS_SHELL, SHIFTED_SARCOPHAGUS_SHELL, violetSarcophagusShells, isVioletSarcophagusShell, VIOLET_SARCOPHAGUS_ID, VIOLET_SARCOPHAGUS_RIM, VIOLET_SARCOPHAGUS_SHELL } from '../world/dungeonSarcophagus.js';

const rooms = new WeakMap();
const coffinFloors = new Map([[41316, 6], [41318, 3], [41322, 3], [41323, 3],
  [41319, 8], [41320, 10], [41321, 10], [VIOLET_SARCOPHAGUS_ID, 9], [41327, 10], [41325, 6], [41326, 6]]);
const lootBounds = new Map();
const surfaces = new WeakMap();
const violetCollisionPoses = new WeakMap();
const cageCollisionPoses = new WeakMap();
const cageMeshes = new Map();
const coffinMeshes = new WeakMap();
const coffinCollision = new WeakMap();
const storageMeshes = new WeakMap();
const tortureTablePoses = new WeakSet();
const pressPoses = new WeakSet();
let pressMesh;
let tortureTable;

export function configureDungeonFurnitureDraw(draw, builder, collider, id, cpu, matrix, remap) {
  draw._batched = addDungeonFurniture(builder, collider, id, cpu, matrix, remap);
  if (!draw._batched) draw.mesh = dungeonPropMesh(id, draw.mesh);
}

function workshopPlacement(collider, id, cpu, matrix, object) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < cpu.positions.length; i++) {
    const axis = i % 3;
    low[axis] = Math.min(low[axis], cpu.positions[i]);
    high[axis] = Math.max(high[axis], cpu.positions[i]);
  }
  const center = low.map((value, axis) => (value + high[axis]) / 2);
  const size = id === 41300 ? restraintChairSize : high.map((value, axis) => value - low[axis]);
  const pose = trs(center[0], low[1], center[2], 0, 0, 0, ...size);
  const placement = { shell: id, pose: multiply(matrix, pose), position: transformPoint(matrix, center[0], center[1], center[2]), object, local: pose };
  if (!object && ['cage', 'frame', 'slab', 'press'].includes(workshopKind(id))) cageCollisionPoses.set(matrix, placement);
  if (!rooms.has(collider)) rooms.set(collider, []);
  rooms.get(collider).push(placement);
  if (['slab', 'table'].includes(workshopKind(id))) {
    if (!surfaces.has(collider)) surfaces.set(collider, []);
    surfaces.get(collider).push(placement);
  }
}

export function addDungeonFurnitureMover(draws, collider, id, cpu, matrix, gpu, object) {
  if (dungeonDecorEnabled() && workshopKind(id) === 'press') {
    workshopPlacement(collider, id, cpu, matrix, object);
  } else draws.push({ gpu: !dungeonDecorEnabled() ? gpu : dungeonPropMesh(id, gpu), object });
}

export function addDungeonFurniture(builder, collider, id, cpu, matrix, remap) {
  if (dungeonDecorEnabled() && workshopKind(id)) {
    workshopPlacement(collider, id, cpu, matrix, null);
    return true;
  }
  if (dungeonDecorEnabled() && cpu.normals && cpu.uvs) {
    if (id === CLASSIC_PRESS_ID) {
      const mesh = pressMesh ??= buildDungeonPress(TREASURE_ART);
      pressPoses.add(matrix);
      if (!rooms.has(collider)) rooms.set(collider, []);
      rooms.get(collider).push({ shell: 'press-' + id, mesh, pose: matrix, position: transformPoint(matrix, 0, 0, 0) });
      return true;
    }
    if (id === TORTURE_TABLE_ID) {
      const mesh = tortureTable ??= buildDungeonTortureTable(TREASURE_ART);
      tortureTablePoses.add(matrix);
      if (!rooms.has(collider)) rooms.set(collider, []);
      rooms.get(collider).push({ shell: 'torture-table', mesh, pose: matrix, position: transformPoint(matrix, .199, -.974, .272) });
      return true;
    }
    if (!storageMeshes.has(cpu)) storageMeshes.set(cpu, dungeonStorageWood(id, cpu, TREASURE_ART));
    const mesh = storageMeshes.get(cpu);
    if (mesh) {
      if (!rooms.has(collider)) rooms.set(collider, []);
      rooms.get(collider).push({ shell: 'storage-' + id, mesh, pose: matrix, position: transformPoint(matrix, 0, 0, 0) });
      return true;
    }
  }
  const floorRecord = coffinFloors.get(id);
  const wooden = woodenCoffinLids.has(id) && dungeonDecorEnabled();
  let coffin;
  if (wooden) {
    if (!coffinMeshes.has(cpu)) coffinMeshes.set(cpu, buildWoodenCoffin(cpu, woodenCoffinLids.get(id), floorRecord));
    const mesh = coffinMeshes.get(cpu);
    coffinCollision.set(matrix, mesh);
    if (!rooms.has(collider)) rooms.set(collider, []);
    coffin = { shell: 'wooden-' + id, mesh, pose: matrix, position: transformPoint(matrix, 0, 0, 0), bonesPose: null };
    rooms.get(collider).push(coffin);
    if (!floorRecord) return true;
  }
  if (!floorRecord && hasDungeonPropProfile(id) && dungeonDecorEnabled()) return false;
  if (!floorRecord || !dungeonDecorEnabled()) {
    builder.add(cpu, matrix, remap);
    return true;
  }
  const floor = cpu.subMeshes.find(s => s.textureArchive === 92 && s.textureRecord === floorRecord && s.primitiveCount >= 2);
  if (!floor) {
    if (wooden) return true;
    builder.add(cpu, matrix, remap);
    return true;
  }
  const corners = Array.from(cpu.indices.slice(floor.startIndex, floor.startIndex + floor.primitiveCount * 3),
    i => Array.from(cpu.positions.slice(i * 3, i * 3 + 3)));
  const low = [0, 1, 2].map(axis => Math.min(...corners.map(point => point[axis])));
  const high = [0, 1, 2].map(axis => Math.max(...corners.map(point => point[axis])));
  if (high[1] - low[1] > .015) {
    if (wooden) return true;
    builder.add(cpu, matrix, remap);
    return true;
  }
  const [x, surfaceY, z] = low.map((value, i) => (value + high[i]) / 2);
  const y = id === 41319 ? surfaceY - VIOLET_SARCOPHAGUS_RIM : surfaceY;
  const width = high[0] - low[0], length = high[2] - low[2];
  const pose = multiply(matrix, trs(x, y + (wooden ? .016 : .006), z, 0, 0, 0, width, 1, length));
  const position = transformPoint(pose, 0, 0, 0);
  if (!rooms.has(collider)) rooms.set(collider, []);
  const shell = violetSarcophagusShells.get(id) ?? 'coffin-shell';
  if (coffin) coffin.bonesPose = pose;
  rooms.get(collider).push({ pose, position, width, length, shell: wooden ? 'coffin-remains' : shell,
    shifted: id === 41316 || id === 41318 });
  if (isVioletSarcophagusShell(shell)) violetCollisionPoses.set(matrix, { pose, shell });
  return true;
}

export function addDungeonFurnitureCollision(collider, cpu, matrix, key = 'dungeon') {
  if (pressPoses.has(matrix)) {
    collider.addMesh(key, pressMesh.positions, pressMesh.indices, matrix);
    return;
  }
  if (tortureTablePoses.has(matrix)) {
    collider.addMesh(key, tortureTable.positions, tortureTable.indices, matrix);
    return;
  }
  const coffin = coffinCollision.get(matrix);
  const replacement = violetCollisionPoses.get(matrix);
  const cage = cageCollisionPoses.get(matrix);
  if (coffin) collider.addMesh(key, coffin.positions, coffin.indices, matrix);
  else if (cage) {
    if (!cageMeshes.has(cage.shell)) cageMeshes.set(cage.shell, buildDungeonWorkshop(0, cage.shell));
    const mesh = cageMeshes.get(cage.shell);
    collider.addMesh(key, mesh.positions, mesh.indices, cage.pose);
  } else if (replacement) addVioletCollision(collider, key, replacement.pose, replacement.shell);
  else collider.addMesh(key, cpu.positions, cpu.indices, matrix);
}

function addVioletCollision(collider, key, pose, shell = VIOLET_SARCOPHAGUS_SHELL) {
  const mesh = buildDungeonSarcophagus(0, shell);
  collider.addMesh(key, mesh.positions, mesh.indices, pose);
}

export function dungeonBurialBatches(renderer, collider) {
  const burials = rooms.get(collider);
  if (!burials?.length) return [];
  return [markDungeonBurials(renderer.createBillboardBatch(206, 0, { w: 1.3, h: 2.7 },
    burials.map(({ position }) => position)), burials)];
}

export const violetSarcophagusPreviewSize = { w: 1.30, h: 2.70 };

export function previewVioletSarcophagus(renderer, base, collider, key, id = VIOLET_SARCOPHAGUS_ID) {
  const { w, h } = violetSarcophagusPreviewSize;
  const position = [base[0], base[1] + .13, base[2]];
  const pose = trs(...position, 0, 0, 0, w, 1, h);
  const shell = violetSarcophagusShells.get(id);
  const batch = markDungeonBurials(renderer.createBillboardBatch(206, 0, violetSarcophagusPreviewSize, [position]),
    [{ position, pose, shell }]);
  collider.addMesh && addVioletCollision(collider, key, pose, shell);
  return batch;
}

export function placeBurialLoot(collider, record, size, marker) {
  if (getPref('enhancedDungeonProps') === false || getPref('enhancedTreasurePiles') === false || !hasTreasureModel(record)) return null;
  const burial = rooms.get(collider)?.find(({ pose, position, width, length, shell }) => {
    const delta = marker.map((v, i) => v - position[i]);
    const project = axis => delta.reduce((sum, v, i) => sum + v * pose[axis * 4 + i], 0);
    return shell !== CLOSED_SARCOPHAGUS_SHELL && width && Math.abs(project(0)) < width * width * .52 && Math.abs(project(2)) < length * length * .52
      && Math.abs(delta[1]) < .90;
  });
  if (!burial) return null;
  if (!lootBounds.has(record)) lootBounds.set(record, buildTreasureModel(record).aabb);
  const bounds = lootBounds.get(record);
  const { pose, width, length } = burial;
  const violet = isVioletSarcophagusShell(burial.shell);
  const rim = violet ? VIOLET_SARCOPHAGUS_RIM : .35;
  const yaw = Math.atan2(pose[8], pose[10]) * 180 / Math.PI + 90;
  if (burial.shell !== SHIFTED_SARCOPHAGUS_SHELL && !burial.shifted
    && bounds.extent[2] * 2 * size.w + .05 <= width * .21 && bounds.extent[0] * 2 * size.w + .06 <= length
    && (violet ? bounds.extent[1] * 2 : bounds.center[1] + bounds.extent[1]) * size.h <= rim - .035) {
    const x = .385 - bounds.center[2] * size.w / width;
    const y = violet ? .004 - (bounds.center[1] - bounds.extent[1]) * size.h : .020;
    return { pos: transformPoint(pose, x, y, bounds.center[0] * size.w / length), yaw };
  }
  for (const side of [-1, 1]) {
    const candidate = transformPoint(pose, side * ((side < 0 ? 1 : .72) + size.w / (2 * width)), violet ? 1.32 : .8, 0);
    const from = [burial.position[0], candidate[1], burial.position[2]];
    const delta = candidate.map((v, i) => v - from[i]);
    const distance = Math.hypot(...delta);
    const wall = collider.raycastHit(from, delta.map(v => v / distance), distance, { only: ['dungeon'] });
    if (wall.normal && Number.isFinite(wall.dist) && Math.abs(wall.normal[1]) < .6) continue;
    const hit = collider.raycastHit(candidate, [0, -1, 0], 2, { only: ['dungeon'] });
    if (Number.isFinite(hit.dist) && hit.normal?.[1] > .8 && !hit.back) {
      candidate[1] -= hit.dist;
      return { pos: candidate, yaw };
    }
  }
  return null;
}

export function placeDungeonLoot(renderer, collider, pile, size, floorLanding) {
  const fitted = placeBurialLoot(collider, pile.record, size, pile.pos) ?? placeWorkshopLoot(collider, pile, size);
  const [x, y, z] = pile.pos;
  const base = fitted?.pos ?? (pile.isFixed
    ? [x, y - size.h / 2, z] : floorLanding(collider, [x, y + .2, z]));
  pile.pos = base;
  pile.decorYaw = fitted?.yaw;
  pile.batch = markTreasurePile(renderer.createBillboardBatch(RANDOM_TREASURE_ARCHIVE, pile.record, size, [base]),
    base, pile.decorYaw);
}

function placeWorkshopLoot(collider, pile, size) {
  if (getPref('enhancedTreasurePiles') === false || !hasTreasureModel(pile.record)) return null;
  if (!lootBounds.has(pile.record)) lootBounds.set(pile.record, buildTreasureModel(pile.record).aabb);
  const bounds = lootBounds.get(pile.record);
  for (const { pose, shell } of surfaces.get(collider) ?? []) {
    const [px, py, pz] = transformPoint(pose, 0, 1, 0);
    const dx = pile.pos[0] - px, dz = pile.pos[2] - pz;
    if (Math.abs(pile.pos[1] - py) > .65) continue;
    const width = Math.hypot(pose[0], pose[2]), depth = Math.hypot(pose[8], pose[10]);
    const x = (dx * pose[0] + dz * pose[2]) / (width * width);
    const z = (dx * pose[8] + dz * pose[10]) / (depth * depth);
    if (Math.abs(x) > .52 || Math.abs(z) > .52) continue;
    const turned = depth > width;
    const long = bounds.extent[0] * size.w, short = bounds.extent[2] * size.w;
    const padX = (turned ? short : long) / width, padZ = (turned ? long : short) / depth;
    if (padX > .40 || padZ > .40) {
      for (const side of [-1, 1]) {
        const at = transformPoint(pose, 0, 1.15, side * (.56 + padZ));
        const hit = collider.raycastHit(at, [0, -1, 0], 2, { only: ['dungeon'] });
        if (Number.isFinite(hit.dist) && hit.normal?.[1] > .8 && !hit.back) return { pos: [at[0], at[1] - hit.dist, at[2]] };
      }
      continue;
    }
    const clamp = (value, pad) => Math.max(-.42 + pad, Math.min(.42 - pad, value));
    const cx = (turned ? bounds.center[2] : bounds.center[0]) * size.w / width;
    const cz = (turned ? -bounds.center[0] : bounds.center[2]) * size.w / depth;
    const yaw = Math.atan2(pose[8], pose[10]) * 180 / Math.PI + (turned ? 90 : 0);
    return { pos: transformPoint(pose, clamp(x, padX) - cx, workshopKind(shell) === 'table' ? .997 : 1.002, clamp(z, padZ) - cz), yaw };
  }
  return null;
}
