import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARENA2, everyLocation, HAVE_ARENA2, openTowns } from '../test/fb1004dArena.mjs';
import { LOCATION_TYPES, longitudeLatitudeToMapPixel } from '../src/formats/mapsFile.js';
import { WoodsFile } from '../src/formats/woodsFile.js';
import { townGateRoads } from '../src/world/townGates.js';
import { generatePixelTerrain } from '../src/world/terrain/terrainGen.js';
import { convertTile } from '../src/world/terrain/terrainSurface.js';
import { setLocationTiles, unstampOffShape } from '../src/world/terrain/terrainTiles.js';
import { PUDDLE_RECORDS } from '../src/world/puddleMask.js';
import { WATER_DRAW_MASK_TABLE } from '../src/world/water/waterCorners.js';
import { pondMask, pondSites, POND_SIDE as side } from '../src/world/water/pondSites.js';
import { isMain } from './lib/isMain.mjs';

export const townTypes = new Set([LOCATION_TYPES.TownCity, LOCATION_TYPES.TownHamlet, LOCATION_TYPES.TownVillage]);
const offsets = [0, 1, side, side + 1];

// Start from the atlas and original stamp, so dropping a pond from the fitter cannot erase the expectation.
export function wetVertices(stamp) {
  const wet = stamp.map(raw => {
    const byte = convertTile(raw);
    return raw && !PUDDLE_RECORDS.includes(byte >> 2) ? WATER_DRAW_MASK_TABLE[byte] : 0;
  });
  const result = [];
  for (let i = 0; i < wet.length - side - 1; i++) {
    if (!(wet[i] & 8) || i % side === side - 1) continue;
    if (offsets.every((d, k) => wet[i + d] & (8 >> k))) result.push(i);
  }
  return result;
}

export function missingVertices(expected, sites, bytes) {
  const covered = new Set(sites.flatMap(site => site.cells));
  return expected.filter(i => !offsets.every((d, k) => covered.has(i + d) && (pondMask(bytes[i + d]) & (8 >> k))));
}

export function terrainInputs(rivers = false) {
  const woods = new WoodsFile();
  woods.load(readFileSync(join(ARENA2, 'WOODS.WLD')));
  const layer = kind => readFileSync(new URL(`../vendor/roads-hazelnut/${kind}Data.bytes`, import.meta.url));
  const roads = { roads: layer('road'), tracks: layer('track'), smooth: true, water: rivers };
  if (rivers) Object.assign(roads, { rivers: layer('river'), streams: layer('stream') });
  return { woods, roads };
}

export function buildTownTerrain(loc, maps, blocks, inputs) {
  const { x: px, y: py } = longitudeLatitudeToMapPixel(loc.mapTableData.longitude, loc.mapTableData.latitude);
  const stamp = new Uint8Array(side ** 2);
  const rect = setLocationTiles(loc, maps, blocks, stamp);
  rect.gateRoads = townGateRoads(loc, maps, blocks);
  const terrain = generatePixelTerrain({
    ...inputs, px, py, tilemap: stamp.slice(), locationRect: rect, hasLocation: true, climateType: 0, landform: true, bed: true,
  });
  if (terrain.townGround) unstampOffShape(stamp, rect.shape, terrain.townGround);
  return { terrain, stamp, px, py };
}

if (isMain(import.meta.url)) {
  if (!HAVE_ARENA2) throw new Error('Set ARENA2_PATH to the game data directory.');
  const inputs = terrainInputs(process.argv.includes('--rivers'));
  for (const mods of [false, true]) {
    const { maps, blocks } = await openTowns({ mods });
    const profile = mods ? 'Beautiful Villages + Beautiful Cities' : 'Classic';
    let towns = 0, wet = 0, missed = 0;
    for (const { loc, r, l } of everyLocation(maps)) {
      if (!loc?.loaded || !townTypes.has(loc.mapTableData.locationType)) continue;
      towns++;
      const { terrain, stamp, px, py } = buildTownTerrain(loc, maps, blocks, inputs);
      const expected = wetVertices(stamp);
      if (!expected.length) continue;
      wet++;
      const sites = pondSites(px, py, terrain.tilemapBytes, terrain.positions, terrain.paths);
      const missing = missingVertices(expected, sites, terrain.tilemapBytes);
      if (!missing.length) continue;
      missed++;
      const i = missing[0];
      console.info(`${profile} | ${loc.name} (${r}/${l}) | map ${px},${py} | first vertex ${i % side + 1},${Math.floor(i / side) + 1} | ${missing.length}/${expected.length} uncovered`);
    }
    if (missed) process.exitCode = 1;
    console.info(`${profile} | ${towns} settlements | ${wet} with pond vertices | ${missed} with uncovered vertices`);
  }
}
