// A game older than the toybox reads a toybox event as a plain staff event and stands its monsters the moment it is
// staged - the Dwarven Dragons that stood through a Dragon Attack's wait. So the hub tells a toybox event only to a
// socket whose hello said its game reads one (`tb`, 1 or nothing, the `w2` law), on the hub link alone; a plain staff
// event is everyone's still. Mutants: tools/mutants/toyboxold.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../chargenDom.mjs';
import { SOCIAL_ROOM, parseClient } from '../../src/net/wire.js';
import { OnlineSession } from '../../src/net/online.js';
import * as H from '../../src/net/hubShards.js';
import { toyboxStaffEvent } from '../../src/net/staffEvent/toyboxEvent.js';
import { takeStaffEventOrder, bookFor } from '../../server/src/staffEvents.js';
import { fakeRooms } from '../fakeRoom.mjs';

const BAY = { rg: 17, loc: 0, px: 207, py: 213, nm: 'Daggerfall', ct: 1 };
const PLAIN = { id: 'ab12cd34ef', rg: 3, loc: 7, px: 200, py: 100, nm: 'Gothway Garden', ct: 1, mt: [7, 12], n: 6, m: 3, b: 24, bs: 250, bh: 20, at: 1_700_000_000_000, ue: 0, eb: 1, fb: 0, by: 'SirMcMobdon' };
const books = (ws) => ws.sent.filter((m) => m.t === 'sev' && m.k === 'ev').map((m) => m.l.map((e) => e.id));

test('TOYBOX-OLD THE HELLO: `tb` is 1 or nothing, and the session says it on a hub link alone', () => {
  const base = { t: 'hello', id: 'peer-0001', secret: 'secret-of-peer-0001', name: 'Mac', look: { f: 0, r: 0, g: 0, h: 0, s: 0 } };
  const said = (m) => parseClient(JSON.stringify(m), false);
  assert.equal(said({ ...base, tb: 1 }).tb, 1);
  assert.equal('tb' in said({ ...base, tb: 2 }), false, 'any other value is no offer');
  assert.equal('tb' in said(base), false);
  const s = new OnlineSession({ url: 'wss://relay.test/', name: 'Mac', id: 'mac-0001', secret: 'shh-shh-shh-0001', WebSocketImpl: class {}, now: () => 0 });
  s.room = SOCIAL_ROOM;
  assert.equal(s._helloFrame(null).tb, 1, 'the hub link');
  assert.equal(s._helloFrame(null, H.hubOfSubject('acct-x')).tb, 1, 'a hub shard');
  assert.equal('tb' in s._helloFrame(null, 'world:9,9'), false, 'a cell room hears no such word');
});

test('TOYBOX-OLD THE BOOK: a toybox event is told only to a game whose hello said `tb`, when staged and to a joiner after; a plain staff event to every game', async () => {
  const AT = Date.now();
  const { ev } = /** @type {any} */ (toyboxStaffEvent({ kind: 'dragon', place: BAY, id: 'dc12cd34ef', at: AT, by: 'Dev' }));
  const world = fakeRooms();
  const hub = world.room(SOCIAL_ROOM);
  const fresh = hub.connect();
  await hub.hello(fresh, 'new-0001', null, { tb: 1 });
  const older = hub.connect();
  await hub.hello(older, 'old-0002');
  assert.equal((await takeStaffEventOrder(hub.room, { o: 'sevent', s: 'acct', op: 'start', ev: PLAIN }, AT)).ok, true);
  assert.equal((await takeStaffEventOrder(hub.room, { o: 'sevent', s: 'acct', op: 'start', ev }, AT)).ok, true);
  assert.deepEqual(books(fresh).at(-1), [PLAIN.id, ev.id], 'this build hears both');
  assert.deepEqual(books(older).at(-1), [PLAIN.id], 'an older game hears the plain event alone');
  const late = hub.connect();
  await hub.hello(late, 'old-0003');
  assert.deepEqual(books(late).at(-1), [PLAIN.id], 'a joiner from an older game: the plain event alone');
  const lateNew = hub.connect();
  await hub.hello(lateNew, 'new-0004', null, { tb: 1 });
  assert.deepEqual(books(lateNew).at(-1), [PLAIN.id, ev.id], 'a joiner of this build: both');
  assert.deepEqual(bookFor({ tb: 1 }, [PLAIN, ev]), [PLAIN, ev]);
  assert.deepEqual(bookFor({}, [PLAIN, ev]), [PLAIN]);
});
