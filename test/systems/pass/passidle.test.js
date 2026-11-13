// A find that would change nothing the service keeps is never asked (systems/pass/passClient.js passFindIdle): the day's
// Aurum found and every challenge its source counts this stage paid. Anything the page cannot be sure of is asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bindPass, askPassFind, passFindIdle, _resetPassClientForTests, PASS_EDGE_MS } from '../../../src/systems/pass/passClient.js';
import { passSeasonById, passStageAt, PASS_CHALLENGES, PASS_DAY_AURUM } from '../../../src/net/battlePassLaw.js';

const S1 = passSeasonById('s1');
const DAY = 86_400_000;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

/** A time inside stage 0, at noon UTC, away from every edge. */
function noonInStage(stage) {
  for (let t = Math.ceil(S1.fromMs / DAY) * DAY + DAY / 2; t < S1.toMs; t += DAY) if (passStageAt(S1, t) === stage) return t;
  throw new Error(`no noon in stage ${stage}`);
}

/** The service stood in: `today` found already, the challenges `paid` paid; a find counts and answers as the service does. */
function service({ today, paid = [], done = () => [] }) {
  const asked = [];
  return {
    asked,
    api: {
      me: () => 'acct-1', guest: () => false,
      mine: async () => ({ ok: true, data: {
        season: 's1', open: true, stage: 0, tracks: { free: true, premium: false }, bought: [], today, dayMax: PASS_DAY_AURUM,
        challenges: PASS_CHALLENGES.map((c) => ({ key: c.key, n: paid.includes(c.key) ? c.n : 0, paid: paid.includes(c.key) })),
      } }),
      find: async (source) => { asked.push(source); return { ok: true, data: { gained: 0, found: 0, today, done: done(source), season: 's1' } }; },
    },
  };
}

async function bound(svc, nowMs) {
  _resetPassClientForTests();
  bindPass({ online: () => true, nowMs: () => nowMs, onEvent: () => {}, api: svc.api, storage: null });
  await settle();
}

const stage0For = (source) => PASS_CHALLENGES.filter((c) => c.stage === 0 && c.sources.includes(source)).map((c) => c.key);

test('capped, and every challenge the source counts this stage paid: the find is not asked', async () => {
  const at = noonInStage(0);
  const svc = service({ today: PASS_DAY_AURUM, paid: stage0For('foe') });
  await bound(svc, at);
  assert.equal(passFindIdle('foe'), true);
  assert.equal(await askPassFind('foe'), 0);
  assert.deepEqual(svc.asked, []);
  _resetPassClientForTests();
});

test('a source with no challenge this stage, capped: not asked', async () => {
  const at = noonInStage(0);
  assert.deepEqual(stage0For('sea'), [], 'stage 0 counts no sea deed');
  const svc = service({ today: PASS_DAY_AURUM });
  await bound(svc, at);
  await askPassFind('sea');
  assert.deepEqual(svc.asked, []);
  _resetPassClientForTests();
});

test('under the day\'s bound, or with a challenge still counting, the find is asked', async () => {
  const at = noonInStage(0);
  const under = service({ today: PASS_DAY_AURUM - 1, paid: stage0For('foe') });
  await bound(under, at);
  await askPassFind('foe');
  assert.deepEqual(under.asked, ['foe'], 'Aurum still to find');
  const counting = service({ today: PASS_DAY_AURUM, paid: stage0For('foe').slice(1) });
  await bound(counting, at);
  await askPassFind('foe');
  assert.deepEqual(counting.asked, ['foe'], 'a challenge still counts it');
  _resetPassClientForTests();
});

test('a challenge a find pays is kept paid: the next find of that source is not asked', async () => {
  const at = noonInStage(0);
  const svc = service({ today: PASS_DAY_AURUM, done: (s) => (s === 'tavern' ? ['tremor-tavern'] : []) });
  await bound(svc, at);
  assert.deepEqual(stage0For('tavern'), ['tremor-tavern']);
  await askPassFind('tavern');
  await askPassFind('tavern');
  assert.deepEqual(svc.asked, ['tavern'], 'the second asks nothing');
  _resetPassClientForTests();
});

test('near a UTC day\'s edge, or a day the card does not count, the find is asked', async () => {
  const at = noonInStage(0);
  const midnight = Math.floor(at / DAY) * DAY + DAY;
  const svc = service({ today: PASS_DAY_AURUM, paid: stage0For('foe') });
  let now = at;
  _resetPassClientForTests();
  bindPass({ online: () => true, nowMs: () => now, onEvent: () => {}, api: svc.api, storage: null });
  await settle();
  assert.equal(passFindIdle('foe'), true);
  now = midnight - PASS_EDGE_MS / 2;
  assert.equal(passFindIdle('foe'), false, 'the service\'s clock may be past midnight already');
  now = midnight + 2 * PASS_EDGE_MS;
  assert.equal(passFindIdle('foe'), false, 'a new day: the card\'s today was yesterday\'s');
  _resetPassClientForTests();
});

test('near a stage\'s edge the find is asked', async () => {
  const at = noonInStage(0);
  let edge = at;
  while (passStageAt(S1, edge) === 0) edge += 60_000;
  const svc = service({ today: PASS_DAY_AURUM, paid: stage0For('construct') });
  let now = at;
  _resetPassClientForTests();
  bindPass({ online: () => true, nowMs: () => now, onEvent: () => {}, api: svc.api, storage: null });
  await settle();
  assert.equal(passFindIdle('construct'), true);
  now = edge - PASS_EDGE_MS / 2;
  assert.equal(passFindIdle('construct'), false, 'the service may already run the next stage');
  _resetPassClientForTests();
});

test('unheard, the find is asked', async () => {
  _resetPassClientForTests();
  assert.equal(passFindIdle('foe'), false);
});
