import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLookupTable, getLocationTerrainTileOrigin } from '../../../src/world/terrain/terrainTiles.js';
import { convertTile, buildTerrainIndices } from '../../../src/world/terrain/terrainSurface.js';
import { clearPondBank, pondSites } from '../../../src/world/water/pondSites.js';
import { restorePondCrossings } from '../../../src/world/water/pondCrossings.js';
import { PondHouseBank } from '../../../src/world/water/pondHouseBank.js';
import { pondBuildingAt } from '../../../src/world/water/pondBuildings.js';
import { quarterOf } from '../../../src/ui/town/townQuarters.js';
import { pondClutterGroups, pondColumnAt, pondTerrain } from '../../../src/world/water/pondTerrain.js';
import { TILE_UNITS } from '../../../src/world/water/waterBed.js';
import { MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE } from '../../../src/world/terrain/terrainSampler.js';

const side = 128, grid = side + 1, at = (x, z) => z * side + x;
const lookup = createLookupTable();
function fixture() {
  const bytes = new Uint8Array(side * side).fill(4);
  const sheet = new Float32Array(grid * grid * 3);
  for (let z = 0; z < grid; z++) for (let x = 0; x < grid; x++)
    sheet.set([x * TILE_UNITS, x < 50 ? 540 : 610, z * TILE_UNITS], (z * grid + x) * 3);
  // March the corners with the game's water/dirt lookup.
  for (const left of [20, 70]) for (let z = 20; z < 25; z++) for (let x = left; x < left + 5; x++) {
    let land = 0;
    for (let k = 0; k < 4; k++) {
      const cx = x + (k & 1), cz = z + (k >> 1);
      if (cx <= left || cx >= left + 5 || cz <= 20 || cz >= 25) land |= 1 << k;
    }
    bytes[at(x, z)] = land ? convertTile(lookup[land]) : 0;
  }
  return { bytes, sheet, paths: new Uint8Array(bytes.length) };
}

test('a pond needs a coherent closed shore and a flat datum', () => {
  for (const change of [
    ({ bytes }) => bytes[at(21, 24)] = 23 << 2,
    ({ bytes }) => bytes[at(21, 24)] ^= 1,
    ({ sheet }) => sheet[(22 * grid + 22) * 3 + 1] += .1,
  ]) {
    const f = fixture();
    const sites = () => pondSites(1800, -400, f.bytes, f.sheet, f.paths).map(p => p.west);
    assert.deepEqual(sites(), [19, 69]);
    change(f);
    assert.deepEqual(sites(), [69]);
  }
});

test('a building or street in the margin excludes furnishing on its footprint', () => {
  const f = fixture();
  const location = { exterior: { exteriorData: { width: 8, height: 8, blockNames: [] } } };
  const o = getLocationTerrainTileOrigin(location), tx = 19 - o.x, tz = 22 - o.y;
  const art = new Uint8Array(4096);
  const painted = Array.from({ length: 256 }, (_, k) => k).find(k => quarterOf(k) !== null);
  art[(4 * (15 - tz % 16) + 3) * 64 + 4 * (tx % 16) + 3] = painted;
  const maps = { getRmbBlockName: (_, x, z) => x === Math.floor(tx / 16) && z === Math.floor(tz / 16) ? 'house' : 'field' };
  const blocks = { checkName: n => n, getBlockIndex: n => n === 'house' ? 0 : -1, getBlock: () => ({ rmbBlock: { fldHeader: { autoMapData: art } } }) };
  const buildingAt = pondBuildingAt(location, maps, blocks);
  assert.equal(buildingAt(19, 22), true);
  assert.equal(buildingAt(19, 23), false);
  f.paths[at(19, 20)] = 1;
  f.bytes[at(21, 25)] = 46 << 2;
  const sites = pondSites(1800, -400, f.bytes, f.sheet, f.paths, side, buildingAt);
  assert.deepEqual(sites.map(p => p.west), [19, 69]);
  for (const [x, z] of [[19, 22], [19, 20], [21, 25]]) assert.equal(clearPondBank(sites[0], x + .5, z + .5), false);
  assert.equal(clearPondBank(sites[0], 24, 23), true);
});

test('a bank wraps an exposed diagonal wall and rejoins the original bed', () => {
  const { bytes, sheet, paths } = fixture(), before = bytes.slice();
  const build = bank => {
    const bed = { sheet, depths: new Float32Array(grid ** 2), sheetDepths: new Float32Array(grid ** 2) };
    pondTerrain({ createTerrainSurface() {} }, 1800, -400, bytes, bed, sheet, new Float32Array(sheet.length),
      buildTerrainIndices(), paths, true, null, bank);
    return bed;
  };
  const original = build(null), bank = new PondHouseBank();
  const x = 22 * TILE_UNITS, z = 22 * TILE_UNITS;
  const side = [x - 2, z - 2, x + 2, z + 2, 540, 544];
  const box = [x - 2, 540, z - 2, x + 2, 544, z + 2];
  const read = (a, b) => ({ floor: original.pondFloor(a, b), grade: 540 });
  bank.add({ sides: [side] }, box, 540, bytes, () => ({ floor: 540, grade: 540 }));
  assert.equal(bank.byTile.size, 0);
  bank.add({ sides: [side] }, box, 540, bytes, read);
  const fitted = build(bank);
  assert.equal(fitted.pondFloor(x, z), 540);
  let previous = 540;
  for (let i = 1; i <= 18; i++) {
    const y = fitted.pondFloor(x - i * .16, z + i * .16);
    assert.ok(y <= previous + .0001 && previous - y < .30);
    previous = y;
  }
  assert.ok(previous < fitted.pondWaterAt(x, z));
  assert.equal(previous, original.pondFloor(x - 18 * .16, z + 18 * .16));
  assert.equal(fitted.pondFloor(72 * TILE_UNITS, z), original.pondFloor(72 * TILE_UNITS, z));
  assert.deepEqual(bytes, before);
});

