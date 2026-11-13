// A toybox event's law: its fields on a staff event (`tb`, `fm`, `go`), the event the toybox builds for a city on the
// Bay and past it, an invasion's waves, the receipt's `tb`, the hub's moments and the relay's gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validStaffEvent,
  staffEventFault,
  validStaffEventOut,
  staffEventBegun,
  staffEventEarned,
  newStaffLedger,
  relaySupportsToyboxEvents,
  TOYBOX_EVENT_RELAY_MIN,
  STAFF_EVENT_RELAY_MIN,
  TB_FAMILIES,
  TB_WAIT_MAX_MS,
  TB_INVASION,
  TB_DRAGON,
} from '../../src/net/staffEvent/staffEventLaw.js';
import { mintStaffReceipt, readStaffReceipt, staffReceiptValid } from '../../src/net/staffEvent/staffEventReceipt.js';
import {
  toyboxStaffEvent,
  invasionWaveSize,
  invasionWaveOf,
  INVASION_METER,
  INVASION_PHASE3_WAVE,
  TOYBOX_EVENT_RUN_MS,
} from '../../src/net/staffEvent/toyboxEvent.js';
import {
  INVASION_FAMILIES,
  INVASION_WAVES,
  TOYBOX_EVENT_WAIT_MS,
  TOYBOX_EVENT_WAIT_OFFLINE_MS,
  DRAGON_ATTACK_KIND,
} from '../../src/systems/toybox/toyboxLaw.js';
import { DRAGON_STAY_MS } from '../../src/net/dragon/dragonLaw.js';
import { DWARVEN_DRAGON_ID } from '../../src/characters/dwarvenDragonId.js';

const AT = 1_800_000_000_000;
const BAY = { rg: 17, loc: 0, px: 207, py: 213, nm: 'Daggerfall', ct: 1 };
// a city past the Bay: a province's region, its own (negative) location, its pixel off the Bay's map
const PAST = { rg: 64, loc: -1000123, px: 1450, py: -220, nm: 'Mournhold', ct: 1 };

test('TOYBOX EVENT: the law\'s copies are pinned to the toybox\'s, and the relay gate sits past the staff event\'s', () => {
  assert.equal(TB_FAMILIES, INVASION_FAMILIES.length);
  assert.ok(TOYBOX_EVENT_WAIT_MS <= TB_WAIT_MAX_MS);
  assert.equal(DRAGON_ATTACK_KIND, DWARVEN_DRAGON_ID);
  assert.ok(TOYBOX_EVENT_RELAY_MIN > STAFF_EVENT_RELAY_MIN);
  assert.equal(relaySupportsToyboxEvents(`world${TOYBOX_EVENT_RELAY_MIN}`), true);
  assert.equal(relaySupportsToyboxEvents(`world${TOYBOX_EVENT_RELAY_MIN - 1}`), false);
  assert.equal(relaySupportsToyboxEvents(null), false);
});

test('TOYBOX EVENT: an invasion at a Bay city - its family\'s kinds and boss, its meter the waves\' sum, its start ten minutes on', () => {
  const r = toyboxStaffEvent({ kind: 'invasion', place: BAY, family: 'orcs', id: 'ab12cd34ef', at: AT, by: 'Dev' });
  assert.ok('ev' in r, JSON.stringify(r));
  const e = r.ev;
  const orcs = INVASION_FAMILIES.find((f) => f.id === 'orcs');
  assert.deepEqual([e.tb, e.fm, e.mt, e.b, e.m, e.go, e.eb], [TB_INVASION, INVASION_FAMILIES.indexOf(orcs), [...orcs.kinds], orcs.boss, INVASION_METER, AT + TOYBOX_EVENT_WAIT_MS, 1]);
  assert.equal(e.ue, e.go + TOYBOX_EVENT_RUN_MS);
  assert.ok(e.n > e.m, 'its total runs past the meter: the third phase');
  assert.equal(staffEventBegun(e, e.go - 1), false);
  assert.equal(staffEventBegun(e, e.go), true);
  assert.deepEqual(validStaffEvent(e), e, 'the hub keeps every field');
});

