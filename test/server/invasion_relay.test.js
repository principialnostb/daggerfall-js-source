// An invasion online, through the relay's real Room (server/src/invasionFights.js wired by index.js): the hub's book
// holds the toybox's invasion, its city's cell hosts the fight - a fighter's `in` from the pixel joins it, the cell's
// state is fanned to the cell, a blow is judged on the socket's own pose - and the boss's fall pays the staff event's
// `tb` receipt to the fighter whose blow it took, never to one who only stood there, and ends the event in the book.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldRoom, SOCIAL_ROOM, PIXEL_UNITS } from '../../src/net/wire.js';
import { readStaffReceipt } from '../../src/net/staffEvent/staffEventReceipt.js';
import { toyboxStaffEvent } from '../../src/net/staffEvent/toyboxEvent.js';
import { INVASION_WAVES } from '../../src/systems/toybox/toyboxLaw.js';
import { INVASION_TICK_MS, INVASION_RISE_MS, INVASION_WAVE_GAP_MS, invasionFoeAt, INVASION_NATIVE_PER_M } from '../../src/net/invasion/invasionBrain.js';
import { takeStaffEventOrder } from '../../server/src/staffEvents.js';
import { fakeRooms } from '../fakeRoom.mjs';
import { RELAY_KEY } from '../dragonOmen.mjs';

const BAY = { rg: 17, loc: 0, px: 207, py: 213, nm: 'Daggerfall', ct: 1 };
const centre = (px, py) => ({ x: px * PIXEL_UNITS + PIXEL_UNITS / 2, z: (499 - py) * PIXEL_UNITS + PIXEL_UNITS / 2 });
const words = (ws, k) => ws.sent.filter((m) => m.t === 'inv' && (!k || m.k === k));

test('INVASION RELAY: the city\'s cell hosts the fight - joined from its pixel, its state fanned, a blow judged on the socket\'s own pose; the fall pays `tb` receipts to earners alone and ends the event; its rise and fall said to every screen (mutants: a blow believed from afar; a stander paid; the event left in the book)', async () => {
  const AT = 1_800_000_000_000;
  const { ev } = /** @type {any} */ (toyboxStaffEvent({ kind: 'invasion', place: BAY, family: 'orcs', id: 'iv12cd34ef', at: AT, by: 'Dev' }));
  const realNow = Date.now;
  let clock = ev.go + 1000;
  try {
    Date.now = () => clock;
    const world = fakeRooms({ now: () => clock });
    const room = (key) => { const r = world.room(key); r.env.GATE_SIGNING_KEY = RELAY_KEY.pkcs8; return r; };
    const hub = room(SOCIAL_ROOM);
    assert.equal((await takeStaffEventOrder(hub.room, { o: 'sevent', s: 'acct', op: 'start', ev }, clock)).ok, true);
    const watcher = hub.connect();
    await hub.hello(watcher, 'wat-0001');
    const at = centre(BAY.px, BAY.py);
    const cell = room(worldRoom(BAY.px, BAY.py));
    const ann = cell.connect(), bob = cell.connect(), far = cell.connect();
    await cell.hello(ann, 'ann-0001', { x: at.x, y: 0, z: at.z, yaw: 0, pitch: 0 });
    await cell.hello(bob, 'bob-0001', { x: at.x + 80, y: 0, z: at.z, yaw: 0, pitch: 0 });
    await cell.hello(far, 'far-0001', { x: at.x + PIXEL_UNITS, y: 0, z: at.z, yaw: 0, pitch: 0 });
    await cell.raw(far, JSON.stringify({ t: 'inv', k: 'in', id: ev.id, lv: 30 }));
    assert.equal(cell.room._inv?.fights?.size ?? 0, 0, 'from another pixel: no fight');
    assert.deepEqual(words(far, 'no').map((m) => m.m), ['far']);
    await cell.raw(ann, JSON.stringify({ t: 'inv', k: 'in', id: ev.id, lv: 30 }));
    await cell.raw(bob, JSON.stringify({ t: 'inv', k: 'in', id: ev.id, lv: 30 }));
    const fight = cell.room._inv.fights.get(ev.id);
    assert.ok(fight, 'joined from its pixel');
    assert.deepEqual(Object.keys(fight.players).sort(), ['acct-ann-0001', 'acct-bob-0001']);
    assert.ok(words(ann, 'st').length >= 1, 'told the whole fight');
    const beat = async (ms) => { for (let t = 0; t < ms; t += INVASION_TICK_MS) { clock += INVASION_TICK_MS; if (cell.alarm.at != null && clock >= cell.alarm.at) await cell.fire(); } };
    await beat(INVASION_WAVE_GAP_MS + 500);
    assert.ok(fight.foes.length > 0, 'the first wave stands');
    assert.ok(words(far, 'st').some((m) => m.f.length > 0), 'fanned to the cell');
    // a blow from afar is refused: the cell reads the socket's own pose, never the word
    const foe = fight.foes[0];
    const [fx, fz] = invasionFoeAt(foe, clock);
    const health = foe.h;
    await cell.raw(bob, JSON.stringify({ t: 'inv', k: 'hit', id: ev.id, i: foe.i, d: 40, r: 0 }));
    assert.equal(foe.h, health, 'a swing from Bob\'s own pose, far from it');
    await cell.pose(ann, { x: fight.sx + fx * INVASION_NATIVE_PER_M, y: 0, z: fight.sz + fz * INVASION_NATIVE_PER_M, yaw: 0, pitch: 0 });
    await cell.raw(ann, JSON.stringify({ t: 'inv', k: 'hit', id: ev.id, i: foe.i, d: 40, r: 0 }));
    assert.ok(foe.h < health, 'Ann\'s, beside it');
    // the boss: the waves spent, it rises; brought low, Ann's blow fells it
    fight.foes = [];
    fight.wave = INVASION_WAVES;
    fight.nextWaveAt = clock;
    await beat(1000);
    assert.ok(fight.boss, 'the boss rises');
    await beat(INVASION_RISE_MS + 500);
    fight.boss.h = 5;
    fight.boss.mv = null;
    await cell.pose(ann, { x: fight.sx + fight.boss.x * INVASION_NATIVE_PER_M, y: 0, z: fight.sz + fight.boss.z * INVASION_NATIVE_PER_M, yaw: 0, pitch: 0 });
    clock += 500;
    await cell.raw(ann, JSON.stringify({ t: 'inv', k: 'hit', id: ev.id, i: 0, d: 40, r: 0 }));
    assert.ok(fight.fell, 'it falls');
    const rc = ann.sent.find((m) => m.t === 'sev' && m.k === 'rc');
    assert.ok(rc, 'Ann is paid');
    const claims = readStaffReceipt(rc.r);
    assert.deepEqual([claims.v, claims.s, claims.tb], [ev.id, 'acct-ann-0001', 1]);
    assert.equal(bob.sent.some((m) => m.t === 'sev' && m.k === 'rc'), false, 'Bob, whose blow it never took, is not');
    const moments = watcher.sent.filter((m) => m.t === 'sev' && m.k === 'tb' && m.id === ev.id).map((m) => m.s);
    assert.deepEqual(moments, ['boss', 'won'], 'its rise and its fall, said to a screen nowhere near');
    const left = await takeStaffEventOrder(hub.room, { o: 'sevent', s: 'acct', op: 'look' }, clock);
    assert.equal(left.l.some((e) => e.id === ev.id), false, 'the event ended at the fall');
  } finally {
    Date.now = realNow;
  }
});
