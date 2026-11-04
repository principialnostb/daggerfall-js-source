// The realm waits through an overloaded service. The boot asks its join and save again, and the loading screen says the
// servers may be slow, once, when they refuse or are only slow. An act asks again for minutes before it ends the
// session. A read still gives up soon, and never ends it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService, sessionStorageOf } from '../accountDb.mjs';
import { SESSION_KEY } from '../../src/net/accountClient.js';
import { realmIo, openRealmBoot, realmBootBusyText, realmGoldAct, createRealmSession, REALM_BUSY_MAX_MS, REALM_BOOT_SLOW_MS, REALM_READ_TRIES } from '../../src/systems/realmSaves.js';
import { BUSY_MAX_MS } from '../../src/net/busyLaw.js';

const busy = () => new Response(JSON.stringify({ error: 'server' }), { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '5' } });

/** A seated realm character and an io whose first `n` asks of each path matching `hit` are answered busy. */
async function stand({ n = 0, hit = () => false } = {}) {
  const svc = await standService();
  const who = await svc.seated('Boltamist');
  const busyLeft = new Map();
  const asked = [];
  const fetch = async (u, i) => {
    const path = new URL(u).pathname;
    asked.push(path);
    if (hit(path)) {
      const left = busyLeft.has(path) ? busyLeft.get(path) : n;
      busyLeft.set(path, left - 1);
      if (left > 0) return busy();
    }
    return svc.fetch(u, i);
  };
  const storage = { ...sessionStorageOf(SESSION_KEY, who), setItem() {}, removeItem() {} };
  return { who, asked, io: realmIo({ fetch, storage }) };
}

/** A clock the waits move, so no test sleeps. */
function clock() {
  let t = 0;
  const waits = [];
  return { waits, now: () => t, wait: async (ms) => { waits.push(ms); t += ms; }, rand: () => 0.5 };
}

test('a busy join is asked again, the loading line said once, and the boot opens the world', async () => {
  const { who, asked, io } = await stand({ n: 3, hit: (p) => p === '/v1/realm/join' });
  const c = clock();
  let said = 0;
  const boot = await openRealmBoot({ io, id: who.character, onBusy: () => { said++; }, ...c });
  assert.equal(boot.ok, true, 'the world opens');
  assert.equal(boot.snap.name, 'Boltamist');
  assert.equal(asked.filter((p) => p === '/v1/realm/join').length, 4, 'three busy answers, then the join');
  assert.equal(said, 1, 'the line is set once');
  assert.ok(c.waits.every((ms, i) => i === 0 || ms >= c.waits[i - 1]), 'each wait at least the last');
});

test('a busy save read is asked again under the same join', async () => {
  const { who, asked, io } = await stand({ n: 2, hit: (p) => p.endsWith('/data') });
  const c = clock();
  const boot = await openRealmBoot({ io, id: who.character, ...c });
  assert.equal(boot.ok, true);
  assert.equal(asked.filter((p) => p === '/v1/realm/join').length, 1, 'one join');
  assert.equal(c.waits.length, 2);
});

test('a refusal that will not clear goes to the door at once, with no wait and no line', async () => {
  const { io } = await stand();
  const c = clock();
  let said = 0;
  const boot = await openRealmBoot({ io, id: 'r' + '0'.repeat(20), onBusy: () => { said++; }, ...c });
  assert.deepEqual(boot, { ok: false, error: 'no-realm-character' });
  assert.deepEqual([c.waits.length, said], [0, 0]);
});

test('a realm busy past the bound goes to the door with the busy word, never past the bound', async () => {
  const { who, io } = await stand({ n: Infinity, hit: (p) => p === '/v1/realm/join' });
  const c = clock();
  const boot = await openRealmBoot({ io, id: who.character, ...c });
  assert.equal(boot.ok, false);
  assert.equal(boot.error, 'server');
  assert.ok(c.now() <= REALM_BUSY_MAX_MS, 'the waits stay inside the bound');
  assert.ok(c.now() > REALM_BUSY_MAX_MS - BUSY_MAX_MS, 'and use most of it');
});

test('the loading screen the world hands in is told the busy line while the boot waits', async () => {
  const { who, io } = await stand({ n: 1, hit: (p) => p === '/v1/realm/join' });
  const lines = [];
  const { wait, now, rand } = clock();
  const boot = await openRealmBoot({ io, id: who.character, wait, now, rand }, { line: (text) => { lines.push(text); } });
  assert.equal(boot.ok, true);
  assert.deepEqual(lines, [realmBootBusyText()]);
});

test('the line is the plain words the owner asked for', () => {
  assert.equal(realmBootBusyText(), 'Servers may be slow due to traffic, please wait...');
});

