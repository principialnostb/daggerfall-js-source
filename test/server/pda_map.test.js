// The journal's map: a worn-paper chart of Tamriel drawn in the service from the owner's relief, decoded back here
// pixel by pixel - land and sea, an exact pin past the Bay on its own ground in its family's ink, a dashed ring for an
// event known only by its province, the picture's address that changes with the pins, and the open route Discord
// fetches. The indexed PNG writer the service still keeps is tested on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdaRig, snowflake, screenText, assertScreenOk } from '../pdaRig.mjs';
import { decode } from '../pngDecode.mjs';
import { mapPins, drawMap, mapKey, pinPlace, pinInk, IMAGE_W, IMAGE_H, MAP_SCALE, MAP_PATH, _resetPdaMapForTests } from '../../server-account/src/pdaMap.js';
import { encodePng, raster, crc32, fillRings, drawText, textWidth } from '../../server-account/src/pdaPng.js';
import { _resetPdaEventsForTests } from '../../server-account/src/pdaEvents.js';
import { provinceAt } from '../../src/world/tamriel/tamrielGeography.js';
import { bayToPicture, pictureToBay } from '../../src/world/tamriel/tamrielFrame.js';

const rgbOf = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
/** How blue a pixel leans: the sea's wash is bluer than any land's paper. */
const blueLean = ([r, , b]) => b - r;

/** A world event as the events module makes one. */
const ev = (o) => ({ key: o.key ?? `${o.family}:x`, title: o.title ?? 'An event', where: 'somewhere', live: true, startAt: null, endAt: null, lane: 0, ...o });

test('PDA png: an indexed PNG round-trips through zlib, every chunk\'s CRC good; the fill leaves no gap on a shared edge; the font is three wide', async () => {
  const r = raster(10, 6, 0);
  fillRings(r, [[[0, 0], [5, 0], [5, 6], [0, 6]]], 1);
  fillRings(r, [[[5, 0], [10, 0], [10, 6], [5, 6]]], 2);
  const d = decode(await encodePng(r, [[0, 0, 0], [255, 0, 0], [0, 0, 255]]));
  assert.deepEqual([d.w, d.h, d.type], [10, 6, 3]);
  assert.deepEqual([d.at(4, 3), d.at(5, 3)], [1, 2], 'two shapes meet with no gap and no overlap');
  assert.equal(textWidth('AB', 2), 14);
  const t = raster(3, 5, 0);
  drawText(t, 'I', 0, 0, 1);
  assert.deepEqual([...t.px], [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1]);
});

test('Journal map: land on worn paper and the sea washed blue, an exact pin past the Bay in its family\'s ink, a dashed ring for an event known only by its province', async () => {
  _resetPdaMapForTests();
  // a gate in Skyrim's lane, at a world pixel inside Skyrim, past the Bay
  const [bx, by] = pictureToBay(160, 52).map(Math.floor);
  assert.equal(provinceAt(...bayToPicture(bx + 0.5, by + 0.5)).key, 'Skyrim');
  const gate = ev({ family: 'gate', lane: 3, px: bx + 0.5, py: by + 0.5 });
  const hollow = ev({ family: 'abyss', lane: 4, live: false, startAt: 1 });
  const pins = mapPins([gate, { ...hollow, live: true }], 0);
  assert.equal(pins.length, 2);
  assert.equal(pins[0].exact, true);
  assert.equal(pins[1].exact, false);
  const d = decode(await drawMap(pins));
  assert.deepEqual([d.w, d.h, d.type], [IMAGE_W, IMAGE_H, 6]);
  const sea = d.at(150 * MAP_SCALE, 190 * MAP_SCALE);
  const land = d.at(205 * MAP_SCALE, 80 * MAP_SCALE);
  assert.ok(blueLean(sea) > blueLean(land) + 20, `the southern sea (${sea}) is bluer than Cyrodiil (${land})`);
  assert.ok(near(d.at(pins[0].x * MAP_SCALE, pins[0].y * MAP_SCALE), rgbOf(pinInk('gate')), 40), 'the pin at its own place, in the gate\'s ink');
  const ring = pins[1];
  const onRing = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => d.at(ring.x * MAP_SCALE + Math.cos(k * 0.785 + 0.2) * 11, ring.y * MAP_SCALE + Math.sin(k * 0.785 + 0.2) * 11));
  assert.ok(onRing.some((c) => near(c, rgbOf(pinInk('abyss')), 50)), 'a ring round the province\'s name, in the abyss\'s ink');
  assert.ok(!near(d.at(ring.x * MAP_SCALE, ring.y * MAP_SCALE), rgbOf(pinInk('abyss')), 20), 'hollow: no place is claimed');
});

