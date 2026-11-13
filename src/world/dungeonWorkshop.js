import { MeshBench, box, prism } from './ships/galleonMesh.js';
import { WORKSHOP_WOOD } from './dungeonWorkshopWood.js';
import { buildWorkshopFrame, buildWorkshopSlab } from './dungeonWorkshopVariants.js';

const models = new Map([
  [41300, 'frame'], [41303, 'frame'],
  [41304, 'slab'], [41305, 'slab'], [41306, 'press'],
  ...[41307, 41308, 41309, 41310, 41311].map(id => [id, 'slab']),
  [41312, 'cage'], [41313, 'cage'],
  [41811, 'chest'], [41812, 'chest'],
  ...[41100, 41101, 41102, 41103, 41104, 41105, 41106].map(id => [id, 'seat']),
  ...[41108, 41109, 41112, 41121].map(id => [id, 'table']),
]);
export const workshopKind = id => models.get(id);

export function buildDungeonWorkshop(archive, id) {
  const b = new MeshBench(archive);
  const kind = workshopKind(id);
  const iron = 2, dark = 11, stone = 115, edge = 116;
  const deck = WORKSHOP_WOOD.boards;
  const boards = (y, height, count, material, tile) => {
    for (let i = 0; i < count; i++) box(b, material, [0, y, (i + .5) / count - .5],
      [.495, height, .493 / count], { tile });
  };
  if (kind === 'chest') {
    const banded = id === 41812;
    box(b, deck, [0, .39, 0], [.47, .39, .46], { tile: [.70, .58] });
    box(b, deck, [0, .885, 0], [.49, .115, .49], { tile: [.72, .62] });
    const trim = banded ? iron : dark;
    for (const y of [.07, .76]) {
      box(b, trim, [0, y, 0], [.486, .035, .476], { skip: [2, 3] });
    }
    for (const x of banded ? [-.32, .32] : [-.43, .43]) {
      box(b, trim, [x, .41, .473], [.034, .31, .011]);
      box(b, trim, [x, .996, 0], [.034, .010, .486]);
    }
    box(b, trim, [0, .75, .493], [banded ? .11 : .074, .12, .007]);
    box(b, 4, [0, .73, .503], [.031, .052, .008]);
  } else if (kind === 'cage') {
    const wide = id === 41313;
    for (const [y, height] of [[.048, .048], [.954, .046]]) {
      box(b, deck, [0, y, 0], [.495, height, .499], { tile: wide ? [.55, .40] : [.85, .65], skip: [4, 5] });
      box(b, WORKSHOP_WOOD.endGrain, [0, y, 0], [.495, height, .499], { tile: [.25, .18], skip: [0, 1, 2, 3] });
    }
    for (const x of [-.459, .459]) for (const z of [-.459, .459]) {
      box(b, iron, [x, .5, z], [.030, .42, .030]);
      for (const y of [.105, .895]) box(b, dark, [x, y, z], [.036, .028, .036]);
    }
    for (const sign of [-1, 1]) for (const axis of [0, 2]) {
      const count = wide ? 11 : 7;
      for (let i = 0; i < count; i++) {
        const offset = -.399 + .798 * i / (count - 1);
        if (axis === 2 && sign === 1 && Math.abs(offset) < .235) continue;
        const [x, z] = axis === 0 ? [sign * .466, offset] : [offset, sign * .466];
        prism(b, dark, [x, .094, z], [x, .908, z], wide ? .011 : .016, wide ? .010 : .015, 6);
        for (const y of [.17, .84]) box(b, iron, [x, y, z], [.025, .011, .025]);
      }
      for (const y of [.12, .90]) box(b, iron, axis === 0 ? [sign * .48, y, 0] : [0, y, sign * .48],
        axis === 0 ? [.016, .020, .49] : [.46, .020, .016]);
    }
    for (const x of [-.223, .223]) box(b, iron, [x, .502, .481], [.017, .385, .018]);
    for (const y of [.124, .505, .88]) box(b, iron, [0, y, .481], [.215, .017, .018]);
    for (const x of [-.15, -.075, 0, .075, .15]) prism(b, dark, [x, .14, .481], [x, .864, .481], .012, .012, 6);
    for (const y of [.22, .77]) box(b, iron, [-.235, y, .491], [.036, .026, .009]);
    box(b, iron, [.222, .505, .491], [.056, .030, .009]);
  } else if (kind === 'press') {
    box(b, stone, [0, .54, 0], [.49, .16, .48]);
    box(b, edge, [0, .39, 0], [.498, .034, .489]);
    box(b, dark, [0, .84, 0], [.18, .155, .23]);
    for (const x of [-.36, -.12, .12, .36]) for (const z of [-.28, .28]) {
      prism(b, iron, [x, .38, z], [x, .035, z], .065, .002, 5);
    }
  } else if (kind === 'slab') {
    buildWorkshopSlab(b, id);
  } else if (kind === 'frame') {
    buildWorkshopFrame(b, id);
  } else {
    const seat = kind === 'seat', bench = id === 41105 || id === 41106;
    const height = seat ? .49 : .95;
    if (seat) boards(height, .045, 3, deck, [.58, .43]);
    else box(b, deck, [0, height, 0], [.495, .045, .499], { tile: [.50, .34] });
    for (const x of [-.39, .39]) for (const z of [-.37, .37]) {
      const top = seat && !bench && z < 0 ? .99 : height - .02;
      box(b, WORKSHOP_WOOD.beam, [x, top / 2, z], [.055, top / 2, .053], {
        uvFace: (_, k) => [[0, 0], [1.35, 0], [1.35, .32], [0, .32]][k],
      });
      box(b, dark, [x, .062, z], [.061, .032, .058]);
    }
    for (const z of [-.36, .36]) box(b, deck, [0, height - .086, z], [.44, .04, .038]);
    if (seat && !bench) for (const y of [.72, .87, .97]) {
      box(b, deck, [0, y, -.37], [.405, .034, .049], { tile: [.55, .50] });
    }
  }
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: mesh.slots[i].record }));
  return mesh;
}
