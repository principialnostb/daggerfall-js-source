import { paintFamily } from './paintFamily.js';
import { buildCourtyardFountain, courtyardFountainPaints, COURTYARD_PAINT } from './courtyardFountain.js';
import { mapCourtyardStone } from './courtyardFountainStone.js';
import { createMeshKit } from './eliteGates/meshKit.js';
import { WORKSHOP_WOOD } from './dungeonWorkshopWood.js';
import { blendRgb, image, noiseField, putTexel } from './superDungeon/sdPixelKit.js';

const COPPER = 134, IRON = 135, SHINGLES = 136, FITTINGS = 137;
const ROPE = 5;
const WELL_STONE = 0, WELL_LIP = 1;
export const WELL_RIM_RADIUS = .442;
const { beam, boards, endGrain } = WORKSHOP_WOOD;
const { stone, water } = COURTYARD_PAINT;

const waterSourceMetalAndRoof = [
  [COPPER, [35, 51, 45], [103, 120, 91]],
  [IRON, [44, 42, 39], [118, 110, 100]],
  [SHINGLES, [69, 48, 36], [147, 109, 73]],
  [FITTINGS, [52, 44, 31], [125, 105, 72]],
];
export const placedWaterSourcePaints = paintFamily([
  ...courtyardFountainPaints.recipes,
  ...waterSourceMetalAndRoof.map(([record, low, high]) => [record, () => waterSourcePaint(record, low, high)]),
]);

function waterSourcePaint(record, low, high) {
  const size = 32, paint = image(size);
  const patina = noiseField(record, 6, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let tone = .52 + (patina(x, y) - .5) * .52;
    if (record === SHINGLES) {
      const row = y % 8;
      const tile = (x + ((y >> 3) % 2) * 4) % 8;
      tone += row === 0 || tile === 0 ? -.30 : row === 1 ? .14 : 0;
      tone += (.5 - patina(x - tile, y - row)) * .36;
    }
    putTexel(paint, x, y, blendRgb(low, high, Math.round(tone * 17) / 17));
  }
  return paint;
}

const octagon = (radius, y, side) => {
  const angle = side * Math.PI / 4;
  return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
};

const WELL_POST = .427;
const AXLE_Y = .481;
const ROOF_EAVE = .656;
const ROOF_RIDGE = .973;
const ROOF_SPAN = .418;
const ROOF_LENGTH = .495;

