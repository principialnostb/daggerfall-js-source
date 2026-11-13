// Errands sent from the Discord PDA. The service's leaf (revenantRemoteLaw.js) restates the few numbers it needs, and is
// held here to the game's own errand law: the places, the ventures, the most abroad, the Renown gate, the odds, the road's
// length with and without stars, and the city drawn. Then the game's side (revenantRemote.js): a pending errand set out as
// the Companions page would set it, refused when the companion is not free, never set out twice, a recall taken up, each
// answered, and an errand the game sends told to the service.
import '../../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null), setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); }, clear: () => _store.clear(), key: (i) => [..._store.keys()][i] ?? null, get length() { return _store.size; },
};

const N = await import('../../../src/systems/revenant/revenant.js');
const E = await import('../../../src/systems/revenant/revenantErrands.js');
const RC = await import('../../../src/systems/revenant/revenantCompanions.js');
const ST = await import('../../../src/systems/revenant/revenantStars.js');
const L = await import('../../../src/systems/revenant/revenantRemoteLaw.js');
const R = await import('../../../src/systems/revenant/revenantRemote.js');
const S = await import('../../../src/systems/companionSlots.js');
const { setPref, _resetForTests } = await import('../../../src/systems/uiPrefs.js');
const WT = await import('../../../src/systems/worldTick.js');
const { MOBILE_TYPES: M } = await import('../../../src/characters/mobile/mobileTypes.js');
const { sharedClassicMinutes, wallMsForClassicMinutes } = await import('../../../src/net/wire.js');

const T0 = 1440 * 10;
const REALM = 'r0123456789abcdef0123';
let me;
beforeEach(() => {
  _resetForTests(); setPref('lootRarity', true); WT.setSharedClock(null);
  N._resetRevenantForTests(); RC._resetRetinueForTests(); S._resetCompanionSlotsForTests(); _store.clear(); R._resetRemoteErrands();
  S.registerCompanionCount('revenant', () => RC.revenantsWithYou().length);
  me = { isPlayer: true, name: 'Ayla Stormwind', characterId: REALM, level: 12, health: 100, maxHealth: 100, items: [], goldPieces: 0 };
  RC.setRetinuePlayer(me);
  WT.setWorldMinutes(T0);
});
function sworn({ rank = 1, state = 'away', loyalty = 60 } = {}) {
  const r = N.revenantDeed(me, { mobileType: M.Orc, level: 6, champion: 'mighty', unquiet: true, health: 5, maxHealth: 50, team: 'Monster' }, 'fled', { mobileType: M.Orc, rolls: () => 0 });
  r.rank = rank;
  const s = N.revenantSpared(me, { revenant: { id: r.id } }, { state });
  s.companion.loyalty = loyalty;
  return s;
}
const rec = (r) => N.revenantById(r.id);
const acts = () => ({ send: RC.sendOnErrand, recall: RC.recallFromErrand, record: (id) => N.revenantRecord(me, id) });

// ── the leaf, held to the game's law ─────────────────────────────────

test('REMOTE LAW: the places, ventures, the most abroad, the Renown gate and the odds are the game\'s own', () => {
  assert.deepEqual(L.REMOTE_PLACES.map((p) => [p.key, p.name, p.days, p.danger]), E.ERRAND_PLACES.map((p) => [p.key, p.name, p.days, p.danger]));
  assert.deepEqual(Object.keys(L.REMOTE_VENTURES), [...E.VENTURE_KEYS]);
  for (const k of E.VENTURE_KEYS) {
    assert.equal(L.REMOTE_VENTURES[k].label, E.VENTURES[k].label);
    assert.equal(L.REMOTE_VENTURES[k].blurb, E.VENTURES[k].blurb);
  }
  assert.equal(L.REMOTE_ERRANDS_MAX, E.ERRAND.MAX);
  assert.equal(L.REMOTE_MIN_RENOWN, N.REVENANT_MIN_RENOWN);
  assert.deepEqual({ ...L.REMOTE_ODDS }, { ...E.ERRAND.ODDS });
  assert.equal(L.worldMinuteAt(Date.UTC(2026, 10, 11)), Math.floor(sharedClassicMinutes(Date.UTC(2026, 10, 11))));
  assert.ok(Math.abs(L.wallSecondOf(600000) * 1000 - wallMsForClassicMinutes(600000)) < 1000);
});

