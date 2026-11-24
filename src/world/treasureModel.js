import { MeshBench, box, prism } from './ships/galleonMesh.js';
import { dfLook } from './dfLook.js';
import { placedWaterSourcePaints } from './placedWaterSources.js';
import { townSignPaints } from './townSignModels.js';
import { yardPropPaints } from './townYardProps.js';
import { marketPropPaints } from './townMarketProps.js';
import { dampPostPaint, DAMP_POST_WOOD } from './shorePost.js';
import { WORKSHOP_WOOD, workshopWoodPaints } from './dungeonWorkshopWood.js';
import { SLAB_STONE, slabStonePaint } from './dungeonSlabStone.js';
import { STAINED_PRESS_IRON, STAINED_TABLE_STONE, stainedTablePaint } from './dungeonTortureTable.js';

export const TREASURE_ART = 38343;
export const FURNISHING_PAINT = { plank: 110, glass: 111, glassEdge: 112, wicker: 113, bone: 114, dryReeds: 125, greenReeds: 126, rackWood: 127, shoreStone: 128, hay: 154 };
const LINEN = 0, LEATHER = 1, STEEL = 2, WOOD = 3, GOLD = 4, ROPE = 5, GLASS = 6, CLOTH = 7, RED = 8;
const DARK_CHEST = 11;
const palettes = [
  [107, 87, 58], [77, 50, 32], [78, 86, 89], [84, 58, 39],
  [157, 114, 41], [137, 111, 70], [61, 113, 102], [58, 60, 57], [100, 49, 35],
  [126, 134, 135], [70, 67, 59], [53, 49, 42],
];

// Each row describes the visible contents of one classic random treasure picture.
const variants = new Map([
  [0, 'sack coins'], [20, 'sack sword rope coins'], [22, 'sack sword rope coins'],
  [24, 'cloth sack blade'], [25, 'cloth sack sword'], [30, 'sack'],
  [37, 'pot coins'], [43, 'sack blade cloth'], [45, 'sack bottle flask coins'],
  [46, 'smallChest coins'], [47, 'chest coins bottle'],
]);
export const hasTreasureModel = record => variants.has(record);
const approvedRecords = [...variants.keys()];
export const treasurePreviewRecords = () => [...variants];
const compactPixels = Object.freeze({ area: .035, maxScale: 1.55 });
const bladePixels = Object.freeze({ area: .035, maxScale: 1.65 });
const coinPixels = Object.freeze({ area: .045, maxScale: 1.45 });
const chestPixels = Object.freeze({ area: .045, maxScale: 1.25 });

export function treasurePixelProfile(record) {
  const parts = variants.get(record) ?? '';
  if (parts.includes('sword') || parts.includes('blade')) return bladePixels;
  if (record === 46 || record === 47) return chestPixels;
  return parts.includes('coins') ? coinPixels : compactPixels;
}

export function selectTreasureAppearance(record, roll) {
  return hasTreasureModel(record) ? record : approvedRecords[Math.floor(roll() * approvedRecords.length)];
}

