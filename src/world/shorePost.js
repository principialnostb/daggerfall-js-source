import { createMeshKit } from './eliteGates/meshKit.js';
import { WORKSHOP_WOOD } from './dungeonWorkshopWood.js';
import { STAINED_PRESS_IRON } from './dungeonTortureTable.js';

const SECTION = [[-.39, -.36], [.25, -.40], [.37, -.21], [.34, .32], [-.23, .41], [-.41, .18]];
const POST_WIDTH = { '212:13': 1, '212:14': 16 / 28 };

export const DAMP_POST_WOOD = 142;
export function dampPostPaint(paint) {
  const colors = paint.colors.slice();
  for (let i = 0; i < colors.length; i += 4) {
    const x = (i / 4) % paint.width;
    const wet = Math.max(0, 1 - x / (paint.width * .8));
    colors[i] *= 1 - .45 * wet;
    colors[i + 1] *= 1 - .28 * wet;
    colors[i + 2] *= 1 - .28 * wet;
  }
  return { ...paint, colors };
}

export const isShorePost = id => Object.hasOwn(POST_WIDTH, id);

// A wet site can lower the pond bed after the original base was placed.
export function shorePostFoot(placement, height, floor) {
  const y = floor(placement.x, placement.z);
  const drop = y == null ? 0 : y - placement.y;
  return drop < -.015 ? [(drop - .12) / height] : null;
}

function postTimber(kit, scale, foot, wet, colors) {
  const { timber, damp } = colors;
  const drift = wet ? .036 : -.008;
  const rings = [[foot, 1, 0], [.075, 1.02, 0], [.17, .98, -.02], [.52, .91, -.032 + drift * .5],
    [.89, .83, -.073 + drift], [.946, .73, -.064 + drift], [.964, .58, -.053 + drift]];
  const ring = rings.map(([y, size, lean]) => SECTION.map(([x, z], i) =>
    [(x * size + lean) * scale, y + (y > .89 ? (i % 3 - 1) * .013 : 0), z * size * scale]));
  for (let row = 1; row < ring.length; row++) {
    for (const [side, [x, z]] of SECTION.entries()) {
      const next = (side + 1) % SECTION.length;
      const [a, b, c, d] = [ring[row - 1][side], ring[row - 1][next], ring[row][next], ring[row][side]];
      const out = [x + SECTION[next][0], 0, z + SECTION[next][1]];
      const material = wet && row <= 2 ? damp : timber;
      kit.quad(material, a, b, c, d, out, true,
        [[a[1] * 5, 0], [b[1] * 5, .46], [c[1] * 5, .46], [d[1] * 5, 0]]);
    }
  }
  const crown = ring.at(-1);
  for (let i = 1; i < crown.length - 1; i++) {
    kit.tri(WORKSHOP_WOOD.endGrain, crown[0], crown[i], crown[i + 1], [0, 1, 0]);
  }
  kit.lathe(STAINED_PRESS_IRON, [[.055, .932], [.055, .982], [.105, .982], [.107, .994], [.081, 1], [0, 1]]
    .map(([r, y]) => [r * scale, y]), 6, { centre: [(-.047 + drift) * scale, 0, -.011 * scale] });
}

function bankGrass(kit, scale, green) {
  for (let i = 0; i < 8; i++) {
    const angle = i * 1.37, dx = Math.cos(angle), dz = Math.sin(angle);
    const x = .25 * scale, z = .23 * scale;
    const rise = .044 + .072 * (.5 + .5 * Math.sin(i * 8.4));
    const reach = .21 + .10 * Math.sin(i * 4.1);
    const a = [x - dz * .014, .01, z + dx * .014], b = [x + dz * .014, .01, z - dx * .014];
    const mid = [x + dx * reach * .57, rise, z + dz * reach * .57];
    const tip = [x + dx * reach, rise * .64, z + dz * reach];
    const shoulder = [mid[0] + dz * .022, mid[1], mid[2] - dx * .022];
    kit.quad(green, a, b, shoulder, mid);
    kit.quad(green, mid, shoulder, b, a);
    kit.tri(green, mid, shoulder, tip);
    kit.tri(green, tip, shoulder, mid);
  }
}

export function buildShorePost(archive, id, foot, colors) {
  const scale = POST_WIDTH[id], wet = id === '212:14', kit = createMeshKit();
  postTimber(kit, scale, foot, wet, colors);
  if (wet) bankGrass(kit, scale, colors.green);
  return kit.pack(archive);
}
