import { paintFamily } from './paintFamily.js';
export const WORKSHOP_WOOD = { boards: 119, beam: 120, endGrain: 121 };

const size = 96;
const variation = (x, y) => ((Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263)) >>> 13 & 255) / 255;

export const workshopWoodPaints = paintFamily(Object.values(WORKSHOP_WOOD).map(record =>
  [record, () => workshopWoodPaint(record)]));

function workshopWoodPaint(record) {
  const colors = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const boards = record === WORKSHOP_WOOD.boards;
    const endGrain = record === WORKSHOP_WOOD.endGrain;
    const row = y % 32;
    const boardTone = boards ? [1.12, .88, 1.01][Math.floor(y / 32)] : 1;
    const wave = Math.sin(x * Math.PI / 48) + .55 * Math.sin(x * Math.PI / 24 + y * .16);
    const radius = Math.hypot((x - 48) * .8, y - 49);
    const grain = endGrain ? radius : y + wave * 2.7;
    const fibers = Math.sin(grain * 1.7) * .12 + Math.sin(grain * .59) * .10;
    const wear = (variation(x >> 2, y >> 1) - .5) * .16;
    const seam = boards && row < 3 ? [.48, .66, 1.17][row] : 1;
    const shade = Math.round((.97 + fibers + wear) * boardTone * seam * 24) / 24;
    const color = endGrain ? [113, 81, 51] : [111, 75, 45];
    colors.set([...color.map(channel => channel * shade), 255], (y * size + x) * 4);
  }
  return { width: size, height: size, colors };
}
