// Local visual pilot for the linked pools at the surveyed Skyrim settlement.
// Coordinates below are terrain tiles within its 128-tile map pixel.
import { POND_DEPTH_OFFSET, WATER_DRAW_MASK_TABLE, waterCoverage } from './waterCorners.js';
import { pondShoreMesh } from './pondShore.js';
import { TILE_UNITS } from './waterBed.js';
import { WATER_LIFT } from '../../render/waterSurface.js';

const SIDE = 128, GRID = SIDE + 1;
const WEST = 66, EAST = 73, SOUTH = 65, NORTH = 71;
const SUB = 8, WIDTH = (EAST - WEST) * SUB + 1, HEIGHT = (NORTH - SOUTH) * SUB + 1;
const WATERLINE = 0.44;
let pilotIndices;

export const isSurveyedPondPixel = (px, py) => px === 1551 && py === -372;

// The record between the pools has opposite wet corners. Cut a winding thalweg
// between them, tapering back into the surveyed corner depths at each end.
function channelDepth(x, z) {
  const along = ((x - 68) + (z - 67)) * 0.5;
  if (along <= 0 || along >= 1) return 0;
  const taper = Math.sin(Math.PI * along);
  const across = ((x - 68) - (z - 67)) / Math.SQRT2 - 0.10 * taper;
  const radius = (across < 0 ? 0.40 : 0.47) * Math.sqrt(taper);
  const section = Math.max(0, 1 - (across / radius) ** 2);
  return 1.12 * section ** 2 * Math.min(1, taper * 3);
}

// Sample the two rendered triangles, including their diagonal, in pixel-local metres.
function floorSampler(heights) {
  return (x, z) => {
    const gx = (x / TILE_UNITS - WEST) * SUB, gz = (z / TILE_UNITS - SOUTH) * SUB;
    if (gx < 0 || gz < 0 || gx >= WIDTH - 1 || gz >= HEIGHT - 1) return null;
    const ix = Math.floor(gx), iz = Math.floor(gz), i = iz * WIDTH + ix;
    const u = gx - ix, v = gz - iz;
    return heights[i] * (1 - Math.max(u, v)) + heights[i + WIDTH + 1] * Math.min(u, v)
      + (u > v ? heights[i + 1] * (u - v) : heights[i + WIDTH] * (v - u));
  };
}

function patchIndices(gridIndices) {
  if (pilotIndices) return pilotIndices;
  const kept = [];
  for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) {
    if (x >= WEST && x < EAST && z >= SOUTH && z < NORTH) continue;
    const offset = (z * SIDE + x) * 6;
    for (let k = 0; k < 6; k++) kept.push(gridIndices[offset + k]);
  }
  for (let z = 0; z < HEIGHT - 1; z++) for (let x = 0; x < WIDTH - 1; x++) {
    const a = GRID * GRID + z * WIDTH + x;
    kept.push(a, a + WIDTH, a + WIDTH + 1, a, a + WIDTH + 1, a + 1);
  }
  pilotIndices = Uint32Array.from(kept);
  return pilotIndices;
}

export function pondTerrain(renderer, px, py, bytes, bed, positions, normals, indices) {
  if (!isSurveyedPondPixel(px, py) || !bed || positions.length !== GRID * GRID * 3)
    return renderer.createTerrainSurface(positions, normals, indices);

  // An altered settlement layout or a slope needs its own survey.
  if ((bytes[68 * SIDE + 70] >> 2) !== 0 || bytes[66 * SIDE + 67] !== (22 << 2 | 1)
    || bytes[69 * SIDE + 71] !== (22 << 2 | 3)) return renderer.createTerrainSurface(positions, normals, indices);
  const level = bed.sheet[(SOUTH * GRID + WEST) * 3 + 1];
  for (let z = SOUTH; z <= NORTH; z++) for (let x = WEST; x <= EAST; x++) {
    if (Math.abs(bed.sheet[(z * GRID + x) * 3 + 1] - level) > 0.001)
      return renderer.createTerrainSurface(positions, normals, indices);
  }

  const pos = new Float32Array(positions.length + WIDTH * HEIGHT * 3);
  const norm = new Float32Array(pos.length);
  const bankDepth = new Float32Array(pos.length / 3);
  pos.set(positions);
  norm.set(normals);
  const heights = new Float32Array(WIDTH * HEIGHT);
  const hasChannel = bytes[67 * SIDE + 68] === 196;
  const cornerDepth = (x, z) => {
    const tx = Math.floor(x), tz = Math.floor(z);
    const mask = WATER_DRAW_MASK_TABLE[bytes[tz * SIDE + tx]];
    const coverage = waterCoverage(mask, x - tx, z - tz);
    // Slightly different slopes on opposing banks expose irregular strips of silt.
    const bank = Math.sin(2.4 * (x - WEST) + 1.6 * (z - SOUTH));
    const basin = 1.55 * coverage ** (1.8 + 0.38 * bank);
    return hasChannel ? Math.max(basin, channelDepth(x, z)) : basin;
  };
  for (let iz = 0; iz < HEIGHT; iz++) for (let ix = 0; ix < WIDTH; ix++) {
    const x = WEST + ix / SUB, z = SOUTH + iz / SUB;
    const i = positions.length + (iz * WIDTH + ix) * 3;
    bankDepth[i / 3] = cornerDepth(x, z);
    pos.set([x * TILE_UNITS, level - bankDepth[i / 3], z * TILE_UNITS], i);
    heights[iz * WIDTH + ix] = pos[i + 1];
    const dx = cornerDepth(x + 1 / SUB, z) - cornerDepth(x - 1 / SUB, z);
    const dz = cornerDepth(x, z + 1 / SUB) - cornerDepth(x, z - 1 / SUB);
    const dy = 2 * TILE_UNITS / SUB, len = Math.hypot(dx, dy, dz);
    norm.set([dx / len, dy / len, dz / len], i);
  }
  // The sheet uses the original indexed lattice. A separate copy keeps gameplay
  // heights and the worker's grid intact. Suppress ocean heave in the small basin.
  bed.pondFloor = floorSampler(heights);
  bed.sheet = bed.sheet.slice();
  bed.sheetDepths = bed.sheetDepths.slice();
  bed.depths = bed.depths.slice(); // the snow and flora sample the coarse drawn floor
  for (let z = SOUTH; z <= NORTH; z++) for (let x = WEST; x <= EAST; x++) {
    const i = z * GRID + x;
    bed.depths[i] = cornerDepth(x, z);
    bed.sheet[i * 3 + 1] = level - WATERLINE - WATER_LIFT;
    bed.sheetDepths[i] = -POND_DEPTH_OFFSET - Math.max(0.015, bed.depths[i] - WATERLINE);
  }
  return renderer.createTerrainSurface(pos, norm, patchIndices(indices), bankDepth, pondShoreMesh(bed.pondFloor, level - WATERLINE));
}
