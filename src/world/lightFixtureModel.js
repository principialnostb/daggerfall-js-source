// Original fixture geometry, in fractions of the authored flat height.
import { MeshBench, box, prism } from './ships/galleonMesh.js';
import { dfLook, lookSeed } from './dfLook.js';
import { TORCH_ARCHIVE, finishTorchMesh } from './torchModel.js';

const IRON = 3, BRASS = 10, WAX = 11, AMBER = 12, DARK_GLASS = 14;
const FORGED = 15, EDGE = 16, HONEY_PANE = 17, CLOTH = 19, INLAY = 20, BONE = 21;
export const FIXTURE_PAINT = new Map([
  [BRASS, [131, 94, 40]], [WAX, [192, 168, 112]],
  [AMBER, [255, 174, 59]], [DARK_GLASS, [39, 62, 65]],
  [FORGED, [55, 48, 40]], [EDGE, [91, 71, 49]],
  [HONEY_PANE, [222, 132, 48]], [CLOTH, [94, 37, 23]], [INLAY, [127, 82, 41]], [BONE, [183, 151, 101]],
]);
export const fixtureEmits = (record) => record === AMBER || record === HONEY_PANE;

const fixtures = new Map([
  [0, ['brazier', .33]], [19, ['brazier', .22, true]],
  [2, ['candle', .17]], [3, ['candle', .18]], [4, ['candle', .27]], [5, ['candle', .25, true]],
  [7, ['chandelier', .33, 6, false]], [9, ['chandelier', .23, 10, true]],
  [10, ['chandelier', .23, 10, false]], [23, ['chandelier', .33, 8, true]],
  [8, ['cage', .27]], [11, ['skull', .21]],
  [12, ['vessel', .29, DARK_GLASS]], [13, ['arched', .29]],
  [14, ['post', .09, AMBER]], [15, ['post', .09, AMBER, true]],
  [21, ['post', .07, AMBER, true]], [28, ['post', .09, AMBER, true]], [29, ['post', .08, AMBER]],
  [22, ['lantern', .11, .36]], [24, ['lantern', .055, .16]],
  [25, ['lantern', .082, .24]], [26, ['lantern', .107, .35]], [27, ['lantern', .20, .70]],
]);
export const fixtureRecord = (archive, record) => {
  if (archive === 200 && record >= 7 && record <= 9) return record + 17;
  return archive === 210 && fixtures.has(record) ? record : null;
};
export const isHangingFixture = (record) => ['chandelier', 'vessel', 'lantern', 'cage', 'skull', 'arched'].includes(fixtures.get(record)?.[0]);

function column(b, material, bottom, top, low, high = low, sides = 8) {
  prism(b, material, [0, bottom, 0], [0, top, 0], low, high, sides);
}

function chain(b, start, end, width, count = Math.max(1, Math.ceil((end - start) / (width * 2.4))), material = IRON) {
  const step = (end - start) / count;
  for (let i = 0; i < count; i++) {
    const y = start + (i + .5) * step;
    const xAxis = i % 2 === 0;
    for (const sign of [-1, 1]) {
      const x = xAxis ? sign * width : 0, z = xAxis ? 0 : sign * width;
      box(b, material, [x, y, z], [width * .32, step * .52, width * .32]);
      box(b, material, [0, y + sign * step * .44, 0], xAxis
        ? [width, step * .15, width * .32] : [width * .32, step * .15, width]);
    }
  }
}

function waxCandle(b, x, y, z, height, radius) {
  prism(b, WAX, [x, y, z], [x, y + height, z], radius, radius * .87, 7);
  prism(b, IRON, [x, y + height, z], [x, y + height + radius, z], radius * .18, radius * .15, 4);
  return { at: [x, y + height, z], scale: radius * 4.5 };
}

