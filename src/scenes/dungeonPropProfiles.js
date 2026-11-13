import { classicDungeonPropGroups } from './dungeonClassicPropCatalog.js';

const familyScale = new Map([
  ['Клетки', 1.10], ['Пыточные устройства', 1.00], ['Гробы', 1.35],
  ['Саркофаги', 1.50], ['Столы', 1.00], ['Стулья и скамьи', 1.20],
  ['Сундуки', 1.25], ['Ящики', 1.25], ['Драпировки и знамёна', 1.05],
]);
const scales = new Map(classicDungeonPropGroups.flatMap(([family, ids]) =>
  ids.map(id => [id, familyScale.get(family) ?? 1.15])));

export const hasDungeonPropProfile = id => scales.has(id);

export function dungeonPropMesh(id, mesh) {
  const pixelBlockScale = scales.get(id);
  return pixelBlockScale === undefined ? mesh : { ...mesh, pixelKind: 'objects', pixelBlockScale };
}
