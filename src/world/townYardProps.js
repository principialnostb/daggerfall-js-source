import { createMeshKit } from './eliteGates/meshKit.js';
import { WORKSHOP_WOOD } from './dungeonWorkshopWood.js';
import { SLAB_STONE, slabStonePaint } from './dungeonSlabStone.js';
import { blendRgb, image, noiseField, putTexel, rng } from './superDungeon/sdPixelKit.js';

const { boards, beam, endGrain } = WORKSHOP_WOOD;
const BARK = 143, SHALE = 144, SHADED_STONE = 145;
const ROPE = 5, SACK = 0, STRAW = 125, DARK_STONE = 128;
const CLOTH = 151, NET_BODY = 152, MOSS = 153;
const IDS = new Set(['212:7', '212:11', '212:12', '211:20', '211:3']);
export const isTownYardProp = record => IDS.has(record);

export function yardPropPaints(paints) {
  const wood = paints[beam], colors = wood.colors.slice();
  for (let i = 0; i < colors.length; i += 4) {
    const ring = (i / 4) % wood.width;
    const chip = ring % 19 < 2 ? .13 : 0;
    colors[i] *= .75 - chip;
    colors[i + 1] *= .73 - chip;
    colors[i + 2] *= .75 - chip;
  }
  const cloth = image(32), net = image(32), moss = image(32);
  const stain = noiseField(11, 7, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const tone = .29 + stain(x, y) * .54 + ((x - y) % 5 === 0 ? .075 : 0);
    putTexel(cloth, x, y, blendRgb([68, 45, 34], [134, 100, 70], tone));
    putTexel(net, x, y, blendRgb([25, 32, 32], [61, 74, 69], tone));
    putTexel(moss, x, y, blendRgb([57, 67, 45], [100, 111, 76], tone));
  }
  return [
    [CLOTH, cloth], [NET_BODY, net], [MOSS, moss],
    [BARK, { ...wood, colors }],
    [SHALE, slabStonePaint([65, 66, 61])],
    [SHADED_STONE, slabStonePaint([84, 79, 68])],
  ];
}

const grainOffset = x => Math.sin(x * 12) * .075;

// Split logs expose pale end grain and a plane along the split.
function splitLog(kit, x, y, depth, length, w, h, tilt, reverse) {
  const flat = reverse ? [[-.51, -.13], [-.34, -.43], [.41, -.39], [.51, .03], [.27, .35], [-.25, .46]]
    : [[-.5, -.39], [.14, -.50], [.51, -.31], [.39, .18], [-.1, .43], [-.42, .34]];
  const shape = flat.map(([u, v]) => [x + (u + v * tilt) * w, y + v * h]);
  const points = shape.map(([u, v]) => [u, v, depth - length / 2]);
  const back = shape.map(([u, v], i) => [u + tilt * .054, v + (i % 2 ? .014 : 0), depth + length / 2]);
  for (const [i, a] of points.entries()) {
    const j = (i + 1) % points.length;
    const b = points[j], out = [b[1] - a[1], a[0] - b[0], 0];
    const material = (i === 4 || i === 5) !== reverse ? boards : BARK;
    const u = Math.hypot(b[0] - a[0], b[1] - a[1]) * 3;
    kit.quad(material, a, b, back[j], back[i], out, true, [[0, 0], [0, u], [1.7, u], [1.7, 0]]);
  }
  const uv = ([u, v]) => [.47 + grainOffset(x) + (u - x) / w * .79, .49 + tilt * .24 + (v - y) / h * .81];
  for (const [side, end] of [[-1, points], [1, back]]) {
    for (let i = 1; i < end.length - 1; i++) {
      kit.tri(endGrain, end[0], end[i], end[i + 1], [0, 0, side], true, uv(end[0]), uv(end[i]), uv(end[i + 1]));
    }
  }
}

function woodPile(kit, loose) {
  const random = rng(loose ? 512 : 511);
  for (const [course, count] of [4, 4, 3, 2].entries()) {
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * .206 + (random() - .5) * .036 + (course % 2 ? .035 : -.018);
      const length = .66 + random() * .19;
      const depth = (random() - .5) * (loose ? .24 : .10);
      splitLog(kit, x, .125 + course * .205, depth, length,
        .188 + random() * .032, .25 + random() * .052, (random() - .5) * .31, (i + course) % 5 === 0);
    }
  }
}

