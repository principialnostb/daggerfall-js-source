import { billboardSize } from '../world/rmbFlats.js';
import { fixtureRecord, isHangingFixture } from '../world/lightFixtureModel.js';
import { isWallTorch, torchKind } from '../world/torchModel.js';
import { findTorchMount } from '../world/torchMount.js';
import { dungeonChainKind } from '../world/dungeonChainModel.js';
import { dungeonRemainsKind } from '../world/dungeonRemainsModel.js';
import { isDungeonCaveProp } from '../world/dungeonCaveProps.js';
import { isVioletSarcophagusPreview } from './dungeonPropCatalog.js';
import { violetSarcophagusPreviewSize } from './dungeonFurniture.js';

const staticDungeon = { only: ['dungeon'] };
const suspendedRemains = new Set(['cage', 'broken-cage', 'skeleton-hanging', 'skeleton-crossbar']);
const hangsFromCeiling = ({ archive, record }) => isHangingFixture(fixtureRecord(archive, record))
  || dungeonChainKind(archive, record) || suspendedRemains.has(dungeonRemainsKind(archive, record))
  || (archive !== 300 && isDungeonCaveProp(archive + ':' + record));

export async function planDungeonPropSet(context, entries, eye, forward, distance, lift) {
  const archives = new Map();
  const props = await Promise.all(entries.map(async ([id]) => {
    if (isVioletSarcophagusPreview(id)) {
      await context.getGpuMesh?.(Number(id.slice(7)));
      return { id, size: violetSarcophagusPreviewSize };
    }
    if (id.startsWith('arch3d:')) return context.loadClassicPreview(id);
    const [source, variant] = id.split('/');
    const [archive, record] = source.split(':').map(Number);
    if (!archives.has(archive)) archives.set(archive, Promise.resolve(context.getTexture(archive)));
    const texture = await archives.get(archive);
    if (!texture || record >= texture.recordCount) throw new Error('Недоступен объект ' + id);
    const size = billboardSize(texture, record);
    if (!(size.w > 0 && size.h > 0)) throw new Error('Неверный размер объекта ' + id);
    return { archive, record, variant, size };
  }));
  const right = [-forward[2], 0, forward[0]];
  const spacing = Math.max(1.25, ...props.map(({ id, size }) => (id ? size.h : size.w) + .35));
  const slots = [];
  for (let row = 0; row < 8; row++) for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    const depth = distance + row * spacing;
    const delta = forward.map((f, i) => f * depth + right[i] * offset * spacing);
    const range = Math.hypot(...delta);
    const direction = delta.map(value => value / range);
    const wall = context.collider.raycastHit(eye, direction, range, staticDungeon);
    const reachable = Math.min(wall.dist, range) - .13;
    if (reachable < .75) continue;
    const target = eye.map((v, i) => v + direction[i] * reachable);
    const floor = context.collider.raycastHit(target, [0, -1, 0], 6, staticDungeon);
    if (!Number.isFinite(floor.dist)) continue;
    const base = [target[0], target[1] - floor.dist + lift, target[2]];
    slots.push({ base, floorY: base[1] - lift });
  }

  const torchProps = props.filter(prop => !prop.id && isWallTorch(torchKind(prop.archive, prop.record)));
  const floorProps = props.filter(prop => !torchProps.includes(prop));
  const placed = [];
  for (const prop of [...torchProps, ...floorProps]) {
    const wallTorch = torchProps.includes(prop);
    let base;
    for (const slot of slots) {
      if (placed.some(other => Math.hypot(slot.base[0] - other.base[0], slot.base[2] - other.base[2]) < spacing * .85)) continue;
      base = [...slot.base];
      if (wallTorch && !findTorchMount(context.collider, base, prop.size.h, staticDungeon)) {
        base = null;
        continue;
      }
      if (!prop.id && hangsFromCeiling(prop)) {
        const ceiling = context.collider.raycastHit([base[0], slot.floorY + .08, base[2]], [0, 1, 0], 8, staticDungeon);
        if (Number.isFinite(ceiling.dist)) base[1] = Math.max(slot.floorY, slot.floorY + .08 + ceiling.dist - prop.size.h);
      }
      break;
    }
    if (!base) throw new Error('Раздел не помещается. Выберите более просторную комнату и направьте камеру в её центр.');
    placed.push({ ...prop, base });
  }
  return placed;
}
