import { getLocationTerrainTileOrigin } from '../terrain/terrainTiles.js';
import { quarterOf } from '../../ui/town/townQuarters.js';
import { BRIDGE, bridgeFrame } from '../road/roadBridges.js';
import { TILE_UNITS } from './waterBed.js';

export function pondStructuresAt(location, maps, blocks, bridges, px, py) {
  const building = pondBuildingAt(location, maps, blocks);
  if (!bridges?.length) return building;
  const decks = bridges.map(b => ({ ...bridgeFrame(b, px, py), half: b.half,
    width: BRIDGE[b.kind === 'road' ? 'road' : 'track'].width }));
  return (x, z) => building?.(x, z) || decks.some(d => {
    const dx = (x + .5) * TILE_UNITS - d.cx, dz = (z + .5) * TILE_UNITS - d.cz;
    const margin = .5 * TILE_UNITS * (Math.abs(d.ax) + Math.abs(d.az));
    return Math.abs(dx * d.ax + dz * d.az) <= d.half + margin
      && Math.abs(dz * d.ax - dx * d.az) <= d.width * .5 + margin;
  });
}

// A block's automap has four footprint pixels per ground tile, with north at row zero.
// Read only blocks an otherwise suitable pond actually touches.
export function pondBuildingAt(location, maps, blocks) {
  if (!location) return null;
  const { width, height } = location.exterior.exteriorData;
  const origin = getLocationTerrainTileOrigin(location);
  const masks = new Map();
  return (x, z) => {
    const tx = x - origin.x, tz = z - origin.y;
    const bx = Math.floor(tx / 16), bz = Math.floor(tz / 16);
    if (bx < 0 || bx >= width || bz < 0 || bz >= height) return false;
    const key = bz * width + bx;
    if (!masks.has(key)) {
      const name = blocks.checkName(maps.getRmbBlockName(location, bx, bz));
      const i = blocks.getBlockIndex(name);
      const art = i < 0 ? null : blocks.getBlock(i)?.rmbBlock?.fldHeader.autoMapData;
      const mask = new Uint8Array(256);
      if (art) for (let j = 0; j < 4096; j++) {
        if (quarterOf(art[j]) === null) continue;
        mask[(15 - (j >> 8)) * 16 + ((j & 63) >> 2)] = 1;
      }
      masks.set(key, mask);
    }
    return !!masks.get(key)[(tz % 16) * 16 + tx % 16];
  };
}
