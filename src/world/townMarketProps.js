import { createMeshKit } from './eliteGates/meshKit.js';
import { WORKSHOP_WOOD } from './dungeonWorkshopWood.js';
import { STAINED_PRESS_IRON as IRON } from './dungeonTortureTable.js';
import { blendRgb, image, noiseField, putTexel } from './superDungeon/sdPixelKit.js';

const { beam, boards, endGrain } = WORKSHOP_WOOD;
const WICKER = 146, ROOT_RED = 147, GRAIN = 148, LINEN = 149, TIRED_WOOD = 150;
const LEAF = 126;
const TWINE = 5;
const IDS = new Set(['205:10', '205:28']);
export const isTownMarketProp = record => IDS.has(record);

export function marketPropPaints(paints) {
  const wicker = image(32);
  const shade = noiseField(20510, 5, wicker.width);
  for (let y = 0; y < wicker.height; y++) for (let x = 0; x < wicker.width; x++) {
    const course = y % 6, reed = (x + 5 * Math.floor(y / 6)) % 10;
    const seam = course === 0 || course === 5 ? -.22 : course === 2 ? .14 : 0;
    const crossing = reed < 2 ? -.23 : reed === 3 ? .19 : 0;
    const tone = .47 + (shade(x, y) - .5) * .26 + seam + crossing;
    putTexel(wicker, x, y, blendRgb([62, 43, 27], [153, 119, 72], tone));
  }
  const boardPaint = paints[boards], worn = boardPaint.colors.slice();
  for (let i = 0; i < worn.length; i += 4) {
    worn[i] *= .66;
    worn[i + 1] *= .75;
    worn[i + 2] *= .79;
  }
  const rootPaint = image(16);
  const rootTone = noiseField(20511, 6, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const tone = .42 + rootTone(x, y) * .35 + y / 80;
    putTexel(rootPaint, x, y, blendRgb([106, 72, 45], [190, 163, 107], tone));
  }
  const rootRed = image(16), linen = image(16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const tone = .38 + rootTone(x, y) * .45;
    putTexel(rootRed, x, y, blendRgb([93, 47, 36], [162, 101, 69], tone));
    putTexel(linen, x, y, blendRgb([79, 75, 54], [186, 168, 121], tone));
  }
  return [
    [WICKER, wicker],
    [GRAIN, rootPaint],
    [ROOT_RED, rootRed], [LINEN, linen],
    [TIRED_WOOD, { ...boardPaint, colors: worn }],
  ];
}

const POLYGON = 12;
const tube = radius => Array.from({ length: 6 }, (_, i) => [
  radius * Math.cos(i * Math.PI / 3), radius * Math.sin(i * Math.PI / 3),
]);

function packedBasket(kit) {
  kit.lathe(WICKER, [[0, 0], [.257, 0], [.294, .051], [.393, .23], [.445, .49],
    [.414, .49], [.374, .22], [.271, .088], [0, .088]], POLYGON, { uvScale: 1.8 });
  kit.lathe(endGrain, [[.421, .47], [.45, .475], [.456, .498], [.443, .523], [.415, .521],
    [.402, .504], [.409, .479]], POLYGON, { uvScale: 3.8 });
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, x = Math.cos(a), z = Math.sin(a);
    const path = [[.28, .07], [.361, .18], [.41, .33], [.443, .481]]
      .map(([r, y], row) => [r * x + Math.sin(i * 4 + row) * .008, y, r * z]);
    kit.sweep(WICKER, tube(.008 + (i % 3) * .002), path, { uvScale: 4 });
  }
  const handle = Array.from({ length: 13 }, (_, i) => {
    const angle = i * Math.PI / 12;
    return [.407 * Math.cos(angle), .453 + .514 * Math.sin(angle), 0];
  });
  kit.sweep(endGrain, tube(.0325), handle, { uvScale: 5 });
  for (const [a, b] of [[0, 1], [1, 2], [10, 11], [11, 12]]) {
    kit.sweep(TWINE, tube(.038), [handle[a], handle[b]], { uvScale: 9 });
  }
  for (const [i, [x, y, z, size]] of [[-.205, .41, -.09, .127], [.018, .437, .21, .099],
    [.177, .443, -.166, .137], [.24, .407, .12, .11], [-.205, .404, .14, .111]].entries()) {
    kit.lathe(i % 2 ? ROOT_RED : GRAIN, [[.03, y - .13], [size * .84, y - .1], [size, y],
      [size * .87, y + .08], [size * .25, y + .111], [0, y + .116]], 7, { centre: [x, 0, z], uvScale: 5 });
    for (const sign of [-1, 1]) {
      const root = [x, y + .096, z], tip = [x + sign * .105, y + .184, z + .071];
      const a = [x + sign * .046, y + .129, z + .043], b = [x + sign * .053, y + .157, z + .011];
      for (const facing of [1, -1]) kit.quad(LEAF, root, a, tip, b, [0, facing, 0]);
    }
  }
  kit.sweep(LINEN, [[-.068, -.055], [.052, -.067], [.069, .047], [-.052, .067]],
    [[-.147, .46, -.23], [-.076, .545, -.206], [.017, .61, -.173]], { uvScale: 5 });
}