test('a painted and a baked street through a pond yield their wet tiles to the bed and the raw gameplay map', () => {
  for (const baked of [false, true]) {
    const { bytes, paths } = fixture();
    const raw = Uint8Array.from(bytes, b => b === 0 ? 255 : (b >> 2) | ((b & 3) << 6));
    const seed = raw.slice();
    const wet = at(22, 22);
    raw[wet] = 46;
    bytes[wet] = 46 << 2;
    if (baked) seed[wet] = 46;
    paths[wet] = 1;
    paths[at(19, 22)] = 1;
    const yard = paths.slice();
    restorePondCrossings(seed, raw, bytes, paths, yard, new Float32Array(grid ** 2).fill(.4));
    assert.deepEqual([raw[wet], bytes[wet], paths[wet], yard[wet]], [255, 0, 0, 0]);
    assert.equal(paths[at(19, 22)], 1);
  }
});

test('a baked lane across the shoreline reconnects only the wet segment and needs a level, unambiguous enclosure', () => {
  for (const condition of ['level', 'slope', 'conflict']) {
    const { bytes, paths } = fixture();
    const raw = Uint8Array.from(bytes, b => b === 0 ? 255 : (b >> 2) | ((b & 3) << 6));
    const samples = new Float32Array(grid ** 2).fill(.4);
    if (condition === 'slope') samples[23 * grid + 22] += .001;
    if (condition === 'conflict') bytes[at(23, 23)] = 8;
    for (let z = 16; z <= 27; z++) {
      raw[at(22, z)] = 46;
      bytes[at(22, z)] = 46 << 2;
      paths[at(22, z)] = 1;
    }
    restorePondCrossings(raw.slice(), raw, bytes, paths, null, samples);
    assert.equal(raw[at(22, 19)], 46);
    assert.equal(paths[at(22, 25)], 1);
    if (condition === 'level') {
      assert.equal(bytes[at(22, 21)], 0);
      assert.equal(bytes[at(22, 20)] >> 2, 31);
      assert.equal(convertTile(raw[at(22, 20)]), bytes[at(22, 20)]);
      assert.deepEqual(pondSites(0, 0, bytes, fixture().sheet, paths).map(s => s.west), [19, 69]);
    } else {
      assert.equal(bytes[at(22, 21)], 46 << 2);
      assert.equal(paths[at(22, 21)], 1);
    }
  }
});

test('two ponds in one streamed pixel keep independent floors, water heights and index ranges', () => {
  const { bytes, sheet, paths } = fixture();
  const bed = { sheet, depths: new Float32Array(grid ** 2), sheetDepths: new Float32Array(grid ** 2) };
  const renderer = { createTerrainSurface: (pos, norm, indices, depth, decor) => ({ pos, indices, decor }) };
  const surface = pondTerrain(renderer, 1800, -400, bytes, bed, sheet, new Float32Array(sheet.length), buildTerrainIndices(), paths);
  assert.ok(surface.decor.positions.length > 0);
  for (const index of surface.indices) assert.ok(index >= 0 && index < surface.pos.length / 3);
  for (const [tx, h] of [[22, 540], [72, 610]]) {
    const x = tx * TILE_UNITS, z = 22 * TILE_UNITS;
    const column = pondColumnAt(() => ({ entry: { _bed: bed }, lx: x, lz: z, baseY: -500 }), [x, h - 501, z]);
    assert.ok(Math.abs(column.floorY - (h - 501.55)) < .001);
    assert.ok(Math.abs(column.waterY - (h - 500.44)) < .001);
    assert.equal(sheet[(22 * grid + tx) * 3 + 1], h);
  }
  assert.equal(bed.pondFloor(42 * TILE_UNITS, 22 * TILE_UNITS), null);
  const wet = [22 * TILE_UNITS, 540, 22 * TILE_UNITS], dry = [42 * TILE_UNITS, 540, wet[2]];
  const suspended = [wet[0], 545, wet[2]];
  const roots = [wet, dry, suspended], groups = new Map([['212_4', roots], ['212_15', roots]]);
  const samples = new Float32Array(grid ** 2).fill(540 / (MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE));
  for (const builtBed of [bed, null]) {
    const shown = pondClutterGroups({groups, px: 1800, py: -400, samples, tilemapBytes: bytes, bed: builtBed});
    assert.deepEqual(shown.get('212_4'), [dry, suspended]);
    assert.deepEqual(shown.get('212_15'), [dry, suspended]);
    assert.equal(groups.get('212_4'), roots);
  }
});
