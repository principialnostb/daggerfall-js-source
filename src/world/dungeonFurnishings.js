import { MeshBench, box, prism } from './ships/galleonMesh.js';
import { FURNISHING_PAINT } from './treasureModel.js';

const WOOD = 3, IRON = 2, DARK = 11, CLOTH = 0, ROPE = 5, GLASS = 6;
const furnishings = new Map([
  ['200:0', 'Кубок'], ['204:6', 'Свёрнутый ковёр'],
  ['205:0', 'Бочка'], ['205:2', 'Стеклянная фляга'], ['205:12', 'Бутылка с этикеткой'],
  ['205:17', 'Мешок на боку'], ['205:19', 'Открытый мешок'], ['205:20', 'Завязанный мешок'],
  ['205:27', 'Деревянная тележка'], ['205:29', 'Деревянное ведро'], ['205:35', 'Бутыль'],
  ['205:36', 'Малый горшок'], ['205:42', 'Свёрнутая ткань'],
  ['206:27', 'Пустой кол'], ['211:29', 'Пустой кол'],
  ['206:32', 'Рогатый череп'],
  ['211:3', 'Груда щебня'], ['211:12', 'Стойка с клинками'], ['211:14', 'Связка копий'],
  ['211:15', 'Заросшее колесо'], ['211:16', 'Колесо'], ['211:18', 'Колодки'],
  ['211:26', 'Железный шкаф с шипами'], ['211:35', 'Каменная чаша'],
  ['211:43', 'Обломок доски'], ['211:44', 'Расщеплённая доска'],
  ['212:1', 'Сено'], ['214:6', 'Кирка'], ['214:13', 'Щипцы'],
  ['214:14', 'Ножницы'], ['214:2', 'Мотыга'], ['214:15', 'Рубанок'], ['218:3', 'Зелёный горшок'],
]);

export const dungeonFurnishingRecords = () => [...furnishings];
export const isDungeonFurnishing = id => furnishings.has(id);
export const dungeonFurnishingKind = (archive, record) => {
  const id = archive + ':' + record;
  return isDungeonFurnishing(id) ? id : null;
};

function vessel(b, profile, sides = 10, sideways = false, folded = false) {
  for (let i = 1; i < profile.length; i++) {
    const [y0, r0] = profile[i - 1], [y1, r1, material] = profile[i];
    for (let n = 0; n < sides; n++) {
      const a = n * 2 * Math.PI / sides, c = (n + 1) * 2 * Math.PI / sides;
      const p = (y, r, angle) => {
        const shape = folded ? 1 + .11 * Math.cos(angle * 5 + y * 1.8) : 1;
        const x = Math.cos(angle) * r * shape + (folded ? .055 * y : 0), z = Math.sin(angle) * r * shape;
        return sideways ? [y - .47, z + .42, x] : [x, y, z];
      };
      const points = [p(y0, r0, a), p(y1, r1, a), p(y1, r1, c), p(y0, r0, c)];
      const uv = Math.abs(y1 - y0) < .024 && Math.abs(r1 - r0) > .055
        ? points.map(([x, y, z]) => [z + .5, sideways ? y : x + .5])
        : [[n / sides, y0], [n / sides, y1], [(n + 1) / sides, y1], [(n + 1) / sides, y0]];
      b.quad(material, ...points, uv, null);
    }
  }
}

