// A called dragon online: the toybox's Dragon Attack in the hub's book (signed for a developer by the account service)
// lets the relay host a world dragon's fight at its city's pixel, with no dwell or budget asked; a forged event or another
// pixel calls nothing; its fall pays the dragon's own `z1` receipt and ends the event in the hub's book.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Law from '../../src/net/dragon/dragonLaw.js';
import { cellRoomOfWire, SOCIAL_ROOM } from '../../src/net/wire.js';
import { DRAGON_TICK_MS } from '../../src/net/dragon/dragonBrain.js';
import { readDragonReceipt } from '../../src/net/dragon/dragonReceipt.js';
import { toyboxStaffEvent } from '../../src/net/staffEvent/toyboxEvent.js';
import { takeStaffEventOrder } from '../../server/src/staffEvents.js';
import { fakeRooms } from '../fakeRoom.mjs';
import { RELAY_KEY } from '../dragonOmen.mjs';

const BAY = { rg: 17, loc: 0, px: 207, py: 213, nm: 'Daggerfall', ct: 1 };
const words = (ws, k) => ws.sent.filter((m) => m.t === 'dragon' && (!k || m.k === k));

test('CALLED DRAGON RELAY: the book\'s Dragon Attack stands a fight at its city at once; a forged id or a neighbour pixel stands none; its fall pays `z1` and ends the event (mutants: the dwell asked; any pixel taken; the event left in the book)', async () => {
  const AT = 1_800_000_000_000;
  const { ev } = /** @type {any} */ (toyboxStaffEvent({ kind: 'dragon', place: BAY, id: 'dc12cd34ef', at: AT, by: 'Dev' }));
  const o = Law.dragonCalledOf(ev), S = Law.pixelCentreNative(BAY.px, BAY.py), N = Law.pixelCentreNative(BAY.px + 1, BAY.py);
  const realNow = Date.now;
  let clock = ev.go + 30_000;
  try {
    Date.now = () => clock;
    const world = fakeRooms({ now: () => clock });
    const room = (key) => { const r = world.room(key); r.env.GATE_SIGNING_KEY = RELAY_KEY.pkcs8; return r; };
    const hub = room(SOCIAL_ROOM);
    assert.equal((await takeStaffEventOrder(hub.room, { o: 'sevent', s: 'acct', op: 'start', ev }, clock)).ok, true);
    const r = room(cellRoomOfWire(S.sx, S.sz)), a = r.connect();
    await r.hello(a, 'peer-0001', { x: S.sx + 40 * Law.DRAGON_NATIVE_PER_M, y: 0, z: S.sz, yaw: 0, pitch: 0 });
    const inWord = { t: 'dragon', k: 'in', w: o.w, bv: Law.DRAGON_BRAIN_V, lv: 20, sx: S.sx, sz: S.sz };
    await r.raw(a, JSON.stringify({ ...inWord, ev: 'zz12cd34ef' }));
    await r.raw(a, JSON.stringify({ ...inWord, sx: N.sx, sz: N.sz, ev: ev.id }));
    assert.equal(r.room._dg?.fights?.size ?? 0, 0, 'a forged event, a neighbour pixel: no fight');
    await r.raw(a, JSON.stringify({ ...inWord, ev: ev.id }));
    const f = r.room._dg.fights.get(Law.dragonFightId(o.w, S.sx, S.sz));
    assert.ok(f && f.ev === ev.id, 'a fresh socket joins at once: no dwell, no budget');
    assert.ok(words(a, 'st').length >= 1);
    clock += DRAGON_TICK_MS; if (r.alarm.at != null && clock >= r.alarm.at) await r.fire();
    f.hp = 5; f.players['acct-peer-0001'].dealt = 1000;
    await r.raw(a, JSON.stringify({ t: 'dragon', k: 'hit', d: 40, r: 1 }));
    const c = readDragonReceipt(words(a, 'rcpt')[0]?.r);
    assert.deepEqual([c?.q, c?.p, c?.x], [o.w, Law.dragonPlaceOf(S.sx, S.sz), 'dealt'], 'the dragon\'s own receipt');
    const left = await takeStaffEventOrder(hub.room, { o: 'sevent', s: 'acct', op: 'look' }, clock);
    assert.equal(left.l.some((e) => e.id === ev.id), false, 'its Dragon Attack ended at the fall');
  } finally { Date.now = realNow; }
});

test('CALLED DRAGON RELAY: a dragon flown away unslain ends its Dragon Attack at once, its cell telling the hub; the hub ends none still running (mutants: the leaving never told; the hub ending it before its time)', async () => {
  const AT = 1_800_000_000_000;
  const { ev } = /** @type {any} */ (toyboxStaffEvent({ kind: 'dragon', place: BAY, id: 'dl12cd34ef', at: AT, by: 'Dev' }));
  const o = Law.dragonCalledOf(ev), S = Law.pixelCentreNative(BAY.px, BAY.py);
  const realNow = Date.now;
  let clock = ev.go + 30_000;
  try {
    Date.now = () => clock;
    const world = fakeRooms({ now: () => clock });
    const room = (key) => { const r = world.room(key); r.env.GATE_SIGNING_KEY = RELAY_KEY.pkcs8; return r; };
    const hub = room(SOCIAL_ROOM);
    assert.equal((await takeStaffEventOrder(hub.room, { o: 'sevent', s: 'acct', op: 'start', ev }, clock)).ok, true);
    const r = room(cellRoomOfWire(S.sx, S.sz)), a = r.connect();
    await r.hello(a, 'peer-0001', { x: S.sx + 40 * Law.DRAGON_NATIVE_PER_M, y: 0, z: S.sz, yaw: 0, pitch: 0 });
    await r.raw(a, JSON.stringify({ t: 'dragon', k: 'in', w: o.w, bv: Law.DRAGON_BRAIN_V, lv: 20, sx: S.sx, sz: S.sz, ev: ev.id }));
    const f = r.room._dg.fights.get(Law.dragonFightId(o.w, S.sx, S.sz));
    assert.ok(f, 'the fight stands');
    const inBook = async () => (await takeStaffEventOrder(hub.room, { o: 'sevent', s: 'acct', op: 'look' }, ev.ue - 1)).l.some((e) => e.id === ev.id);
    const { endLeftDragon } = await import('../../server/src/staffEvents.js');
    assert.equal(await endLeftDragon(hub.room, ev.id, ev.ue - 1), false, 'the hub ends none still running');
    clock = Law.dragonTimes(o).leaveAt + DRAGON_TICK_MS;
    for (let k = 0; k < 4 && !f.gone; k++) { if (r.alarm.at != null) await r.fire(); else break; }
    assert.ok(f.gone && !f.fell, 'it flew away unslain');
    assert.equal(f.told, true, 'its leaving told the hub');
    assert.equal(await inBook(), false, 'its Dragon Attack ended at the leaving');
  } finally { Date.now = realNow; }
});
