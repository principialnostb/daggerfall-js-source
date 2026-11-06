// A port whose sounding found no harbour is sounded again every HARBOUR_RETRY_S only where something that sounding read
// has changed (systems/naval/harbourBook.js groundHeld): the built ground over the box of the points it asked
// (builtGround), its footprint and reach, the hulls' builds and its keep's answers. The world here reads its pixels as
// the world host's water law does (scenes/world.js navalIsWater, surfaceAt, tvSeaY, csaPixelAt): a pixel's record, its
// tile map, its heights, its ring class and its carved sea, through the frame's compensation and map origin.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as harbourBook from '../../../src/systems/naval/harbourBook.js';
import { findHarbour, draftOf, HARBOUR_REACH } from '../../../src/systems/naval/shipLife.js';
import { setShipStanding, buildsStamp } from '../../../src/systems/naval/navalShips.js';
import { TERRAIN_SIZE } from '../../../src/world/terrain/terrainSampler.js';
import { hostText } from '../../hostText.mjs';

const { createHarbourBook, harbourOf, HARBOUR_RETRY_S, KEEP_ASKS } = harbourBook;
const read = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
const TILES = 128;
/** The town's footprint in the scene, on the land north of the shore at z = 200 (harbourbook.test.js's). */
const TOWN = { minX: -100, maxX: 100, minZ: 220, maxZ: 420 };
/** A town of two blocks by two, as harbourOf reads a location. */
const LOC = { exterior: { exteriorData: { width: 2, height: 2, blockNames: ['A', 'B', 'C', 'D'] } } };
const KEY = 'port:7';

/**
 * A streamed world as the world host keeps it: each built pixel a record `{ px, py, tilemapBytes, samples, _stride,
 * deepWaters }` under `px,py`, read through `state` (the frame: compensation and map origin). `wet(x, z)` lays the water
 * in the first frame's scene metres. Its water and ground read a point as navalIsWater and surfaceAt do.
 */
function makeWorld(wet) {
  const state = { mapOrigin: { x: 50, y: 60 }, compensation: [0, 0, 0], localFromWorld: (x, z) => [x, z] };
  const built = new Map();
  const tilesOf = (px, py) => {
    const out = new Uint8Array(TILES * TILES),
      step = TERRAIN_SIZE / TILES;
    const x0 = (px - 50) * TERRAIN_SIZE,
      z0 = -(py - 60) * TERRAIN_SIZE;
    for (let tz = 0; tz < TILES; tz++)
      for (let tx = 0; tx < TILES; tx++) out[tz * TILES + tx] = wet(x0 + (tx + 0.5) * step, z0 + (tz + 0.5) * step) ? 0 : 4;
    return out;
  };
  const record = (px, py) => ({ px, py, tilemapBytes: tilesOf(px, py), samples: Float32Array.of(1), _stride: 1, deepWaters: null });
  for (let px = 45; px <= 55; px++) for (let py = 55; py <= 65; py++) built.set(`${px},${py}`, record(px, py));
  const pixelAt = (x, z) => {
    const c = state.compensation;
    return built.get(`${state.mapOrigin.x + Math.floor((x - c[0]) / TERRAIN_SIZE)},${state.mapOrigin.y - Math.floor((z - c[2]) / TERRAIN_SIZE)}`) ?? null;
  };
  const tileAt = (pixel, x, z) => {
    const cx = (pixel.px - state.mapOrigin.x) * TERRAIN_SIZE + state.compensation[0],
      cz = -(pixel.py - state.mapOrigin.y) * TERRAIN_SIZE + state.compensation[2];
    const tx = Math.min(TILES - 1, Math.max(0, Math.trunc(((x - cx) / TERRAIN_SIZE) * TILES)));
    const tz = Math.min(TILES - 1, Math.max(0, Math.trunc(((z - cz) / TERRAIN_SIZE) * TILES)));
    return pixel.tilemapBytes[tz * TILES + tx] >> 2;
  };
  const seaY = () => state.compensation[1];
  /** The ground's height: a carved pixel's floor, else its heights by its tiles, at its ring class. */
  const surface = (x, z) => {
    const pixel = pixelAt(x, z);
    if (!pixel) return -Infinity;
    if (pixel.deepWaters) return pixel.deepWaters.floor + state.compensation[1];
    return (tileAt(pixel, x, z) === 0 ? -4 : 4) * pixel.samples[0] * pixel._stride + state.compensation[1];
  };
  /** The water law: an unbuilt pixel unknown, a tile's water, or a carved floor under the hull's draft. */
  const isWater = (x, z, hull = 0) => {
    const pixel = pixelAt(x, z);
    if (!pixel) return null;
    if (!pixel.deepWaters) return tileAt(pixel, x, z) === 0;
    return surface(x, z) < seaY() - (hull < 0 ? 0.05 : draftOf(hull));
  };
  const ground = (x, z) => surface(x, z) - seaY();
  return { state, built, record, tilesOf, pixelAt, isWater, ground };
}