// Flatter, chipped facets keep the heap readable as stone at street distance.
function looseStone(kit, rand, rec, x, y, z, rx, h, rz) {
  const twist = rand() * Math.PI;
  const radii = Array.from({ length: 6 }, () => .86 + rand() * .25);
  const rings = [[.73, 0], [1, .32], [.88, .73], [.47, 1]].map(([width, level]) =>
    radii.map((radius, i) => {
      const t = twist + i * Math.PI / 3;
      return [x + Math.cos(t) * rx * width * radius, y + level * h + (i % 3) * h * .044,
        z + Math.sin(t) * rz * width * radius];
    }));
  for (let row = 1; row < rings.length; row++) {
    for (let side = 0; side < radii.length; side++) {
      const next = (side + 1) % radii.length, angle = twist + (side + .5) * Math.PI / 3;
      kit.quad(rec, rings[row - 1][side], rings[row - 1][next], rings[row][next], rings[row][side],
        [Math.cos(angle), .25, Math.sin(angle)], true);
    }
  }
  const top = rings.at(-1);
  for (let i = 1; i < top.length - 1; i++) kit.tri(rec, top[0], top[i], top[i + 1], [0, 1, 0]);
}

function stoneHeap(kit) {
  const rand = rng(0x7114);
  const paints = [DARK_STONE, SHALE, SHADED_STONE, SLAB_STONE];
  for (const [layer, [count, radius]] of [[10, .36], [8, .244], [4, .135], [2, .065]].entries()) {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * (i + layer * .41) / count, scale = .82 + rand() * .26;
      const mossy = layer === 0 && i % 4 === 1;
      looseStone(kit, rand, mossy ? MOSS : paints[(i + layer * 3) % paints.length],
        Math.cos(angle) * radius * scale + layer * .025, layer * .139, Math.sin(angle) * radius * .78 * scale,
        .085 + rand() * .083, .15 + rand() * .19, .066 + rand() * .075);
    }
  }
}

const TWINE = [[-.014, 0], [0, -.014], [.014, 0], [0, .014]];
const NET_STRAND = [[-.004, 0], [0, -.004], [.004, 0], [0, .004]];

function bundledNet(kit) {
  const ribs = 15;
  const profile = [[.475, .04], [.407, .14], [.333, .28], [.274, .46], [.182, .64], [.091, .76], [.038, .81]];
  const rings = profile.map(([r, y], row) => Array.from({ length: ribs }, (_, i) => {
    const a = (i + row * .46) * Math.PI * 2 / ribs;
    const uneven = 1 + Math.sin(i * 2.6 + row * .9) * .097;
    return [Math.cos(a) * r * uneven + .017 * row, y + Math.sin(a * 3 + row) * .034, Math.sin(a) * r * .76 * uneven];
  }));
  for (let row = 1; row < rings.length; row++) {
    const lower = rings[row - 1], upper = rings[row];
    for (let i = 0; i < ribs; i++) {
      const j = (i + 1) % ribs;
      const half = (a, b, lift = 0) => a.map((value, axis) => (value + b[axis]) / 2 + (axis === 1 ? lift : 0));
      kit.quad(NET_BODY, lower[i], lower[j], upper[j], upper[i], [lower[i][0] - .04, .14, lower[i][2]]);
      for (const end of [upper[i], upper[j]]) {
        const lift = ([x, y, z]) => [x + (x - .05) * .038, y + .013, z * 1.038];
        kit.sweep(ROPE, NET_STRAND, [lift(lower[i]), lift(half(lower[i], end, -.016)), lift(end)], { uvScale: 8 });
      }
    }
  }
  const top = rings.at(-1);
  for (let i = 1; i < top.length - 1; i++) kit.tri(NET_BODY, top[0], top[i], top[i + 1], [0, 1, 0]);
  const edge = [...rings[0], [.45, .034, -.24], [.51, .039, -.29], [.505, .04, -.35], [.438, .03, -.36], [.396, .035, -.29]];
  kit.sweep(ROPE, TWINE, edge, { uvScale: 8 });
  for (const [x, z] of [[-.31, .19], [.27, .24], [.466, -.30]]) {
    kit.extrude(endGrain, [[-.026, -.034], [.031, -.027], [.027, .034], [-.035, .028]],
      [x - .039, .074, z], [x + .032, .069, z + .045]);
  }
}

