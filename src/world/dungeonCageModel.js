import { MeshBench, box, prism } from './ships/galleonMesh.js';
import { addDungeonChainLink } from './dungeonChainModel.js';

const IRON = 2, DARK_IRON = 11;
const SIDES = 12;
const ringPoint = (radius, y, i) => {
  const angle = i * Math.PI * 2 / SIDES;
  const basketRadius = radius * .88;
  const basketY = y - Math.max(0, y - .30) * .14;
  return [Math.cos(angle) * basketRadius, basketY, Math.sin(angle) * basketRadius];
};

function belt(b, y, radius, halfHeight) {
  for (let i = 0; i < SIDES; i++) {
    const next = i + 1, inner = radius - .061;
    const [x, , z] = ringPoint(1, y, i + .5);
    const outerLow = ringPoint(radius, y - halfHeight, i), outerHigh = ringPoint(radius, y + halfHeight, i);
    const innerLow = ringPoint(inner, y - halfHeight, i), innerHigh = ringPoint(inner, y + halfHeight, i);
    const uv = [[0, 0], [.25, 0], [.25, 1], [0, 1]];
    b.quad(DARK_IRON, outerLow, ringPoint(radius, y - halfHeight, next), ringPoint(radius, y + halfHeight, next), outerHigh, uv, [x, 0, z]);
    b.quad(IRON, outerHigh, ringPoint(radius, y + halfHeight, next), ringPoint(inner, y + halfHeight, next), innerHigh, uv, [0, 1, 0]);
    b.quad(DARK_IRON, outerLow, innerLow, ringPoint(inner, y - halfHeight, next), ringPoint(radius, y - halfHeight, next), uv, [0, -1, 0]);
    b.quad(DARK_IRON, innerLow, innerHigh, ringPoint(inner, y + halfHeight, next), ringPoint(inner, y - halfHeight, next), uv, [-x, 0, -z]);
  }
}

export function addDungeonCage(b) {
  belt(b, .30, .665, .054);
  belt(b, 1.47, .65, .055);
  belt(b, 1.56, .52, .029);
  for (let i = 0; i < SIDES; i++) {
    const bottom = ringPoint(.61, .26, i), top = ringPoint(.60, 1.49, i);
    // An open front bar has bent outward above the lower rim.
    const bent = i === 2;
    const shoulder = bent ? ringPoint(.76, .75, i) : ringPoint(.62, .86, i);
    prism(b, DARK_IRON, bottom, shoulder, .027, .024, 5);
    prism(b, IRON, shoulder, top, .024, .024, 5);
    prism(b, DARK_IRON, bottom, ringPoint(.57, .06 + (i % 3) * .037, i), .035, .006, 5);
    prism(b, DARK_IRON, top, ringPoint(.46, 1.56, i), .026, .023, 5);
  }
  for (let i = 0; i < 6; i++) {
    prism(b, DARK_IRON, ringPoint(.605, .31, i), ringPoint(.605, .31, i + 6), .033, .033, 5);
  }
  for (const i of [0, 4, 8]) {
    prism(b, DARK_IRON, ringPoint(.57, 1.51, i), [0, 2.55, 0], .019, .016, 5);
  }
  addDungeonChainLink(b, 2.61, .077, .085, .020, false, 0, 1);
  for (let i = 0; i < 6; i++) {
    addDungeonChainLink(b, 2.72 + i * .135, .040, .074, .018, i % 2 === 0, 0, 1);
  }
  prism(b, DARK_IRON, [0, 3.42, 0], [0, 3.525, 0], .059, .056, 6);
}

// TEXTURE.211:34 has a long chain over a low, domed cage with a broken underside.
// Coordinates are fractions of the authored flat footprint and height.
export function buildBrokenDungeonCage(archive) {
  const b = new MeshBench(archive);
  const sides = 8;
  const point = (i, radius, y) => {
    const a = i * Math.PI * 2 / sides;
    return [Math.cos(a) * radius, y, Math.sin(a) * radius];
  };
  for (let i = 0; i < sides; i++) {
    const rim = point(i, .43, .29);
    const shoulder = point(i, .34, .49);
    const crown = point(i, .11, .58);
    const root = point(i, .12, .61);
    prism(b, DARK_IRON, rim, point(i + 1, .43, .29), .035, .035, 4);
    prism(b, IRON, rim, shoulder, .026, .024, 5);
    prism(b, DARK_IRON, shoulder, crown, .024, .027, 5);
    prism(b, DARK_IRON, crown, root, .028, .028, 5);
    if (i !== 1 && i !== 2) {
      const knee = point(i, .31, i === 4 ? .23 : .19);
      const hook = point(i + .25, .34, i === 4 ? .15 : .07 + (i % 3) * .03);
      prism(b, DARK_IRON, rim, knee, .025, .021, 5);
      prism(b, IRON, knee, hook, .021, .014, 5);
    }
  }
  box(b, DARK_IRON, [0, .618, 0], [.126, .021, .126]);
  prism(b, IRON, point(5, .27, .23), point(8, .23, .12), .026, .020, 5);
  prism(b, DARK_IRON, point(7, .26, .21), point(6, .18, .045), .028, .016, 5);
  addDungeonChainLink(b, .656, .080, .029, .024, false, 0, 1, .008);
  for (let i = 0; i < 7; i++) {
    addDungeonChainLink(b, .700 + .044 * i, .060, .026, .022, i % 2 === 0, 0, 1, .007);
  }
  box(b, DARK_IRON, [0, .984, 0], [.07, .016, .07]);
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: mesh.slots[i].record }));
  return mesh;
}