export function treasurePaints() {
  const paints = palettes.map((color, material) => {
    const size = material === WOOD ? 32 : 16;
    const colors = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const streak = ((x >> 1) * 29 ^ (y >> 1) * 13 ^ material * 17) & 7;
      const wear = (((x >> 1) * 11 ^ (y >> 2) * 31) & 7) - 3;
      const seam = material === LINEN && (x % 4 === 0 || y % 5 === 0) ? -.13 : 0;
      const grain = material === WOOD && x % 5 === 0 ? -.21 : seam;
      const woodGrain = ((x * 17 ^ (y >> 2) * 5) & 7) * .024;
      const shade = material === WOOD
        ? .91 + woodGrain + (x % 8 === 0 ? -.18 : 0) + wear * .024
        : .82 + streak * .040 + wear * .035 + grain;
      colors.set([...color.map(c => c * shade), 255], (y * size + x) * 4);
    }
    return dfLook({ width: size, height: size, colors }, material + 83);
  });
  for (const [material, color] of [[110, [91, 65, 43]], [111, [39, 72, 65]], [112, [81, 130, 112]], [113, [113, 87, 51]], [114, [150, 139, 111]], [115, [84, 79, 67]], [116, [111, 101, 79]], [117, [103, 73, 83]], [118, [130, 92, 102]], [FURNISHING_PAINT.dryReeds, [126, 103, 52]], [FURNISHING_PAINT.greenReeds, [71, 83, 47]], [FURNISHING_PAINT.rackWood, [106, 84, 53]]]) {
    const size = 24;
    const colors = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const grain = ((Math.floor(x / 4) * 11 + y * 17) % 9 - 4) * .018;
      const shade = material === 110 ? .95 + grain - (y % 7 === 0 ? .21 : 0)
        : material === 113 ? .96 + grain + ((Math.floor(x / 3) + Math.floor(y / 2)) % 2 ? .12 : -.12)
        : material === FURNISHING_PAINT.rackWood ? .74 + (y / (size - 1)) * .18 + grain
          + ((x * 17 ^ (y >> 2) * 5) & 7) * .025 - (x % 6 === 0 ? .12 : 0)
        : material >= 115 ? .91 + grain + ((x * 7 + y * 13) % 11) * .012
        : .94 + grain * .4 + (x > 5 && x < 9 ? .12 : 0);
      colors.set([...color.map(channel => channel * shade), 255], (y * size + x) * 4);
    }
    paints[material] = { width: size, height: size, colors };
  }
  for (const [record, paint] of workshopWoodPaints()) paints[record] = paint;
  // Follow the slope of the stack with broken strands in a few warm straw tones.
  const hayWidth = 96, hayHeight = 32;
  const hayColors = new Uint8ClampedArray(hayWidth * hayHeight * 4);
  for (let y = 0; y < hayHeight; y++) for (let x = 0; x < hayWidth; x++) {
    const strand = (x + (y >> 2) * 2 + Math.floor(2 * Math.sin(y * .3 + (x >> 4)))) % hayWidth;
    const bundle = Math.floor(strand / 3);
    const tip = (y + bundle * 7) % (9 + bundle % 5);
    const shade = .86 + ((bundle * 13) % 11) * .021 + (strand % 3 === 0 && tip > 2 ? .18 : 0)
      - (tip < 2 ? .13 : 0) + .11 * y / hayHeight;
    hayColors.set([155 * shade, 124 * shade, 70 * shade, 255], (y * hayWidth + x) * 4);
  }
  paints[FURNISHING_PAINT.hay] = { width: hayWidth, height: hayHeight, colors: hayColors };
  paints[DAMP_POST_WOOD] = dampPostPaint(paints[WORKSHOP_WOOD.beam]);
  paints[SLAB_STONE] = slabStonePaint();
  paints[FURNISHING_PAINT.shoreStone] = slabStonePaint([58, 56, 48]);
  paints[STAINED_TABLE_STONE] = stainedTablePaint();
  paints[STAINED_PRESS_IRON] = stainedTablePaint(true);
  for (const [record, paint] of placedWaterSourcePaints()) paints[record] = paint;
  for (const [record, paint] of townSignPaints()) paints[record] = paint;
  for (const [record, paint] of yardPropPaints(paints)) paints[record] = paint;
  for (const [record, paint] of marketPropPaints(paints)) paints[record] = paint;
  return paints;
}

// Irregular rings give the fabric real folds and a pinched neck.
function vessel(b, material, x, z, rings, sides = 9, fold = .10, fabric = false) {
  const points = rings.map(([y, rx, rz, lean = 0], row) => Array.from({ length: sides }, (_, i) => {
    const angle = Math.PI * 2 * i / sides;
    const bulge = 1 + Math.cos(i * 2.7 + row * .38) * fold;
    const crease = fabric ? Math.cos(angle * 5 + row * .31) : 0;
    const edge = fabric && row > 3 ? .024 * crease : 0;
    return [
      x + lean + Math.cos(angle) * rx * (bulge + crease * .07),
      y + edge,
      z + Math.sin(angle) * rz * (bulge + crease * .07),
    ];
  }));
  for (let row = 1; row < points.length; row++) for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    const angle = (i + .5) * Math.PI * 2 / sides;
    b.quad(material, points[row - 1][i], points[row - 1][next], points[row][next], points[row][i],
      [[i / sides, (row - 1) / points.length], [(i + 1) / sides, (row - 1) / points.length],
        [(i + 1) / sides, row / points.length], [i / sides, row / points.length]],
      [Math.cos(angle), 0, Math.sin(angle)]);
  }
  for (const [row, face] of [[0, -1], [points.length - 1, 1]]) {
    const [, rx, rz, lean = 0] = rings[row];
    const capUV = points[row].map(([px, , pz]) => [.5 + (px - x - lean) / (rx * 2.5), .5 + (pz - z) / (rz * 2.5)]);
    b.poly(material, points[row], capUV, [0, face, 0]);
  }
  return points;
}