/** The port as the world host hands it each frame: harbourOf's, on this world, its own reach ready (the ring's not). */
const portOf = (world, extra = {}) => ({
  ...harbourOf({ id: 7, loc: LOC, x: 50, y: 60, name: 'Fakeport' }, { state: world.state, built: world.pixelAt, woods: null }),
  rect: TOWN,
  ready: (reach) => reach === undefined,
  ...extra,
});

/** A book on `world`, its port whatever `hand.near` holds, counting the water and keep each step asks. */
function bookOn(world, hand) {
  const asked = { water: 0, keep: 0 };
  const book = createHarbourBook({
    harbourNear: () => {
      const near = hand.near;
      if (!near?.keep) return near;
      const keep = near.keep;
      return { ...near, keep: (x, z) => (asked.keep++, keep(x, z)) };
    },
    isWater: (x, z, hull) => (asked.water++, world.isWater(x, z, hull)),
    ground: (x, z) => world.ground(x, z),
  });
  return { book, asked };
}

/** What a sounding now gives the port: findHarbour over the world as the book asks it. */
const fresh = (world, near) =>
  findHarbour({ rect: near.rect, isWater: world.isWater, reach: near.reach ?? HARBOUR_REACH, keep: near.keep ?? null, ground: world.ground });

/** A dry world, its port sounded once at t = 0 (no harbour), its counts zeroed. */
function soundedDry() {
  const world = makeWorld(() => false);
  const hand = { near: portOf(world) };
  const { book, asked } = bookOn(world, hand);
  book.step(0);
  assert.equal(book.get(KEY).harbour, null, 'no shore, no harbour');
  assert.ok(asked.water > 0, 'sounded once its ground is built');
  asked.water = 0;
  return { world, hand, book, asked };
}

test('THE RETRY READS FIRST: a port that gave no harbour, its ground as it was, is not sounded again - no water asked - and its next retry is as late as ever; what it keeps is what a sounding now gives', () => {
  const { world, hand, book, asked } = soundedDry();
  book.step(HARBOUR_RETRY_S);
  assert.equal(asked.water, 0, 'the retry asks no water of ground that reads as it did');
  assert.equal(book.get(KEY).at, HARBOUR_RETRY_S, 'the retry is spent: the next one HARBOUR_RETRY_S on');
  assert.deepEqual(book.get(KEY).harbour, fresh(world, hand.near), 'the harbour a sounding now gives');
  hand.near = portOf(world); // the host hands a new port each frame
  book.step(2 * HARBOUR_RETRY_S);
  assert.equal(asked.water, 0, 'nor the next, the world unchanged');
  // a pixel the sounding never read, built again: nothing it read has moved
  world.built.set('53,60', world.record(53, 60));
  world.built.delete('45,55');
  book.step(3 * HARBOUR_RETRY_S);
  assert.equal(asked.water, 0, 'ground it never read moves nothing');
  assert.deepEqual(book.get(KEY).harbour, fresh(world, hand.near));
});

/** Each thing a sounding reads, changed - the world's or the port's. */
const CHANGES = [
  ['a pixel it read, built again', ({ world }) => world.built.set('50,60', world.record(50, 60))],
  ['a pixel it read, let go', ({ world }) => world.built.delete('49,61')],
  ['a pixel it read, its tile map', ({ world }) => (world.built.get('49,59').tilemapBytes = world.tilesOf(49, 59))],
  ['a pixel it read, its heights', ({ world }) => (world.built.get('50,61').samples = Float32Array.of(1))],
  ['a pixel it read, its ring class', ({ world }) => (world.built.get('50,60')._stride = 2)],
  ['a pixel it read, its carved sea', ({ world }) => (world.built.get('50,60').deepWaters = { floor: -9 })],
  ['the floating origin', ({ world }) => (world.state.compensation[0] += 0.5)],
  ['the sea\'s height', ({ world }) => (world.state.compensation[1] -= 1)],
  ['the map origin', ({ world }) => (world.state.mapOrigin = { x: 50, y: 61 })],
  ['its footprint, east', ({ world, hand }) => (hand.near = portOf(world, { rect: { ...TOWN, maxX: TOWN.maxX + 0.25 } }))],
  ['its footprint, south', ({ world, hand }) => (hand.near = portOf(world, { rect: { ...TOWN, minZ: TOWN.minZ - 0.25 } }))],
  ['its reach', ({ world, hand }) => (hand.near = portOf(world, { reach: HARBOUR_REACH - 1 }))],
  ['a keep handed it', ({ world, hand }) => (hand.near = portOf(world, { keep: () => false }))],
  [
    'the hulls\' builds',
    () => {
      const was = buildsStamp();
      setShipStanding(1, false);
      setShipStanding(1, true);
      assert.notEqual(buildsStamp(), was, 'the builds stood again');
    },
  ],
];