function bottle(b, form) {
  const { glass, glassEdge } = FURNISHING_PAINT;
  const width = form === 2 ? .46 : .33, neck = form === 35 ? .081 : .112;
  const shoulder = form === 2 ? .55 : form === 12 ? .57 : .43;
  vessel(b, [[.012, 0], [.012, width * .76, glass], [.047, width * .89, glassEdge], [.13, width, glass],
    [shoulder - .13, width, glass], [shoulder, width * .92, glass], [shoulder + .14, neck * 1.28, glass],
    [.86, neck, glass], [.89, neck * 1.29, glassEdge], [.935, neck * 1.29, glassEdge],
    [.94, neck * .77, glass], [.885, neck * .76, DARK], [.88, 0, DARK]], form === 12 ? 8 : 12);
  if (form !== 2) prism(b, WOOD, [0, .90, 0], [0, .99, 0], neck * .66, neck * .64, 7);
  if (form === 12) {
    box(b, 8, [0, .335, width * .96], [.142, .124, .017]);
    box(b, ROPE, [0, .34, width * .98], [.100, .048, .006]);
  }
}

function decorSack(b, record) {
  const open = record === 19, sideways = record === 17;
  const lip = open ? .29 : .106;
  const shape = [[.005, 0], [.005, .24, CLOTH], [.12, .37, CLOTH], [.32, .42, CLOTH],
    [.54, .385, CLOTH], [.72, open ? .31 : .22, CLOTH], [.82, lip, CLOTH],
    [.91, lip * 1.15, open ? ROPE : CLOTH], [.96, lip * 1.11, CLOTH], [.948, lip * .83, CLOTH],
    [.80, lip * .82, DARK], [open ? .43 : .80, open ? .23 : 0, DARK], [open ? .42 : .80, 0, DARK]];
  vessel(b, shape, 12, sideways, true);
  if (!open) {
    const knot = sideways ? [.34, .42, .11] : [.045, .835, .11];
    const end = sideways ? [.35, .44, -.013] : [.045, .859, .11];
    prism(b, ROPE, knot, end, .027, .031, 6);
    for (const sign of [-1, 1]) {
      const tip = sideways ? [.21, .41 + sign * .065, .15] : [.045 + sign * .068, .69, .19];
      prism(b, ROPE, knot, tip, .012, .006, 5);
    }
  }
}

function cart(b) {
  const { plank } = FURNISHING_PAINT;
  for (let i = 0; i < 5; i++) {
    box(b, plank, [(i - 2) * .116, .39, -.015], [.056, .045, .324], { tile: [1, 2] });
  }
  prism(b, IRON, [-.41, .26, -.07], [.41, .26, -.07], .035, .035, 8);
  for (const sign of [-1, 1]) {
    const x = sign * .30;
    for (const y of [.52, .68, .84]) box(b, plank, [x, y, -.015], [.030, .076, .328], { tile: [1, 2] });
    for (const z of [-.293, .282]) {
      box(b, WOOD, [x + sign * .033, .64, z], [.022, .268, .024]);
      for (const y of [.55, .81]) box(b, IRON, [x + sign * .057, y, z], [.009, .021, .011]);
    }
    prism(b, WOOD, [x * .84, .368, .13], [x * 1.04, .49, .55], .037, .024, 5);
    wheel(b, [sign * .375, .26, -.07], 0, .23);
  }
  for (const y of [.53, .70]) box(b, plank, [0, y, -.333], [.297, .08, .026], { tile: [2, 1] });
}

function wheel(b, center, axis, radius, material = WOOD) {
  const point = (a, r, face) => {
    const u = Math.cos(a) * r, v = Math.sin(a) * r;
    return center.map((value, i) => value + (axis === 1 ? [u, face, v] : [face, u, v * .53])[i]);
  };
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, c = a + Math.PI / 6;
    const rim = point(a, radius, 0);
    prism(b, material, rim, point(c, radius, 0), radius * .115, radius * .115, 5);
    if (i % 2 === 0) prism(b, WOOD, center, rim, radius * .085, radius * .065, 4);
  }
  const axle = axis === 1 ? .12 : .065;
  prism(b, DARK, point(0, 0, -axle), point(0, 0, axle), radius * .22, radius * .22, 8);
}