test('REMOTE LAW: the road\'s length, the odds and the city are the game\'s for the same companion, with stars and without', () => {
  const plain = sworn({ rank: 1, loyalty: 40 });
  const devoted = sworn({ rank: 4, loyalty: 95 });
  const far = sworn({ rank: 2 });
  N.revenantCompanionUpdate(me, far.id, (c) => { c.xp = 244; });
  RC.setSwornStars(far.id, ['r_odd1', 'r_haul1', 'r_far']);
  const starred = rec(far);
  assert.ok(ST.rvnErrandSky(starred).road > 0, 'a star that shortens the road');
  for (const r of [rec(plain), rec(devoted), starred]) {
    for (const p of E.ERRAND_PLACES) {
      const e = E.newErrand(r, p.key, 'plunder', T0, 77, 500000);
      assert.equal(L.remoteRoadMinutes(r, p.key), e.due - 500000, `${p.key}: the road`);
      assert.equal(L.remoteErrandOdds(r, p.key), E.errandOdds(r, p), `${p.key}: the odds`);
      assert.equal(L.remoteErrandCity(r, p.key, 77), e.city, `${p.key}: the city`);
      assert.equal(L.remoteOddsWord(L.remoteErrandOdds(r, p.key)), E.oddsWord(E.errandOdds(r, p)));
    }
  }
});

test('REMOTE LAW: the sworn read from a save - the living sworn only, with where each stands', () => {
  const a = sworn({ state: 'with' });
  const b = sworn({ state: 'away' });
  RC.sendOnErrand(b.id, 'Skyrim', 'forage', { now: T0, seed: 5, world: 600000 });
  const list = L.swornInSave({ modData: { Revenant: { list: [rec(a), rec(b), { id: 'x', gone: true, rev: 2 }, { ...rec(a), id: 'y', sworn: false }] } } });
  assert.deepEqual(list.map((c) => [c.id, c.state]), [[a.id, 'with'], [b.id, 'errand']]);
  assert.equal(list[1].errand.seed, 5);
  assert.deepEqual(L.swornInSave(null), []);
});

test('REMOTE LAW: what the service sends is checked as it arrives', () => {
  assert.deepEqual(L.remoteErrandOf({ id: 'x0123456789abcdef0123', kind: 'send', companion: 'k', seed: 3, place: 'Skyrim', venture: 'forage', world: 9 }), { id: 'x0123456789abcdef0123', kind: 'send', companion: 'k', seed: 3, place: 'Skyrim', venture: 'forage', world: 9 });
  assert.deepEqual(L.remoteErrandOf({ id: 'x0123456789abcdef0123', kind: 'recall', companion: 'k', seed: 3 }), { id: 'x0123456789abcdef0123', kind: 'recall', companion: 'k', seed: 3 });
  for (const bad of [null, { id: 'nope', kind: 'send' }, { id: 'x0123456789abcdef0123', kind: 'send', companion: 'k', seed: 3, place: 'Atmora', venture: 'forage', world: 9 }, { id: 'x0123456789abcdef0123', kind: 'send', companion: 'k', seed: -1, place: 'Skyrim', venture: 'forage', world: 9 }, { id: 'x0123456789abcdef0123', kind: 'raid', companion: 'k', seed: 3 }])
    assert.equal(L.remoteErrandOf(bad), null);
});

// ── the game's side ──────────────────────────────────────────────────

test('REMOTE: a pending errand sets out exactly as the Companions page would set it, with the service\'s seed and world minute; its record\'s revision moves; it is answered taken with its due', () => {
  const a = sworn({ state: 'away' });
  const twin = { ...rec(a) };
  const before = rec(a).rev;
  const ack = R.takeUp({ id: 'x0000000000000000000a', kind: 'send', companion: a.id, seed: 4242, place: 'Morrowind', venture: 'contract', world: 600000 }, T0, acts());
  const e = rec(a).companion.errand;
  assert.equal(rec(a).companion.state, 'errand');
  assert.deepEqual(e, E.newErrand(twin, 'Morrowind', 'contract', T0, 4242, 600000), 'the same fields sendOnErrand writes');
  assert.ok(rec(a).rev > before, 'the revision moved, so the mirror keeps it');
  assert.deepEqual(ack, { id: 'x0000000000000000000a', taken: true, due: e.due });
  // asked again (an answer the service never heard): taken, never set out twice
  const rev = rec(a).rev;
  assert.deepEqual(R.takeUp({ id: 'x0000000000000000000a', kind: 'send', companion: a.id, seed: 4242, place: 'Morrowind', venture: 'contract', world: 600000 }, T0, acts()), { id: 'x0000000000000000000a', taken: true, due: e.due });
  assert.equal(rec(a).rev, rev);
});