function lantern(b, bottom, height, radius, glow, round) {
  const top = bottom + height;
  const sides = round ? 10 : 6;
  column(b, BRASS, bottom, bottom + height * .12, radius * .73, radius, sides);
  column(b, glow, bottom + height * .10, top - height * .15, radius * .88, radius * .88, sides);
  column(b, BRASS, top - height * .15, top, radius, radius * .35, sides);
  for (let i = 0; i < sides; i++) {
    const a = i * Math.PI * 2 / sides;
    const x = Math.cos(a) * radius * .89, z = Math.sin(a) * radius * .89;
    prism(b, IRON, [x, bottom + height * .09, z], [x, top - height * .12, z], radius * .12, radius * .10, 4);
  }
}

function polar(radius, y, step, sides) {
  const a = step * Math.PI * 2 / sides;
  return [radius * Math.cos(a), y, radius * Math.sin(a)];
}

const QUAD_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

function band(b, material, low, high, sides = 12, inward = false) {
  for (let i = 0; i < sides; i++) {
    const facing = polar(inward ? -1 : 1, 0, i + .5, sides);
    if (low[1] === high[1]) facing[1] = inward ? -1 : 1;
    const a = polar(...low, i, sides), c = polar(...high, i, sides);
    b.quad(material, a, polar(...low, i + 1, sides), polar(...high, i + 1, sides), c, QUAD_UV, facing);
  }
}

function forgedBowl(b, radius, bottom, lip, sides = 12) {
  const waist = bottom + (lip - bottom) * .64;
  band(b, FORGED, [radius * .42, bottom], [radius * .88, waist], sides);
  band(b, FORGED, [radius * .88, waist], [radius, lip - .018], sides);
  band(b, EDGE, [radius, lip - .018], [radius, lip], sides);
  band(b, EDGE, [radius, lip], [radius * .88, lip], sides);
  band(b, IRON, [radius * .88, lip], [radius * .54, waist], sides, true);
  column(b, IRON, bottom, waist, radius * .42, radius * .54, sides);
  return waist;
}

function forgedPath(b, material, points, thickness) {
  for (let i = 1; i < points.length; i++) {
    prism(b, material, points[i - 1], points[i], thickness[i - 1], thickness[i], 5);
  }
}

function rivet(b, radius, y, i, sides, size) {
  prism(b, INLAY, polar(radius - .002, y, i, sides), polar(radius + size * .42, y, i, sides), size, size * .44, 4);
}

function pennant(b, x, z, top, length, width) {
  const foot = top - length;
  const upper = [[x-width, top, z], [x+width, top, z], [x+width, foot, z+.013], [x-width, foot+.031, z+.013]];
  const notch = [x+.009, foot+.066, z+.017];
  for (const facing of [[0, 0, 1], [0, 0, -1]]) {
    b.tri(CLOTH, upper[0], upper[1], notch, [0, 1], [1, 1], [.55, .20], facing);
    b.tri(CLOTH, upper[1], upper[2], notch, [1, 1], [1, 0], [.55, .20], facing);
    b.tri(CLOTH, upper[3], upper[0], notch, [0, 0], [0, 1], [.55, .20], facing);
  }
  prism(b, EDGE, upper[0], upper[1], .012, .012, 5);
}

function brazierIronwork(b, radius, bed, lip, pedestal) {
  const count = pedestal ? 6 : 4;
  for (let i = 0; i < count; i++) {
    const heel = polar(radius * .46, bed - .054, i, count);
    const elbow = polar(radius * .81, lip - .065, i, count);
    const rim = polar(radius * 1.01, lip - .012, i, count);
    const hook = polar(radius * 1.07, lip + .075, i, count);
    const tip = polar(radius * .88, lip + (pedestal ? .19 : .12), i, count);
    forgedPath(b, FORGED, [heel, elbow, rim, hook, tip], [.022, .028, .026, .020, 0]);
    rivet(b, radius * 1.03, lip - .015, i, count, .015);
  }
  if (!pedestal) return;
  for (const side of [-1, 1]) pennant(b, side * radius * .76, radius * .26, lip - .052, .25, .025);
  for (let i = 0; i < 4; i++) {
    const [x, , z] = polar(radius * .408, 0, i, 4);
    const tangent = [-Math.sin(i * Math.PI / 2), 0, Math.cos(i * Math.PI / 2)];
    const at = (u, y) => [x + tangent[0]*u, y, z + tangent[2]*u];
    const motif = [[-.023,.43],[.022,.43],[.022,.35],[-.013,.35],[-.013,.39],[.005,.39],[.005,.26],[-.022,.26],[-.022,.30]];
    forgedPath(b, INLAY, motif.map(([u, y]) => at(u,y)), motif.map(() => .0045));
  }
}