function stocks(b) {
  const plank = (x, y, w, h) => box(b, WOOD, [x, y, 0], [w, h, .095]);
  plank(0, .13, .48, .12);
  plank(0, .87, .48, .12);
  for (const [x, width, r] of [[-.323, .157, .073], [0, .166, .127], [.323, .157, .073]]) {
    const uv = [[0, 0], [.25, 0], [.25, 1], [0, 1]];
    const angles = [0, Math.PI / 6, Math.atan2(.25, width), Math.PI / 2];
    for (const angle of angles.slice(1, -1).reverse()) angles.push(Math.PI - angle);
    const half = [...angles, Math.PI];
    const ring = [...half, ...half.slice(1).map(angle => angle + Math.PI)];
    for (let n = 1; n < ring.length; n++) {
      const a = ring[n - 1], c = ring[n];
      const inner = (angle, z) => [x + r * Math.cos(angle), .50 + r * 1.72 * Math.sin(angle), z];
      const outer = (angle, z) => {
        const u = Math.cos(angle), v = Math.sin(angle);
        const scale = 1 / Math.max(Math.abs(u) / width, Math.abs(v) / .25);
        return [x + u * scale, .50 + v * scale, z];
      };
      for (const sign of [-1, 1]) {
        const z = sign * .095;
        const panel = [inner(a, z), inner(c, z), outer(c, z), outer(a, z)];
        b.quad(WOOD, ...panel, panel.map(([px, py]) => [px + .5, py]), [0, 0, sign]);
      }
      b.quad(DARK, inner(a, -.095), inner(c, -.095), inner(c, .095), inner(a, .095),
        uv, [-Math.cos((a + c) / 2), -Math.sin((a + c) / 2), 0]);
    }
  }
  for (const x of [-.48, .48]) {
    b.quad(WOOD, [x, .25, -.095], [x, .75, -.095], [x, .75, .095], [x, .25, .095],
      [[0, 0], [0, 1], [1, 1], [1, 0]], [Math.sign(x), 0, 0]);
  }
}

function weaponStand(b, swords) {
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + .20;
    const x = Math.cos(a), z = Math.sin(a);
    const foot = [x * .39, .025, z * .39], collar = [0, .72, 0];
    const end = [-x * .12, .96 - i * .025, -z * .12];
    prism(b, swords ? IRON : WOOD, foot, collar, swords ? .023 : .017, .024, swords ? 4 : 6);
    prism(b, IRON, collar, end, swords ? .015 : .027, swords ? .019 : .001, 4);
    if (swords) {
      prism(b, ROPE, [end[0] - .065, end[1] - .02, end[2]], [end[0] + .065, end[1] - .02, end[2]], .017, .017, 4);
      prism(b, DARK, end, [end[0], end[1] + .04, end[2]], .020, .017, 6);
    }
  }
  prism(b, ROPE, [0, .70, 0], [0, .74, 0], .063, .059, 7);
}