test('REMOTE: an errand already home is never set out again - its seed is among the paid ones, so an answer the service never heard cannot pay its haul twice (mutant: the paid seeds unasked)', () => {
  const a = sworn({ state: 'away' });
  const ask = { id: 'x0000000000000000000f', kind: 'send', companion: a.id, seed: 7777, place: 'HighRock', venture: 'forage', world: 600000 };
  assert.equal(R.takeUp(ask, T0, acts()).taken, true);
  assert.ok(RC.returnFromErrand(a.id, T0 + 10_000), 'it comes home with its haul');
  assert.ok(rec(a).companion.paid.includes(7777));
  const state = rec(a).companion.state;
  const rev = rec(a).rev;
  assert.deepEqual(R.takeUp(ask, T0 + 10_001, acts()), { id: ask.id, taken: true }, 'answered taken, not sent');
  assert.equal(rec(a).companion.state, state);
  assert.equal(rec(a).rev, rev, 'nothing written');
});

test('REMOTE: the step reads nothing from the device while nothing waits and no ask is due - it runs every frame', () => {
  WT.setSharedClock(() => 600000);
  let reads = 0;
  const get = globalThis.localStorage.getItem;
  globalThis.localStorage.getItem = (k) => { reads++; return get(k); };
  try {
    let clock = 5_000_000;
    R.remoteErrandsStep(me, T0, acts(), { clock: () => clock, io: null });
    reads = 0;
    for (let i = 0; i < 100; i++) R.remoteErrandsStep(me, T0, acts(), { clock: () => clock });
    assert.equal(reads, 0, 'no session read on a quiet frame');
    clock += R.REMOTE_POLL_MS;
    R.remoteErrandsStep(me, T0, acts(), { clock: () => clock });
    assert.ok(reads > 0, 'read when an ask is due');
  } finally {
    globalThis.localStorage.getItem = get;
  }
});

test('REMOTE: a pending errand for one abroad, or past the most at once, is refused in the game\'s own words', () => {
  const a = sworn({ state: 'away' });
  const b = sworn({ state: 'away' });
  const c = sworn({ state: 'away' });
  RC.sendOnErrand(a.id, 'Skyrim', 'forage', { now: T0, seed: 1 });
  const again = R.takeUp({ id: 'x0000000000000000000b', kind: 'send', companion: a.id, seed: 2, place: 'HighRock', venture: 'forage', world: 600000 }, T0, acts());
  assert.equal(again.taken, false);
  assert.match(again.why, /already abroad/);
  RC.sendOnErrand(b.id, 'Skyrim', 'forage', { now: T0, seed: 3 });
  const most = R.takeUp({ id: 'x0000000000000000000c', kind: 'send', companion: c.id, seed: 4, place: 'HighRock', venture: 'forage', world: 600000 }, T0, acts());
  assert.equal(most.taken, false);
  assert.match(most.why, /most allowed/);
  assert.equal(rec(c).companion.state, 'away');
});

test('REMOTE: a recall is taken up for the errand it names, and only that one', () => {
  const a = sworn({ state: 'away' });
  RC.sendOnErrand(a.id, 'Skyrim', 'forage', { now: T0, seed: 9 });
  assert.deepEqual(R.takeUp({ id: 'x0000000000000000000d', kind: 'recall', companion: a.id, seed: 8 }, T0 + 5, acts()), { id: 'x0000000000000000000d', taken: false, why: 'not-abroad' });
  assert.equal(rec(a).companion.state, 'errand');
  assert.deepEqual(R.takeUp({ id: 'x0000000000000000000d', kind: 'recall', companion: a.id, seed: 9 }, T0 + 5, acts()), { id: 'x0000000000000000000d', taken: true });
  assert.equal(rec(a).companion.state, 'resting', 'it brings nothing back and must rest');
});

