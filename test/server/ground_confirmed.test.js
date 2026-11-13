// The confirmed ground kept as it is confirmed (migration 0212, server-account/src/groundConfirmed.js).
// A pixel report's insert keeps its pixel's confirmation; the reports filed before the table are read in a page a
// minute; the day's Motherlodes pick reads the kept rows, and answers what a scan of every report answered.
// tools/mutants/ground_confirmed.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { d1, T0 } from '../accountDb.mjs';
import {
  confirmationOf,
  confirmedGroundBefore,
  fillGroundStep,
  groundFilled,
} from '../../server-account/src/groundConfirmed.js';
import { MINUTE_JOBS, LODE_CLOCK_EVERY_MIN, _resetCronForTests } from '../../server-account/src/cron.js';
import { witnessedFact, factConfirmed } from '../../src/net/nodeLaw.js';
import { DB_ROOT } from '../../server-account/src/service.js';
import { MOTHERLODE_CLIMATES } from '../../src/net/motherlodeLaw.js';
import { utcDay } from '../../src/net/marksLaw.js';

const M = MOTHERLODE_CLIMATES[0];

/** A seeded stream of numbers in [0, 1), so a failure is the same failure on every run. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A database, `n` accounts, and a way to file a pixel report as the harvest does. */
function world(n = 12) {
  const P = d1();
  const raw = P._raw;
  for (let i = 0; i < n; i++) raw.prepare("INSERT INTO players (id, guest_name, created_at, last_seen) VALUES (?, 'g', 1, 1)").run(`a${i}`);
  const put = raw.prepare("INSERT OR IGNORE INTO world_witness (kind, key, account, report, region, at) VALUES ('pixel', ?, ?, ?, ?, ?)");
  const say = (key, account, climate, region, at) => put.run(key, account, `${climate},${region}`, region, at);
  const kept = () => new Map(raw.prepare('SELECT key, report, at FROM ground_confirmed').all().map((r) => [r.key, { report: r.report, at: Number(r.at) }]));
  const reportsOf = () => {
    const by = new Map();
    for (const r of raw.prepare("SELECT key, account, report, at FROM world_witness WHERE kind = 'pixel'").all()) {
      if (!by.has(r.key)) by.set(r.key, []);
      by.get(r.key).push({ account: r.account, report: r.report, at: Number(r.at) });
    }
    return by;
  };
  return { P, raw, say, kept, reportsOf };
}

/** Random reports in time order, as the harvest files them: a few pixels, a few answers each, one report an account. */
function scatter({ say }, rand, { keys = 40, reports = 400, t0 = T0 } = {}) {
  let at = t0;
  for (let i = 0; i < reports; i++) {
    const key = `${100 + Math.floor(rand() * keys)},80`;
    const climate = [M, M, M, 231][Math.floor(rand() * 4)];
    const region = [21, 21, 22][Math.floor(rand() * 3)];
    at += 1 + Math.floor(rand() * 600);
    say(key, `a${Math.floor(rand() * 12)}`, climate, region, at);
  }
  return at;
}

test('GROUND-CONFIRMED: a fresh database has its fill done; a report\'s insert keeps a pixel at its third agreeing account\'s second, and the first answer confirmed stands (mutants: the trigger dropped; the third\'s second unread; a later answer replaces)', () => {
  const w = world();
  assert.deepEqual({ ...w.raw.prepare('SELECT after, done FROM ground_confirmed_fill').get() }, { after: '', done: 1 }, 'no pixel report: nothing to fill');
  w.say('10,10', 'a0', M, 21, 100);
  w.say('10,10', 'a1', M, 21, 200);
  assert.equal(w.kept().size, 0, 'two confirm nothing');
  w.say('10,10', 'a2', M, 21, 300);
  assert.deepEqual(w.kept().get('10,10'), { report: `${M},21`, at: 300 }, 'the third confirms, at its second');
  // filed with a plain INSERT: an outer OR IGNORE would set the trigger's own conflict rule aside
  const plain = w.raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('pixel', '10,10', ?, '231,22', 22, ?)");
  for (const [a, at] of [['a3', 400], ['a4', 500], ['a5', 600]]) plain.run(a, at);
  assert.deepEqual(w.kept().get('10,10'), { report: `${M},21`, at: 300 }, 'three later for another answer: the first stands');
  w.say('10,10', 'a6', M, 21, 700);
  assert.deepEqual(w.kept().get('10,10'), { report: `${M},21`, at: 300 }, 'a fourth agreeing changes nothing');
  w.raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('dungeon', 'd1', 'a0', ?, 21, 1)").run(`${M},21`);
  w.raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('dungeon', 'd1', 'a1', ?, 21, 2)").run(`${M},21`);
  w.raw.prepare("INSERT INTO world_witness (kind, key, account, report, region, at) VALUES ('dungeon', 'd1', 'a2', ?, 21, 3)").run(`${M},21`);
  assert.equal(w.kept().has('d1'), false, 'a dungeon\'s ground is not the map\'s');
});

test('GROUND-CONFIRMED: on random reports filed in time order, the kept rows are every pixel nodeLaw witnessedFact confirms - its answer, at confirmationOf\'s second - and no other (mutants: the order unread; the third\'s second unread)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = world();
    scatter(w, seeded(seed));
    const kept = w.kept();
    for (const [key, rows] of w.reportsOf()) {
      const fact = witnessedFact(rows);
      const c = confirmationOf(rows);
      assert.equal(factConfirmed(fact), !!c, `seed ${seed} ${key}: confirmed by both or neither`);
      if (!c) {
        assert.equal(kept.has(key), false, `seed ${seed} ${key}: unconfirmed, unkept`);
        continue;
      }
      const said = c.report.split(',').map(Number);
      assert.deepEqual([fact.climate, fact.region], said, `seed ${seed} ${key}: the same answer`);
      assert.deepEqual(kept.get(key), c, `seed ${seed} ${key}: kept at its second`);
    }
  }
});