function ironCabinet(b) {
  box(b, DARK, [0, .027, -.10], [.44, .027, .34]);
  box(b, IRON, [0, .067, -.10], [.39, .013, .29]);

  // Both halves share the same outline at the seam. Separate inner and
  // outer surfaces give the casting a visible thickness from every view.
  const profile = [
    [.08, .22, .13], [.13, .25, .18], [.31, .26, .19],
    [.53, .31, .23], [.67, .37, .25], [.74, .35, .23],
    [.80, .23, .18], [.84, .17, .15], [.92, .16, .15],
    [.97, .125, .12], [1, .085, .07],
  ];
  const seam = -.035, hingeX = .34;
  const swing = Math.PI * 2 / 3, c = Math.cos(swing), s = Math.sin(swing);
  const body = (x, y, z) => [x, y, seam - z];
  const door = (x, y, z) => [hingeX + (x - hingeX) * c + z * s, y,
    seam - (x - hingeX) * s + z * c];

  function shell(place, depthScale) {
    const segments = 12;
    const ring = ([y, width, depth], i, inner) => {
      const a = i * Math.PI / segments;
      return place((width - inner) * Math.cos(a), y, (depth * depthScale - inner) * Math.sin(a));
    };
    const skin = (material, thickness, side) => {
      for (let j = 1; j < profile.length; j++) for (let i = 0; i < segments; i++) {
        const p = ring(profile[j - 1], i, thickness), q = ring(profile[j - 1], i + 1, thickness);
        const r = ring(profile[j], i + 1, thickness), t = ring(profile[j], i, thickness);
        const a = (i + .5) * Math.PI / segments, y = profile[j][0];
        const center = place(0, y, 0), toward = place(Math.cos(a), y, Math.sin(a));
        const facing = toward.map((n, k) => (n - center[k]) * side);
        const u = i / segments, v = (i + 1) / segments;
        b.quad(material, p, q, r, t, [[u, profile[j - 1][0]], [v, profile[j - 1][0]],
          [v, y], [u, y]], facing);
      }
    };
    skin(IRON, 0, 1);
    skin(DARK, .028, -1);
    for (const i of [0, segments]) {
      for (let j = 1; j < profile.length; j++) {
        const a = profile[j - 1], d = profile[j];
        const p = ring(a, i, 0), q = ring(d, i, 0);
        b.quad(IRON, p, q, ring(d, i, .028), ring(a, i, .028),
          [[0, a[0]], [0, d[0]], [.12, d[0]], [.12, a[0]]], null);
        prism(b, DARK, p, q, .012, .012, 6);
      }
    }
    for (const [row, sign] of [[profile[0], -1], [profile.at(-1), 1]]) {
      b.poly(IRON, Array.from({ length: segments + 1 }, (_, i) => ring(row, i, 0)),
        Array.from({ length: segments + 1 }, (_, i) => [i / segments, Math.sin(i * Math.PI / segments)]),
        [0, sign, 0]);
    }
  }
  shell(body, 1);
  shell(door, .53);

  for (const y of [.28, .62, .73]) {
    const axle = [hingeX, y, seam];
    prism(b, DARK, [axle[0], y - .029, seam], [axle[0], y + .029, seam], .032, .032, 8);
    prism(b, IRON, body(.27, y, .025), axle, .023, .023, 6);
    prism(b, IRON, axle, door(.25, y, .012), .019, .019, 6);
  }
  for (const [y, spread] of [[.23, .11], [.43, .14], [.63, .18]]) {
    for (const x of [-spread, 0, spread]) {
      prism(b, IRON, door(x, y, .055), door(x, y + .012, -.07), .021, .002, 5);
    }
  }

  const axes = [[c, 0, -s], [0, 1, 0], [s, 0, c]];
  // Curved reinforcing straps follow the casting instead of bridging it.
  for (const [y, width, depth] of [profile[2], profile[5], profile[8]]) {
    const onSkin = (angle, lift) => door(width * Math.cos(angle), y, depth * .53 * Math.sin(angle) + lift);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 12, next = (i + 1) * Math.PI / 12;
      const low = onSkin(a, .006), high = onSkin(next, .006);
      const edge = (p, offset) => [p[0], p[1] + offset, p[2]];
      b.quad(DARK, edge(low, -.011), edge(high, -.011), edge(high, .011), edge(low, .011),
        [[0, 0], [1, 0], [1, .25], [0, .25]], [s, 0, c]);
    }
    for (const angle of [Math.PI * .22, Math.PI * .5, Math.PI * .78]) {
      prism(b, IRON, onSkin(angle, .007), onSkin(angle, .019), .012, .008, 7);
    }
  }
  box(b, DARK, door(-.29, .65, .065), [.049, .022, .014], { axes });
  prism(b, IRON, door(-.33, .65, .080), door(-.25, .65, .080), .012, .012, 7);
}