/** A service that answers pending with `list` and keeps every call. */
function fakeService(list) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });
    const json = String(url).includes('/v1/expeditions/pending') ? { errands: list } : { ok: true };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { io: { fetch, base: 'https://accounts.invalid', secret: 'secret' }, calls };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('REMOTE: the game\'s step - online only; asks the service, then sets each errand out on the next step and answers it; asks again only after its pause', async () => {
  const a = sworn({ state: 'away' });
  const svc = fakeService([{ id: 'x0000000000000000000e', kind: 'send', companion: a.id, seed: 31, place: 'HighRock', venture: 'plunder', world: 600000 }]);
  let clock = 1_000_000;
  const o = { io: svc.io, clock: () => clock };
  assert.equal(R.remoteErrandsStep(me, T0, acts(), o), 0);
  assert.equal(svc.calls.length, 0, 'offline: nothing asked');
  WT.setSharedClock(() => 600000);
  R.remoteErrandsStep(me, T0, acts(), o);
  await settle();
  assert.equal(svc.calls.length, 1);
  assert.match(svc.calls[0].url, /\/v1\/expeditions\/pending\?character=r0123456789abcdef0123$/);
  assert.equal(R.remoteErrandsStep(me, T0, acts(), o), 1, 'set out');
  await settle();
  assert.equal(rec(a).companion.state, 'errand');
  const ack = svc.calls.find((c) => c.url.endsWith('/v1/expeditions/ack'));
  assert.deepEqual(ack.body, { id: 'x0000000000000000000e', taken: true, due: rec(a).companion.errand.due });
  assert.ok(!svc.calls.some((c) => c.url.endsWith('/v1/expeditions/game')), 'an errand the PDA sent is not told back as the game\'s');
  const asked = svc.calls.filter((c) => c.url.includes('/pending')).length;
  R.remoteErrandsStep(me, T0, acts(), o);
  await settle();
  assert.equal(svc.calls.filter((c) => c.url.includes('/pending')).length, asked, 'not again before its pause');
  clock += R.REMOTE_POLL_MS;
  R.remoteErrandsStep(me, T0, acts(), o);
  await settle();
  assert.equal(svc.calls.filter((c) => c.url.includes('/pending')).length, asked + 1);
  // a character that is not an online one asks nothing
  R._resetRemoteErrands();
  const offlineMe = { ...me, characterId: 'char-offline' };
  assert.equal(R.remoteErrandsStep(offlineMe, T0, acts(), o), 0);
});

test('REMOTE: an errand sent or recalled from the Companions page is told to the service, online', async () => {
  const sent = [];
  globalThis.fetch = async (url, init = {}) => {
    sent.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  localStorage.setItem('dagger.account.session', JSON.stringify({ secret: 'secret', id: 'acct' }));
  const a = sworn({ state: 'away' });
  RC.sendOnErrand(a.id, 'Skyrim', 'forage', { now: T0, seed: 12, world: 600000 });
  await settle();
  assert.equal(sent.length, 0, 'offline: nothing told');
  RC.recallFromErrand(a.id, T0 + 1);
  WT.setSharedClock(() => 600000);
  const b = sworn({ state: 'away' });
  RC.sendOnErrand(b.id, 'Valenwood', 'plunder', { now: T0, seed: 13, world: 600000 });
  await settle();
  const told = sent.find((c) => c.url.endsWith('/v1/expeditions/game'));
  assert.ok(told, 'told');
  const e = rec(b).companion.errand;
  assert.deepEqual(told.body, { character: REALM, kind: 'send', companion: b.id, name: rec(b).name, rank: rec(b).rank, place: 'Valenwood', venture: 'plunder', seed: 13, due: e.due, world: e.due - L.remoteRoadMinutes(rec(b), 'Valenwood') });
  RC.recallFromErrand(b.id, T0 + 2);
  await settle();
  const recall = sent.filter((c) => c.url.endsWith('/v1/expeditions/game')).at(-1);
  assert.deepEqual(recall.body, { character: REALM, kind: 'recall', companion: b.id, seed: 13 });
  delete globalThis.fetch;
});