test('ANY CHANGE SOUNDS IT AGAIN: each thing the sounding read, changed - a pixel built again or let go, its tile map, heights, ring class or carved sea, the frame, the footprint, the reach, a keep, the builds - and the retry sounds, to what a sounding now gives', () => {
  for (const [what, change] of CHANGES) {
    const run = soundedDry();
    change(run);
    run.book.step(HARBOUR_RETRY_S);
    assert.ok(run.asked.water > 0, `${what}: sounded again`);
    assert.deepEqual(run.book.get(KEY).harbour, fresh(run.world, run.hand.near), `${what}: the harbour a sounding now gives`);
  }
});

test('THE RETRY WAITS ITS TIME: ground changed between retries is sounded at the retry, never before - and the water come in gives the harbour a sounding now gives', () => {
  const { world, hand, book, asked } = soundedDry();
  book.step(HARBOUR_RETRY_S); // nothing changed: spent, no sounding
  assert.equal(asked.water, 0);
  const coast = makeWorld((x, z) => z < 200);
  for (const [key, pixel] of coast.built) world.built.set(key, pixel); // the shore built in
  book.step(HARBOUR_RETRY_S + 3);
  book.step(2 * HARBOUR_RETRY_S - 0.1);
  assert.equal(asked.water, 0, 'not before its retry');
  assert.equal(book.get(KEY).harbour, null);
  book.step(2 * HARBOUR_RETRY_S);
  assert.ok(asked.water > 0, 'sounded at its retry');
  const harbour = book.get(KEY).harbour;
  assert.ok(harbour?.berths?.length, 'a harbour off the shore come in');
  assert.deepEqual(harbour, fresh(world, hand.near), 'the harbour a sounding now gives');
  assert.deepEqual(harbour, fresh(coast, portOf(coast)), 'and the one the shore always gave');
});

test('ITS KEEP IS ASKED AGAIN: a walled shore that gave no harbour, its keep handed anew each frame with the same answers, is not sounded - its keep asked, no water; its keep changed or gone, it is', () => {
  const world = makeWorld((x, z) => z < 200);
  assert.ok(fresh(world, portOf(world))?.berths?.length, 'the shore gives a harbour, keep aside');
  /** A port whose town keeps its whole shore (z > 150), sounded once: no harbour. */
  const walledPort = () => {
    const hand = { near: portOf(world, { keep: (x, z) => z > 150 }) };
    const run = { hand, ...bookOn(world, hand) };
    run.book.step(0);
    assert.equal(run.book.get(KEY).harbour, null, 'every berth under the keep');
    assert.ok(run.asked.keep > 0, 'its keep asked');
    run.asked.water = 0;
    run.asked.keep = 0;
    return run;
  };
  const { hand, book, asked } = walledPort();
  hand.near = portOf(world, { keep: (x, z) => z > 150 });
  book.step(HARBOUR_RETRY_S);
  assert.equal(asked.water, 0, 'the same answers: no sounding');
  assert.ok(asked.keep > 0, 'its keep asked again where the sounding asked it');
  assert.deepEqual(book.get(KEY).harbour, fresh(world, hand.near));
  // the keep drawn in to the town's own ground: sounded, to the harbour a sounding now gives
  hand.near = portOf(world, { keep: (x, z) => z > 300 });
  book.step(2 * HARBOUR_RETRY_S);
  assert.ok(asked.water > 0, 'its keep changed: sounded again');
  assert.ok(book.get(KEY).harbour?.berths?.length, 'a harbour clear of its keep');
  assert.deepEqual(book.get(KEY).harbour, fresh(world, hand.near));
  // the keep gone: sounded again
  const gone = walledPort();
  gone.hand.near = portOf(world);
  gone.book.step(HARBOUR_RETRY_S);
  assert.ok(gone.asked.water > 0, 'no keep now: sounded again');
  assert.deepEqual(gone.book.get(KEY).harbour, fresh(world, gone.hand.near), 'the harbour the shore gives');
});