function brazier(b, radius, pedestal) {
  const bottom = pedestal ? .57 : .24;
  if (pedestal) {
    column(b, FORGED, 0, .045, radius * .75, radius * .73);
    column(b, EDGE, .045, .073, radius * .73, radius * .59);
    column(b, FORGED, .073, .13, radius * .59, radius * .46);
    column(b, FORGED, .13, .49, radius * .46, radius * .36);
    column(b, EDGE, .49, .515, radius * .50);
    column(b, FORGED, .515, bottom + .02, radius * .37, radius * .49);
  } else for (let i = 0; i < 3; i++) {
    const x = polar(radius * .89, .028, i, 3);
    const knee = polar(radius * .81, .105, i, 3);
    prism(b, FORGED, x, knee, .031, .030, 5);
    prism(b, FORGED, knee, polar(radius * .50, bottom + .04, i, 3), .030, .027, 5);
  }
  const lip = bottom + .16;
  const bed = forgedBowl(b, radius, bottom, lip);
  brazierIronwork(b, radius, bed, lip, pedestal);
  for (let i = 0; i < 9; i++) {
    const p = polar(radius * (.17 + i % 3 * .13), bed + .005, i * 2.4, 9);
    const top = [p[0] + .012, p[1] + .022 + (i % 2) * .013, p[2]];
    prism(b, 4, p, top, radius * .14, radius * .095, 5, { twist: i });
  }
  return [{ at: [0, bed + .004, 0], scale: radius * 2.48, broad: true }];
}

function candles(b, record, radius, branch) {
  column(b, BRASS, 0, .07, radius * .86, radius * .69);
  if (!branch) return [waxCandle(b, 0, .065, 0, .56, radius * (record === 4 ? .46 : .63))];
  column(b, BRASS, .05, .63, .035, .025);
  const flames = [waxCandle(b, 0, .62, 0, .13, .040)];
  for (const side of [-1, 1]) {
    const x = side * radius * .79;
    prism(b, BRASS, [0, .32, 0], [x, .49, 0], .022, .017, 6);
    flames.push(waxCandle(b, x, .49, 0, .16, .036));
  }
  return flames;
}

function chandelier(b, radius, count, lit) {
  const y = .17;
  const flames = [];
  band(b, FORGED, [radius, y - .07], [radius, y], count);
  band(b, IRON, [radius * .81, y], [radius * .81, y - .07], count, true);
  band(b, EDGE, [radius, y], [radius * .81, y], count);
  band(b, IRON, [radius * .81, y - .07], [radius, y - .07], count, true);
  for (let i = 0; i < count; i++) {
    const [x, , z] = polar(radius * .91, y, i, count);
    prism(b, EDGE, [x, y, z], [x, y + .028, z], .034, .040, 6);
    if (i % 2 === 0) {
      const lower = polar(radius, y - .02, i, count);
      const shoulder = polar(radius * .98, y + .13, i, count);
      prism(b, FORGED, lower, shoulder, .014, .012, 5);
      prism(b, FORGED, shoulder, [0, .84, 0], .010, .010, 5);
    }
    const candle = waxCandle(b, x, y + .028, z, .10 + (i % 3) * .023, .023);
    const drip = polar(radius * .995, y, i, count);
    prism(b, WAX, drip, [drip[0], y - .055 - i % 3 * .018, drip[2]], .007, .0035, 5);
    rivet(b, radius, y - .032, i + .5, count, .009);
    if (lit) flames.push(candle);
  }
  column(b, EDGE, .82, .872, .028, .022, 6);
  chain(b, .86, 1, .019);
  return flames;
}

