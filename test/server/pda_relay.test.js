// The Discord PDA's doors on the relay: the live world events' public facts, and one account's friends through a signed
// ask - read, and acted on by the hub's own social acts, with a forged, stale or replayed ask refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../server/src/index.js';
import { fakeRooms } from '../fakeRoom.mjs';
import { SOCIAL_ROOM, SD_KEY, SD_LANE_SPAN } from '../../src/net/wire.js';
import { _b64url } from '../../src/net/identityToken.js';
import { signAsk, openAsk, askClaimsOk, PDA_ASK_TTL_S, PDA_FRIENDS_PATH, PDA_LIVE_PATH } from '../../server/src/pdaRelayLaw.js';
import { _resetPdaRelayForTests } from '../../server/src/pdaRelay.js';
import { gateAt } from '../../src/net/gate/gateLaw.js';
import { gateLaneKey } from '../../src/net/wire.js';

const { subtle } = globalThis.crypto;
const quiet = async (fn) => {
  const info = console.info, warn = console.warn;
  console.info = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.info = info;
    console.warn = warn;
  }
};

/** A relay with its hub, the service's key pair, and a clock the pins drive. */
async function standRelay() {
  _resetPdaRelayForTests();
  let clock = 1_800_000_000_000;
  const realNow = Date.now;
  Date.now = () => clock;
  const world = fakeRooms({ now: () => clock });
  const hubRoom = world.room(SOCIAL_ROOM);
  // the Abyss director's record, far off, so the hub's alarms are the sweep's alone
  hubRoom.store.set(SD_KEY, { s: 0, ph: 'gone', r: -1, at: clock, until: clock, next: clock + 10 * 365 * 86_400_000 });
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const env = { ROOMS: world.ROOMS, IDENTITY_PUBLIC_KEY: _b64url.encode(new Uint8Array(await subtle.exportKey('raw', kp.publicKey))) };
  const tick = (ms = 700) => {
    clock += ms;
  };
  const join = async (n) => {
    const ws = hubRoom.connect();
    await hubRoom.hello(ws, `peer-${n}`, null, { name: n, acct: `acct-${n}`, asecret: `secret-of-acct-${n}` });
    tick(10);
    return ws;
  };
  const act = (ws, o) => hubRoom.raw(ws, JSON.stringify({ t: 'social', ...o }));
  let n = 0;
  const nonce = () => (++n).toString(16).padStart(16, '0');
  const ask = async (claims, key = kp.privateKey) => {
    const a = await signAsk({ c: nonce(), ...claims }, key, { subtle, nowS: Math.floor(clock / 1000) });
    return worker.fetch(new Request(`https://relay.test${PDA_FRIENDS_PATH}`, { method: 'POST', body: JSON.stringify({ ask: a }) }), env);
  };
  const live = () => worker.fetch(new Request(`https://relay.test${PDA_LIVE_PATH}`), env);
  const done = () => {
    Date.now = realNow;
  };
  return { env, hubRoom, join, act, tick, ask, live, kp, done, now: () => clock };
}

test('PDA relay law: an ask opens only under the service\'s key, while it lives, with its claims well made', async () => {
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const other = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const nowS = 1_800_000_000;
  const a = await signAsk({ s: 'acct-a', a: 'read', c: '00000000000000aa' }, kp.privateKey, { subtle, nowS });
  assert.equal((await openAsk(a, kp.publicKey, { subtle, nowS })).s, 'acct-a');
  assert.equal(await openAsk(a, other.publicKey, { subtle, nowS }), null, 'another key');
  assert.equal(await openAsk(a, kp.publicKey, { subtle, nowS: nowS + PDA_ASK_TTL_S }), null, 'lapsed');
  assert.equal(await openAsk(`${a}x`, kp.publicKey, { subtle, nowS }), null, 'tampered');
  assert.equal(askClaimsOk({ k: 'friends', s: 'acct-a', a: 'remove', c: '00000000000000aa', i: nowS, e: nowS + 60 }, nowS), false, 'an act names its target');
  assert.equal(askClaimsOk({ k: 'friends', s: 'acct-a', a: 'remove', t: 'acct-a', c: '00000000000000aa', i: nowS, e: nowS + 60 }, nowS), false, 'never oneself');
  await assert.rejects(() => signAsk({ s: 'acct-a', a: 'party', c: '00000000000000aa' }, kp.privateKey, { subtle, nowS }));
});