function roundProfile(radius, sides = 8) {
  return Array.from({ length: sides }, (_, side) => {
    const angle = side * Math.PI * 2 / sides;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

function wellCanopy(kit) {
  const plank = [[-.023, -.025], [.023, -.025], [.023, .025], [-.023, .025]];
  for (const x of [-WELL_POST, WELL_POST]) {
    kit.box(beam, [x - .034, 0, -.04], [x + .034, .697, .04], { uvScale: 3 });
    kit.box(beam, [x - .032, .637, -.365], [x + .032, .669, .365], { uvScale: 3 });
    kit.sweep(beam, plank, [[x, .563, 0], [x * .75, .653, 0]]);
    for (const side of [-1, 1]) {
      kit.sweep(beam, plank, [[x, .555, side * .018], [x, .656, side * .228]]);
      kit.sweep(beam, plank, [[x, .639, side * ROOF_SPAN], [x, ROOF_RIDGE - .021, 0]]);
    }
  }
  kit.box(beam, [-.482, .919, -.023], [.482, .962, .023], { uvScale: 3 });
  for (const side of [-1, 1]) {
    const roof = (x, t, lift = 0) =>
      [x, ROOF_EAVE + (ROOF_RIDGE - ROOF_EAVE) * t + lift, side * ROOF_SPAN * (1 - t)];
    const out = [0, 1, side];
    kit.quad(boards, roof(-ROOF_LENGTH, 0, -.017), roof(ROOF_LENGTH, 0, -.017),
      roof(ROOF_LENGTH, 1, -.017), roof(-ROOF_LENGTH, 1, -.017), [0, -1, -side], true);
    for (let course = 0; course < 5; course++) {
      const low = course / 5, high = (course + 1) / 5;
      const offset = course % 2 ? .13 : 0;
      const left = roof(-ROOF_LENGTH, low + .003, .014), right = roof(ROOF_LENGTH, low + .003, .014);
      kit.quad(SHINGLES, left, right, roof(ROOF_LENGTH, high, .003), roof(-ROOF_LENGTH, high, .003),
        out, true, [[offset, 0], [offset + 1.75, 0], [offset + 1.75, .24], [offset, .24]]);
      kit.quad(SHINGLES, roof(-ROOF_LENGTH, low), roof(ROOF_LENGTH, low), right, left, [0, 0, side], true,
        [[offset, .055], [offset + 1.75, .055], [offset + 1.75, .012], [offset, .012]]);
    }
    for (const x of [-ROOF_LENGTH, ROOF_LENGTH]) {
      kit.sweep(beam, plank.map(([u, v]) => [u * .46, v * .63]), [roof(x, 0, -.008), roof(x, 1, -.012)]);
    }
    kit.quad(SHINGLES, [-.498, .977, side * .044], [.498, .977, side * .044],
      [.498, 1, 0], [-.498, 1, 0], out, true, [[0, .035], [1.75, .035], [1.75, .21], [0, .21]]);
  }
}

function wellDrawingGear(kit) {
  const ropeRadius = .007;
  const rope = roundProfile(ropeRadius, 5);
  const drumRadius = .045;
  const coilRadius = drumRadius + ropeRadius * .65;
  const hookX = .015, hookZ = coilRadius;
  const hookY = .277, bucketTop = .223;
  kit.extrude(beam, roundProfile(.028), [-.459, AXLE_Y, 0], [.469, AXLE_Y, 0], { uvScale: 3 });
  kit.extrude(beam, roundProfile(drumRadius), [-.115, AXLE_Y, 0], [.071, AXLE_Y, 0], { uvScale: 5 });
  for (const x of [-WELL_POST, WELL_POST]) {
    kit.extrude(IRON, roundProfile(.036), [x - .032, AXLE_Y, 0], [x + .032, AXLE_Y, 0]);
  }
  // The free end leaves the wrapped drum tangentially and meets the bucket's bail.
  const turns = 6;
  const coil = Array.from({ length: turns * 8 + 1 }, (_, step) => {
    const t = step / (turns * 8), angle = -t * turns * Math.PI * 2;
    return [-.086 + (hookX + .086) * t, AXLE_Y + Math.sin(angle) * coilRadius, Math.cos(angle) * coilRadius];
  });
  kit.sweep(ROPE, rope, [...coil, [hookX, hookY, hookZ]], { uvScale: 16 });
  kit.lathe(ROPE, [[.004, hookY - .006], [.012, hookY - .003], [.011, hookY + .009], [.006, hookY + .012]],
    7, { centre: [hookX, 0, hookZ] });

  const bucket = { centre: [hookX, 0, hookZ], uvScale: 12 };
  kit.lathe(boards, [[0, .143], [.048, .143], [.066, bucketTop], [.057, bucketTop],
    [.044, .156], [0, .156]], 9, bucket);
  kit.lathe(IRON, [[.049, .152], [.053, .153], [.055, .164], [.052, .166]], 9, bucket);
  kit.lathe(IRON, [[.062, .205], [.066, .206], [.068, .216], [.065, .217]], 9, bucket);
  const bail = Array.from({ length: 9 }, (_, i) => {
    const angle = i * Math.PI / 8;
    return [hookX + .065 * Math.cos(angle), bucketTop - .005 + .059 * Math.sin(angle), hookZ];
  });
  kit.sweep(IRON, roundProfile(.006, 5), bail, { uvScale: 13 });

  kit.sweep(IRON, roundProfile(.014, 6), [[.457, AXLE_Y, 0], [.474, AXLE_Y, 0],
    [.474, .457, .063], [.474, .429, .112], [.49, .429, .112]]);
  kit.extrude(beam, roundProfile(.024), [.452, .429, .112], [.498, .429, .112], { uvScale: 8 });
}

function buildCoveredWell(archive) {
  const kit = createMeshKit();
  // The inner face descends below the rim to a small dark pool.
  kit.lathe(WELL_STONE, [[0, 0], [.418, 0], [.435, .032], [.432, .112], [.425, .117], [.432, .124],
    [.423, .226], [WELL_RIM_RADIUS, .253],
    [WELL_RIM_RADIUS, .281]], 8);
  kit.lathe(WELL_LIP, [[WELL_RIM_RADIUS, .281], [.411, .313], [.337, .313], [.322, .293],
    [.319, .066], [0, .066]], 8);
  for (let side = 0; side < 8; side++) {
    const y = .081;
    const a = octagon(.3193, y, side), b = octagon(.3193, y, side + 1);
    const uv = ([x, , z]) => [x / .3193, z / .3193];
    kit.tri(water, [0, y, 0], a, b, [0, 1, 0], true, [0, 0], uv(a), uv(b));
  }

  wellCanopy(kit);
  wellDrawingGear(kit);

  const mesh = kit.pack(archive);
  for (const slot of mesh.subMeshes) {
    if (slot.textureRecord === water) {
      slot.fountainWater = 1;
      slot.fountainShelter = .72;
    }
    if (slot.textureRecord === beam) {
      const end = slot.startIndex + slot.primitiveCount * 3;
      for (let i = slot.startIndex * 2; i < end * 2; i += 2) {
        const u = mesh.uvs[i];
        mesh.uvs[i] = mesh.uvs[i + 1];
        mesh.uvs[i + 1] = u;
      }
    }
    if (slot.textureRecord !== WELL_STONE && slot.textureRecord !== WELL_LIP) continue;
    mapCourtyardStone(mesh, slot, slot.textureRecord === WELL_STONE ? 'wall' : 'coping', 8, { wallBottom: .025, wallHeight: .195 });
    slot.textureRecord = stone;
  }
  return mesh;
}

// The narrow body, bent outlet and curved lever remain readable from either side.
function buildHandPump(archive, metal) {
  const kit = createMeshKit();
  const centre = [.015, 0, 0];
  kit.lathe(metal, [[0, 0], [.128, 0], [.149, .021], [.149, .069], [.119, .084],
    [.106, .174], [.101, .59], [.122, .68], [.122, .766], [.097, .797],
    [.077, .906], [.102, .931], [.102, .97], [.076, 1], [0, 1]], 8, { centre, uvScale: 3 });
  kit.lathe(FITTINGS, [[.112, .092], [.127, .093], [.127, .115], [.112, .119]], 8, { centre });
  kit.sweep(metal, roundProfile(.067), [[-.064, .729, 0], [-.225, .727, 0], [-.297, .691, 0], [-.32, .608, 0]], { uvScale: 4 });
  kit.lathe(metal, [[.040, .604], [.077, .604], [.077, .626], [.062, .636]], 8,
    { centre: [-.32, 0, 0] });
  kit.extrude(FITTINGS, roundProfile(.036), [.035, .932, -.108], [.035, .932, .108]);
  kit.sweep(FITTINGS, roundProfile(.028), [[.054, .932, .039], [.196, .904, .06], [.235, .797, .086],
    [.243, .609, .113], [.286, .468, .143], [.354, .413, .17], [.398, .346, .185]], { uvScale: 4 });
  kit.sweep(beam, roundProfile(.042), [[.365, .395, .173], [.404, .337, .187], [.398, .306, .194]]);
  return kit.pack(archive);
}

const MODELS = new Map([
  ['212:0', buildCoveredWell],
  ['212:2', buildCourtyardFountain],
  ['212:3', archive => buildCourtyardFountain(archive, { dry: true })],
  ['212:8', archive => buildHandPump(archive, COPPER)],
  ['212:9', archive => buildHandPump(archive, IRON)],
]);

export const isPlacedWaterSource = record => MODELS.has(record);
export const buildPlacedWaterSource = (archive, record) => MODELS.get(record)?.(archive);