function lanternScreen(b, side, height, sign) {
  const x = sign * side * 1.03;
  const at = (u, v) => [x, v * height, u * side];
  const edge = side * .11;
  for (const z of [-.95, .95]) {
    prism(b, EDGE, at(z, -.12), at(z, .76), edge, edge, 5);
  }
  for (let row = 0; row < 4; row++) {
    const y = .065 + row * .157;
    const path = [[-.87,y],[-.39,y+.095],[.55,y+.095],[.82,y+.038],[.33,y-.012],[-.10,y+.035]];
    forgedPath(b, FORGED, path.map(([u,v]) => at(sign*u,v)), path.map(() => edge * .72));
  }
  const fringe = [[-.95,-.12],[-.48,-.18],[-.08,-.119],[.37,-.16],[.95,-.12]];
  forgedPath(b, EDGE, fringe.map(([u,v]) => at(u,v)), fringe.map(() => edge));
}

function skullLantern(b, radius) {
  const base = .19, rim = .66, sides = 8;
  column(b, FORGED, 0, .10, .009, radius * .42);
  band(b, FORGED, [radius*.40,.10], [radius*.95,base], sides);
  column(b, EDGE, base, base+.034, radius);
  column(b, EDGE, rim-.018, rim+.025, radius);
  column(b, FORGED, rim+.025, .75, radius * .93, radius * .28);
  for (let i = 1; i < sides; i += 2) {
    prism(b, FORGED, polar(radius*.91, base, i, sides), polar(radius*.91, rim, i, sides), .015, .015, 5);
    rivet(b, radius, rim, i, sides, .009);
    prism(b, EDGE, polar(radius*.42,.10,i,sides), polar(radius*.88,base,i,sides), .010, .010, 5);
  }
  chain(b, .74, 1, .022);

  // Carve the face with shadowed sockets and individual teeth.
  const r = radius * .58, face = r * .84;
  column(b, BONE, .333, .406, r * .69, r, 10);
  column(b, BONE, .406, .502, r, r * .94, 10);
  column(b, BONE, .502, .553, r * .94, r * .54, 10);
  for (const sign of [-1, 1]) {
    const x = sign * r * .39;
    prism(b, IRON, [x,.433,face-.025], [x,.433,face+.015], r*.30, r*.275, 6);
    prism(b, BONE, [x-sign*.030,.463,face+.013], [x+sign*.030,.475,face+.010], .011, .013, 5);
    box(b, BONE, [sign*r*.66,.365,face*.91], [r*.12,.033,r*.22]);
  }
  prism(b, IRON, [0,.383,face-.014], [0,.383,face+.009], .018, .017, 3);
  box(b, IRON, [0,.312,face*.70], [r*.64,.022,r*.39]);
  for (let tooth = -2; tooth <= 2; tooth++) {
    box(b, BONE, [tooth*r*.22,.313,face*.96], [r*.085,.018,r*.12]);
  }
  box(b, BONE, [0,.275,face*.55], [r*.61,.013,r*.42]);
  const candle = waxCandle(b, 0, .222, -r*.69, .30, .033);
  return [candle];
}