function sack(b, x, z, record) {
  const tall = record === 30;
  const h = tall ? .98 : .68;
  const lean = record % 2 ? -.10 : .10;
  const breadth = tall ? .90 : 1;
  const shape = [
    [0, .19, .16], [.055, .25, .20, -.016], [h * .29, .28, .235, -.027],
    [h * .54, .265, .205, -.023], [h * .73, .202, .16, lean * .4],
    [h * .87, .085, .073, lean], [h * .96, .101, .078, lean * 1.15],
    [h, .065, .049, lean * 1.32], [h * .94, .033, .026, lean * 1.23],
  ].map(([y, rx, rz, shift]) => [y, rx * breadth, rz, shift]);
  const folds = vessel(b, LINEN, x, z, shape, 12, .07, true);
  const neckX = x + lean;
  for (const wrap of [-1, 1]) {
    prism(b, ROPE, [neckX - .007, h * .865 + wrap * .012, z],
      [neckX + .007, h * .883 + wrap * .012, z + .004], .089, .085, 10);
  }
  const knot = [neckX + .018, h * .873, z + .081];
  prism(b, ROPE, [knot[0] - .024, knot[1] - .012, knot[2] - .004], knot, .024, .029, 6);
  for (const sign of [-1, 1]) {
    const bend = [knot[0] + sign * .042, knot[1] - h * .086, knot[2] + .037];
    const tip = [bend[0] + sign * .043, bend[1] - h * (sign > 0 ? .09 : .14), bend[2] + .013];
    prism(b, ROPE, knot, bend, .012, .010, 5);
    prism(b, ROPE, bend, tip, .010, .007, 5);
  }

  // Coarse stitches follow one actual fold down the front of the cloth.
  for (let row = 1; row < 5; row++) {
    const a = folds[row][3], c = folds[row + 1][3];
    for (const t of [.20, .65]) {
      const sx = a[0] + (c[0] - a[0]) * t;
      const sy = a[1] + (c[1] - a[1]) * t;
      const sz = a[2] + (c[2] - a[2]) * t + .006;
      prism(b, ROPE, [sx - .014, sy - .009, sz - .002],
        [sx + .012, sy + .010, sz - .002], .005, .005, 4);
    }
  }
}

