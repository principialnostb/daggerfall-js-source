import { createMeshKit } from './eliteGates/meshKit.js';
import { WORKSHOP_WOOD } from './dungeonWorkshopWood.js';
import { blendRgb, image, noiseField, putTexel } from './superDungeon/sdPixelKit.js';

const { boards, beam, endGrain } = WORKSHOP_WOOD;
const IRON = 138, CREST = 139, LEAF = 140, PAINTED_WOOD = 141;
const IRON_SECTION = [[-.021, -.015], [.021, -.015], [.024, -.008], [.024, .008], [.021, .015], [-.021, .015], [-.024, .008], [-.024, -.008]];
const SIGNS = new Set(['212:4', '212:5', '212:6']);
export const isTownSign = record => SIGNS.has(record);

export function townSignPaints() {
  return [
    [IRON, [38, 34, 30], [137, 119, 102]],
    [CREST, [92, 65, 39], [177, 144, 93]],
    [LEAF, [45, 54, 30], [105, 111, 57]],
    [PAINTED_WOOD, [52, 57, 47], [114, 105, 81]],
  ].map(([record, dark, light]) => {
    const paint = image(32), pattern = noiseField(record, 7, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const wear = Math.round((.22 + pattern(x, y) * .62) * 12) / 12;
      putTexel(paint, x, y, blendRgb(dark, light, wear));
    }
    return [record, paint];
  });
}

function scroll(kit, x, y, radius, from, turn, lead = []) {
  const spiral = Array.from({ length: 19 }, (_, i) => {
    const t = i / 18, angle = from + t * turn;
    const r = radius * (1 - .75 * t);
    return [x + r * Math.cos(angle), y + r * Math.sin(angle), 0];
  });
  kit.sweep(IRON, IRON_SECTION, [...lead, ...spiral], { uvScale: 4 });
}

function post(kit, x, top) {
  kit.box(beam, [x - .054, 0, -.048], [x + .054, top - .028, .048], { uvScale: 3 });
  kit.lathe(endGrain, [[.073, top - .042], [.073, top - .025], [.046, top], [0, top]],
    4, { centre: [x, 0, 0], a0: Math.PI / 4, a1: Math.PI * 9 / 4, uvScale: 4 });
}

function faceBolt(kit, x, y, z) {
  kit.box(IRON, [x - .017, y - .008, z - .009], [x + .017, y + .008, z + .009]);
}

function climbingIvy(kit) {
  const trail = Array.from({ length: 13 }, (_, i) => {
    const f = i / 12;
    return [-.383 + Math.sin(i * 1.11) * .044, .09 + .71 * f, Math.cos(i * .7) * .065];
  });
  kit.sweep(beam, [[-.009, 0], [0, -.009], [.009, 0], [0, .009]], trail, { uvScale: 5 });
  for (const [i, root] of trail.entries()) {
    if (i === trail.length - 1) break;
    const [x, y, z] = root, sign = i % 2 ? -1 : 1;
    const tip = [x + sign * .111, y + .026, z + sign * .038];
    const a = [x + sign * .049, y - .017, z + sign * .023];
    const b = [x + sign * .052, y + .044, z - sign * .012];
    const ridge = [x + sign * .052, y + .016, z + sign * .035];
    for (const out of [[0, 0, 1], [0, 0, -1]]) {
      kit.tri(LEAF, root, a, ridge, out);
      kit.tri(LEAF, a, tip, ridge, out);
      kit.tri(LEAF, tip, b, ridge, out);
      kit.tri(LEAF, b, root, ridge, out);
    }
  }
}

