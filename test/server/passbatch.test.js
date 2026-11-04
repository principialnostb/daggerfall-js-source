// A pass find may carry several deeds (`sources`, battlePassLaw.js PASS_FIND_BATCH_MAX): counted exactly as the same
// finds asked one by one - the day's asks and Aurum, the ledger, each challenge's count and its one payment - and its ask
// spends the progression stream once a deed. Through the real Worker on node:sqlite (test/accountDb.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { standService } from '../accountDb.mjs';
import { progressSpentOf } from '../../server-account/src/progress.js';
import { passSeasonById, passFindSources, PASS_FIND_BATCH_MAX, PASS_DAY_AURUM } from '../../src/net/battlePassLaw.js';

const ON = { PASS_OPEN: 'on' };
const S1 = passSeasonById('s1');
const IN_TREMOR = S1.fromMs + 3 * 86_400_000 + 3_600_000;
const rid = (n) => n.toString(16).padStart(16, '0');

async function stand() {
  const s = await standService(ON);
  const raw = s.env.DB._raw;
  const kept = (who) => ({
    day: { ...raw.prepare('SELECT asks, aurum FROM pass_days WHERE account = ?').get(who.id) },
    found: raw.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM aurum_ledger WHERE account = ? AND kind = 'find'").get(who.id).n,
    challenges: raw.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM aurum_ledger WHERE account = ? AND kind = 'challenge'").get(who.id).n,
    counts: raw.prepare('SELECT challenge, n, paid > 0 AS paid FROM pass_counts WHERE account = ? ORDER BY challenge').all(who.id).map((r) => ({ ...r })),
    stream: raw.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM progress_hours WHERE player = ? AND stream = 'pass'").get(who.id).n,
  });
  return { ...s, kept };
}

const DEEDS = ['foe', 'tavern', 'construct', 'tavern', 'endgame', 'tavern', 'foe', 'endgame', 'endgame', 'endgame', 'endgame'];

test('one find carrying many deeds is counted as the same finds asked one by one, past the day\'s bound and a challenge paid', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: IN_TREMOR });
  const s = await stand();
  const one = await s.seated('Batcher'), each = await s.seated('Single');
  const r = await s.call('/v1/pass/find', { sources: DEEDS, rid: rid(1) }, one.secret);
  assert.equal(r.status, 200);
  let gained = 0;
  for (let i = 0; i < DEEDS.length; i++) gained += (await s.call('/v1/pass/find', { source: DEEDS[i], rid: rid(100 + i) }, each.secret)).body.gained;
  const a = s.kept(one), b = s.kept(each);
  assert.deepEqual({ ...a, stream: 0 }, { ...b, stream: 0 }, 'the same rows, whichever way they were asked');
  assert.equal(r.body.gained, gained, 'the same Aurum gained');
  assert.equal(a.day.aurum, PASS_DAY_AURUM, 'the day\'s bound clamps the sum');
  assert.ok(r.body.done.includes('tremor-tavern'), 'the challenge three taverns complete is paid by the find that carries them');
  assert.equal(r.body.finds, DEEDS.length);
  assert.equal(a.stream, DEEDS.length, 'the stream spent once a deed');
  assert.equal(b.stream, DEEDS.length);
  assert.deepEqual(progressSpentOf('/v1/pass/find', r.body), [['pass', DEEDS.length]]);
});

test('a find carrying many deeds asked again by its id is answered as it was, counted once', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: IN_TREMOR });
  const s = await stand();
  const me = await s.seated('Again');
  const first = await s.call('/v1/pass/find', { sources: ['foe', 'foe', 'construct'], rid: rid(7) }, me.secret);
  const again = await s.call('/v1/pass/find', { sources: ['foe', 'foe', 'construct'], rid: rid(7) }, me.secret);
  assert.deepEqual(again.body, { ...first.body, repeat: true });
  assert.deepEqual(s.kept(me).day, { asks: 3, aurum: 4 });
});

test('a find\'s deeds: one to PASS_FIND_BATCH_MAX, every one a source the law knows; one `source` as before', () => {
  assert.deepEqual(passFindSources({ source: 'foe' }), ['foe']);
  assert.deepEqual(passFindSources({ sources: ['foe', 'sea'] }), ['foe', 'sea']);
  assert.equal(passFindSources({ sources: [] }), null);
  assert.equal(passFindSources({ sources: Array(PASS_FIND_BATCH_MAX + 1).fill('foe') }), null);
  assert.equal(passFindSources({ sources: ['foe', 'nope'] }), null);
  assert.equal(passFindSources({ sources: 'foe' }), null);
  assert.equal(passFindSources({ source: 'nope' }), null);
});

test('a find carrying deeds the law refuses is refused whole, and the pass says how many one find may carry', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: IN_TREMOR });
  const s = await stand();
  const me = await s.seated('Refused');
  const r = await s.call('/v1/pass/find', { sources: ['foe', 'nope'], rid: rid(9) }, me.secret);
  assert.equal(r.body.error, 'source');
  assert.equal(s.kept(me).day.asks, undefined, 'nothing counted');
  const mine = await s.call('/v1/pass/mine', {}, me.secret);
  assert.equal(mine.body.batch, PASS_FIND_BATCH_MAX);
});

test('the day\'s asks bound a find by the deeds it carries', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: IN_TREMOR });
  const s = await stand();
  const me = await s.seated('Bounded');
  s.env.DB._raw.prepare('INSERT INTO pass_days (account, day, asks, aurum, last) VALUES (?, ?, ?, 0, 0)').run(me.id, Math.floor(IN_TREMOR / 86_400_000), 1999);
  assert.equal((await s.call('/v1/pass/find', { sources: ['foe', 'foe'], rid: rid(11) }, me.secret)).body.error, 'capped', 'two past the day\'s last one');
  assert.equal((await s.call('/v1/pass/find', { source: 'foe', rid: rid(12) }, me.secret)).status, 200, 'the last one still fits');
});
