// The finds queued while one is asked go as one ask (systems/pass/passClient.js), under one id, kept on the device as
// one - only when the service says it takes them (its pass's `batch`). A lone find is asked at once, as ever.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bindPass, askPassFind, _resetPassClientForTests, PASS_FINDS_STORE } from '../../../src/systems/pass/passClient.js';
import { passSeasonById, PASS_DAY_AURUM, PASS_FIND_BATCH_MAX } from '../../../src/net/battlePassLaw.js';

const S1 = passSeasonById('s1');
const IN = S1.fromMs + 2 * 86_400_000 + 43_200_000;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

/** A device store. */
function store() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), kept: () => JSON.parse(m.get(PASS_FINDS_STORE) ?? '{}') };
}

/** The service stood in: each find held until `release`, its asks kept as sent. `batch` the pass's word, or none. */
function service(batch) {
  const asked = [];
  let open = null;
  return {
    asked,
    release: () => { const o = open; open = null; o?.(); },
    api: {
      me: () => 'acct-1', guest: () => false,
      mine: async () => ({ ok: true, data: { season: 's1', open: true, stage: 0, tracks: { free: true, premium: false }, bought: [], today: 0, dayMax: PASS_DAY_AURUM, challenges: [], ...(batch ? { batch } : {}) } }),
      find: async (source, rid) => {
        asked.push([source, rid]);
        await new Promise((r) => { open = r; });
        return { ok: true, data: { gained: Array.isArray(source) ? source.length : 1, found: 1, today: 1, done: [], season: 's1' } };
      },
    },
  };
}

let n = 0;
async function bound(svc, storage) {
  _resetPassClientForTests();
  bindPass({ online: () => true, nowMs: () => IN, onEvent: () => {}, api: svc.api, storage, rid: () => (++n).toString(16).padStart(16, '0') });
  await settle();
}

test('the finds queued behind one in flight go as one ask, under the first one\'s id, kept on the device as one', async () => {
  const svc = service(PASS_FIND_BATCH_MAX), dev = store();
  await bound(svc, dev);
  const first = askPassFind('foe');
  await settle();
  assert.equal(svc.asked.length, 1, 'a lone find is asked at once');
  const rest = [askPassFind('foe'), askPassFind('construct'), askPassFind('loot')];
  await settle();
  svc.release();
  await settle();
  assert.equal(await first, 1);
  assert.equal(svc.asked.length, 2, 'the three behind it as one ask');
  const [sources, rid] = svc.asked[1];
  assert.deepEqual(sources, ['foe', 'construct', 'loot']);
  assert.deepEqual(dev.kept()['acct-1'].map((x) => [x.rid, x.sources]), [[rid, ['foe', 'construct', 'loot']]], 'kept as the ask was sent');
  svc.release();
  assert.deepEqual(await Promise.all(rest), [3, 0, 0], 'the ask that carried them tells the Aurum');
  assert.equal(dev.kept()['acct-1'], undefined, 'answered: let go');
  _resetPassClientForTests();
});

test('a service that does not say it takes many asks each find alone', async () => {
  const svc = service(null), dev = store();
  await bound(svc, dev);
  const all = [askPassFind('foe'), askPassFind('construct'), askPassFind('loot')];
  for (let i = 0; i < 3; i++) { await settle(); svc.release(); }
  await Promise.all(all);
  assert.deepEqual(svc.asked.map(([s]) => s), ['foe', 'construct', 'loot']);
  _resetPassClientForTests();
});

test('no more than the most one ask carries', async () => {
  const svc = service(3), dev = store();
  await bound(svc, dev);
  const all = [askPassFind('foe')];
  await settle();
  for (let i = 0; i < 5; i++) all.push(askPassFind('foe'));
  for (let i = 0; i < 4; i++) { await settle(); svc.release(); }
  await Promise.all(all);
  assert.deepEqual(svc.asked.map(([s]) => (Array.isArray(s) ? s.length : 1)), [1, 3, 2]);
  _resetPassClientForTests();
});

test('a merged ask kept on the device is asked again, as one, at the next bind', async () => {
  const dev = store();
  dev.setItem(PASS_FINDS_STORE, JSON.stringify({ 'acct-1': [{ rid: 'aaaaaaaaaaaaaaaa', sources: ['foe', 'loot'], at: IN - 1000 }] }));
  const svc = service(PASS_FIND_BATCH_MAX);
  await bound(svc, dev);
  await settle();
  svc.release();
  await settle();
  assert.deepEqual(svc.asked[0], [['foe', 'loot'], 'aaaaaaaaaaaaaaaa']);
  _resetPassClientForTests();
});