function archedLantern(b, radius) {
  const sides = 6, bottom = .21, top = .70;
  column(b, FORGED, 0, .11, .009, radius*.39);
  column(b, EDGE, .11, .137, radius*.44, radius*.46);
  column(b, FORGED, .137, bottom, radius*.43, radius*.88);
  column(b, EDGE, bottom, bottom+.027, radius);
  column(b, FORGED, top, top+.046, radius);
  for (let i = 0; i < sides; i++) {
    const point = (y, j, scale=1) => polar(radius * scale, y, j, sides);
    const shoulder = .574, peak = .668;
    const p = [point(bottom+.029,i,.91),point(bottom+.029,i+1,.91),
      point(shoulder,i+1,.91),point(peak,i+.5,.79),point(shoulder,i,.91)];
    const n = polar(1,0,i+.5,sides);
    b.poly(HONEY_PANE, p, [[0,0],[1,0],[1,.76],[.5,1],[0,.76]], n);
    forgedPath(b, EDGE, [point(bottom+.025,i),point(shoulder,i),p[4],p[3],p[2],point(shoulder,i+1)], [.014,.014,.012,.011,.012,.014]);
    forgedPath(b, FORGED, [point(top+.03,i),point(.81,i,.76),point(.89,i,.39),point(.927,i,.11)], [.017,.016,.014,.014]);
    rivet(b, radius, top+.022, i+.5, sides, .011);
  }
  column(b, EDGE, .909, .945, radius*.23, radius*.17);
  chain(b, .937, 1, .019);
}

function hangingLantern(b, radius, height, record) {
  const side = radius * .70;
  column(b, FORGED, 0, height * .12, radius * .78, radius, 8);
  column(b, EDGE, height * .11, height * .16, radius);
  box(b, HONEY_PANE, [0, height * .43, 0], [side * .93, height * .29, side * .93]);
  for (const x of [-side, side]) for (const z of [-side, side]) {
    box(b, FORGED, [x, height * .44, z], [radius * .115, height * .33, radius * .115]);
  }
  column(b, EDGE, height * .73, height * .78, radius * 1.06);
  column(b, FORGED, height * .78, height * .95, radius * 1.06, radius * .32);
  column(b, EDGE, height * .94, height, radius * .32, radius * .22, 6);
  if (record === 22 || record === 25) {
    for (const sign of [-1, 1]) lanternScreen(b, side, height, sign);
  }
  if (record === 27) {
    prism(b, FORGED, [-radius * 1.55, height * .74, 0], [radius * 1.55, height * .74, 0], .019, .019, 5);
    for (const side of [-1, 1]) {
      const end = [side * radius * 1.53, height * .74, 0];
      pennant(b, side * radius * 1.28, 0, height * .73, height * .57, radius * .22);
      prism(b, EDGE, end, [0, Math.min(.99,height+.12), 0], .008, .008, 5);
      prism(b, INLAY, [end[0],end[1]-.039,0], [end[0],end[1]+.047,0], .011, .004, 5);
    }
  }
  if (record === 22 || record === 27) {
    for (const x of [-side, side]) for (const z of [-side, side]) {
      const tip = [x * 1.24, height * .83, z * 1.24];
      prism(b, EDGE, [x, height * .74, z], tip, radius * .12, radius * .09, 5);
      prism(b, FORGED, tip, [x * 1.29, height * .98, z * 1.29], radius * .09, 0, 5);
    }
  }
  chain(b, height, 1, Math.min(.022, radius * .25));
}

function candleCage(b, radius) {
  const sides = 8;
  column(b, FORGED, 0, .085, .012, radius * .38);
  column(b, EDGE, .085, .112, radius * .44, radius * .39);
  column(b, FORGED, .11, .22, radius * .36, radius * .67);
  column(b, EDGE, .22, .257, radius * .69, radius * .69);
  column(b, FORGED, .635, .675, radius, radius);
  column(b, EDGE, .675, .699, radius, radius * .94);
  column(b, FORGED, .699, .77, radius * .94, radius * .62);
  column(b, FORGED, .77, .83, radius * .62, radius * .19);
  for (let i = 0; i < sides; i += 2) {
    const foot = polar(radius * .62, .246, i, sides);
    const shoulder = polar(radius * .91, .515, i, sides);
    const rim = polar(radius * .97, .646, i, sides);
    prism(b, FORGED, foot, shoulder, .023, .021, 5);
    prism(b, FORGED, shoulder, rim, .021, .019, 5);
    const arch = polar(radius * .95, .624, i + 1, sides);
    prism(b, EDGE, polar(radius * .93, .57, i, sides), arch, .012, .012, 5);
    prism(b, EDGE, arch, polar(radius * .93, .57, i + 2, sides), .012, .012, 5);
  }
  for (let i = 0; i < sides; i += 2) {
    rivet(b, radius, .657, i, sides, .012);
    const curl = [[1,.656],[1.17,.65],[1.32,.714],[1.30,.774],[1.19,.79],[1.12,.757]];
    forgedPath(b, FORGED, curl.map(([r,y]) => polar(radius*r,y,i,sides)), [.018,.018,.016,.014,.010,0]);
  }
  column(b, EDGE, .817, .857, radius * .25, radius * .20, 6);
  chain(b, .85, 1, .025);
  return [waxCandle(b, 0, .247, 0, .167, .055)];
}