test('TOYBOX EVENT: a dragon attack past the Bay - no boss called, it stands for the world dragon\'s stay; an offline wait; refusals by name', () => {
  const r = toyboxStaffEvent({ kind: 'dragon', place: PAST, id: 'ab12cd34ef', at: AT, by: 'Dev' });
  assert.ok('ev' in r, JSON.stringify(r));
  assert.deepEqual([r.ev.tb, r.ev.mt, r.ev.b, r.ev.fb, r.ev.loc, r.ev.rg], [TB_DRAGON, [DRAGON_ATTACK_KIND], DRAGON_ATTACK_KIND, 0, PAST.loc, PAST.rg]);
  assert.equal(r.ev.go, AT + TOYBOX_EVENT_WAIT_MS);
  assert.equal(r.ev.ue - r.ev.go, DRAGON_STAY_MS, 'it ends the moment its dragon leaves');
  const off = toyboxStaffEvent({ kind: 'dragon', place: PAST, id: 'ab12cd34ef', at: AT, by: 'Dev', wait: TOYBOX_EVENT_WAIT_OFFLINE_MS });
  assert.ok('ev' in off && off.ev.go === AT + 60_000, 'offline it begins in a minute');
  assert.deepEqual(toyboxStaffEvent({ kind: 'nuke', place: BAY, id: 'ab12cd34ef', at: AT, by: '' }), { error: 'kind' });
  assert.deepEqual(toyboxStaffEvent({ kind: 'invasion', place: BAY, family: 'gnomes', id: 'ab12cd34ef', at: AT, by: '' }), { error: 'family' });
  assert.deepEqual(toyboxStaffEvent({ kind: 'dragon', place: { ...PAST, rg: 17 }, id: 'ab12cd34ef', at: AT, by: '' }), { error: 'town' });
});

test('TOYBOX EVENT: a staff event\'s shape is the one it always was; a bad `tb`, `fm` or `go` is refused by name', () => {
  const ev = { id: 'ab12cd34ef', ...BAY, mt: [7], n: 30, m: 12, b: 24, bs: 200, bh: 10, hp: 0, at: AT, ue: 0, eb: 1, fb: 0, by: 'S' };
  assert.equal('tb' in validStaffEvent(ev), false);
  assert.equal(staffEventBegun(validStaffEvent(ev), AT), true, 'a staff event begins at its staging');
  assert.equal(staffEventFault({ ...ev, tb: 3 }), 'toybox');
  assert.equal(staffEventFault({ ...ev, tb: 1, fm: TB_FAMILIES }), 'toybox');
  assert.equal(staffEventFault({ ...ev, tb: 1, go: AT - 1 }), 'begins');
  assert.equal(staffEventFault({ ...ev, tb: 1, go: AT + TB_WAIT_MAX_MS + 1 }), 'begins');
  assert.equal(staffEventFault({ ...ev, tb: 1, go: AT + 10, ue: AT + 5 }), 'begins');
});

test('TOYBOX EVENT: THE WAVES - each the size of its turn; the meter is their sum, so the wave under way reads off the kills', () => {
  let n = 0;
  for (let k = 0; k < INVASION_WAVES; k++) {
    assert.equal(invasionWaveOf(n), k);
    assert.equal(invasionWaveSize(k), 6 + k);
    n += invasionWaveSize(k);
  }
  assert.equal(n, INVASION_METER);
  assert.equal(invasionWaveOf(n), INVASION_WAVES, 'the tenth fell');
  assert.ok(INVASION_PHASE3_WAVE > 0);
});

test('TOYBOX EVENT: THE RECEIPT - an invasion\'s says `tb` inside the signed bytes; a dragon attack\'s and a staff event\'s say none', async () => {
  const { subtle } = globalThis.crypto;
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const nowS = Math.floor(AT / 1000);
  const inv = readStaffReceipt(await mintStaffReceipt({ v: 'ab12cd34ef', s: 'acct01', c: 7, r: 1, tb: TB_INVASION }, kp.privateKey, { subtle, nowS }));
  assert.deepEqual([inv.tb, inv.signed], [1, true]);
  const dragon = readStaffReceipt(await mintStaffReceipt({ v: 'ab12cd34ef', s: 'acct01', c: 7, r: 1, tb: TB_DRAGON }, null, { subtle, nowS }));
  assert.equal(dragon.tb, undefined, 'a dragon attack pays a staff event\'s spoils');
  assert.equal(staffReceiptValid({ v: 'ab12cd34ef', s: 'acct01', c: 7, r: 1, tb: 5, i: nowS, e: nowS + 60 }), false);
});

test('TOYBOX EVENT: the hub\'s moments on the wire; a struck fighter of a toybox event earns, a staff event\'s does not', () => {
  assert.deepEqual(validStaffEventOut({ t: 'sev', k: 'tb', id: 'ab12cd34ef', s: 'boss' }), { k: 'tb', id: 'ab12cd34ef', s: 'boss' });
  assert.equal(validStaffEventOut({ k: 'tb', id: 'ab12cd34ef', s: 'party' }), null);
  const led = newStaffLedger(/** @type {any} */ ({ id: 'ab12cd34ef' }), AT);
  led.a.acct01 = { nm: 'A', n: 0, s: 1, last: AT, h: 1 };
  assert.equal(staffEventEarned(led).length, 0);
  assert.equal(staffEventEarned(led, { tb: TB_DRAGON }).length, 1);
});
