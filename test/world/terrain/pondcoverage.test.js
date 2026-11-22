import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTownTerrain, missingVertices, terrainInputs, townTypes, wetVertices } from '../../../tools/pondTerrainSweep.mjs';
import { pondColumnReader } from '../../../src/world/water/pondTerrain.js';
import { TILE_UNITS } from '../../../src/world/water/waterBed.js';
import { convertTile } from '../../../src/world/terrain/terrainSurface.js';
import { setLocationTiles } from '../../../src/world/terrain/terrainTiles.js';
import { TOWN_OUTLINE_BLOCK, TOWN_OUTLINE_BLOCK_INDEX, townOutlineBlockJson } from '../../../src/world/townOutline.js';
import { arenaTemplates } from '../../../src/world/arenaLocations.js';
import { restorePondCrossings } from '../../../src/world/water/pondCrossings.js';
import { pondSites, POND_SIDE as side } from '../../../src/world/water/pondSites.js';
import { everyLocation, openTowns, SKIP } from '../../fb1004dArena.mjs';
import { sweepClone, SWEEP_KINDS } from '../../../tools/townBoardsSweep.mjs';

const samples = new Float32Array((side + 1) ** 2);

for (const mods of [false, true]) {
  test(`town pond coverage on level land, ${mods ? 'Beautiful Villages and Beautiful Cities' : 'classic'}`, { skip: SKIP }, async t => {
    const log = console.log;
    t.mock.method(console, 'log', (...args) => {
      if (!String(args[0]).startsWith('[worlddata]')) log(...args);
    });
    const { maps, blocks, W } = await openTowns({ mods });
    const rows = [];
    let wetTowns = 0, wetOutlines = 0;
    const check = (loc, label) => {
      const stamp = new Uint8Array(side ** 2);
      setLocationTiles(loc, maps, blocks, stamp);
      const expected = wetVertices(stamp);
      if (!expected.length) return 0;
      const raw = Uint8Array.from(stamp, byte => byte || 2);
      const bytes = raw.map(convertTile);
      restorePondCrossings(stamp, raw, bytes, null, null, samples);
      const sites = pondSites(0, 0, bytes, null, null, side, null, () => 0);
      const missing = missingVertices(expected, sites, bytes);
      assert.equal(missing.length, 0, `${label} ${loc.name} missing wet vertices near tile ${missing[0] % side},${Math.floor(missing[0] / side)}`);
      assert.deepEqual(raw.map(convertTile), bytes, label);
      return 1;
    };
    for (const { loc, r, l } of everyLocation(maps)) {
      if (!loc?.loaded || !townTypes.has(loc.mapTableData.locationType)) continue;
      rows.push(loc);
      wetTowns += check(loc, `region ${r}, location ${l}`);
    }
    W.registerPortBlock(TOWN_OUTLINE_BLOCK, townOutlineBlockJson, TOWN_OUTLINE_BLOCK_INDEX);
    const templates = arenaTemplates(rows);
    const io = {
      classicOf: name => blocks.readClassicBlock(blocks.getBlockIndex(blocks.checkName(name))),
      servedOf: name => blocks.getBlockByName(name),
    };
    for (const kind of SWEEP_KINDS) {
      for (let j = 0; j < templates[kind].length; j += 17) {
        wetOutlines += check(sweepClone({ templates, io }, kind, j), `outlined ${kind} template ${j}`);
      }
    }
    assert.ok(wetTowns && wetOutlines);
    t.diagnostic(`${rows.length} towns, ${wetTowns} with verified water, plus ${wetOutlines} wet procedural outlines`);
  });
}

test('the terrain job retains pond depth beside the generated roads in Bubyrydata and Berbaaqnia', { skip: SKIP }, async () => {
  const { maps, blocks } = await openTowns();
  const inputs = terrainInputs();
  for (const [location, name, tx, tz] of [[13, 'Bubyrydata', 89, 43], [15, 'Berbaaqnia', 64, 112]]) {
    const loc = maps.getLocation(0, location);
    assert.equal(loc.name, name);
    const { terrain, px, py } = buildTownTerrain(loc, maps, blocks, inputs);
    assert.ok(terrain.paths.some(Boolean));
    const sites = pondSites(px, py, terrain.tilemapBytes, terrain.positions, terrain.paths);
    assert.ok(sites.some(site => site.cells.includes(tz * side + tx)), name);
    const column = pondColumnReader({ px, py, tilemapBytes: terrain.tilemapBytes, samples: terrain.samples });
    const submerged = column((tx + .5) * TILE_UNITS, (tz + .5) * TILE_UNITS);
    assert.ok(submerged && submerged.water - submerged.floor > .5, name);
    assert.deepEqual(terrain.tilemap.map(convertTile), terrain.tilemapBytes);
  }
});

test('roads and generated river banks retain authored water on the sloping town layouts', { skip: SKIP }, async () => {
  const { maps, blocks } = await openTowns();
  const inputs = terrainInputs(true);
  for (const [r, l, name] of [[17, 967, 'Holmarket'], [20, 6, 'Sentinel'], [17, 1264, 'Upvale Borough'], [17, 1308, 'Burgtry Commons']]) {
    const loc = maps.getLocation(r, l);
    assert.equal(loc.name, name);
    const { terrain, stamp, px, py } = buildTownTerrain(loc, maps, blocks, inputs);
    const expected = wetVertices(stamp);
    const sites = pondSites(px, py, terrain.tilemapBytes, terrain.positions, terrain.paths);
    assert.ok(expected.length > 0);
    assert.deepEqual(missingVertices(expected, sites, terrain.tilemapBytes), [], name);
    assert.deepEqual(terrain.tilemap.map(convertTile), terrain.tilemapBytes);
  }
});