test('PDA map: a place past the Bay that lands outside its own province is never pinned as exact; places without one are left off', () => {
  // Skyrim's lane, but a pixel in Hammerfell
  const [bx, by] = pictureToBay(84, 96).map(Math.floor);
  const p = pinPlace(ev({ family: 'gate', lane: 3, px: bx + 0.5, py: by + 0.5 }));
  assert.equal(p.exact, false);
  assert.equal(provinceAt(p.x, p.y - 6).key, 'Skyrim', 'its province\'s name instead');
  assert.equal(pinPlace(ev({ family: 'spire' })), null);
  assert.equal(pinPlace(ev({ family: 'siege' })), null);
  assert.equal(pinPlace(ev({ family: 'serpent' })), null, 'a serpent nobody has placed');
  const k = pinPlace(ev({ family: 'ketch', lane: 3, station: 'Solitude' }));
  assert.deepEqual([k.x, k.y, k.exact], [136, 26, true]);
  assert.equal(pinPlace(ev({ family: 'ketch', lane: 0, station: 'Daggerfall' })).exact, true);
});

test('PDA map: the address changes with the pins and only with them; the open route answers a PNG, drawn once for the same moment', async () => {
  _resetPdaMapForTests();
  _resetPdaEventsForTests();
  const a = mapPins([ev({ family: 'gate', lane: 3 })], 0);
  const b = mapPins([ev({ family: 'gate', lane: 5 })], 0);
  assert.equal(mapKey(a), mapKey(mapPins([ev({ family: 'gate', lane: 3 })], 0)));
  assert.notEqual(mapKey(a), mapKey(b));
  const r = await pdaRig();
  const res = await r.fetch(`https://accounts.invalid${MAP_PATH}?v=anything`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('cache-control'), /public/);
  const one = new Uint8Array(await res.arrayBuffer());
  decode(one);
  const two = new Uint8Array(await (await r.fetch(`https://accounts.invalid${MAP_PATH}`)).arrayBuffer());
  assert.deepEqual(two, one, 'the same moment, the same picture');
  assert.equal((await r.fetch(`https://accounts.invalid${MAP_PATH}`, { method: 'POST', body: '{}' })).status, 405);
});

test('PDA map: the screen shows the picture by its state\'s address, its legend numbered, to anyone', async () => {
  _resetPdaMapForTests();
  _resetPdaEventsForTests();
  const r = await pdaRig();
  const s = assertScreenOk(await r.press({ id: snowflake(), username: 'x' }, 'open:map', { message: { flags: 1 << 15 } }), 'map');
  const urls = [...JSON.stringify(s.data.components).matchAll(/"url":"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.some((u) => /^https:\/\/accounts\.invalid\/v1\/pda\/map\.png\?v=[0-9a-f]{8}$/.test(u)), urls.join(' '));
  assert.match(screenText(s), /\*\*1\*\* [●○]/);
});

test('Journal map: drawn from the owner\'s relief and our authored geography alone - no reader of the game\'s files, no picture of them', () => {
  for (const f of ['server-account/src/pdaMap.js', 'server-account/src/pdaPng.js', 'server-account/src/journalMap.js', 'server-account/src/journalArt.js']) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    assert.ok(imports.every((p) => !p.includes('/formats/') && !/\.(png|img|bsa|cif)$/i.test(p)), `${f} reads no game file`);
    const world = imports.filter((p) => p.includes('/world/'));
    assert.ok(world.every((p) => /tamriel\/(tamrielGeography|tamrielFrame|tamrielLand|tamrielReliefData|tamrielRelief)\.js$/.test(p)), `${f}: the relief and the authored geography alone`);
  }
});
