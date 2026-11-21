import { blendRgb, image, noiseField, putTexel, ramp } from './superDungeon/sdPixelKit.js';

const TILE = 32;
const SIZE = TILE * 2;
const WALL = 0, DRESSED = 1, DAMP = 2, FOOT = 3;
const STONE = [
  [[57, 52, 46], [99, 92, 81], [137, 129, 115]],
  [[72, 67, 59], [119, 111, 98], [156, 148, 134]],
  [[42, 42, 36], [77, 75, 63], [111, 105, 90]],
  [[46, 43, 37], [87, 78, 65], [124, 115, 99]],
];
const MOSS = [[44, 48, 34], [68, 72, 49], [105, 106, 78]];

function stoneRamp([dark, mid, light]) {
  return Array.from({ length: 17 }, (_, i) =>
    i < 8 ? blendRgb(dark, mid, i / 8) : blendRgb(mid, light, (i - 8) / 8));
}

export function courtyardStonePaint() {
  const atlas = image(SIZE);
  const moss = stoneRamp(MOSS);
  for (const [tile, stops] of STONE.entries()) {
    const seed = 0x2170 + tile * 31;
    const broad = noiseField(seed, 5, TILE), chips = noiseField(seed + 1, 13, TILE);
    const stains = noiseField(seed + 2, 4, TILE);
    const stone = stoneRamp(stops);
    const left = (tile % 2) * TILE, bottom = Math.floor(tile / 2) * TILE;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const height = y / (TILE - 1);
      const volume = (broad(x, y) - .5) * .46 + (chips(x, y) - .5) * .13;
      const stain = stains(x, y);
      let color = stone;
      let tone;
      if (tile === WALL) {
        const courseLine = 15 + Number(x > 18);
        const jointX = y < courseLine ? 19 : 11;
        const edge = y === courseLine + 1 || x === jointX + 1 ? .15 : 0;
        const block = (y > courseLine ? .09 : -.04) + (x > jointX ? -.07 : .03);
        const mortar = x < 2 || x > 29 || y === courseLine || x === jointX;
        tone = mortar ? .13 + volume * .23 : .54 + block + volume + edge - Math.max(0, stain - .55) * .26;
      } else {
        const dirt = Math.max(0, stain - .39) * (tile === FOOT ? .53 : .30);
        tone = .54 + volume - dirt - (tile === FOOT ? (1 - height) * .13 : 0);
        const growth = stain + Math.max(0, .52 - height) * .27 + chips(x, y) * .07;
        if ((tile === FOOT && growth > .78) || (tile === DAMP && growth > .87)) color = moss;
      }
      putTexel(atlas, left + x, bottom + y, ramp(color, tone, x, y));
    }
  }
  return atlas;
}
const clamp = value => Math.max(0, Math.min(1, value));

// Map along each stone face and through its profile. Keep atlas edges out of near mip samples.
export function mapCourtyardStone(mesh, slot, part, sides, { dry = false, wallBottom = .108, wallHeight = .278 } = {}) {
  const step = Math.PI * 2 / sides;
  for (let i = slot.startIndex; i < slot.startIndex + slot.primitiveCount * 3; i += 3) {
    const { positions, normals, uvs } = mesh;
    const j = i * 3;
    const x = (positions[j] + positions[j + 3] + positions[j + 6]) / 3;
    const y = (positions[j + 1] + positions[j + 4] + positions[j + 7]) / 3;
    const z = (positions[j + 2] + positions[j + 5] + positions[j + 8]) / 3;
    const r = Math.hypot(x, z);
    const facing = r ? (normals[j] * x + normals[j + 2] * z) / r : 0;
    const facet = Math.floor(Math.atan2(z, x) / step);
    const angle = (facet + .5) * step;
    const pillar = r < .2 && y > .15;
    const joint = part === 'wall' && y > .325 && r > .35 && Math.abs(facing) < .2;
    let tile = DRESSED;
    if (part === 'foot') tile = FOOT;
    else if (dry && part === 'wall' && (y < .115 || facing < -.18)) tile = FOOT;
    else if (joint || facing < -.18 || (pillar && y < .33)) tile = DAMP;
    else if (part === 'wall' && !pillar && r > .33) tile = WALL;
    const horizontal = Math.abs(normals[j + 1]) > .83;
    const span = (pillar ? .17 : .49) * Math.sin(step / 2);
    for (let vertex = i; vertex < i + 3; vertex++) {
      const [px, py, pz] = positions.subarray(vertex * 3, vertex * 3 + 3);
      const along = (-px * Math.sin(angle) + pz * Math.cos(angle)) / (2 * span);
      const across = Math.hypot(px, pz);
      const u = clamp(.5 + (facet % 2 ? -along : along));
      let v;
      if (tile === FOOT) v = dry && part === 'wall' ? clamp(.32 + (py - .10) * 3.5 - across * .7) : py / .108;
      else if (tile === WALL) v = (py - wallBottom) / wallHeight;
      else if (tile === DAMP) v = joint ? .24 : (py - .22) / .18;
      else if (pillar) v = horizontal ? .2 + across * 3 : (py - .29) / .71;
      else v = horizontal ? (.50 - across) / .105 : (py - .32) / .115;
      const margin = tile === WALL ? 1.5 : 2.5;
      const range = TILE - margin * 2;
      uvs[vertex * 2] = ((tile % 2) * TILE + margin + u * range) / SIZE;
      uvs[vertex * 2 + 1] = (Math.floor(tile / 2) * TILE + margin + clamp(v) * range) / SIZE;
    }
  }
}