/** A timer the test fires by hand: `fire()` runs what was set, `stopped` says it was cleared. */
function handTimer() {
  const t = { fn: null, ms: 0, stopped: false, fire: () => t.fn?.() };
  t.set = (fn, ms) => { t.fn = fn; t.ms = ms; return () => { t.stopped = true; }; };
  return t;
}

test('a boot the realm is only slow to answer says the busy line, once, and the timer stops when the world opens', async () => {
  const svc = await standService();
  const who = await svc.seated('Boltamist');
  let release;
  const held = new Promise((r) => { release = r; });
  let joins = 0;
  const fetch = async (u, i) => {
    if (new URL(u).pathname === '/v1/realm/join' && joins++ === 0) await held;   // slow, never refused
    return svc.fetch(u, i);
  };
  const io = realmIo({ fetch, storage: { ...sessionStorageOf(SESSION_KEY, who), setItem() {}, removeItem() {} } });
  const timer = handTimer();
  const lines = [];
  const booting = openRealmBoot({ io, id: who.character, slowTimer: timer.set, ...clock() }, { line: (text) => { lines.push(text); } });
  assert.equal(timer.ms, REALM_BOOT_SLOW_MS);
  timer.fire();
  timer.fire();
  release();
  const boot = await booting;
  assert.equal(boot.ok, true, 'the world opens');
  assert.deepEqual(lines, [realmBootBusyText()], 'said once');
  assert.equal(timer.stopped, true, 'the timer goes with the boot');
});

test('a boot both slow and refused busy says the line once', async () => {
  const { who, io } = await stand({ n: 2, hit: (p) => p === '/v1/realm/join' });
  const timer = handTimer();
  let said = 0;
  const c = clock();
  const wait = async (ms) => { timer.fire(); await c.wait(ms); };
  const boot = await openRealmBoot({ io, id: who.character, onBusy: () => { said++; }, slowTimer: timer.set, ...c, wait });
  assert.equal(boot.ok, true);
  assert.equal(said, 1);
});

/** A realm session over a record at seq 7, and what ended it. */
function session() {
  const lost = [];
  const s = createRealmSession({ io: { storage: null }, id: 'char-1', lease: 'L', seq: 7, onLost: (why) => lost.push(why), later: () => () => {}, hidden: () => false, watchHidden: () => () => {} });
  return { s, lost };
}

test('a vendor or vault act the realm refuses busy for a while is asked again until it lands, and the player stays in the world', async () => {
  const { s, lost } = session();
  const c = clock();
  let asked = 0;
  const call = async () => (++asked <= 6 ? { ok: false, error: 'server', status: 503 } : { ok: true, data: { realm: { seq: 8 } } });
  let applied = null;
  const r = await realmGoldAct({ session: s, checkpoint: () => {}, call, apply: (a) => { applied = a; }, wait: c.wait, rand: c.rand });
  assert.equal(r.ok, true);
  assert.equal(r.seq, 8);
  assert.ok(applied, 'the answer is applied');
  assert.equal(asked, 7);
  assert.deepEqual(lost, [], 'the session stands');
  assert.ok(c.now() > 60_000, 'a wait past what four quick tries gave');
  assert.ok(c.waits.every((ms, i) => i === 0 || ms >= c.waits[i - 1]), 'each wait at least the last');
});

test('an act whose answer was lost and then landed is known as landed after a busy wait', async () => {
  const { s, lost } = session();
  let asked = 0;
  const call = async () => (++asked < 4 ? { ok: false, error: 'server', status: 503 } : { ok: false, error: 'seq', seq: 8, status: 409 });
  const r = await realmGoldAct({ session: s, checkpoint: () => {}, call, ...clock() });
  assert.deepEqual([r.ok, r.landed, r.seq], [true, true, 8]);
  assert.deepEqual(lost, []);
});

test('an act the realm never answers ends the session only past the bound, with its waits inside it', async () => {
  const { s, lost } = session();
  const c = clock();
  const r = await realmGoldAct({ session: s, checkpoint: () => {}, call: async () => ({ ok: false, error: 'server', status: 503 }), wait: c.wait, rand: c.rand });
  assert.equal(r.unknown, true);
  assert.deepEqual(lost, ['unknown']);
  assert.ok(c.now() <= REALM_BUSY_MAX_MS, 'the waits stay inside the bound');
  assert.ok(c.now() > REALM_BUSY_MAX_MS - BUSY_MAX_MS, 'and use most of it');
});

test('a read still gives up after its few quick tries and never ends the session', async () => {
  const { s, lost } = session();
  let asked = 0;
  const r = await realmGoldAct({ session: s, checkpoint: () => {}, read: true, call: async () => { asked++; return { ok: false, error: 'server', status: 503 }; }, ...clock() });
  assert.deepEqual(r, { ok: false, error: 'offline', why: 'offline' });
  assert.equal(asked, REALM_READ_TRIES);
  assert.deepEqual(lost, []);
});