test('A KEEP ASKED PAST WHAT THE BOOK KEEPS: a sounding that asks its keep more than KEEP_ASKS times is sounded again at every retry, as before', () => {
  const world = makeWorld((x, z) => z < 200);
  const jetties = (x, z) => z > 198; // its quays clear, every jetty's walk ashore under the keep
  const hand = { near: portOf(world, { keep: jetties }) };
  const { book, asked } = bookOn(world, hand);
  book.step(0);
  assert.equal(book.get(KEY).harbour, null, 'every berth under the keep');
  assert.ok(asked.keep > KEEP_ASKS, `its keep asked ${asked.keep} times`);
  asked.water = 0;
  hand.near = portOf(world, { keep: jetties });
  book.step(HARBOUR_RETRY_S);
  assert.ok(asked.water > 0, 'sounded again: too few of its answers kept to tell');
  assert.deepEqual(book.get(KEY).harbour, fresh(world, hand.near));
});

test('A PORT WITH A HARBOUR KEEPS NO READ: only a port with none is sounded again, so only it keeps what its sounding read - a port whose own shore or the port law\'s ring gave a harbour holds nothing of it', () => {
  assert.ok(soundedDry().book.get(KEY).read, 'a port with no harbour keeps what it read, for its retry');
  // its own shore, its keep asked at every berth's walk ashore
  const coast = makeWorld((x, z) => z < 200);
  const walled = bookOn(coast, { near: portOf(coast, { keep: (x, z) => z > 300 }) });
  walled.book.step(0);
  assert.ok(walled.book.get(KEY).harbour?.berths?.length, 'a harbour off its own shore');
  assert.ok(walled.asked.keep > 0, 'its keep asked');
  assert.equal(walled.book.get(KEY).read ?? null, null, 'nothing of its sounding kept');
  // the shore past its own reach: none there, one on the ring
  const far = makeWorld((x, z) => z < -600);
  const ring = bookOn(far, { near: portOf(far, { ready: () => true }) });
  ring.book.step(0);
  assert.equal(ring.book.get(KEY).far, true, 'sounded on the ring');
  assert.ok(ring.book.get(KEY).harbour?.berths?.length, 'a harbour off the ring\'s shore');
  assert.equal(ring.book.get(KEY).read ?? null, null, 'nothing of its near sounding kept');
});

test('A PORT THAT CANNOT NAME ITS GROUND is sounded at every retry, as before: a host whose port has no groundOver', () => {
  const world = makeWorld(() => false);
  const near = { key: 'port:8', name: null, rect: TOWN, ready: (reach) => reach === undefined };
  const { book, asked } = bookOn(world, { near });
  book.step(0);
  asked.water = 0;
  book.step(HARBOUR_RETRY_S);
  assert.ok(asked.water > 0, 'sounded again at its retry');
  assert.equal(book.get('port:8').harbour, null);
});

test('THE GROUND OVER A BOX: harbourOf hands builtGround over the host\'s own frame and pixels - the frame, then each pixel the box touches, south to north and west to east: the pixel, its tile map, heights, ring class and carved sea', () => {
  const world = makeWorld(() => false);
  const near = portOf(world);
  const box = [10, 20, 900, 830]; // two pixels each way
  const stamp = near.groundOver(box);
  assert.deepEqual(stamp, harbourBook.builtGround(world.state, world.pixelAt, box));
  assert.equal(stamp.length, 5 + 4 * 5);
  assert.deepEqual(stamp.slice(0, 5), [0, 0, 0, 50, 60], 'the frame');
  assert.equal(stamp[8], 1, 'the ring class, as it reads');
  assert.equal(stamp[9], null, 'no carved sea');
  assert.notEqual(stamp[5], stamp[10], 'each pixel its own');
  assert.deepEqual(near.groundOver(box), stamp, 'the same ground, the same answer');
  const pixel = world.built.get('51,59');
  pixel.samples = Float32Array.of(1);
  const moved = near.groundOver(box);
  assert.deepEqual(moved.slice(0, 22), stamp.slice(0, 22), 'the pixels before it as they were');
  assert.notEqual(moved[22], stamp[22], 'its heights anew');
  assert.deepEqual(near.groundOver([Infinity, Infinity, -Infinity, -Infinity]), [0, 0, 0, 50, 60], 'an empty box, the frame');
});

