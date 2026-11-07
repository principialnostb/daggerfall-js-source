// The toybox's cities (systems/toybox/toyboxCities.js) - every city of Tamriel, the Bay's and past it, each by a name of
// its own and the fields a toybox event's place carries - and the client's start (net/toyboxEvents.js): online through
// the developer's route when the relay keeps a toybox event, offline through the local runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toyboxCities, toyboxCityNamed } from '../../src/systems/toybox/toyboxCities.js';
import { startToyboxEvent, TOYBOX_EVENT_PATH } from '../../src/net/toyboxEvents.js';
import { DEV_EVENT_PATH } from '../../server-account/src/devEvents.js';
import { TOYBOX_EVENT_RELAY_MIN, validStaffEvent } from '../../src/net/staffEvent/staffEventLaw.js';
import { createLocalToyboxEvents } from '../../src/systems/toybox/localToyboxEvents.js';

const places = {
  all: () => [
    { name: 'Daggerfall', type: 0, px: 207, py: 213, region: 17, mapId: 900 },
    { name: 'Daggerfall Hamlet', type: 1, px: 210, py: 213, region: 17, mapId: 901 },
    { name: 'Wayrest', type: 0, px: 800, py: 200, region: 18, mapId: 902 },
    { name: 'Wayrest', type: 0, px: 1500, py: -300, region: 64, mapId: 903, location: -1000200 },
    { name: 'Mournhold', type: 0, px: 1450, py: -220, region: 64, mapId: 904, location: -1000123 },
    { name: 'Nowhere', type: 0, px: 1460, py: -220, region: 64, mapId: 905 },
  ],
};
const maps = {
  getRegion: (r) => ({ mapTable: r === 17 ? [{ mapId: 1 }, { mapId: 900 }] : r === 18 ? [{ mapId: 902 }] : [] }),
};

test('TOYBOX CITIES: every city of Tamriel by a name of its own - a Bay city by its MAPS.BSA index, one past the Bay by its own; hamlets and placeless towns left out', () => {
  const list = toyboxCities({ places, maps, regionName: (rg) => (rg === 64 ? 'Morrowind' : `R${rg}`) });
  assert.deepEqual(list.map((c) => c.name), ['Daggerfall', 'Mournhold', 'Wayrest (Morrowind)', 'Wayrest (R18)']);
  assert.equal(new Set(list.map((c) => c.name)).size, list.length, 'unique');
  assert.deepEqual(toyboxCityNamed(list, 'Daggerfall'), { rg: 17, loc: 1, px: 207, py: 213, nm: 'Daggerfall', ct: 1 });
  assert.deepEqual(toyboxCityNamed(list, 'Mournhold'), { rg: 64, loc: -1000123, px: 1450, py: -220, nm: 'Mournhold', ct: 1 });
  assert.equal(toyboxCityNamed(list, 'Atlantis'), null);
  assert.equal(TOYBOX_EVENT_PATH, DEV_EVENT_PATH);
});

test('TOYBOX START: online asks the route only of a relay that keeps it; offline stages on this machine', async () => {
  const cities = () => toyboxCities({ places, maps });
  const posted = [];
  const post = async (body) => { posted.push(body); return { ok: true, data: { event: { id: 'x' } } }; };
  assert.deepEqual(await startToyboxEvent({ kind: 'invasion', city: 'Mournhold', family: 'undead' }, { online: () => true, relayVersion: () => 'world300', post, cities }), { ok: false, error: 'relay-old' });
  assert.equal(posted.length, 0);
  const r = await startToyboxEvent({ kind: 'invasion', city: 'Mournhold', family: 'undead' }, { online: () => true, relayVersion: () => `world${TOYBOX_EVENT_RELAY_MIN}`, post, cities });
  assert.deepEqual([r.ok, posted[0]], [true, { kind: 'invasion', city: { rg: 64, loc: -1000123, px: 1450, py: -220, nm: 'Mournhold', ct: 1 }, family: 'undead' }]);
  assert.deepEqual(await startToyboxEvent({ kind: 'dragon', city: 'Atlantis' }, { online: () => false, cities }), { ok: false, error: 'city' });
  const frames = [];
  const local = createLocalToyboxEvents({ deliver: (sev) => frames.push(sev), now: () => 1_800_000_000_000 });
  const off = await startToyboxEvent({ kind: 'dragon', city: 'Mournhold' }, { online: () => false, local, cities });
  assert.equal(off.ok, true);
  assert.ok(validStaffEvent(off.event), 'the law\'s own shape');
  assert.deepEqual(frames.map((f) => f.k), ['ev'], 'the book, as the hub would say it');
});
