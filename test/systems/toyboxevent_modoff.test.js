// A toybox event runs whatever the Raiding Parties mod says (systems/raidingParties.js raidFrame): with the mod off an
// invasion still stands its waves (its cell's, drawn by scenes/invasionField.js), while a plain staff event and the
// mod's own raids stay off as they always were.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { raidFrame as frame, raidRelayWord, setRaidingPartiesHost, restoreRaidSaveData, raidState, _resetRaidingParties } from '../../src/systems/raidingParties.js';
import { staffEventBook, staffRaids, _resetStaffEvents } from '../../src/systems/staffEvents.js';
import { setSharedClock } from '../../src/systems/worldTick.js';
import { MINUTES_PER_DAY } from '../../src/systems/gameDate.js';
import { _resetModSettings, setModSetting } from '../../src/systems/modSettings.js';
import { _resetRenownKillsForTests } from '../../src/net/renownTracker.js';
import { createLocalToyboxEvents } from '../../src/systems/toybox/localToyboxEvents.js';
import { _resetToyboxNews, setToyboxSound } from '../../src/systems/toybox/toyboxNews.js';
import { startToyboxEvent } from '../../src/net/toyboxEvents.js';
import { createInvasionField } from '../../src/scenes/invasionField.js';
import { INVASION_NATIVE_PER_M } from '../../src/net/invasion/invasionBrain.js';
import { PIXEL_UNITS } from '../../src/net/wire.js';

const DAY = 400;
const CITY = { rg: 3, loc: 7, px: 200, py: 100, nm: 'Gothway Garden', ct: 1 };
const EV = { id: 'ab12cd34ef', rg: 3, loc: 7, px: 200, py: 100, nm: 'Gothway Garden', ct: 1, mt: [7, 12], n: 6, m: 3, b: 24, bs: 250, bh: 20, at: 1_700_000_000_000, ue: 0, eb: 1, fb: 0, by: 'SirMcMobdon' };
const tick = () => new Promise((r) => setImmediate(r));

function rig() {
  const at = { now: DAY * MINUTES_PER_DAY + 600, clock: 1_800_000_000_000 };
  const log = { raiders: [], said: [] };
  let seq = 0;
  const foe = (mobileType) => ({ mobileType, dead: false, corpse: false, entity: { health: 40, maxHealth: 40, mobileType }, ai: { feet: [seq, 0, 0], height: 4 }, uid: ++seq });
  let local = null;
  setRaidingPartiesHost({
    now: () => at.now, random: () => 0, wallNow: () => at.clock, relayNow: () => at.clock, selfId: () => 'me', maps: () => null, picker: () => null,
    regionIndex: () => 3, regionName: (r) => `Region${r}`,
    townHere: (outdoors) => (outdoors ? true : { regionIndex: 3, locationIndex: 7 }), playerPixel: () => ({ x: 200, y: 100 }),
    peersInTown: () => [], raidPuppets: () => [], ownRaidFoes: () => [], relayRaids: () => false,
    standRaider: (mt) => { const f = foe(mt); log.raiders.push(f); return Promise.resolve(f); },
    standDefender: () => Promise.resolve(null), defenderCount: () => 0, defendersAllowed: () => true, removeFoe: (f) => { f.dead = true; }, outOfSight: () => true,
    reputation: () => ({ player: { legalRep: {} }, store: { dict: new Map() } }), say: (line) => log.said.push(line),
    sendRaid: (w) => local?.word(w),
  });
  local = createLocalToyboxEvents({ deliver: (sev, room) => raidRelayWord({ k: 'sev', sev }, room), now: () => at.clock, rand: () => 0.25, name: () => 'Dev' });
  _resetToyboxNews(() => {});
  setToyboxSound(() => {});
  restoreRaidSaveData({ lastSelectedDay: DAY - 1, raids: [] });
  return { at, log, local };
}
async function run(at, n, dt = 2.1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    at.clock += dt * 1000;
    out.push(frame(dt));
    await tick();
  }
  return out;
}

beforeEach(() => {
  _resetRaidingParties();
  _resetStaffEvents();
  _resetModSettings();
  _resetRenownKillsForTests();
  setModSetting('world-events-raiding-parties', 'Enabled', false);
  setSharedClock(null);
});

test('TOYBOX MOD-OFF: with Raiding Parties off, a toybox invasion still stands its waves - the cell runs them and the field draws them, none by the raid - and the mod\'s day is never rolled', async () => {
  const { at, log, local } = rig();
  const started = await startToyboxEvent({ kind: 'invasion', city: 'Gothway Garden', family: 'orcs' }, { online: () => false, local, cities: () => [{ name: 'Gothway Garden', ...CITY }] });
  assert.equal(started.ok, true, JSON.stringify(started));
  const stood = [];
  const pool = { spawnFoe: (kind, pos) => { const f = { mobileType: kind, dead: false, entity: { health: 1, maxHealth: 1 }, ai: { feet: [...pos] } }; stood.push(f); return Promise.resolve(f); }, damageFoe: () => {}, removeFoe: (f) => { f.dead = true; } };
  const centre = [(CITY.px * PIXEL_UNITS + PIXEL_UNITS / 2) / INVASION_NATIVE_PER_M, 0, ((499 - CITY.py) * PIXEL_UNITS + PIXEL_UNITS / 2) / INVASION_NATIVE_PER_M];
  const field = createInvasionField({
    offline: () => true, now: () => at.clock, clock: () => at.clock, pixel: () => ({ x: CITY.px, y: CITY.py }), pool: () => pool,
    local: (nx, nz) => [nx / INVASION_NATIVE_PER_M, nz / INVASION_NATIVE_PER_M], native: (x, z) => [x * INVASION_NATIVE_PER_M, z * INVASION_NATIVE_PER_M],
    ground: () => 0, feet: () => centre, player: { health: 100, maxHealth: 100 }, level: () => 30, hurt: () => {}, blows: () => {}, tactics: () => 0,
  });
  at.clock = started.event.go;
  for (let i = 0; i < 25; i++) {
    at.clock += 250;
    frame(0.25);
    local.tick();
    field.frame();
    await tick();
  }
  assert.ok(stood.length > 0, 'its first wave stood');
  assert.equal(log.raiders.length, 0, 'none of it by the raid');
  assert.equal(raidState().lastSelectedDay, DAY - 1, 'no day of the mod rolled');
  assert.equal(raidState().raids.length, 0);
});

test('TOYBOX MOD-OFF: with Raiding Parties off, a plain staff event stands nothing and says nothing, as before', async () => {
  const { at, log } = rig();
  assert.equal(staffEventBook([EV]), 1);
  assert.equal(staffRaids().length, 1);
  const out = await run(at, 25);
  assert.ok(out.every((x) => x === null), 'the frame is off');
  assert.deepEqual([log.raiders.length, log.said.length], [0, 0]);
  assert.equal(raidState().lastSelectedDay, DAY - 1);
});

test('TOYBOX MOD-OFF: with Raiding Parties on, the same plain staff event runs', async () => {
  setModSetting('world-events-raiding-parties', 'Enabled', true);
  const { at, log } = rig();
  restoreRaidSaveData({ lastSelectedDay: DAY, raids: [] }); // the mod's day already rolled (no picker here to roll it)
  staffEventBook([EV]);
  await run(at, 25);
  assert.ok(log.raiders.length > 0);
});