const WHEEL_X = .016, WHEEL_Y = .327;
function cartWheel(kit, z) {
  const point = (i, scale, depth) => {
    const angle = i * Math.PI * 2 / POLYGON;
    return [WHEEL_X + Math.cos(angle) * .178 * scale, WHEEL_Y + Math.sin(angle) * .327 * scale, z + depth];
  };
  const uv = ([x, y]) => [.5 + (x - WHEEL_X) * 2.53, .5 + (y - WHEEL_Y) * 1.48];
  for (let i = 0; i < POLYGON; i++) {
    const j = i + 1, a = point(i, 1, -.029), b = point(j, 1, -.029);
    const c = point(j, 1, .029), d = point(i, 1, .029);
    const out = [a[0] + b[0] - WHEEL_X * 2, a[1] + b[1] - WHEEL_Y * 2, 0];
    kit.quad(IRON, a, b, c, d, out);
    for (const side of [-1, 1]) {
      const edge = .029 * side, p = point(i, .88, edge), q = point(j, .88, edge);
      const outer = [0, 0, side];
      kit.quad(IRON, point(i, 1, edge), point(j, 1, edge), q, p, outer);
      const innerA = point(i, .71, edge), innerB = point(j, .71, edge);
      kit.quad(TIRED_WOOD, p, q, innerB, innerA, outer, true, [uv(p), uv(q), uv(innerB), uv(innerA)]);
      if (side === 1) kit.quad(TIRED_WOOD, innerA, innerB, point(j, .71, -edge), point(i, .71, -edge), out.map(value => -value));
    }
  }
  const hub = [WHEEL_X, WHEEL_Y, z];
  for (let i = 0; i < POLYGON; i += 2) {
    const a = point(i, .19, 0), b = point(i, .78, 0);
    kit.extrude(beam, [[-.022, -.022], [.022, -.022], [.021, .026], [-.021, .026]], a, b, { uvScale: 4 });
  }
  kit.extrude(beam, tube(.061), [hub[0], hub[1], z - .035], [hub[0], hub[1], z + .035], { uvScale: 4 });
  kit.extrude(IRON, tube(.034), [hub[0], hub[1], z - .046], [hub[0], hub[1], z + .046], { uvScale: 4 });
}

function handcart(kit) {
  for (let i = 0; i < 5; i++) {
    const z = -.232 + i * .093;
    kit.box(i % 2 ? boards : TIRED_WOOD, [-.462, .354, z - .045], [.255, .423, z + .045], { uvScale: 2.7 });
  }
  for (const side of [-1, 1]) {
    const z = side * .245;
    kit.box(beam, [-.475, .311, z - .025], [.323, .382, z + .025], { uvScale: 2.5 });
    for (const [i, y] of [.421, .57, .719].entries()) {
      const offset = i * .007 * side;
      kit.box(i % 2 ? TIRED_WOOD : boards, [-.457 + offset, y, z - .024], [.253 - offset, y + .139, z + .024], { uvScale: 2.6 });
    }
    for (const x of [-.439, .225]) {
      kit.box(beam, [x - .023, .36, z - .032], [x + .023, .918, z + .032], { uvScale: 3 });
      kit.box(IRON, [x - .026, .691, z - .034], [x + .026, .727, z + .034]);
    }
    kit.sweep(beam, [[-.023, -.029], [.023, -.029], [.023, .029], [-.023, .029]],
      [[.214, .427, z], [.352, .518, z + side * .033], [.476, .692, z + side * .055]], { uvScale: 3 });
    for (const x of [-.432, .226]) {
      kit.box(endGrain, [x - .014, .584, z + side * .029 - .007], [x + .014, .614, z + side * .029 + .007]);
    }
    cartWheel(kit, side * .304);
  }
  for (const [i, y] of [.421, .57, .719].entries()) {
    kit.box(i % 2 ? boards : TIRED_WOOD, [-.481, y, -.245], [-.44, y + .143, .245], { uvScale: 2.4 });
  }
  kit.box(beam, [WHEEL_X - .027, WHEEL_Y - .026, -.307], [WHEEL_X + .027, WHEEL_Y + .026, .307]);
  // The front rest keeps the load bed level while the handles are down.
  kit.box(beam, [.208, 0, -.168], [.251, .363, -.127], { uvScale: 3.3 });
  kit.box(beam, [.208, 0, .127], [.251, .363, .168], { uvScale: 3.3 });
}

export function buildTownMarketProp(archive, record) {
  const kit = createMeshKit();
  if (record === '205:10') packedBasket(kit);
  else handcart(kit);
  return kit.pack(archive);
}