function strawFringe(kit, roots, outward) {
  for (const [i, [x, y, z]] of roots.entries()) {
    const f = i % 4;
    const a = [x - .018, y, z], b = [x + .018, y + .016, z + .01];
    const tip = [x + outward[0] * (.071 + f * .018), y + outward[1] * (.046 + f * .016), z + outward[2] * (.05 + f * .012)];
    kit.tri(STRAW, a, b, tip);
    kit.tri(STRAW, a, tip, b);
  }
}

function scarecrow(kit) {
  kit.sweep(beam, [[-.03, -.031], [.031, -.031], [.033, .033], [-.031, .029]],
    [[-.018, 0, 0], [0, .61, 0], [.029, .876, 0]], { uvScale: 2 });
  kit.sweep(beam, [[-.026, -.032], [.026, -.032], [.026, .032], [-.026, .032]],
    [[-.447, .704, .02], [.019, .677, 0], [.439, .622, -.018]]);
  kit.lathe(CLOTH, [[0, .407], [.136, .43], [.156, .49], [.146, .59], [.172, .683],
    [.117, .728], [.057, .732], [0, .732]], 7, { uvScale: 4 });
  for (const [i, y] of [.58, .64, .683].entries()) {
    kit.box(ROPE, [.022, y, .131 + i * .006], [.049, y + .019, .151 + i * .006]);
  }
  kit.lathe(ROPE, [[.145, .535], [.151, .541], [.152, .558], [.143, .564]], 7);
  kit.lathe(SACK, [[0, .743], [.075, .755], [.108, .825], [.093, .921], [.062, .952], [0, .965]],
    7, { centre: [.025, 0, .026], uvScale: 5 });
  kit.lathe(STRAW, [[.083, .878], [.179, .884], [.178, .899], [.105, .911], [.083, .972], [0, .973]],
    8, { centre: [.024, 0, .012], uvScale: 4 });
  for (const [side, y] of [[-1, .71], [1, .634]]) {
    const x = side * .358;
    const cuff = [[-.058, -.054], [.046, -.058], [.052, .041], [-.043, .055]];
    kit.extrude(CLOTH, cuff, [side * .105, .674, 0], [x, y - .008, .008], { uvScale: 3 });
    kit.sweep(ROPE, TWINE, [[x, y - .019, -.045], [x, y - .037, .018],
      [x, y + .001, .052], [x, y + .035, .012], [x, y + .012, -.042]], { closed: true });
    strawFringe(kit, Array.from({ length: 7 }, (_, i) =>
      [x, y + (i % 3 - 1) * .032, (i - 3) * .015]), [side, side < 0 ? .30 : -.60, .47]);
  }
  strawFringe(kit, Array.from({ length: 12 }, (_, i) => [
    Math.cos(i * Math.PI / 6) * .122, .455, Math.sin(i * Math.PI / 6) * .117,
  ]), [.24, -1, .17]);
}

export function buildTownYardProp(archive, record) {
  const kit = createMeshKit();
  if (record === '211:3') stoneHeap(kit);
  else if (record === '212:7') bundledNet(kit);
  else if (record === '211:20') scarecrow(kit);
  else woodPile(kit, record === '212:12');
  const mesh = kit.pack(archive);
  // Vertex profiles let these irregular objects settle over the authored base.
  let foot = Infinity, top = -Infinity;
  for (let i = 1; i < mesh.positions.length; i += 3) {
    foot = Math.min(foot, mesh.positions[i]);
    top = Math.max(top, mesh.positions[i]);
  }
  for (let i = 1; i < mesh.positions.length; i += 3) mesh.positions[i] = (mesh.positions[i] - foot) / (top - foot);
  return mesh;
}
