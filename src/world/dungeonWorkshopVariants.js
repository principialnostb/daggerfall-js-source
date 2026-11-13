import { box, prism } from './ships/galleonMesh.js';
import { SLAB_STONE } from './dungeonSlabStone.js';
import { STAINED_TABLE_STONE } from './dungeonTortureTable.js';
import { WORKSHOP_WOOD } from './dungeonWorkshopWood.js';

const slabs = new Map([
  [41304, { base: 'plinth', rim: .12, fittings: 'corner', bones: true }],
  [41305, { base: 'feet', rim: .14, fittings: 'cord' }],
  [41307, { base: 'tapered', rim: .09, fittings: 'rings', bones: true }],
  [41308, { base: 'plinth', rim: .17, fittings: 'straps' }],
  [41309, { base: 'feet', rim: .18, fittings: 'rings' }],
  [41310, { base: 'tapered', rim: .13, fittings: 'cord', bones: true }],
  [41311, { base: 'feet', rim: .10, fittings: 'corner' }],
]);

export function buildWorkshopSlab(b, id) {
  const { base, rim, fittings, bones } = slabs.get(id);
  const top = 1 - rim;
  const stone = SLAB_STONE, iron = 2;
  if (base === 'feet') {
    for (const x of [-.32, .32]) box(b, stone, [x, top / 2, 0], [.13, top / 2, .39], { tile: [.56, .67], skip: [2] });
  } else {
    box(b, stone, [0, .08, 0], [.44, .08, .42], { tile: [.60, .74], skip: [2] });
    box(b, stone, [0, (top + .16) / 2, 0], [base === 'tapered' ? .32 : .43, (top - .16) / 2, .39],
      { tile: [.60, .74], skip: [2, 3] });
  }
  box(b, stone, [0, 1 - rim / 2, 0], [.49, rim / 2, .48], { tile: [.62, .72], skip: [2] });
  box(b, STAINED_TABLE_STONE, [0, 1 - rim / 2, 0], [.49, rim / 2, .48], {
    skip: [0, 1, 3, 4, 5], uvFace: (_, i) => [[0, 0], [0, 1], [1, 1], [1, 0]][i],
  });
  // Leave the middle clear for the existing loot surface.
  if (fittings === 'corner') for (const x of [-.40, .40]) for (const z of [-.39, .39]) {
    box(b, iron, [x, 1.014, z], [.049, .014, .045]);
  }
  if (fittings === 'straps') for (const z of [-.37, .37]) {
    box(b, 1, [0, 1.009, z], [.45, .009, .036]);
    box(b, iron, [.36, 1.022, z], [.048, .012, .043]);
  }
  if (fittings === 'rings' || fittings === 'cord') {
    const rope = fittings === 'cord';
    for (const [x, z] of [[-.34, -.33], [.34, .34]]) {
      const point = i => [x + Math.cos(i * Math.PI / 6) * .066, 1.014, z + Math.sin(i * Math.PI / 6) * .047];
      for (let i = 0; i < 12; i++) prism(b, rope ? 5 : iron, point(i), point(i + 1), .012, .012, 6, { caps: [false, false] });
    }
  }
  if (bones) prism(b, 114, [.30, 1.019, -.23], [.42, 1.021, -.08], .020, .014, 6);
}

// Normalized frame fits a humanoid seat rather than the original prop's oversized bounds.
export const restraintChairSize = [.78, 1.22, .84];

export function buildWorkshopFrame(b, id) {
  const chair = id === 41300;
  const wood = WORKSHOP_WOOD.beam;
  const iron = 2;
  const seatY = chair ? .36 : .52;
  for (const x of [-.42, .42]) for (const z of [-.40, .40]) {
    box(b, wood, [x, seatY / 2, z], [.058, seatY / 2, .059], { tile: [.35, .60], skip: [2] });
    box(b, iron, [x, .085, z], [.065, .035, .066]);
  }
  box(b, WORKSHOP_WOOD.boards, [0, seatY, 0], [.48, .05, .45], { tile: [.58, .48] });
  if (chair) {
    for (const x of [-.42, .42]) {
      box(b, wood, [x, .69, -.39], [.057, .31, .061], { tile: [.35, .60] });
      box(b, wood, [x, .55, -.04], [.063, .041, .34]);
      box(b, iron, [x, .59, .15], [.067, .014, .076]);
      for (let i = 0; i < 8; i++) {
        const point = j => [x + Math.cos(j * Math.PI / 8) * .062, .60 + Math.sin(j * Math.PI / 8) * .066, .15];
        prism(b, iron, point(i), point(i + 1), .013, .013, 6, { caps: [false, false] });
      }
    }
    for (const y of [.66, .84, .96]) box(b, WORKSHOP_WOOD.boards, [0, y, -.39], [.37, .041, .048]);
  } else {
    for (const x of [-.44, .44]) box(b, iron, [x, .61, 0], [.036, .042, .45]);
    for (const z of [-.40, .40]) box(b, wood, [0, .66, z], [.48, .051, .058]);
    for (const x of [-.34, .34]) box(b, 1, [x, .58, .14], [.065, .018, .18]);
  }
}
