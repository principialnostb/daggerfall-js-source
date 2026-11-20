import { MeshBench, prism } from './ships/galleonMesh.js';
import { FURNISHING_PAINT } from './treasureModel.js';

const FRAMES = new Map([['212:15', 2.8], ['212:16', 4.225]]);
const WOOD = FURNISHING_PAINT.rackWood;
const STRAW = FURNISHING_PAINT.dryReeds;
const REEDS = FURNISHING_PAINT.greenReeds;
export const isWaterRack = id => FRAMES.has(id);

// A two-sided, tapered blade bends once before the tip. The shared kit
// keeps the silhouette readable from both the bank and the water.
function reed(mesh, rec, root, angle, reach, crest, tip, halfWidth) {
  const [x, y, z] = root;
  const vx = Math.cos(angle), vz = Math.sin(angle);
  const point = (along, up, across) => [x + vx * along - vz * across, y + up, z + vz * along + vx * across];
  const a = point(0, 0, -halfWidth), b = point(0, 0, halfWidth);
  const c = point(reach * .48, crest, halfWidth * .66), d = point(reach * .48, crest, -halfWidth * .66);
  const e = point(reach, tip, 0);
  mesh.quad(rec, a, b, c, d, [[0, 0], [1, 0], [1, .5], [0, .5]]);
  mesh.quad(rec, b, a, d, c, [[1, 0], [0, 0], [0, .5], [1, .5]]);
  mesh.tri(rec, d, c, e, [0, .5], [1, .5], [.5, 1]);
  mesh.tri(rec, c, d, e, [1, .5], [0, .5], [.5, 1]);
}

// The compressed reed bed fills the sightlines through the fans from above and below.
function reedBed(mesh, deck) {
  const sides = 16;
  const rings = [[1.06, .66, -.08], [1.24, .84, .03], [.92, .62, .16]];
  const points = rings.map(([width, depth, rise], ring) => Array.from({ length: sides }, (_, i) => {
    const angle = i * Math.PI * 2 / sides;
    const bulge = 1 + Math.sin(i * 2.4 + ring * .9) * .08;
    return [width * Math.cos(angle) * bulge, deck + rise + Math.sin(i * 3.8) * .045, depth * Math.sin(angle) * bulge];
  }));
  const [bottom, rim, crown] = points;
  const topCenter = [0, deck + .19, 0], bottomCenter = [0, deck - .08, 0];
  const uv = ([x, , z]) => [x * 1.8, z * 1.8];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const lower = [bottom[i], bottom[j], rim[j], rim[i]];
    const upper = [rim[i], rim[j], crown[j], crown[i]];
    mesh.quad(REEDS, ...lower, lower.map(uv), [rim[i][0], 0, rim[i][2]]);
    mesh.quad(REEDS, ...upper, upper.map(uv), [0, 1, 0]);
    mesh.tri(REEDS, crown[i], crown[j], topCenter, uv(crown[i]), uv(crown[j]), uv(topCenter), [0, 1, 0]);
    mesh.tri(REEDS, bottom[i], bottom[j], bottomCenter, uv(bottom[i]), uv(bottom[j]), uv(bottomCenter), [0, -1, 0]);
  }
}

const rails = [-.91, -.04, .91];
const depth = .69;
const footX = x => x + .045 * Math.sign(x);
const frameWidth = id => id === '212:16' ? 3.175 : 3.15;

// Convert the visible terrain under each foot back into the frame's authored metres.
export function rackFootHeights(id, placement, width, height, floor) {
  const scale = width / frameWidth(id);
  const feet = [];
  for (const side of [-1, 1]) for (const x of rails) {
    const y = floor(placement.x + footX(x) * scale, placement.z + side * depth * scale);
    const drop = y == null ? 0 : Math.min(0, y - placement.y);
    feet.push(drop < -0.015 ? (drop - 0.12) * FRAMES.get(id) / height : 0);
  }
  return feet.some(y => y < 0) ? feet : null;
}