test('PDA relay friends: read shows friends online with their last seen and requests by name alone; Discord accepts, declines, removes through the hub\'s own acts; a stranger by account is told to meet them first', async () => {
  const r = await standRelay();
  try {
    await quiet(async () => {
      const a = await r.join('a');
      const b = await r.join('b');
      const c = await r.join('c');
      await r.join('d');
      await r.act(a, { k: 'friend.request', peer: 'peer-b' });
      r.tick();
      await r.act(b, { k: 'friend.accept', acct: 'acct-a' });
      r.tick();
      await r.act(c, { k: 'friend.request', peer: 'peer-a' });
      r.tick();
      const read = await (await r.ask({ s: 'acct-a', a: 'read' })).json();
      assert.equal(read.known, true);
      assert.deepEqual(read.friends.map((f) => [f.acct, f.name, f.online]), [['acct-b', 'b', true]]);
      assert.deepEqual(read.in.map((f) => [f.acct, f.name, f.online, f.seen]), [['acct-c', 'c', false, null]], 'a request carries a name and nothing else');
      assert.ok(!('peers' in read.friends[0]), 'no live peer ids leave the hub');
      // accepted from Discord: c's own game hears the state at once
      const heard = c.sent.length;
      const acc = await (await r.ask({ s: 'acct-a', a: 'accept', t: 'acct-c' })).json();
      assert.equal(acc.said, null);
      assert.deepEqual(acc.friends.map((f) => f.acct).sort(), ['acct-b', 'acct-c']);
      assert.ok(c.sent.slice(heard).some((m) => m.t === 'social' && m.k === 'state'), 'the friend\'s game is told');
      // a stranger by account: the hub's law
      const ask = await (await r.ask({ s: 'acct-a', a: 'request', t: 'acct-d' })).json();
      assert.equal(ask.said, 'meet them first');
      const rm = await (await r.ask({ s: 'acct-a', a: 'remove', t: 'acct-b' })).json();
      assert.deepEqual(rm.friends.map((f) => f.acct), ['acct-c']);
      // b goes offline: still a friend of c, seen when it left
      await r.act(c, { k: 'friend.request', peer: 'peer-b' });
      r.tick();
      await r.act(b, { k: 'friend.accept', acct: 'acct-c' });
      r.tick();
      await r.hubRoom.drop(b);
      r.tick(60_000);
      const cr = await (await r.ask({ s: 'acct-c', a: 'read' })).json();
      const rowB = cr.friends.find((f) => f.acct === 'acct-b');
      assert.equal(rowB.online, false);
      assert.ok(rowB.seen > 0 && rowB.seen <= r.now());
      // an account the hub never met
      assert.deepEqual(await (await r.ask({ s: 'acct-nobody', a: 'read' })).json(), { known: false, friends: [], in: [], out: [], said: null });
    });
  } finally {
    r.done();
  }
});

test('PDA relay friends: a forged ask is refused before the hub is woken, and an act asked twice is taken once', async () => {
  const r = await standRelay();
  try {
    await quiet(async () => {
      await r.join('a');
      const forged = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
      assert.equal((await r.ask({ s: 'acct-a', a: 'read' }, forged.privateKey)).status, 403);
      const a = await signAsk({ s: 'acct-a', a: 'remove', t: 'acct-b', c: '00000000000000ff' }, r.kp.privateKey, { subtle, nowS: Math.floor(r.now() / 1000) });
      const send = () => worker.fetch(new Request(`https://relay.test${PDA_FRIENDS_PATH}`, { method: 'POST', body: JSON.stringify({ ask: a }) }), r.env);
      assert.equal((await send()).status, 200);
      assert.equal((await send()).status, 409, 'a replay wakes nothing');
      const big = await worker.fetch(new Request(`https://relay.test${PDA_FRIENDS_PATH}`, { method: 'POST', body: 'x'.repeat(5000) }), r.env);
      assert.equal(big.status, 413);
      assert.equal((await worker.fetch(new Request(`https://relay.test${PDA_FRIENDS_PATH}`), r.env)).status, 405);
    });
  } finally {
    r.done();
  }
});

test('PDA relay live: every open lane\'s gate with its place once agreed, the serpent\'s agreed place, and a Hollow\'s region only once it is found', async () => {
  const r = await standRelay();
  try {
    await quiet(async () => {
      const now = r.now();
      const bay = gateAt(now, 0).day;
      const sky = gateAt(now, 3).day;
      // two accounts agree on the Bay's gate, and on Skyrim's - past the Bay
      r.hubRoom.store.set(gateLaneKey('gatesite', 0), { d: bay, c: [[310, 120, 'Ilessan Hills', ['x', 'y']]] });
      r.hubRoom.store.set(gateLaneKey('gatesite', 3), { d: sky, c: [[1700, -600, 'Whiterun', ['x', 'y']]] });
      // a Hollow risen in Skyrim's lane, and one found on the Bay
      r.hubRoom.store.set(`${SD_KEY}:3`, { s: 3 * SD_LANE_SPAN + 4, ph: 'risen', r: 64, at: now - 1000, until: now + 3_600_000, next: now + 7_200_000 });
      r.hubRoom.store.set(SD_KEY, { s: 9, ph: 'found', r: 17, at: now - 5000, until: now + 3_600_000, next: now + 9_000_000, foundAt: now - 1000, fb: 'Finder' });
      r.hubRoom.wake();
      const res = await r.live();
      assert.equal(res.status, 200);
      const body = await res.json();
      const g0 = body.gates.find((g) => g.lane === 0);
      assert.deepEqual([g0.n, g0.px, g0.py, g0.pl], [bay, 310, 120, 'Ilessan Hills']);
      const g3 = body.gates.find((g) => g.lane === 3);
      assert.deepEqual([g3.px, g3.py, g3.pl], [1700, -600, 'Whiterun'], 'a lane past the Bay keeps its own pixel');
      assert.ok(body.gates.every((g) => g.lane === 0 || g.lane === 3 || g.px === undefined), 'no place before one is agreed');
      const sky3 = body.abyss.find((h) => h.lane === 3);
      assert.equal(sky3.ph, 'risen');
      assert.ok(!('r' in sky3), 'a risen Hollow names no region');
      const found = body.abyss.find((h) => h.lane === 0);
      assert.equal(found.r, 17);
      assert.ok(!('fb' in found), 'nobody\'s name rides the live facts');
      // kept: a second ask in the window does not wake the hub
      r.hubRoom.store.set(gateLaneKey('gatesite', 0), null);
      assert.equal((await (await r.live()).json()).gates.find((g) => g.lane === 0).pl, 'Ilessan Hills');
      assert.equal((await worker.fetch(new Request(`https://relay.test${PDA_LIVE_PATH}`, { method: 'POST' }), r.env)).status, 405);
    });
  } finally {
    r.done();
  }
});