function chest(b, small) {
  const w = small ? .32 : .43, depth = small ? .21 : .26;
  const wood = WORKSHOP_WOOD.boards;
  box(b, wood, [0, .11, 0], [w, .11, depth], { tile: [.55, .45] });
  for (const sign of [-1, 1]) {
    box(b, wood, [0, .32, sign * depth], [w, .20, .034], { tile: [.55, .45] });
    box(b, wood, [sign * w, .32, 0], [.034, .20, depth], { tile: [.55, .45] });
    box(b, LEATHER, [0, .52, sign * depth], [w + .025, .029, .047]);
  }
  // Tilted lid exposes the mouth of the chest and its metal fittings.
  const axes = [[1, 0, 0], [0, .66, .75], [0, -.75, .66]];
  const lidY = .535 + depth * .66, lidZ = -depth + depth * .75;
  box(b, wood, [0, lidY, lidZ], [w, depth, .043], { axes, tile: [.55, .45] });
  for (const x of [-w * .72, w * .72]) {
    box(b, STEEL, [x, .26, depth], [.032, .22, .015]);
    box(b, STEEL, [x, lidY - .040, lidZ + .035], [.032, depth, .016], { axes });
  }
  box(b, GOLD, [0, .39, depth + .022], [.055, .061, .023]);
  box(b, DARK_CHEST, [0, .392, depth + .047], [.010, .025, .003]);
  // The two straps wrap the lid. Small rivets mark the strap ends and hinge plates.
  for (const x of [-w * .72, w * .72]) {
    box(b, STEEL, [x, .48, -depth - .037], [.049, .046, .015]);
    for (const y of [.13, .43]) prism(b, GOLD, [x, y, depth + .015], [x, y, depth + .035], .012, .010, 6);
  }
  box(b, CLOTH, [.09, .238, -.035], [w * .52, .021, depth * .69]);
  const roll = small ? .12 : .18;
  prism(b, LEATHER, [w * .38, .31, -.105], [w * .38, .31, -.105 + roll], .048, .052, 7);
  prism(b, ROPE, [w * .38, .31, -.047], [w * .38, .31, -.029], .054, .054, 7);
  vessel(b, LEATHER, -.145, -.085, [[.25, .065, .062], [.30, .084, .073], [.39, .072, .062],
    [.445, .030, .026], [.465, .041, .035]], 8, .07);
  prism(b, ROPE, [-.145, .434, -.085], [-.145, .450, -.085], .037, .036, 7);
  for (const [x, z, y] of [[-.055, -.027, .33], [.027, .067, .36], [-.15, .093, .33], [.114, -.105, .35]]) {
    prism(b, GOLD, [x, y, z], [x + .014, y + .028, z + .006], .048, .042, 7);
    prism(b, GOLD, [x + .023, y + .023, z - .017], [x + .019, y + .043, z - .018], .036, .033, 7);
  }
  if (!small) {
    // The outer compartments are visible from above the front rim.
    box(b, CLOTH, [-.309, .263, .044], [.071, .035, .141]);
    prism(b, LEATHER, [-.318, .339, -.092], [-.293, .337, .117], .056, .052, 8);
    prism(b, ROPE, [-.307, .338, -.009], [-.305, .338, .012], .060, .059, 7);
    box(b, LEATHER, [.318, .266, -.031], [.073, .044, .139]);
    for (const [x, z, height] of [[.306, -.116, .081], [.342, -.036, .049], [.290, .045, .065], [.333, .104, .036]]) {
      prism(b, GOLD, [x, .310, z], [x, .310 + height, z], .044, .041, 8);
      prism(b, GOLD, [x - .005, .310 + height, z], [x - .007, .325 + height, z], .046, .044, 8);
    }
  }
}

function blade(b, long, besideSack) {
  const base = [-.23, .063, besideSack ? .36 : .16];
  const tip = [long ? .46 : .32, .063, besideSack ? .31 : -.16];
  const dx = tip[0] - base[0], dz = tip[2] - base[2];
  const length = Math.hypot(dx, dz);
  const along = [dx / length, dz / length];
  const across = [-along[1], along[0]];
  const at = (u, v, lift = 0) => [
    base[0] + along[0] * u + across[0] * v,
    base[1] + lift,
    base[2] + along[1] * u + across[1] * v,
  ];
  // A thin blade has a central ridge, two bevels and a point, like the
  // faceted metal heads on the dungeon fixtures.
  const edgeSteel = 9;
  const shoulder = length * .76;
  for (const side of [-1, 1]) {
    const outside = at(0, side * .043);
    const bevel = at(shoulder, side * .031);
    const ridge = at(0, 0, .012);
    const ridgeEnd = at(shoulder, 0, .009);
    const point = at(length, 0);
    b.quad(side > 0 ? edgeSteel : STEEL, outside, bevel, ridgeEnd, ridge,
      [[0, 0], [.78, 0], [.78, 1], [0, 1]], [0, 1, 0]);
    b.tri(edgeSteel, bevel, point, ridgeEnd, [.78, 0], [1, .5], [.78, 1], [0, 1, 0]);
  }
  b.poly(STEEL, [at(0, -.043), at(shoulder, -.031), tip, at(shoulder, .031), at(0, .043)],
    [[0, 0], [.78, 0], [1, .5], [.78, 1], [0, 1]], [0, -1, 0]);
  prism(b, GOLD, at(-.018, -.077), at(-.018, .077), .016, .014, 5);
  prism(b, LEATHER, at(-.033, 0), at(-.183, 0), .025, .021, 6);
  for (const ring of [-.063, -.103, -.143]) {
    prism(b, ROPE, at(ring, 0), at(ring - .009, 0), .026, .026, 6);
  }
  prism(b, GOLD, at(-.183, 0), at(-.216, 0), .028, .022, 6);
}