test('GROUND-CONFIRMED: the fill reads the reports filed before the table a page at a time - a key the page cut read whole by the next - replaces a row kept wrongly before it, ends done, and then reads nothing (mutants: a cut key kept from half its rows; the cursor unmoved; the row not replaced; never done)', async () => {
  const w = world();
  scatter(w, seeded(7), { keys: 30, reports: 300 });
  const want = new Map();
  for (const [key, rows] of w.reportsOf()) {
    const c = confirmationOf(rows);
    if (c) want.set(key, c);
  }
  assert.ok(want.size >= 10, 'enough ground to fill');
  // the table before the fill: empty but for one pixel kept wrongly by a report filed while the fill ran
  w.raw.exec("DELETE FROM ground_confirmed; UPDATE ground_confirmed_fill SET after = '', done = 0");
  const [key0] = want.keys();
  w.raw.prepare("INSERT INTO ground_confirmed (key, report, at) VALUES (?, '231,22', 1)").run(key0);
  assert.equal(await groundFilled(w.P), false);
  let steps = 0;
  while (!(await groundFilled(w.P))) {
    await fillGroundStep(w.P, 7);
    steps++;
    assert.ok(steps < 200, 'the fill ends');
  }
  assert.ok(steps > 10, 'many pages');
  assert.deepEqual(w.kept(), want, 'every confirmed pixel, exactly as the law reads it');
  const before = w.raw.prepare('SELECT total_changes() AS c').get().c;
  const asked = [];
  const db = { ...w.P, [DB_ROOT]: w.P, prepare: (sql) => { asked.push(sql); return w.P.prepare(sql); } };   // a request's wrapper, as countedDb makes one
  assert.equal(await fillGroundStep(db, 7), 0);
  assert.deepEqual(asked, [], 'done: the isolate asks nothing more');
  assert.equal(w.raw.prepare('SELECT total_changes() AS c').get().c, before);
});

test('GROUND-CONFIRMED: the ground confirmed before a day is the kept rows with a second before it - what a scan of every report before the day said, a disputed pixel among them (mutants: the day\'s second unread; a disputed pixel dropped)', async () => {
  const w = world();
  const end = scatter(w, seeded(11), { keys: 40, reports: 500 });
  // a disputed pixel: three agree, then two others say another answer
  for (const [a, at] of [['a0', T0 + 1], ['a1', T0 + 2], ['a2', T0 + 3], ['a3', T0 + 4], ['a4', T0 + 5]]) w.say('99,99', a, at < T0 + 4 ? M : 231, 21, at);
  for (const day of [utcDay(T0) + 1, utcDay(end - 86_400) + 1, utcDay(end) + 1]) {
    const before = day * 86_400;
    const by = new Map();
    for (const r of w.raw.prepare("SELECT key, account, report, at FROM world_witness WHERE kind = 'pixel' AND at < ?").all(before)) {
      if (!by.has(r.key)) by.set(r.key, []);
      by.get(r.key).push({ account: r.account, report: r.report, at: Number(r.at) });
    }
    const scan = [];
    for (const [key, rows] of by) {
      const f = witnessedFact(rows);
      if (!factConfirmed(f)) continue;
      const [x, y] = key.split(',').map(Number);
      scan.push({ x, y, climate: f.climate, region: f.region });
    }
    const order = (l) => [...l].sort((a, b) => a.y - b.y || a.x - b.x);
    assert.deepEqual(order(await confirmedGroundBefore(w.P, day)), order(scan), `day ${day}: the kept ground is the scan's`);
  }
  assert.ok((await confirmedGroundBefore(w.P, utcDay(T0) + 1)).some((c) => c.x === 99 && c.climate === M), 'the disputed pixel, its first answer');
});

test('GROUND-CONFIRMED: while the fill is unfinished the minute\'s Motherlodes job reads a page of it and picks nothing; the next try picks from the whole ground (mutants: the fill unwired; a fill minute picking)', async () => {
  const w = world();
  for (const [a, at] of [['a0', 1], ['a1', 2], ['a2', 3]]) w.say('10,10', a, M, 5, at);
  w.raw.exec("DELETE FROM ground_confirmed; UPDATE ground_confirmed_fill SET after = '', done = 0");
  const lodes = MINUTE_JOBS.find(([n]) => n === 'motherlodes')[1];
  const D = utcDay(T0) + 1;
  const at = D * 86_400 + LODE_CLOCK_EVERY_MIN * 60;
  const ENV = { PROFESSIONS_OPEN: 'on' };
  const picked = () => w.raw.prepare('SELECT COUNT(*) AS n FROM motherlode_days WHERE day = ?').get(D).n;
  _resetCronForTests();
  await lodes({ db: w.P, nowS: at, rand: Math.random }, ENV);
  assert.equal(picked(), 0, 'a minute of the fill: no pick');
  assert.equal(await groundFilled(w.P), true, 'its page the last');
  assert.equal(w.kept().has('10,10'), true, 'the ground read in');
  assert.equal(await lodes({ db: w.P, nowS: at + LODE_CLOCK_EVERY_MIN * 60, rand: Math.random }, ENV), 1, 'the next try picks');
  assert.equal(picked(), 1);
});