function hangingSign(kit, ivy) {
  post(kit, -.383, .9);
  kit.box(IRON, [-.435, .741, -.054], [-.32, .811, .054], { uvScale: 4 });
  kit.sweep(IRON, IRON_SECTION, [[-.415, .787, 0], [.434, .787, 0]], { uvScale: 4 });
  kit.extrude(IRON, [[-.026, -.024], [.029, -.024], [.029, .024], [-.026, .024]],
    [.403, .787, 0], [.457, .787, 0]);
  scroll(kit, .315, .857, .074, 0, Math.PI * 2.13,
    [[-.341, .872, 0], [-.248, .91, 0], [-.143, .899, 0], [-.024, .851, 0], [.14, .805, 0], [.319, .796, 0]]);
  scroll(kit, -.313, .932, .064, 0, Math.PI * 2.04, [[-.389, .789, 0], [-.384, .902, 0]]);
  // Each broad face is built from the same three boards and has its own fasteners.
  for (let i = 0; i < 3; i++) {
    const y = .429 + i * .083;
    const ends = [.013, -.008, .005];
    const edges = [[-.195 + ends[i], -.055], [.366 + ends[2 - i], -.055], [.382, .041], [.359, .062],
      [-.184, .059], [-.198, .028]];
    kit.prism(boards, edges, y, y + .079, { uvScale: 2.5, bottom: true });
  }
  for (const x of [-.151, .334]) {
    kit.box(IRON, [x - .023, .431, -.061], [x + .023, .674, .061]);
    kit.sweep(IRON, IRON_SECTION, [[x, .782, 0], [x, .745, .022], [x, .687, .024], [x, .653, .065]]);
    for (const z of [-.067, .067]) {
      faceBolt(kit, x, .455, z);
      faceBolt(kit, x, .651, z);
    }
  }
  for (const sign of [-1, 1]) {
    const z = sign * .057, out = [0, 0, sign];
    const diamond = [[.095, .625, z], [.23, .566, z], [.095, .507, z], [-.04, .566, z]];
    for (let i = 0; i < 4; i++) {
      kit.tri(CREST, diamond[i], diamond[(i + 1) % 4], [.095, .566, z + sign * .038], out);
    }
    kit.box(CREST, [.074, .554, sign > 0 ? .093 : -.098], [.116, .579, sign > 0 ? .098 : -.093]);
  }
  if (ivy) climbingIvy(kit);
}

function arrowSign(kit) {
  post(kit, 0, 1);
  for (const [i, d] of [1, -1, 1, -1].entries()) {
    const y = .766 - i * .119 + Math.sin(i * 4) * .007;
    const wear = i * .012;
    const outline = [[-.37 + wear, -.048], [.316, -.048], [.47 - wear, .004], [.316, .048], [-.374 + wear, .039]];
    const place = ([x, lift], z) => [x * d, y + lift + x * (i % 2 ? .035 : -.02), z + .063 * d];
    const material = i % 2 ? boards : PAINTED_WOOD;
    for (let n = 0; n < outline.length; n++) {
      const n2 = (n + 1) % outline.length, a = outline[n], b = outline[n2];
      const out = [d * (b[1] - a[1]), a[0] - b[0], 0];
      kit.quad(beam, place(a, -.037), place(b, -.037), place(b, .037), place(a, .037), out);
      for (const z of [-.037, .037]) {
        const uv = ([x, h]) => [x * 2 + 1, h * 4 + .5];
        kit.tri(material, place([0, 0], z), place(a, z), place(b, z), [0, 0, Math.sign(z)], true, [1, .5], uv(a), uv(b));
      }
    }
    for (const z of [-.041, .041]) {
      faceBolt(kit, -.048, y, z + .063 * d);
      faceBolt(kit, .048, y, z + .063 * d);
    }
  }
}

export function buildTownSign(archive, record) {
  const kit = createMeshKit();
  if (record === '212:6') arrowSign(kit);
  else hangingSign(kit, record === '212:4');
  const mesh = kit.pack(archive);
  for (const slot of mesh.subMeshes) {
    if (slot.textureRecord !== beam) continue;
    const end = slot.startIndex + slot.primitiveCount * 3;
    for (let i = slot.startIndex * 2; i < end * 2; i += 2) {
      const u = mesh.uvs[i];
      mesh.uvs[i] = mesh.uvs[i + 1];
      mesh.uvs[i + 1] = u;
    }
  }
  return mesh;
}