function bottle(b, x, z, scale) {
  vessel(b, GLASS, x, z, [[0, .069, .061], [.045, .09, .08], [.23, .077, .07], [.30, .035, .035], [.39, .038, .038]]
    .map(([y, rx, rz]) => [y * scale, rx * scale, rz * scale]), 7, .025);
  prism(b, WOOD, [x, .38 * scale, z], [x, .42 * scale, z], .029 * scale, .026 * scale, 6);
}

function coins(b, record, elevated, spread) {
  for (let i = 0; i < 24; i++) {
    const theta = i * 2.39996 + record;
    const radius = Math.sqrt((i + .4) / 24) * spread;
    const x = Math.cos(theta) * radius, z = Math.sin(theta) * radius * .72 + (elevated ? 0 : .09);
    const y = elevated ? .26 + (i % 4) * .022 : .012 + (i % 4 === 0 ? .018 : 0);
    const r = .032 + (i % 5) * .004;
    prism(b, GOLD, [x, y, z], [x + .004, y + .022, z], r, r * .94, 7);
  }
}

export function buildLootPouch(archive) {
  const b = new MeshBench(archive);
  sack(b, 0, 0, 0);
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: mesh.slots[i].record }));
  return mesh;
}

export function buildTreasureModel(record) {
  const parts = variants.get(record).split(' ');
  const has = part => parts.includes(part);
  const b = new MeshBench(TREASURE_ART);
  const isChest = has('chest') || has('smallChest');
  if (has('cloth')) vessel(b, CLOTH, .03, 0, [[0, .43, .28], [.05, .47, .30], [.085, .28, .19, .07]], 9, .22);
  if (has('sack')) sack(b, has('sword') || has('blade') ? -.10 : -.05, -.06, record);
  if (has('rope')) {
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5, next = (i + 1) * Math.PI / 5;
      prism(b, ROPE, [.25 + .115 * Math.cos(angle), .037, .20 + .09 * Math.sin(angle)],
        [.25 + .115 * Math.cos(next), .037, .20 + .09 * Math.sin(next)], .021, .021, 5);
    }
  }
  if (has('blade') || has('sword')) blade(b, has('sword'), has('sack'));
  if (has('pot')) {
    vessel(b, RED, 0, -.095, [[0, .15, .13], [.16, .26, .23], [.43, .235, .21], [.59, .16, .15]], 9, .05);
    vessel(b, LEATHER, 0, -.095, [[.55, .17, .16], [.60, .19, .175], [.65, .18, .165]], 9, .03);
  }
  if (isChest) chest(b, has('smallChest'));
  if (has('bottle')) bottle(b, isChest ? -.22 : .24, isChest ? .06 : .035, 1);
  if (has('flask')) bottle(b, -.30, .12, .66);
  if (has('coins')) coins(b, record, isChest, isChest ? .24 : .43);

  const mesh = b.finish();
  // Match the original sprite's width and height even when the subject is a low pile.
  const width = mesh.aabb.extent[0] * 2, top = mesh.aabb.center[1] + mesh.aabb.extent[1];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    mesh.positions[i] /= width;
    mesh.positions[i + 1] /= top;
    mesh.positions[i + 2] /= width;
    const length = Math.hypot(mesh.normals[i] * width, mesh.normals[i + 1] * top, mesh.normals[i + 2] * width);
    mesh.normals[i] *= width / length;
    mesh.normals[i + 1] *= top / length;
    mesh.normals[i + 2] *= width / length;
  }
  mesh.aabb.center = mesh.aabb.center.map((v, i) => v / (i === 1 ? top : width));
  mesh.aabb.extent = mesh.aabb.extent.map((v, i) => v / (i === 1 ? top : width));
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => ({ ...sub, textureArchive: TREASURE_ART, textureRecord: mesh.slots[i].record }));
  return mesh;
}
