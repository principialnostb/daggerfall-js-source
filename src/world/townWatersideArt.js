import { blendRgb, image, noiseField, putTexel, rng } from './superDungeon/sdPixelKit.js';

export const WATERSIDE_ARCHIVE = 38228;
export const WATERSIDE_ART = Object.freeze({ deck: 0, timberEnd: 1, pile: 2, boulder: 3 });

function paint(sample) {
  const tile = image(64);
  for (let y = 0; y < tile.height; y++) for (let x = 0; x < tile.width; x++) putTexel(tile, x, y, sample(x, y));
  return tile;
}

const WOOD = [[55, 47, 37], [69, 60, 48], [83, 72, 59], [97, 85, 70], [111, 99, 83], [126, 115, 101], [141, 130, 115]];
const STONE = [[62, 61, 56], [77, 76, 70], [91, 91, 84], [105, 104, 96], [119, 117, 108], [133, 130, 120], [148, 144, 134]];
const tone = (palette, value) => palette[Math.max(0, Math.min(palette.length - 1, Math.round(value)))];

function woodGrain(seed, alongX) {
  const rings = noiseField(seed, 3, 64, 64, 29), splits = noiseField(seed + 9, 7, 64, 64, 23);
  const pores = noiseField(seed + 19, 24, 64, 64, 29);
  return (x, y) => {
    const [along, across] = alongX ? [x, y] : [y, x];
    const grain = rings(along, across), split = splits(along, across);
    return (grain - .5) * 2.1 + (pores(along, across) - .5) * .95
      - (grain < .28 && split > .50 ? .85 : 0)
      + (grain > .66 && split < .52 ? .55 : 0);
  };
}

function deckPaint() {
  const random = rng(38425), grain = woodGrain(522, true), wear = noiseField(514, 7);
  const boards = Array.from({ length: 8 }, () => 2.5 + random() * 1.5);
  const damage = noiseField(671, 12, 64, 64, 18);
  return paint((x, y) => {
    const edge = y % 8, wearPatch = wear(x, y);
    if (edge === 0) return tone(WOOD, damage(x, y) > .7 ? 1 : 0);
    const chip = damage(x, y) > .71 && (edge === 1 || edge === 7);
    const bevel = edge === 1 && wearPatch > .45 ? .6 : edge === 7 ? -.6 : 0;
    return tone(WOOD, boards[y >> 3] + grain(x, y) + (wearPatch - .5) * 2 + bevel - (chip ? 1.4 : 0));
  });
}

function timberPaint(pile) {
  const grain = woodGrain(258, !pile), age = noiseField(751, 7);
  return paint((x, y) => {
    const weather = age(x, y);
    const damp = pile ? Math.max(0, Math.min(1, (y - 14 + weather * 11) / 17)) : 0;
    const wood = tone(WOOD, 3.05 + grain(x, y) + (weather - .5) * 2.3 - damp);
    return damp > .35 && weather > .50 ? blendRgb(wood, [57, 61, 43], .24) : wood;
  });
}

function boulderPaint() {
  const faces = noiseField(233, 8), grain = noiseField(941, 26), chips = noiseField(632, 17);
  const seams = noiseField(305, 6), breaks = noiseField(506, 9), moss = noiseField(729, 7);
  return paint((x, y) => {
    const drift = seams(x + Math.floor(y / 4), y) - .53, fragment = breaks(x, y);
    const crack = Math.abs(drift) < .022 && fragment > .47;
    const lip = drift > .022 && drift < .059 && fragment > .52;
    const bite = chips(x, y) < .26 ? -.8 : chips(x, y) > .73 ? .7 : 0;
    const stone = tone(STONE, 3.6 + (faces(x, y) - .5) * 3.35 + (grain(x, y) - .5) * 1.6
      + bite - (crack ? 1.35 : 0) + (lip ? .75 : 0));
    const lichen = moss(x, y);
    if (lichen < .67) return stone;
    return blendRgb(stone, lichen > .8 ? [105, 110, 83] : [83, 90, 63], lichen > .8 ? .36 : .25);
  });
}

const painters = [deckPaint, () => timberPaint(false), () => timberPaint(true), boulderPaint];
export const watersideMaterialEntries = gate => painters.map((build, record) => ({
  archive: WATERSIDE_ARCHIVE, record, standIn: true, gate,
  build: () => {
    const { width, height, colors } = build();
    return { width, height, data: colors };
  },
  fileName: 'town-waterside-' + record,
}));

export const FENCE_ART = Object.freeze({ rail: 4, post: 5, end: 6 });

const FENCE_WOOD = [[60, 53, 43], [73, 66, 55], [86, 80, 68], [101, 95, 82], [116, 110, 97], [130, 124, 111], [145, 139, 126]];

function fenceWood(post) {
  const grain = woodGrain(post ? 826 : 395, !post), wear = noiseField(post ? 602 : 818, 8);
  return paint((x, y) => {
    const patina = wear(x, y);
    const footing = post && y > 48 ? (y - 48) / 15 : 0;
    const wood = tone(FENCE_WOOD, (post ? 3.1 : 3.5) + grain(x, y) * 1.23 + (patina - .5) * 2.35 - footing * 1.4);
    return footing > .27 && patina > .56 ? blendRgb(wood, [65, 68, 48], footing * .34) : wood;
  });
}

function fenceEnd() {
  const wear = noiseField(501, 9);
  return paint((x, y) => {
    const patch = wear(x, y), dx = x - 28, dy = (y - 32) * .89;
    const ring = (Math.hypot(dx, dy) + patch * 3) % 6;
    const split = x < 30 && Math.abs(y - (31 + dx * .15)) < 1.2;
    return tone(FENCE_WOOD, 3.5 + (patch - .5) * 3 - (ring < 1.15 ? 1 : 0) - (split ? 1.55 : 0));
  });
}

export const fenceMaterialEntries = () => [
  [FENCE_ART.rail, () => fenceWood(false)],
  [FENCE_ART.post, () => fenceWood(true)],
  [FENCE_ART.end, fenceEnd],
].map(([record, build]) => ({
  archive: WATERSIDE_ARCHIVE, record, standIn: true, fileName: 'town-fence-' + record,
  build: () => {
    const { width, height, colors } = build();
    return { width, height, data: colors };
  },
}));
