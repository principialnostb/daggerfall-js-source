import { registerCustomModel } from './customModels.js';
import { createMeshKit } from './eliteGates/meshKit.js';

export const STREET_FOUNTAIN_MODEL = 41220;
const STONE = 0, TRIM = 1, WATER = 2, STREAM = 3;
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

const SMALL_FOUNTAINS = new Map([
  [41221, { radius: 3.021, inside: 2.886, foot: -1.035, lip: .039, water: -.436, top: 1.073, bowl: .94, trim: [341, 0] }],
  [41222, { radius: 2.25, inside: 2.15, foot: -.662, lip: .139, water: -.545, top: .909, bowl: .64, trim: [41, 0] }],
]);

export const isStreetFountain = id => id === STREET_FOUNTAIN_MODEL || SMALL_FOUNTAINS.has(id);

function finish(kit, materials) {
  const model = kit.pack(0);
  for (const slot of model.subMeshes) {
    const slotIndex = slot.textureRecord;
    if (slotIndex === WATER || slotIndex === STREAM) slot.fountainWater = slotIndex === STREAM ? -1 : 1;
    [slot.textureArchive, slot.textureRecord] = materials[slotIndex === STREAM ? WATER : slotIndex];
  }
  return model;
}

// A separate horizontal fan for each pool. Its UV origin is the source of the ripples.
function waterFan(kit, sides, y, point) {
  for (let side = 0; side < sides; side++) {
    const angles = [side, side + 1].map(i => i * 2 * Math.PI / sides);
    const [a, b] = angles.map(t => [Math.cos(t), Math.sin(t)]);
    kit.tri(WATER, point(0, y, 0), point(a[0], y, a[1]), point(b[0], y, b[1]),
      [0, 1, 0], true, [0, 0], a, b);
  }
}

// A narrow faceted ribbon follows the short ballistic arc from an outlet into the pool.
function waterStream(kit, path, radius) {
  kit.sweep(STREAM, [[radius, 0], [0, radius], [-radius, 0], [0, -radius]], path, { uvScale: 1 });
}

function buildSmallFountain({ radius, inside, foot, lip, water, top, bowl, trim }) {
  const kit = createMeshKit();
  const stone = (profile, sides = 5) => kit.lathe(STONE, profile, sides, { uvScale: .8 });
  const coping = (profile, sides = 5) => kit.lathe(TRIM, profile, sides, { uvScale: 1.2 });
  stone([[radius * .96, foot], [radius, foot + .07], [radius, foot + .15],
    [radius * .974, foot + .19], [radius * .974, lip - .20]]);
  // DFU's GameObjectHelper uses the ARCH3D rim. A projecting stone cap keeps the
  // five sides legible on the object pixel grid within the same street footprint.
  const capOuter = radius * .982, capInner = radius * .875, throat = radius * .855;
  coping([[radius * .974, lip - .20], [radius, lip - .15], [radius, lip - .055], [capOuter, lip]]);
  for (let side = 0; side < 5; side++) {
    const corner = (r, i) => [r * Math.cos(i * 2 * Math.PI / 5), lip, r * Math.sin(i * 2 * Math.PI / 5)];
    const face = [corner(capOuter, side), corner(capOuter, side + 1), corner(capInner, side + 1), corner(capInner, side)];
    const uv = face.map(([x, , z]) => [x * 1.2, z * 1.2]);
    kit.quad(TRIM, face[0], face[1], face[2], face[3], [0, 1, 0], true, uv);
  }
  coping([[capInner, lip], [throat, lip - .055], [throat, lip - .15]]);
  stone([[throat, lip - .15], [inside, water], [inside, foot + .06], [0, foot + .06]]);
  // A stepped plinth supports a narrow shaft and the hollow, overhanging spill bowl.
  stone([[bowl * .53, foot + .06], [bowl * .53, water + .04], [bowl * .39, water + .12],
    [bowl * .29, water + .16], [bowl * .25, top - .48], [bowl * .36, top - .42]], 10);
  coping([[bowl * .36, top - .42], [bowl * .42, top - .41], [bowl * .42, top - .36],
    [bowl * .55, top - .33], [bowl * .92, top - .15], [bowl, top - .09],
    [bowl, top - .035], [bowl * .95, top], [bowl * .84, top],
    [bowl * .77, top - .09], [bowl * .37, top - .21], [0, top - .21]], 10);
  waterFan(kit, 5, water, (x, y, z) => [inside * x, y, inside * z]);
  waterFan(kit, 10, top - .09, (x, y, z) => [bowl * .77 * x, y, bowl * .77 * z]);
  for (const direction of [-1, 1]) {
    const path = [0, .25, .5, .75, 1].map(t =>
      [direction * (bowl * .84 + t * bowl * .62), top - .045 + t * .18 - t * t * (top - water + .18), 0]);
    waterStream(kit, path, .023);
  }
  return finish(kit, [MATERIALS[STONE], trim, MATERIALS[WATER]]);
}

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
  }
  waterFan(kit, SIDES, WATER_Y, (x, y, z) => [CENTRE_X + .83 * RADIUS_X * x, y, .83 * RADIUS_Z * z]);

  const centre = [CENTRE_X, 0, 0];
  kit.lathe(STONE, [[.55, -.24], [.55, -.06], [.46, .03], [.38, .08], [.32, .61], [.38, .70]], SIDES, { centre, uvScale: 1.2 });
  kit.lathe(TRIM, [[.36, .60], [.40, .64], [.40, .72], [.34, .79], [.38, .86], [.30, .91], [0, .91]], SIDES, { centre, uvScale: 1.4 });
  kit.sweep(TRIM, [[.05, 0], [.035, .035], [0, .05], [-.035, .035], [-.05, 0], [-.035, -.035], [0, -.05], [.035, -.035]],
    [[CENTRE_X, .64, .30], [CENTRE_X, .64, .51], [CENTRE_X, .57, .63], [CENTRE_X, .52, .63]]);
  waterStream(kit, [[CENTRE_X, .525, .63], [CENTRE_X, .40, .655],
    [CENTRE_X, .17, .68], [CENTRE_X, WATER_Y - .012, .70]], .030);
  return finish(kit, MATERIALS);
}

export function registerStreetFountain() {
  registerCustomModel(STREET_FOUNTAIN_MODEL, buildStreetFountain, () => true, { climateFree: true });
  for (const [id, shape] of SMALL_FOUNTAINS) {
    registerCustomModel(id, () => buildSmallFountain(shape), () => true, { climateFree: true });
  }
}
