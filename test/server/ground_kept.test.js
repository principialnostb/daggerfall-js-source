// GROUND-KEPT (2026-10-29, the account database overloaded through the night of 2026-10-28; bible/11-Multiplayer/
// Scale-Arc.md GROUND-KEPT). A writ board read scanned its region's witnessed ground - 123,000 rows in 409 ms - every
// time the day's writs had not posted, 684 times an hour on the primary. An isolate keeps a region's ground for
// REGION_GROUND_KEEP_MS now; ground of none is never kept. Each pin failed on the build before it.
// tools/mutants/ground_kept.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { standService, T0 } from '../accountDb.mjs';
import { REGION_GROUND_KEEP_MS } from '../../server-account/src/professions.js';
import { writsMinute as job, _resetCronForTests } from '../../server-account/src/cron.js';
import { CLIMATES } from '../../src/formats/mapsTables.js';
import { utcDay } from '../../src/net/marksLaw.js';

const NOON = utcDay(T0) * 86_400 + 12 * 3600;
const ANTICLERE = 21;

async function stand(t) {
  let clock = NOON * 1000;
  t.mock.method(Date, 'now', () => clock);
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on' });
  const raw = s.env.DB._raw;
  const scans = { n: 0 };
  const prepare = s.env.DB.prepare.bind(s.env.DB);
  s.env.DB.prepare = (sql) => { if (/kind = 'pixel' AND region = \?/.test(sql)) scans.n++; return prepare(sql); };
  const mac = await s.seated('Mac');
  const witness = (x, climate, region) => {
    for (let i = 0; i < 3; i++) {
      raw.prepare("INSERT OR IGNORE INTO players (id, guest_name, created_at, last_seen) VALUES (?, 'g', 1, 1)").run(`w${i}`);
      raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('pixel', ?, ?, ?, ?, ?)").run(`${x},200`, `w${i}`, `${climate},${region}`, region, NOON - 86_400);
    }
  };
  const board = async (region) => (await s.call('/v1/writs/list', { character: mac.character, region }, mac.secret)).body;
  return { s, scans, witness, board, at: (ms) => { clock = ms; } };
}

test('GROUND-KEPT: a region whose writs never post (open sea, no material in it) is scanned once a day: the isolate keeps it, then the row of the day does (mutants: the kept ground unread; the keep unbounded)', async (t) => {
  const { scans, witness, board, at } = await stand(t);
  witness(500, CLIMATES.Ocean, ANTICLERE);
  assert.deepEqual((await board(ANTICLERE)).writs, [], 'open sea posts nothing');
  assert.equal(scans.n, 1);
  assert.deepEqual((await board(ANTICLERE)).writs, []);
  assert.equal(scans.n, 1, 'the second read: the kept ground');
  at((NOON + 1) * 1000 + REGION_GROUND_KEEP_MS);
  await board(ANTICLERE);
  assert.equal(scans.n, 1, 'past the keep: the day\'s kept row, not a scan');
  at((NOON + 86_400) * 1000);
  await board(ANTICLERE);
  assert.equal(scans.n, 2, 'the next day: scanned again');
});

test('WRITS CLOCK: the clock posts today\'s writs for each region that posted yesterday, its ground scanned once for every isolate; a board read after it scans nothing (mutants: the clock posts nothing; the kept row unread)', async (t) => {
  const { s, scans, witness, board, at } = await stand(t);
  witness(520, CLIMATES.Woodlands, ANTICLERE);
  const yesterday = (await board(ANTICLERE)).writs;
  assert.ok(yesterday.length > 0);
  _resetCronForTests();
  const TOMORROW = NOON + 86_400 - 12 * 3600 + 60;
  at(TOMORROW * 1000);
  const ctx = { db: s.env.DB, nowS: TOMORROW, rand: Math.random, budget: () => true };
  const n = scans.n;
  assert.equal(await job(ctx, s.env), 1, 'the clock posts the region');
  assert.equal(scans.n, n + 1, 'one scan');
  assert.equal(await job(ctx, s.env), 0, 'posted: the isolate is done for the day');
  const today = (await board(ANTICLERE)).writs;
  assert.ok(today.length > 0, 'the board reads the posted writs');
  assert.equal(scans.n, n + 1, 'and scans nothing');
  assert.notDeepEqual(today.map((w) => w.id), yesterday.map((w) => w.id), 'today\'s own');
});

test('GROUND-KEPT: ground of none is never kept - a region posts the moment its ground is witnessed (mutant: an empty ground kept)', async (t) => {
  const { witness, board } = await stand(t);
  assert.deepEqual((await board(ANTICLERE)).writs, [], 'nothing witnessed: nothing posted');
  witness(520, CLIMATES.Woodlands, ANTICLERE);
  assert.ok((await board(ANTICLERE)).writs.length > 0, 'the next read posts');
});
