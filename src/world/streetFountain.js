import { registerCustomModel } from './customModels.js';
import { createMeshKit } from './eliteGates/meshKit.js';

export const STREET_FOUNTAIN_MODEL = 41220;
const STONE = 0, TRIM = 1, WATER = 2;
const MATERIALS = [[92, 11], [141, 1], [85, 0]];
const SIDES = 8;

// Measured from ARCH3D 41220 in the scene's metre scale. Preserve the base,
// outer footprint and water level so the replacement sits in existing streets.
const CENTRE_X = .278, RADIUS_X = 2.633, RADIUS_Z = 2.769;
const WATER_Y = -.123;
const RIM = [
  [0, -.576], [.96, -.576], [1, -.49], [1, -.38], [.94, -.30],
  [.94, .28], [.99, .34], [1, .41], [.98, .459],
  [.86, .459], [.83, .38], [.83, -.24], [0, -.24],
];

export function buildStreetFountain() {
  const kit = createMeshKit();
  const point = (r, y, a) => [CENTRE_X + r * RADIUS_X * Math.cos(a), y, r * RADIUS_Z * Math.sin(a)];
  for (let side = 0; side < SIDES; side++) {
    const a = side * 2 * Math.PI / SIDES;
    const b = (side + 1) * 2 * Math.PI / SIDES;
    const radial = [(Math.cos(a) + Math.cos(b)) / RADIUS_X, 0, (Math.sin(a) + Math.sin(b)) / RADIUS_Z];
    for (let j = 0; j + 1 < RIM.length; j++) {
      const [r0, y0] = RIM[j], [r1, y1] = RIM[j + 1];
      const p = point(r0, y0, a), q = point(r0, y0, b), r = point(r1, y1, b), s = point(r1, y1, a);
      const out = [radial[0] * (y1 - y0), r0 - r1, radial[2] * (y1 - y0)];
      const material = j >= 6 && j <= 9 ? TRIM : STONE;
      const uv = Math.abs(y1 - y0) < .08
        ? [p, q, r, s].map(([x, , z]) => [x * .8, z * .8])
        : [[side * 2, y0], [(side + 1) * 2, y0], [(side + 1) * 2, y1], [side * 2, y1]];
      if (!r0) kit.tri(material, p, r, s, out, true, uv[0], uv[2], uv[3]);
      else if (!r1) kit.tri(material, p, q, r, out, true, uv[0], uv[1], uv[2]);
      else kit.quad(material, p, q, r, s, out, true, uv);
    }
    const left = point(.83, WATER_Y, a), right = point(.83, WATER_Y, b);
    kit.tri(WATER, [CENTRE_X, WATER_Y, 0], left, right, [0, 1, 0], true,
      [0, 0], [(left[0] - CENTRE_X) * .75, left[2] * .75], [(right[0] - CENTRE_X) * .75, right[2] * .75]);
  }

  const centre = [CENTRE_X, 0, 0];
  kit.lathe(STONE, [[.55, -.24], [.55, -.06], [.46, .03], [.38, .08], [.32, .61], [.38, .70]], SIDES, { centre, uvScale: 1.2 });
  kit.lathe(TRIM, [[.36, .60], [.40, .64], [.40, .72], [.34, .79], [.38, .86], [.30, .91], [0, .91]], SIDES, { centre, uvScale: 1.4 });
  kit.sweep(TRIM, [[.05, 0], [.035, .035], [0, .05], [-.035, .035], [-.05, 0], [-.035, -.035], [0, -.05], [.035, -.035]],
    [[CENTRE_X, .64, .30], [CENTRE_X, .64, .51], [CENTRE_X, .57, .63], [CENTRE_X, .52, .63]]);
  const model = kit.pack(0);
  for (const slot of model.subMeshes) [slot.textureArchive, slot.textureRecord] = MATERIALS[slot.textureRecord];
  return model;
}

export function registerStreetFountain() {
  registerCustomModel(STREET_FOUNTAIN_MODEL, buildStreetFountain, () => true, { climateFree: true });
}
