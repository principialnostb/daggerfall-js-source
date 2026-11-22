import { layoutRmbBlock } from '../../../src/world/rmbLayout.js';
import { collectBlockFlats } from '../../../src/world/rmbFlats.js';
import { customModelFor } from '../../../src/world/customModels.js';
import { blockRockSeat, installTownStandIns, rootInsideBoulder } from '../../../src/world/townStandIns.js';
import { game, skipReal } from '../../lwRealTown.mjs';
import { outlineTownLocation, installTownOutline } from '../../../src/world/townOutline.js';
import { synthesizeCountryLocation } from '../../../src/world/tamrielCountry.js';
import { POND_DEPTH_OFFSET } from '../../../src/world/water/waterCorners.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLookupTable, setLocationTiles, getLocationTerrainTileOrigin } from '../../../src/world/terrain/terrainTiles.js';
import { convertTile, buildTerrainIndices } from '../../../src/world/terrain/terrainSurface.js';
import { groundKindsOf } from '../../../src/world/terrain/groundEdge.js';
import { clearPondBank, pondSites } from '../../../src/world/water/pondSites.js';
import { restorePondCrossings } from '../../../src/world/water/pondCrossings.js';
import { PondHouseBank } from '../../../src/world/water/pondHouseBank.js';
import { pondBuildingAt } from '../../../src/world/water/pondBuildings.js';
import { quarterOf } from '../../../src/ui/town/townQuarters.js';
import { buildWaterIndices, WATER_LIFT } from '../../../src/render/waterSurface.js';
import { exteriorSurfaces, ON_EXTERIOR_WATER } from '../../../src/player/exteriorSurface.js';
import { bindPondMovement, pondPuddleContact, pondClutterGroups, pondColumnAt, pondColumnReader, pondTerrain } from '../../../src/world/water/pondTerrain.js';
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

test('a sloping dry bank keeps its original triangles while the water and the walker share one horizontal level', () => {
  const { bytes, sheet } = fixture();
  const samples = new Float32Array(grid ** 2);
  sheet[(22 * grid + 20) * 3 + 1] = 538;
  sheet[(23 * grid + 25) * 3 + 1] = 541;
  for (let z = 0; z < grid; z++) for (let x = 0; x < grid; x++) {
    samples[x * grid + z] = sheet[(z * grid + x) * 3 + 1] / (MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE);
  }
  const bed = { sheet, depths: new Float32Array(grid ** 2), sheetDepths: new Float32Array(grid ** 2) };
  pondTerrain({ createTerrainSurface() {} }, 0, 0, bytes, bed, sheet, new Float32Array(sheet.length), buildTerrainIndices());
  const read = pondColumnReader({ px: 0, py: 0, tilemapBytes: bytes, samples });
  const water = bed.pondWaterAt(22 * TILE_UNITS, 22 * TILE_UNITS);
  assert.ok(Math.abs(water - 537.56) < .001);
  assert.equal(bed.pondFloor(20 * TILE_UNITS, 22 * TILE_UNITS), 538);
  let entered = false;
  for (let n = 0; n <= 40; n++) {
    const x = (20 + n / 20) * TILE_UNITS, z = 22.16 * TILE_UNITS;
    const floor = bed.pondFloor(x, z), far = read(x, z);
    assert.ok(Math.abs(floor - far.floor) < .001 && Math.abs(far.water - water) < .001);
    assert.ok(floor <= far.grade + .001);
    if (floor < water) entered = true;
    else assert.equal(entered, false, 'the approach descends continuously through the waterline');
    const pond = { waterY: water, floorY: floor, feetY: floor };
    const contact = exteriorSurfaces({ pond, probe: { hit: true, terrain: true } });
    assert.equal(contact.water !== ON_EXTERIOR_WATER.None, floor < water);
  }
  assert.equal(entered, true);
});

test('a stamped basin meets generated dry ground and keeps a channel that reaches the pixel boundary open', () => {
  for (const exterior of [2, 11, 255]) {
    const stamp = new Uint8Array(side ** 2);
    for (let z = 48; z < 52; z++) for (let x = 56; x < 60; x++) stamp[at(x, z)] = 255;
    const raw = Uint8Array.from(stamp, b => b || exterior), before = raw.slice(), bytes = raw.map(convertTile);
    restorePondCrossings(stamp, raw, bytes, null, null, new Float32Array(grid ** 2));
    const sites = pondSites(0, 0, bytes, null, null, side, null, () => 0);
    assert.equal(sites.length, exterior === 255 ? 0 : 1);
    if (exterior === 255) assert.deepEqual(raw, before);
    else assert.ok(sites[0].cells.includes(at(58, 50)));
    assert.deepEqual(raw.map(convertTile), bytes);
  }
});

