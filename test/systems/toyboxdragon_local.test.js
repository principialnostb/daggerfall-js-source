// The toybox's Dragon Attack as the world dragon: its event read as a called omen (dragonLaw.js dragonCalledOf) that lands
// at the city's pixel at its `go`, past the Bay as on it; the screen's list of dragons holding it; and offline its fight
// run by the relay's own brain on this machine (systems/dragon/localDragonFights.js), its kill an unsigned receipt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Law from '../../src/net/dragon/dragonLaw.js';
import { toyboxStaffEvent } from '../../src/net/staffEvent/toyboxEvent.js';
import { validStaffEvent, TB_INVASION } from '../../src/net/staffEvent/staffEventLaw.js';
import { dragonSiteOf } from '../../src/systems/dragon/dragonSite.js';
import { createLocalDragonFights, LOCAL_DRAGON_ACCOUNT } from '../../src/systems/dragon/localDragonFights.js';
import { readDragonReceipt } from '../../src/net/dragon/dragonReceipt.js';
import { DRAGON_TICK_MS } from '../../src/net/dragon/dragonBrain.js';
import { skyDragonsAt } from '../../src/scenes/dragonHost.js';

const AT = 1_800_000_000_000;
const BAY = { rg: 17, loc: 0, px: 207, py: 213, nm: 'Daggerfall', ct: 1 };
const PAST = { rg: 64, loc: -1000123, px: 1450, py: -220, nm: 'Mournhold', ct: 1 };
const eventAt = (place, wait = 60_000) => validStaffEvent(toyboxStaffEvent({ kind: 'dragon', place, id: 'ab12cd34ef', at: AT, by: 'Dev', wait }).ev);

test('A CALLED DRAGON: a dragon attack\'s event is an omen landing at its `go` on its city\'s pixel, on the Bay and past it; an invasion is none (mutants: its landing rolled; its cell rolled; any pixel of its cell taken)', () => {
  for (const place of [BAY, PAST]) {
    const o = Law.dragonCalledOf(eventAt(place));
    assert.ok(o && Law.isDragonOmen(o), place.nm);
    assert.equal(Law.dragonTimes(o).landAt, AT + 60_000);
    assert.equal(Law.dragonTimes(o).leaveAt, AT + 60_000 + Law.DRAGON_STAY_MS);
    assert.deepEqual(Law.dragonCellOf(o), { cx: Math.floor(place.px / Law.DRAGON_CELL_PX), cy: Math.floor(place.py / Law.DRAGON_CELL_PX) });
    const c = Law.pixelCentreNative(place.px, place.py);
    assert.equal(Law.dragonSiteOk(o, c.sx, c.sz), true, 'its city');
    const n = Law.pixelCentreNative(place.px + 1, place.py);
    assert.equal(Law.dragonSiteOk(o, n.sx, n.sz), false, 'never its neighbour');
    const site = dragonSiteOf(o, { bayScan: () => null, theatres: () => null });
    assert.deepEqual([site.px, site.py, site.sx, site.sz, site.near], [place.px, place.py, c.sx, c.sz, place.nm]);
  }
  const inv = validStaffEvent(toyboxStaffEvent({ kind: 'invasion', family: 'orcs', place: BAY, id: 'ab12cd34ef', at: AT, by: '' }).ev);
  assert.equal(inv.tb, TB_INVASION);
  assert.equal(Law.dragonCalledOf(inv), null);
  assert.equal(Law.isDragonOmen({ ...Law.dragonCalledOf(eventAt(BAY)), la: AT + 99 * Law.DRAGON_WATCH_MS }), false, 'a landing outside its watch');
});

test('THE SKY: a called dragon is drawn from its landing until its remains are gone, beside the told omens', () => {
  const o = Law.dragonCalledOf(eventAt(BAY));
  const t = Law.dragonTimes(o);
  assert.equal(skyDragonsAt(t.landAt - 1, () => null, [o]).length, 0, 'not before it lands');
  assert.equal(skyDragonsAt(t.landAt, () => null, [o])[0].ev, o.ev);
  assert.equal(skyDragonsAt(t.leaveAt + Law.DRAGON_REMAINS_MS, () => null, [o]).length, 0);
});

test('OFFLINE: the fight is the relay\'s brain on this machine - joined at the city, beaten each tick, its fall said and its unsigned receipt handed to the hoard (mutants: a far join taken; no receipt; the event not told)', async () => {
  const o = Law.dragonCalledOf(eventAt(PAST));
  const c = Law.pixelCentreNative(PAST.px, PAST.py);
  let clock = Law.dragonTimes(o).landAt + 1000;
  let pose = { x: c.sx + 5000 * Law.DRAGON_NATIVE_PER_M, z: c.sz };
  const said = [], hoards = [], fell = [];
  const cell = createLocalDragonFights({ called: () => [o], pose: () => pose, deliver: (w) => said.push(w), hoard: (r) => hoards.push(r), fell: (ev) => fell.push(ev), now: () => clock, rand: () => 0.5, name: () => 'Dev' });
  const inWord = { k: 'in', w: o.w, bv: Law.DRAGON_BRAIN_V, lv: 30, sx: c.sx, sz: c.sz, ev: o.ev };
  cell.send(inWord);
  assert.deepEqual(said.map((w) => [w.k, w.m]), [['no', 'far']], 'from far, refused');
  pose = { x: c.sx, z: c.sz };
  cell.send({ ...inWord, ev: 'zz99zz99zz' });
  assert.equal(cell._fights().size, 0, 'an event it does not hold calls nothing');
  cell.send(inWord);
  const st = said.find((w) => w.k === 'st');
  assert.ok(st && st.w === o.w && st.sx === c.sx && st.m > 0, 'its whole state');
  clock += DRAGON_TICK_MS;
  cell.tick();
  const f = [...cell._fights().values()][0];
  f.hp = 1;
  f.players[LOCAL_DRAGON_ACCOUNT].dealt = 1e6;
  clock += 2000;
  cell.send({ k: 'hit', d: 50, r: 1 });
  await cell.settled();
  assert.ok(said.some((w) => w.k === 'fell'), 'its fall said');
  assert.deepEqual(fell, [o.ev], 'its event told');
  assert.equal(hoards.length, 1);
  const r = readDragonReceipt(hoards[0]);
  assert.deepEqual([r.q, r.p, r.x, r.s], [o.w, Law.dragonPlaceOf(c.sx, c.sz), 'dealt', LOCAL_DRAGON_ACCOUNT]);
});