test('WHAT THE WATER LAW READS: the world host\'s water and ground at a scene point read its pixel through the frame, the record\'s tile map, heights, ring class and carved sea, the sea\'s top off the compensation, a hull\'s draft off the builds - what builtGround names and the book compares', () => {
  const W = hostText('src/scenes/world.js');
  assert.match(
    W,
    /const navalIsWater = \(x, z, hull = 0\) => \{\n\s*const p = csaPixelAt\(x, z\);\n\s*if \(!p\) return null;[^\n]*\n\s*const t = csaTerrainOf\(p\), corner = state\.pixelTranslation\(p\.px, p\.py, _navalTile\);[^\n]*\n\s*if \(!p\.deepWaters && csaTileMapIndexAtXZ\(x, z, corner\[0\], corner\[2\], t\.tileMap\) !== 0\) return false;\n\s*if \(!p\.deepWaters\) return true;\n\s*const floor = surfaceAt\(x, z\);\n\s*return Number\.isFinite\(floor\) && floor < tvSeaY\(\) - \(hull < 0 \? 0\.05 : navalDraftOf\(hull\)\);\n\s*\};/,
  );
  assert.match(
    W,
    /const surfaceAt = \(x, z\) => \{\n\s*const c = state\.compensation;\n\s*const px = state\.mapOrigin\.x \+ Math\.floor\(\(x - c\[0\]\) \/ TERRAIN_SIZE\);\n\s*const py = state\.mapOrigin\.y - Math\.floor\(\(z - c\[2\]\) \/ TERRAIN_SIZE\);\n\s*const p = built\.get\(`\$\{px\},\$\{py\}`\);\n\s*if \(!p\) return -Infinity;\n\s*const t = state\.pixelTranslation\(p\.px, p\.py, _stT\);\n\s*const lx = x - t\[0\], lz = z - t\[2\];\n\s*if \(lx < 0 \|\| lz < 0 \|\| lx >= TERRAIN_SIZE \|\| lz >= TERRAIN_SIZE\) return -Infinity;\n\s*if \(p\.deepWaters\) \{ const f = deepWaters\.floorLocalY\(p, lx, lz\); if \(f != null\) return f \+ t\[1\]; \}[^\n]*\n\s*return surfaceHeightAt\(p\.samples, lx, lz, p\._stride \?\? 1\) \+ t\[1\];\n\s*\};/,
  );
  assert.match(
    W,
    /const tvSeaY = \(\) => \(deepWaters\?\.oceanLocalY \?\? SCALED_OCEAN_ELEVATION \* STREAMING_TERRAIN_SCALE\) \+ state\.pixelTranslation\(state\.current\.x, state\.current\.y, _tvSeaT\)\[1\];/,
  );
  assert.match(
    W,
    /const csaPixelAt = \(x, z\) => \{\n\s*const c = state\.compensation;\n\s*return built\.get\(pixelKeyText\(state\.mapOrigin\.x \+ Math\.floor\(\(x - c\[0\]\) \/ TERRAIN_SIZE\), state\.mapOrigin\.y - Math\.floor\(\(z - c\[2\]\) \/ TERRAIN_SIZE\)\)\) \?\? null;/,
  );
  assert.match(W, /get tileMap\(\) \{ return p\.tilemapBytes \?\? null; \}/, 'the tile map, the record\'s own');
  assert.match(W, /\bp\._stride = stride;/, 'the ring class written in place: read by its value');
  assert.match(W, /const harbourBook = createHarbourBook\(\{\n\s*harbourNear: navalHarbourNear,\n\s*isWater: navalIsWater,\n\s*ground: \(x, z\) => surfaceAt\(x, z\) - tvSeaY\(\),/, 'the book asks those');
  assert.match(W, /const h = harbourOf\(t, \{ state, built: csaPixelAt, woods: host\.woods \}\);/, 'its ports read the same pixels');
  const dw = read('src/scenes/deepWater/deepWatersHost.js');
  assert.match(dw, /floorLocalY\(entry, lx, lz\) \{ return carvedFloorLocalY\(entry\?\.deepWaters, lx, lz\); \}/, 'a carved floor, its pixel\'s carved sea');
  assert.match(dw, /\n\s*entry\.deepWaters = state;\n/, 'a carved sea stood anew, never changed in place');
  assert.match(read('src/world/streamingWorld.js'), /\n\s*out\[1\] = this\.compensation\[1\];\n/, 'a pixel\'s height off the compensation alone');
  assert.match(read('src/systems/naval/navalShips.js'), /if \(standing\[hull\] !== !!on\) stamp\+\+;/, 'a build changed, a new stamp');
});
