import { TILE } from '../road/roadPainter.js';
import { convertTile } from '../terrain/terrainSurface.js';
import { MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE } from '../terrain/terrainSampler.js';
import { SHORE_FAMILIES, WATER_DRAW_MASK_TABLE as masks } from './waterCorners.js';
import { pondSites, POND_SIDE as side } from './pondSites.js';

const paved = record => record === TILE.road || record === TILE.roadDirt || record === TILE.roadGrass;
const stoneBank = new Uint8Array(16);
for (const record of SHORE_FAMILIES[2]) for (let turn = 0; turn < 4; turn++) {
  const byte = record * 4 + turn;
  stoneBank[masks[byte]] = byte;
}

// Older blocks sometimes bake the street into the water. Read each corner from all
// available non-road neighbours. A conflict or an unknown corner leaves the tile alone.
function crossingMask(bytes, paths, x, z) {
  let mask = 0;
  for (let corner = 0; corner < 4; corner++) {
    const cx = x + (corner & 1), cz = z + (corner >> 1);
    let vote = -1;
    for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) {
      const nx = cx - dx, nz = cz - dz, i = nz * side + nx;
      if ((nx === x && nz === z) || paths?.[i] || paved(bytes[i] >> 2)) continue;
      const wet = (masks[bytes[i]] >> (2 * dz + dx)) & 1;
      if (vote >= 0 && vote !== wet) return 0;
      vote = wet;
    }
    if (vote < 0) return 0;
    mask |= vote << corner;
  }
  return mask;
}

// Resolve before the bed, billboards and navigation consume the shared tilemap.
// Only a level enclosed component can commit its candidate water tiles.
export function restorePondCrossings(stamp, raw, bytes, paths, yardPaths, samples) {
  if (!stamp) return;
  let candidate;
  const changes = [];
  for (let i = 0; i < stamp.length; i++) {
    if (!stamp[i] || (!paths?.[i] && !paved(bytes[i] >> 2))) continue;
    const authored = convertTile(stamp[i]);
    let next = authored;
    if (!masks[authored]) {
      if (!paved(authored >> 2)) continue;
      const x = i % side, z = Math.floor(i / side);
      if (!x || !z || x === side - 1 || z === side - 1) continue;
      const mask = crossingMask(bytes, paths, x, z);
      if (!mask) continue;
      next = mask === 15 ? 0 : stoneBank[mask];
    }
    candidate ??= bytes.slice();
    candidate[i] = next;
    changes.push(i);
  }
  if (!candidate) return;
  const h = (x, z) => Math.fround(samples[x * (side + 1) + z] * MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE);
  // Use the ordinary closure test even for the hand-surveyed site.
  const accepted = new Set(pondSites(0, 0, candidate, null, null, side, null, h).flatMap(s => s.cells));
  for (const i of changes) {
    if (!accepted.has(i)) continue;
    const byte = candidate[i];
    bytes[i] = byte;
    raw[i] = byte === 0 ? 255 : (byte >> 2) | ((byte & 3) << 6);
    if (paved(byte >> 2)) continue;
    if (paths) paths[i] = 0;
    if (yardPaths) yardPaths[i] = 0;
  }
}