test('a dry corner touching an open shore cannot invalidate the pond beside it', () => {
  const { bytes, sheet } = fixture();
  for (let x = 0; x < 20; x++) bytes[at(x, 19)] = 0;
  const covered = new Set(pondSites(0, 0, bytes, sheet, null).flatMap(s => s.cells));
  assert.ok(covered.has(at(21, 21)));
  assert.ok(covered.has(at(72, 22)));
  assert.equal(covered.has(at(19, 19)), false);
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

test('the grass approach meets a dirt bank at its shared edge and keeps the paved road next to it', () => {
  const { bytes, paths } = fixture(), approach = at(19, 22), road = at(19, 23);
  bytes[approach] = 2 << 2;
  bytes[road] = 55 << 2;
  paths[road] = 1;
  const raw = Uint8Array.from(bytes, b => b === 0 ? 255 : (b >> 2) | ((b & 3) << 6));
  restorePondCrossings(raw.slice(), raw, bytes, paths, null, new Float32Array(grid ** 2).fill(.4));
  assert.deepEqual(groundKindsOf(bytes[approach]), { a: 2, b: 1, mask: 10 });
  assert.equal(convertTile(raw[approach]), bytes[approach]);
  assert.equal(bytes[road], 55 << 2);
  assert.equal(paths[road], 1);
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


test('Helbenar builds a submerged floor and a water sheet in all seven authored pools', { skip: skipReal }, () => {
  const { maps, blocks } = game();
  const template = maps.getLocation(40, 486);
  assert.equal(template.name, 'Hordale');
  const px = 3269, py = 543;
  installTownOutline();
  const loc = outlineTownLocation(synthesizeCountryLocation(template, { px, py, type: template.mapTableData.locationType, name: 'Helbenar' }), {
    classicOf: n => blocks.readClassicBlock(blocks.getBlockIndex(blocks.checkName(n))),
    servedOf: n => blocks.getBlockByName(n),
  });
  const stamp = new Uint8Array(side * side);
  setLocationTiles(loc, maps, blocks, stamp);
  const raw = Uint8Array.from(stamp, byte => byte || 2);
  const bytes = Uint8Array.from(raw, convertTile);
  const samples = new Float32Array(grid ** 2).fill(.4);
  restorePondCrossings(stamp, raw, bytes, null, null, samples);
  assert.deepEqual(bytes, Uint8Array.from(raw, convertTile));
  const grade = Math.fround(samples[0] * MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE);
  const sheet = new Float32Array(grid ** 2 * 3);
  for (let z = 0; z < grid; z++) for (let x = 0; x < grid; x++) sheet.set([x * TILE_UNITS, grade, z * TILE_UNITS], (z * grid + x) * 3);
  const bed = { sheet, depths: new Float32Array(grid ** 2), sheetDepths: new Float32Array(grid ** 2) };
  const surface = pondTerrain({ createTerrainSurface: (pos, norm, indices, depths, shore) => ({ pos, indices, shore }) },
    px, py, bytes, bed, sheet, new Float32Array(sheet.length), buildTerrainIndices());
  const far = pondColumnReader({ px, py, tilemapBytes: bytes, samples });
  for (const [tx, tz] of [[49.25, 50.25], [61.25, 54.75], [77.25, 67.25], [65.25, 68.25], [48.75, 74.75], [65.75, 73.75], [59.25, 77.25]]) {
    const x = tx * TILE_UNITS, z = tz * TILE_UNITS, floor = bed.pondFloor(x, z);
    assert.ok(bed.pondWaterAt(x, z) - floor > .5);
    assert.ok(Math.abs(far(x, z).floor - floor) < .001);
    const vertex = Math.round(tz) * grid + Math.round(tx);
    assert.ok(bed.sheetDepths[vertex] < -POND_DEPTH_OFFSET);
  }
  assert.ok(surface.shore.positions.length);
  assert.ok(surface.indices.every(i => i < surface.pos.length / 3));
  // The native grass puddle faces the dry side of the pond.
  assert.equal(stamp[at(49, 52)], 23);
  assert.equal(raw[at(49, 52)], 2);
  assert.equal(bytes[at(49, 52)], convertTile(2));
  for (const t of [.01, .5, .99]) {
    const x = (49 + t) * TILE_UNITS, z = (52 + t) * TILE_UNITS;
    assert.equal(bed.pondFloor(x, z) ?? grade, grade);
    assert.equal(far(x, z)?.floor ?? grade, grade);
  }
  // A layout retaining a painted tile still needs distinct sheet heights at a shared corner.
  const retained = bytes.slice(), retainedBed = { sheet, depths: new Float32Array(grid ** 2), sheetDepths: new Float32Array(grid ** 2) };
  retained[at(49, 52)] = convertTile(23);
  pondTerrain({ createTerrainSurface() {} }, px, py, retained, retainedBed, sheet, new Float32Array(sheet.length), buildTerrainIndices());
  for (const vi of [52 * grid + 49, 52 * grid + 50, 53 * grid + 49, 53 * grid + 50]) {
    assert.equal(retainedBed.sheet[vi * 3 + 1], grade);
  }
  const indices = buildWaterIndices(retained), split = retainedBed.splitSheet(indices);
  assert.ok(split);
  for (let q = 0; q < indices.length; q += 6) {
    const v = indices[q], tx = v % grid, tz = Math.floor(v / grid);
    const waterY = retainedBed.pondWaterAt((tx + .5) * TILE_UNITS, (tz + .5) * TILE_UNITS);
    if (waterY == null && (tx !== 49 || tz !== 52)) continue;
    for (let t = q; t < q + 6; t++) {
      const y = split.positions[3 * split.indices[t] + 1];
      assert.ok(Math.abs(y - (waterY == null ? grade : waterY - WATER_LIFT)) < .001);
    }
  }
  assert.equal(raw[at(68, 62)], stamp[at(68, 62)], 'isolated puddle keeps its own painted outline');
  assert.equal(bed.pondFloor(68.5 * TILE_UNITS, 62.5 * TILE_UNITS), null);
});

test('a painted puddle only wets the part of the tile covered by its artwork, with the terrain underfoot', () => {
  const mask = { width: 2, height: 1, colors: Uint32Array.of(0xff112233, 0x00112233) };
  const layers = []; layers[23] = mask;
  const pixel = { tilemap: [23], tilemapBytes: [23 << 2], _bed: { pondFloor: () => null }, groundArchive: 1 };
  for (const [x, wet] of [[.25, true], [.75, false]]) {
    const sample = { tile: 23, feet: [x, .5] };
    const paintedWet = pondPuddleContact(sample, () => ({ entry: pixel }), [0, 0, 0], new Map([[1, layers]]));
    assert.equal(paintedWet, wet);
    for (const terrain of [true, false]) {
      const result = exteriorSurfaces({ rawTile: sample.tile, feet: sample.feet, paintedWet, probe: { hit: true, terrain } });
      assert.equal(result.water, wet && terrain ? ON_EXTERIOR_WATER.WaterWalking : ON_EXTERIOR_WATER.None);
    }
  }
});

test('a fence follows its planned edge and a walker only encounters water past the fitted bank', () => {
  const { bytes, sheet } = fixture(), bank = new PondHouseBank();
  const x = 22 * TILE_UNITS, z = 22 * TILE_UNITS;
  bank.addFences({ W: 1, fences: [{ inner: 0, dir: 1 }] }, [x, 540, z], () => 0, bytes, () => ({ floor: 538.45, grade: 540 }));
  const bed = { sheet, depths: new Float32Array(grid ** 2), sheetDepths: new Float32Array(grid ** 2) };
  pondTerrain({ createTerrainSurface() {} }, 1800, -400, bytes, bed, sheet, new Float32Array(sheet.length), buildTerrainIndices(), null, true, null, bank);
  const collider = {}, player = { pos: [x, 540, z + .8], waterWalking: true };
  bindPondMovement(collider, player, (lx, lz) => ({ entry: { _bed: bed }, lx, lz, baseY: 0 }));
  assert.equal(bed.pondFloor(x, z + .8), 540);
  assert.equal(collider.waterWalkFloor(player.pos), undefined);
  assert.equal(collider.wadingDepth(player.pos), 0);
  player.pos[0] += 3.2;
  player.pos[1] = bed.pondFloor(player.pos[0], player.pos[2]);
  assert.equal(collider.waterWalkFloor(player.pos), bed.pondWaterAt(player.pos[0], player.pos[2]));
  assert.ok(collider.wadingDepth(player.pos) > .5);
  const fence = new PondHouseBank(), bounds = [-.18, -.95, -1.2, .18, .8, 2];
  // A quarter-turned 41207, its single post at one end and the next section at the other.
  const transform = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, x, 540.85, z, 1];
  fence.addFencePiece(bounds, transform, [x - 1.2, 539.9, z - .18, x + 2, 541.65, z + .18],
    540, bytes, () => ({ floor: 538.45, grade: 540 }));
  for (const along of [-1.2, 0, 2]) assert.ok(Math.abs(fence.depth(x + along, z, 540, 1.55) - .08) < 1e-8);
  assert.equal(fence.depth(x, z + 3.2, 540, 1.55), 1.55);
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

test('the Beautiful Villages bridge in Helbenar joins its banks on both sides and clears the pine inside its boulder', { skip: skipReal }, async () => {
  const { openTowns } = await import('../../fb1004dArena.mjs');
  const { maps, blocks } = await openTowns();
  const template = maps.getLocation(40, 486);
  installTownOutline();
  const location = outlineTownLocation(synthesizeCountryLocation(template, {
    px: 3269, py: 543, type: template.mapTableData.locationType, name: 'Helbenar',
  }), {
    classicOf: name => blocks.readClassicBlock(blocks.getBlockIndex(blocks.checkName(name))),
    servedOf: name => blocks.getBlockByName(name),
  });
  const stamp = new Uint8Array(side ** 2);
  setLocationTiles(location, maps, blocks, stamp);
  const raw = Uint8Array.from(stamp, byte => byte || 2), bytes = raw.map(convertTile);
  const corners = (x, z) => [0, 1, side, side + 1].map((d, k) => {
    const b = bytes[at(x, z) - d], g = groundKindsOf(b);
    return g ? (g.mask & (1 << k) ? g.b : g.a) : b >> 2;
  });
  const grassSpots = [[49, 52], [58, 51], [50, 74], [49, 76]].map(([x, z]) => at(x, z));
  assert.ok(grassSpots.every(i => (bytes[i] >> 2) === 23));
  const besideDeck = at(65, 55), acrossTrack = at(62, 56);
  assert.deepEqual([bytes[besideDeck], bytes[acrossTrack]], [136, 138]);
  restorePondCrossings(stamp, raw, bytes, null, null, new Float32Array(grid ** 2).fill(.4));
  assert.deepEqual([bytes[besideDeck], bytes[acrossTrack]], [84, 86]);
  const waterQuads = buildWaterIndices(bytes);
  const firstCorners = new Set(waterQuads.filter((_, n) => n % 6 === 0));
  for (const i of grassSpots) {
    assert.equal(raw[i], 2);
    assert.equal(bytes[i], convertTile(2));
    assert.equal(firstCorners.has(Math.floor(i / side) * grid + i % side), false);
    assert.equal(exteriorSurfaces({ rawTile: raw[i], feet: [.5, .5], probe: { hit: true, terrain: true } }).water, ON_EXTERIOR_WATER.None);
  }
  assert.deepEqual(raw.map(convertTile), bytes);
  for (const [x, z] of [[65, 56], [65, 57], [63, 56], [67, 57], [49, 72]]) {
    assert.equal(new Set(corners(x, z)).size, 1, `shared soil at ${x},${z}`);
  }

  installTownStandIns(() => true);
  const block = blocks.getBlockByName('GENRAS00.RMB');
  const rocks = blockRockSeat(layoutRmbBlock(block).models, customModelFor);
  const pine = collectBlockFlats(block, 504).find(f => f.record === 25 && f.x === 6.4 && f.z === 57.6);
  assert.ok(pine);
  assert.ok(rocks.topAt(pine.x, pine.z) > pine.y + 1);
  assert.equal(rootInsideBoulder(rocks, pine.x, pine.y, pine.z), true);
  assert.equal(rootInsideBoulder(rocks, pine.x, pine.y + 2, pine.z), false);
  assert.equal(rootInsideBoulder(rocks, pine.x - 6, pine.y, pine.z), false);
});