function hornedSkull(b) {
  const bone = 10, ivory = FURNISHING_PAINT.bone;
  const ridge = [[-.37, .19, .10, .105], [-.24, .24, .174, .16], [-.10, .25, .154, .143],
    [.04, .215, .104, .104], [.19, .166, .085, .082], [.34, .135, .066, .069], [.43, .115, .040, .042]];
  const contour = (row, i) => {
    const [z, y, width, height] = ridge[row], a = i * Math.PI / 6;
    return [Math.cos(a) * width, y + Math.sin(a) * height, z];
  };
  for (let row = 1; row < ridge.length; row++) for (let i = 0; i < 12; i++) {
    if (row === 2 && [0, 1, 4, 5].includes(i)) continue;
    const a = (i + .5) * Math.PI / 6;
    b.quad(i % 3 === 0 ? bone : ivory, contour(row - 1, i), contour(row - 1, i + 1),
      contour(row, i + 1), contour(row, i), [[0, 0], [.3, 0], [.3, .35], [0, .35]],
      [Math.cos(a), Math.sin(a), 0]);
  }
  for (const sign of [-1, 1]) {
    const orbit = [[.138, .34, -.21], [.207, .31, -.125], [.208, .225, -.06], [.187, .15, -.108], [.134, .15, -.212], [.138, .23, -.26]];
    const rim = orbit.map(([x, y, z]) => [x * sign, y, z]);
    const recess = rim.map(([x, y, z]) => [(x * .60 + sign * .027), y * .70 + .068, z * .70 - .045]);
    for (let i = 0; i < orbit.length; i++) {
      const next = (i + 1) % orbit.length;
      prism(b, ivory, rim[i], rim[next], .024, .024, 6);
      b.quad(bone, rim[i], rim[next], recess[next], recess[i], [[0, 0], [1, 0], [1, 1], [0, 1]], [sign, .25, 0]);
    }
    b.poly(DARK, recess, recess.map(([, y, z]) => [y, z + .4]), [sign, .25, 0]);
    prism(b, bone, [.187 * sign, .15, -.108], [.086 * sign, .089, .26], .030, .016, 6);
    for (let i = 0; i < 4; i++) {
      const z = .21 + .058 * i;
      prism(b, ivory, [sign * (.082 - i * .008), .115, z],
        [sign * (.084 - i * .008), .047 + i * .011, z + .014], .014, .007, 4);
    }
    const horn = [[.13 * sign, .36, -.22], [.26 * sign, .51, -.23], [.37 * sign, .70, -.26],
      [.41 * sign, .87, -.29], [.39 * sign, .99, -.36]];
    const widths = [.076, .061, .041, .021, .002];
    for (let i = 1; i < horn.length; i++) prism(b, i === 1 ? bone : ivory, horn[i - 1], horn[i], widths[i - 1], widths[i], 7,
      { caps: [i === 1, i === horn.length - 1] });
  }
}

