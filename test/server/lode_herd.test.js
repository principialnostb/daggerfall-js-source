// LODE-HERD and HUNT-LEAN: only the clock picks the day's Motherlodes, a try every LODE_CLOCK_EVERY_MIN minutes while
// the day is unkept, and a read before it answers none. The hunt's read writes nothing and a replica serves it.
// tools/mutants/lode_herd.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { d1, standService, T0 } from '../accountDb.mjs';
import { motherlodesOf } from '../../server-account/src/motherlodes.js';
import { MINUTE_JOBS, LODE_CLOCK_EVERY_MIN, _resetCronForTests } from '../../server-account/src/cron.js';
import { REPLICA_ROUTES } from '../../server-account/src/service.js';
import { busyRead } from '../../src/net/busyLaw.js';
import { D1_BOOKMARK_READS } from '../../src/net/accountClient.js';
import { HUNT_STATE_MS } from '../../src/net/huntBook.js';
import { MOTHERLODE_CLIMATES } from '../../src/net/motherlodeLaw.js';
import { utcDay } from '../../src/net/marksLaw.js';

/** A database with one pixel confirmed long before day `D`, and a count of the pick's scans run on it. */
function ground() {
  const P = d1();
  const raw = P._raw;
  for (let i = 1; i <= 3; i++) raw.prepare("INSERT INTO players (id, guest_name, created_at, last_seen) VALUES (?, 'g', 1, 1)").run(`a${i}`);
  for (const a of ['a1', 'a2', 'a3']) raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('pixel', '10,10', ?, ?, 5, 1)").run(a, `${MOTHERLODE_CLIMATES[0]},5`);
  const scans = { n: 0 };
  const prepare = P.prepare.bind(P);
  P.prepare = (sql) => { if (/FROM world_witness/.test(sql)) scans.n++; return prepare(sql); };
  const kept = (day) => raw.prepare('SELECT COUNT(*) AS n FROM motherlode_days WHERE day = ?').get(day).n;
  return { P, raw, scans, kept };
}

test('LODE-HERD: a read never picks the day - before the clock keeps it, every read answers none and scans nothing; once kept, every read answers it (mutant: a read picks)', async () => {
  const { P, scans, kept } = ground();
  const D = utcDay(T0) + 1;
  const ctx = { db: P, nowS: D * 86400 + 1, rand: Math.random };
  const answers = await Promise.all(Array.from({ length: 6 }, () => motherlodesOf(ctx, D)));
  assert.deepEqual(answers.map((a) => a.length), [0, 0, 0, 0, 0, 0], 'none before the clock');
  assert.equal(scans.n, 0, 'and no scan');
  assert.equal(kept(D), 0);
  assert.equal((await motherlodesOf(ctx, D, { clock: true })).length, 1, 'the clock picks');
  assert.equal(scans.n, 1);
  assert.equal((await motherlodesOf(ctx, D)).length, 1, 'once kept, every read answers it');
  assert.equal(scans.n, 1, 'and scans nothing');
});

test('LODE-HERD: the minute\'s job tries an unkept day only every LODE_CLOCK_EVERY_MIN minutes, reading the marks between; a kept day costs the isolate nothing more (mutants: the spacing dropped; the job asks as a read)', async () => {
  const { P, scans, kept } = ground();
  const job = MINUTE_JOBS.find(([name]) => name === 'motherlodes')[1];
  const ENV = { PROFESSIONS_OPEN: 'on' };
  const D = utcDay(T0) + 3;
  _resetCronForTests();
  for (let m = 1; m < LODE_CLOCK_EVERY_MIN; m++) {
    assert.equal(await job({ db: P, nowS: D * 86400 + m * 60, rand: Math.random }, ENV), 0, `minute ${m}: not a try`);
  }
  assert.equal(scans.n, 0, 'no scan between tries');
  assert.equal(kept(D), 0);
  assert.equal(await job({ db: P, nowS: D * 86400 + LODE_CLOCK_EVERY_MIN * 60, rand: Math.random }, ENV), 1, 'the try picks');
  assert.equal(kept(D), 1);
  const n = scans.n;
  assert.equal(await job({ db: P, nowS: D * 86400 + LODE_CLOCK_EVERY_MIN * 60 + 61, rand: Math.random }, ENV), 0, 'picked: the isolate is done');
  assert.equal(scans.n, n);
  const E = D + 1;
  _resetCronForTests();
  assert.equal(await job({ db: P, nowS: E * 86400 + 5, rand: Math.random }, ENV), 1, 'the day\'s first minute is a try');
  assert.equal(kept(E), 1);
});

test('HUNT-LEAN: the hunt\'s read writes nothing - no rate window - and runs on a D1 session, a replica\'s read the client bookmarks and holds back in an overload; the book asks it every ten minutes (mutants: the rate window back; the route off the replica; the busy read dropped; the two minutes back)', async (t) => {
  const NOON = utcDay(T0) * 86_400 + 12 * 3600;
  t.mock.method(Date, 'now', () => NOON * 1000);
  const s = await standService({ SEATS_OPEN: 'on' });
  const mac = await s.seated('Mac');
  const raw = s.env.DB._raw;
  const before = s.env.DB._sessions.length;
  const r = await s.call('/v1/hunt/state', { character: mac.character }, mac.secret);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key LIKE 'hunt:%'").get().n, 0, 'no rate window written');
  const sessions = s.env.DB._sessions.slice(before);
  assert.ok(sessions.some((x) => x.statements.some((q) => /FROM hunt_clears/.test(q))), 'its reads on a session');
  assert.equal(REPLICA_ROUTES.get('/v1/hunt/state'), 'POST');
  assert.equal(D1_BOOKMARK_READS.get('/v1/hunt/state'), 'POST');
  assert.equal(busyRead('/v1/hunt/state', 'POST'), true);
  assert.equal(HUNT_STATE_MS, 600_000);
});