function hangingVessel(b, radius) {
  const lip = .39;
  forgedBowl(b, radius, .06, lip);
  const sides = 8;
  {
    column(b, DARK_GLASS, lip - .04, .55, radius * .73, radius * .48, sides);
    column(b, FORGED, .53, .61, radius * .75, radius * .40, sides);
    for (let i = 0; i < sides; i++) {
      prism(b, FORGED, polar(radius * .91, lip - .015, i, sides),
        polar(radius * .52, .552, i, sides), .023, .017, 5);
    }
  }
  const junction = .71;
  for (let i = 0; i < 3; i++) {
    prism(b, FORGED, polar(radius * .94, lip, i, 3), [0, junction, 0], .013, .011, 5);
  }
  column(b, EDGE, junction - .02, junction + .025, .026);
  chain(b, junction, 1, .022);

}

export function buildLightFixture(record) {
  const [kind, radius, variant, detail] = fixtures.get(record);
  const b = new MeshBench(TORCH_ARCHIVE);
  let flames = [];
  if (kind === 'brazier') flames = brazier(b, radius, variant);
  if (kind === 'candle') flames = candles(b, record, radius, variant);
  if (kind === 'chandelier') flames = chandelier(b, radius, variant, detail);
  if (kind === 'lantern') hangingLantern(b, radius, variant, record);
  if (kind === 'skull') flames = skullLantern(b, radius);
  if (kind === 'arched') archedLantern(b, radius);
  if (kind === 'cage') flames = candleCage(b, radius);
  if (kind === 'vessel') hangingVessel(b, radius);
  if (kind === 'post') {
    column(b, IRON, 0, .07, radius * .77, radius * .55);
    column(b, record >= 28 ? IRON : 1, .05, .80, radius * .24, radius * .20);
    if (record === 21) {
      column(b, BRASS, .76, .80, radius, radius * .75);
      flames = [waxCandle(b, 0, .79, 0, .105, .030)];
    } else lantern(b, .76, .24, radius, variant, detail);
  }
  return { mesh: finishTorchMesh(b), flames };
}

export function buildFixtureChain(count, material) {
  const b = new MeshBench(TORCH_ARCHIVE);
  chain(b, 0, 1, .016, count, material);
  return finishTorchMesh(b);
}

export function buildFixtureCeilingLink() {
  const b = new MeshBench(TORCH_ARCHIVE);
  column(b, IRON, 0, 1, .014, .014, 6);
  return finishTorchMesh(b);
}

export function fixturePaint(record) {
  const color = FIXTURE_PAINT.get(record);
  const colors = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const pane = record === HONEY_PANE;
    const core = Math.max(0, 1 - Math.hypot((x - 7.5) / 8, (y - 5) / 11));
    const grain = pane ? .63 + .35 * core + ((x ^ y) & 3) * .018
      : .86 + ((x * 13 ^ y * 7) & 7) * .02;
    const weave = record === CLOTH && (x < 2 || x > 13 || (x + y * 2) % 9 < 2) ? 1.35 : 1;
    colors.set([...color.map(c => c * grain * weave), 255], (y * 16 + x) * 4);
  }
  const paint = { width: 16, height: 16, colors };
  return record === FORGED || record === EDGE ? dfLook(paint, lookSeed(TORCH_ARCHIVE, record)) : paint;
}