function build(b, id) {
  const [, record] = id.split(':').map(Number);
  switch (id) {
    case '200:0':
      vessel(b, [[.025, 0], [.025, .28, IRON], [.08, .33, IRON], [.13, .14, IRON],
        [.45, .075, IRON], [.50, .19, IRON], [.65, .33, IRON], [.95, .42, IRON],
        [.97, .39, IRON], [.97, .34, DARK], [.74, .25, IRON], [.60, 0, DARK]]);
      break;
    case '204:6':
      prism(b, 7, [-.41, .27, 0], [.42, .25, 0], .25, .23, 16, { capRec: CLOTH });
      box(b, 7, [0, .032, .24], [.41, .018, .16], { tile: [3, 2] });
      for (const x of [-.29, .29]) {
        prism(b, ROPE, [x - .017, .258, 0], [x + .017, .258, 0], .248, .248, 16, { caps: false });
      }
      for (const x of [-.413, .423]) for (let i = 0; i < 34; i++) {
        const p = n => {
          const r = .015 + n * .0061;
          return [x, .26 + r * Math.cos(n * .54), r * Math.sin(n * .54)];
        };
        prism(b, 7, p(i), p(i + 1), .007, .007, 4);
      }
      break;
    case '205:0':
      vessel(b, [[.025, 0], [.025, .32, DARK], [.07, .34, WOOD], [.22, .401, WOOD], [.28, .43, IRON],
        [.34, .443, IRON], [.35, .42, WOOD], [.49, .438, WOOD], [.63, .422, WOOD], [.64, .448, IRON],
        [.71, .436, IRON], [.72, .407, WOOD], [.91, .35, WOOD], [.97, .348, IRON],
        [.97, .30, WOOD], [.91, .29, DARK], [.91, 0, WOOD]], 14);
      for (let i = 0; i < 14; i++) {
        const a = i * Math.PI / 7;
        const p = (y, r) => [Math.cos(a) * r, y, Math.sin(a) * r];
        for (const [y, r] of [[.313, .436], [.678, .442]]) prism(b, DARK, p(y, r - .006), p(y, r + .012), .010, .008, 5);
        prism(b, DARK, p(.36, .425), p(.49, .440), .004, .004, 4);
        prism(b, DARK, p(.49, .440), p(.62, .425), .004, .004, 4);
      }
      break;
    case '205:2': case '205:12': case '205:35':
      bottle(b, record);
      break;
    case '205:17': case '205:19': case '205:20':
      decorSack(b, record);
      break;
    case '205:27':
      cart(b);
      break;
    case '205:29':
      vessel(b, [[.02, 0], [.035, .28, DARK], [.68, .42, FURNISHING_PAINT.wicker], [.77, .44, ROPE], [.81, .39, ROPE],
        [.80, .34, FURNISHING_PAINT.wicker], [.19, .23, DARK], [.19, 0, DARK]], 12);
      for (let n = 0; n < 6; n++) {
        const point = i => [.42 * Math.cos(i * Math.PI / 6), .76 + .23 * Math.sin(i * Math.PI / 6), 0];
        prism(b, IRON, point(n), point(n + 1), .021, .021, 5);
      }
      break;
    case '205:36':
      vessel(b, [[.015, 0], [.015, .24, DARK], [.08, .28, 8], [.26, .42, 8], [.51, .43, 8],
        [.70, .32, 8], [.83, .29, DARK], [.91, .35, 8], [.97, .34, 8], [.96, .27, 8],
        [.80, .25, DARK], [.32, .26, DARK], [.19, .18, DARK], [.19, 0, DARK]], 12);
      break;
    case '205:42': {
      prism(b, CLOTH, [-.42, .23, 0], [.43, .25, 0], .20, .22, 9, { capRec: ROPE });
      box(b, CLOTH, [-.05, .055, .19], [.36, .04, .19]);
      break;
    }
    case '206:27': case '211:29':
      prism(b, WOOD, [-.29, 0, 0], [.27, .90, 0], .047, .038, 5);
      prism(b, WOOD, [.27, .90, 0], [.32, 1, 0], .038, .002, 5);
      break;
    case '206:32':
      hornedSkull(b);
      break;
    case '211:3':
      for (const [x, z, r, h] of [[-.23, .04, .16, .62], [.12, -.11, .21, .82], [.31, .15, .12, .47],
        [0, .21, .16, .54], [-.34, -.12, .085, .32], [.26, -.22, .11, .44]]) {
        prism(b, 10, [x, .02, z], [x + .035, h, z - .03], r, r * .48, 5);
      }
      break;
    case '211:12': case '211:14':
      weaponStand(b, record === 12);
      break;
    case '211:15': case '211:16':
      wheel(b, [0, .20, 0], 1, .42, record === 15 ? 7 : WOOD);
      prism(b, WOOD, [0, .20, 0], [0, .96, 0], .061, .055, 6);
      break;
    case '211:18':
      stocks(b);
      break;
    case '211:26':
      ironCabinet(b);
      break;
    case '211:35':
      vessel(b, [[.02, .01], [.02, .33, DARK], [.16, .36, DARK], [.26, .24, DARK],
        [.39, .19, DARK], [.46, .25, DARK], [.68, .39, DARK], [.91, .48, IRON],
        [.94, .46, IRON], [.94, .39, DARK], [.68, .26, DARK], [.58, .02, DARK]], 12);
      break;
    case '211:43': case '211:44':
      for (let i = 0; i < (record === 44 ? 3 : 2); i++) {
        const x = (i - .5) * .21;
        const shoulder = [x + .17, .70, .04 * i];
        prism(b, i === 1 ? WOOD : 7, [x - .08, .015, -.03 * i], shoulder, .115, .097, 5);
        prism(b, WOOD, shoulder, [x + .12, .99 - .085 * i, .05 * i], .097, .005, 5);
      }
      break;
    case '212:1':
      vessel(b, [[.025, .03], [.05, .48, ROPE], [.27, .43, ROPE], [.56, .32, ROPE],
        [.82, .21, ROPE], [.97, .06, CLOTH], [.98, 0, CLOTH]], 11);
      for (let i = 0; i < 17; i++) {
        const a = i * 2.4, y = .12 + (i % 6) * .12, radius = .49 - y * .34;
        prism(b, CLOTH, [Math.cos(a) * radius, y, Math.sin(a) * radius],
          [Math.cos(a + .28) * (radius + .047), y + .11, Math.sin(a + .28) * (radius + .047)], .012, .002, 4);
      }
      break;
    case '214:2': case '214:6': {
      const head = [-.25, .68, .02];
      prism(b, WOOD, [.41, .16, -.04], head, .033, .028, 6);
      if (record === 6) {
        prism(b, IRON, head, [-.45, .33, -.12], .055, .006, 5);
        prism(b, IRON, head, [-.13, .78, .16], .051, .005, 5);
      } else {
        prism(b, DARK, head, [-.32, .47, .08], .047, .033, 7);
        const spineA = [-.33, .46, -.015], spineB = [-.33, .46, .18];
        const edgeA = [-.43, .28, -.085], edgeB = [-.43, .28, .25];
        b.quad(DARK, spineA, spineB, edgeB, edgeA, [[0, 0], [1, 0], [1, 1], [0, 1]], null);
        b.quad(IRON, edgeA, edgeB, spineB, spineA, [[0, 1], [1, 1], [1, 0], [0, 0]], null);
        prism(b, IRON, edgeA, edgeB, .012, .012, 5);
      }
      break;
    }
    case '214:13': case '214:14':
      for (const sign of [-1, 1]) {
        prism(b, DARK, [-.38, .19, sign * .17], [.06, .42, 0], .025, .039, 5);
        prism(b, IRON, [.06, .42, 0], [.43, .26, sign * .075], .035, .009, 4);
        if (record === 14) wheel(b, [-.38, .19, sign * .17], 1, .08, IRON);
      }
      break;
    case '214:15':
      box(b, WOOD, [0, .28, 0], [.41, .21, .19]);
      prism(b, IRON, [-.12, .40, 0], [.09, .77, 0], .086, .082, 4);
      box(b, WOOD, [.22, .59, 0], [.087, .11, .075]);
      break;
    case '218:3':
      vessel(b, [[.04, 0], [.04, .24, DARK], [.26, .37, GLASS], [.61, .43, GLASS],
        [.78, .30, GLASS], [.84, .34, DARK], [.95, .32, GLASS], [.95, .25, GLASS],
        [.79, .23, DARK], [.25, .15, DARK], [.25, 0, DARK]]);
      break;
  }
}

export function buildDungeonFurnishing(archive, id) {
  const b = new MeshBench(archive);
  build(b, id);
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: mesh.slots[i].record }));
  return mesh;
}
