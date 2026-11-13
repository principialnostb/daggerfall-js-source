import { createMeshKit } from '../world/eliteGates/meshKit.js';
import { isFood, TEMPLATE } from '../systems/survival/food.js';

export const isMeatLoot = (item) => isFood(item)
  && (item.templateIndex === TEMPLATE.RawMeat || item.templateIndex === TEMPLATE.Meat);

/** A cut of meat with a rounded shoulder and a narrower end, shaded by
 * the room and painted with opaque colors sampled from its inventory art. */
export function lootPaints(picture) {
  const { colors, width, height } = picture;
  const paints = [];
  for (let i = 0; i < width * height; i++) {
    if (colors[i * 4 + 3] >= 128) {
      const [r, g, b] = [colors[i * 4], colors[i * 4 + 1], colors[i * 4 + 2]];
      paints.push({ uv: [(i % width + 0.5) / width, (Math.floor(i / width) + 0.5) / height], light: r + g + b });
    }
  }
  return paints.sort((a, b) => a.light - b.light);
}

export function meatLootModel(picture, archive, record) {
  const paints = lootPaints(picture);
  if (!paints.length) return null;
  const kit = createMeshKit();
  const outline = [[-.45, -.18], [-.30, -.43], [.13, -.46], [.43, -.25], [.38, .16], [.19, .43], [-.18, .41], [-.38, .22]];
  const ring = (sx, sz, y) => outline.map(([x, z], i) => [x * sx, y + (i % 3) * y * .12, z * sz]);
  const rings = [ring(.76, .76, 0), ring(1, 1, .55), ring(.62, .68, 1)];
  const center = [0, .5, 0];
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length;
    const uv = (fraction) => paints[Math.floor((paints.length - 1) * fraction)].uv;
    const side = uv(.24 + (i % 3) * .12), top = uv(.49 + (i % 4) * .13);
    kit.quad(record, rings[0][i], rings[0][next], rings[1][next], rings[1][i], center, false, [side, side, side, side]);
    kit.quad(record, rings[1][i], rings[1][next], rings[2][next], rings[2][i], center, false, [top, top, top, top]);
    kit.tri(record, rings[2][i], rings[2][next], [0, 1.13, 0], center, false, top, top, top);
    kit.tri(record, rings[0][i], rings[0][next], [0, 0, 0], center, false, side, side, side);
  }
  return kit.pack(archive);
}