export function buildWaterRack(archive, id, feet = null) {
  const mesh = new MeshBench(archive);
  // X/Z use billboard width and Y uses billboard height in the placed-prop pass.
  const width = frameWidth(id);
  const height = FRAMES.get(id);
  let post = 0;
  const deck = 2.4;
  const timber = (a, b, radius, tip = radius, sides = 4) =>
    prism(mesh, WOOD, a, b, radius, tip, sides, { twist: Math.PI / 4, tileV: Math.hypot(...b.map((v, i) => v - a[i])) });

  for (const side of [-1, 1]) {
    const z = side * depth;
    for (const [i, x] of rails.entries()) {
      timber([footX(x), feet?.[post] ?? 0, z], [x, deck, z - side * .025], .098 - i * .006, .078);
      post++;
    }
    timber([rails[0] - .06, deck - .06, z], [rails[2] + .07, deck - .03, z], .092);
    timber([rails[0], .47 + side * .10, z], [rails[1], .68, z], .067);
    timber([rails[1], .96, z], [rails[2], .38 - side * .06, z], .070);
    timber([rails[0], 1.02 + side * .10, z], [rails[1], 1.76, z], .073);
    timber([rails[1], 1.15, z], [rails[2], 1.93 - side * .11, z], .076);
    timber([rails[0], 2.06, z], [rails[1], 2.12 - side * .08, z], .060);
  }
  for (const x of rails) timber([x, deck, -depth - .13], [x, deck, depth + .13], .079);
  for (const x of [rails[0], rails[2]]) {
    const sign = Math.sign(x);
    timber([x, .50, -depth], [x, 1.03 + sign * .18, depth], .066);
    timber([x, 1.96, -depth], [x, 1.12 + sign * .12, depth], .070);
    timber([x, 2.19, -depth], [x, 2.22, depth], .057);
  }

  // The slats support the compressed bed and its projecting leaves.
  for (let i = 0; i < 12; i++) {
    const x = -.91 + i * .167, skew = Math.sin(i * 7.2) * .12;
    timber([x, deck + .01, -.77], [x + skew, deck + .065, .78], .033, .019, 3);
  }
  reedBed(mesh, deck);
  const tuftRows = [[-.53, -.96, 5], [.04, -.72, 4], [.53, -.96, 5]];
  for (const [row, [rowZ, firstX, count]] of tuftRows.entries()) {
    for (let column = 0; column < count; column++) {
      const tuft = row * 5 + column;
      const x = firstX + column * .48;
      const z = rowZ + Math.sin(tuft * 3.1) * .12;
      for (let leaf = 0; leaf < 13; leaf++) {
        const i = tuft * 13 + leaf;
        const angle = leaf * 2.39996 + tuft * 1.67;
        const edge = (Math.abs(rowZ) > .4 && Math.sin(angle) * Math.sign(z) > .42)
          || (Math.abs(x) > .70 && Math.cos(angle) * Math.sign(x) > .56);
        const reach = .29 + .27 * (1 + Math.sin(i * 9.1)) / 2;
        const rootHeight = .10 + Math.sin(i * 2.6) * .045;
        const crest = Math.min(.18 + .16 * (1 + Math.cos(i * 3.3)) / 2, FRAMES.get('212:15') - deck - rootHeight);
        const tip = edge ? -.13 - .19 * (1 + Math.cos(i * 8.2)) / 2 : crest * .75;
        const root = [x + Math.cos(i * 4.3) * .065, deck + rootHeight, z + Math.sin(i * 4.3) * .065];
        reed(mesh, i % 5 < 2 ? REEDS : STRAW, root, angle, reach, crest, tip, .043 + .014 * (i % 3));
      }
    }
  }
  if (id === '212:16') timber([0, .56, depth], [.043, height, depth], .065, .039);

  const model = mesh.finish();
  for (let i = 0; i < model.positions.length; i += 3) {
    model.positions[i] /= width;
    model.positions[i + 1] /= height;
    model.positions[i + 2] /= width;
    const nx = model.normals[i] * width;
    const ny = model.normals[i + 1] * height;
    const nz = model.normals[i + 2] * width;
    const length = Math.hypot(nx, ny, nz) || 1;
    model.normals.set([nx / length, ny / length, nz / length], i);
  }
  for (const bounds of [model.aabb.center, model.aabb.extent]) {
    bounds[0] /= width;
    bounds[1] /= height;
    bounds[2] /= width;
  }
  model.subMeshes = model.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: model.slots[i].record }));
  return model;
}
