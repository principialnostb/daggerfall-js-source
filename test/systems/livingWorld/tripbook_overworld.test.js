// The living world's books under a clock that outruns its ways (the Overworld over a city): a town's roads' word that
// waits on a way is not planned again each tick but kept until the trips it waited on have answered; the waiting trips
// are asked again a few a frame, so their ways are asked and land; and a turn of fate renews only what it can change.
// Every answer - each trip, visitor, away window, holder, news and place - is the one a reader with every way known gives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { synthMap } from '../../lwRoads.mjs';
import { TripBook, createLivingBooks, PENDING_PER_FRAME, PLACE_TURNS, TROUBLE_TURNS } from '../../../src/scenes/livingWorld/livingBooks.js';
import { createRelations, TURNS_RECENT } from '../../../src/systems/livingWorld/relations.js';
import { townTrips, visitorsOf, innGuestsOf, setsOut, awayOf, placeCycle, paceScale, patrolCover, newsOf, placeName, handsOn, memoTrip, cycleOf, wayBetween, CALENDAR_MPM, INN_TYPE, NEWS_DAYS, TRIP_REACH_PX } from '../../../src/systems/livingWorld/trips.js';
import { troubleOf, troubledTrip } from '../../../src/systems/livingWorld/trouble.js';
import { troubleFoesOf } from '../../../src/scenes/livingWorld/troubleFoes.js';
import { enemyLevelOf } from '../../../src/characters/enemy/enemyBasics.js';
import { placeAt, turnKey } from '../../../src/systems/livingWorld/lives.js';
import { DAY_MIN } from '../../../src/systems/livingWorld/dayPlan.js';

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const WORLD = rd('src/scenes/world.js').replace(/\r\n/g, '\n');   // a checkout's own line endings are not the host's shape
/** A host closure lifted whole from world.js: from `const <name> = (` to the `};` that closes it. */
const lift = (name) => {
  const a = WORLD.indexOf(`  const ${name} = (`);
  const b = WORLD.indexOf('\n  };\n', a);
  assert.ok(a > 0 && b > a, `${name} found in the host`);
  return WORLD.slice(a, b + 5);
};
const DEPS = 'livingMemoFresh, livingTurnsFresh, livingWordFresh, livingBooks, PERSON_MOVE_SPEED, livingBaseRate, _livingTripMemo, townTrips, livingTripWorld, tripVisitorsOf, INN_TYPE, innGuestsOf, livingPlaceOf, placeCycle, paceScale, setsOut, tripAwayOf, placeName, NEWS_DAYS, newsOf, livingRelations, livingFoeWord, _livingToldKept';
/** The host's roads' word for a town and a day (world.js livingTripsOf, its news livingRoadNewsAt), run over `deps`. */
const makeTripsOf = (deps) => new Function('deps', `const { ${DEPS} } = deps;\n${lift('livingRoadNewsAt')}\n${lift('livingTripsOf')}\nreturn livingTripsOf;`)(deps);

const INN = 7000;
/**
 * The host's living world on the synthetic map (`n` towns a side), composed as world.js composes it, with a way book
 * that lands `perFrame` pairs a frame and answers undefined past them (as the planner's budget does) - every pair known
 * from the start when `perFrame` is Infinity - and the character's `turns` made on its record.
 */
function host({ perFrame = Infinity, turns = [], n = 9 } = {}) {
  const m = synthMap({ dives: true, n });
  m.towns.push({ mapId: INN, px: 102, py: 100, blocks: 1, region: 17, people: 3, type: INN_TYPE, name: 'Wayside', port: false });
  const byId = new Map(m.towns.map((t) => [t.mapId, t]));
  const known = new Set();
  const counts = { routeAsks: 0, rosterAsks: 0 };
  let budget = perFrame;
  const base = m.world;
  const world = {
    ...base,
    routeOf: (a, b) => {
      counts.routeAsks++;
      const key = `${a.mapId}>${b.mapId}`;
      if (!known.has(key)) {
        if (budget <= 0) return undefined;
        budget--;
        known.add(key);
      }
      return base.routeOf(a, b);
    },
    rosterOf: (t) => { counts.rosterAsks++; return base.rosterOf(t); },
  };
  const R = { rel: createRelations() };
  for (const [kind, key, at] of turns) assert.ok(R.rel.turn(kind, key, at), `the turn ${kind} ${key} made`);
  const book = new TripBook();
  const books = createLivingBooks({ book, world, townOfId: (id) => byId.get(id) ?? null, relations: () => R.rel, mpm: () => CALENDAR_MPM, fresh: () => {} });
  world.holderOf = (res, k) => books.placeOf(res, k).holder;
  world.fated = (res, k) => books.placeOf(res, k).diced;
  const o = () => ({ mpm: CALENDAR_MPM, memo: book });
  const placeOfRes = (res) => { const town = byId.get(res.town); const roster = town ? base.rosterOf(town) : []; return [roster.find((r) => r.slot === res.slot) ?? res, roster]; };
  const tripPlace = (res, trip) => { const [place, roster] = placeOfRes(res); return books.placeOf(place, placeCycle(place, roster, Math.floor(trip.outT0 / DAY_MIN), 1)); };
  const cycleOfRes = (res, day) => { const [place, roster] = placeOfRes(res); return res.roll !== 't' ? cycleOf(res, day, 1).k : placeCycle(place, roster, day, 1); };
  let coverPending = false;
  const tw = {
    climateAt: () => 230, foesOf: troubleFoesOf({ faunaAt: () => null }), foeLevel: enemyLevelOf,
    dies: (res, trip) => { const pl = tripPlace(res, trip); return pl.dies && pl.hand == null; },
    diced: (res, trip) => tripPlace(res, trip).diced,
    turnOf: (id) => { const t = R.rel.turns(); return t.won.has(id) ? 'won' : t.lost.has(id) ? 'lost' : null; },
    covered: (trip) => { const c = patrolCover(trip, world, o()); if (c === undefined) coverPending = true; return !!c; },
  };
  world.fate = (trip) => {
    const key = `${trip.id}|${trip.party.map((p) => p.id).join(',')}`;
    let f = books.fates.get(key);
    if (!f) {
      const was = coverPending;
      coverPending = false;
      const enc = troubleOf(trip, tw);
      const waits = coverPending;
      coverPending = was;
      if (waits) return undefined;
      f = handsOn(troubledTrip(trip, enc), (mem) => books.placeOf(mem, cycleOfRes(mem, Math.floor((trip.outT0 - 240) / 1440))).hand);
      books.fates.set(key, f);
    }
    return f;
  };
  const _livingToldKept = new Map();
  let wordV = -1;
  const livingWordFresh = () => { if (wordV !== R.rel.turnsVersion()) { wordV = R.rel.turnsVersion(); _livingToldKept.clear(); } };
  const tripsOf = makeTripsOf({
    livingMemoFresh: () => {}, livingTurnsFresh: books.turnsFresh, livingWordFresh, livingBooks: books, PERSON_MOVE_SPEED: CALENDAR_MPM, livingBaseRate: () => 1,
    _livingTripMemo: book, townTrips, livingTripWorld: world, tripVisitorsOf: visitorsOf, INN_TYPE, innGuestsOf, livingPlaceOf: books.placeOf, placeCycle, paceScale, setsOut,
    tripAwayOf: awayOf, placeName, NEWS_DAYS, newsOf, livingRelations: { turns: () => R.rel.turns() }, livingFoeWord: (f, n) => `foe${f}x${n}`, _livingToldKept,
  });
  books.turnsFresh();   // the boot's first read of the record, before anything is planned (as the host's frame does)
  /** A frame as the host runs it: the waiting trips asked again on the budget left, then the asking renewed. */
  const frame = () => { books.step(); budget = perFrame; };
  return { m, world, R, book, books, tripsOf, frame, byId, counts, known, o };
}

/** A trip as the pins compare it: everything a reader can see of it. */
const tripView = (tr) => ({
  id: tr.id, kind: tr.kind, from: tr.from?.mapId ?? null, to: tr.to?.mapId ?? null, party: tr.party.map((p) => p.id),
  outT0: tr.outT0, outT1: tr.outT1, backT0: tr.backT0, backT1: tr.backT1, trim0: tr.trim0, trim1: tr.trim1, len: tr.way?.len ?? null,
  inns: tr.way?.inns?.map((i) => i.town.mapId) ?? null, enc: tr.enc ? { id: tr.enc.id, kind: tr.enc.kind, t0: tr.enc.t0, t1: tr.enc.t1, dead: tr.enc.dead } : null,
  halt: tr.halt ?? null, fallen: tr.fallen?.map((f) => [f.res.id, f.t, f.s]) ?? null, turned: !!tr.turned, dive: tr.dive ?? null, market: !!tr.market,
  company: tr.company?.key ?? null, hiredBy: tr.hiredBy ?? null,
});
/** The roads' word as the pins compare it. */
const wordView = (w) => ({
  away: [...w.away].map(([id, ws]) => [id, ws]), visitors: w.visitors.map((v) => ({ res: v.res.id, trip: v.trip?.id ?? null, inT: v.inT, outT: v.outT, yaw: v.yaw, dock: v.dock })),
  holders: [...w.holders].map(([id, h]) => [id, h?.id ?? null]), news: w.news, places: w.places,
});
/** Every party of the town and of every town within its reach on `day`, by town. */
const partiesView = (h, town, day) => {
  const noon = day * DAY_MIN + 240 + 720;
  return h.world.townsNear(town.px, town.py, TRIP_REACH_PX).map((t) => [t.mapId, townTrips(t, noon, h.world, h.o())?.map(tripView) ?? 'waits']);
};

test('the trips\' book knows what waits: a trip that answers undefined is pending and watched while a word is asked; one answered leaves the pending; cleared, the book forgets its pending, its watch and the words that wait (mutants: pending kept past a clear; an answer left pending; the watch blind)', () => {
  const book = new TripBook();
  const res = { id: 'L5.t1' }, town = { mapId: 5 };
  book.waits('L5.t1:9', res, town, 9);
  book.waits('L5.t1:9', { id: 'other' }, town, 9);
  assert.deepEqual([...book.pending], [['L5.t1:9', { res, town, k: 9 }]], 'remembered once, the first asking\'s');
  assert.equal(book.watch, null, 'no word asked: nothing watched');
  book.watch = new Set();
  book.waits('L5.t2:9', res, town, 9);
  assert.deepEqual([...book.watch], ['L5.t2:9'], 'the word asked watches what waited');
  book.set('L5.t1:9', null);
  assert.deepEqual([...book.pending.keys()], ['L5.t2:9'], 'answered (no trip): pending no more');
  book.misses.set('5:400', ['L5.t2:9']);
  book.clear();
  assert.deepEqual([book.size, book.pending.size, book.misses.size, book.watch], [0, 0, 0, null]);
  assert.match(rd('src/scenes/livingWorld/livingTrips.js'), /const memo = new TripBook\(\);/, 'the host\'s memo is the book');
  assert.match(rd('src/systems/livingWorld/trips.js'), /else \/\*\* @type \{any\} \*\/ \(o\.memo\)\?\.waits\?\.\(key, res, town, k\);/, 'memoTrip tells the book what waits');
});

test('the record names the turns made since a version, oldest first; none when caught up; null once more were made than it keeps (mutants: the ring unbounded; a turn missed; the first kept read as missing)', () => {
  const rel = createRelations();
  assert.deepEqual(rel.turnsSince(0), [], 'nothing made');
  rel.turn('spared', 'L1.t2@40');
  rel.turn('won', 'L1.t2:40:e');
  rel.turn('spared', 'L1.t2@40');
  assert.deepEqual(rel.turnsSince(0), [{ v: 1, kind: 'spared', key: 'L1.t2@40' }, { v: 2, kind: 'won', key: 'L1.t2:40:e' }], 'a turn made once is named once');
  assert.deepEqual(rel.turnsSince(1), [{ v: 2, kind: 'won', key: 'L1.t2:40:e' }]);
  assert.deepEqual(rel.turnsSince(2), []);
  for (let i = 0; i < TURNS_RECENT; i++) rel.turn('won', `e${i}`);
  assert.equal(rel.turnsSince(2)?.length, TURNS_RECENT, 'as many made as kept: every one named');
  assert.equal(rel.turnsSince(1), null, 'one more than kept: the reader starts over');
  rel.turn('won', 'one more');
  assert.equal(rel.turnsSince(2), null, 'the oldest gone: the reader starts over');
  assert.equal(rel.turnsSince(3)?.length, TURNS_RECENT, 'the kept ones from the oldest kept');
  assert.deepEqual([[...PLACE_TURNS], [...TROUBLE_TURNS]], [['spared', 'fallen', 'slain', 'died', 'killed'], ['won', 'lost', 'routed']]);
});

test('ROADS KEPT WAITING: with the ways landing a dozen a frame, a town\'s word that waited is asked again only when every trip it waited on has answered - a tick meanwhile plans nothing (no roster read, no way asked) - the waiting trips are asked again a few a frame till every one is known, and every word given is the one a reader with every way known gives (mutants: the miss forgotten each tick; the pending never asked; a resolved key read as waiting; the way book keyed without the pair\'s direction)', () => {
  const slow = host({ perFrame: 12, n: 5 });
  const all = host({ n: 5 });
  const towns = [slow.m.towns[12], slow.m.towns[13], slow.byId.get(INN)];
  const day0 = 400, DAYS = 5;
  const asked = new Set(), answered = new Set(), waitedCheap = [], waitedDear = [];
  /** A tick: each living town's word for `day` asked; a word kept waiting must plan nothing; a word given must be a fresh reader's. */
  const tick = (day) => {
    for (const town of towns) {
      const key = `${town.mapId >>> 0}:${day}`;
      asked.add(key);
      const miss = slow.book.misses.get(key);
      const stillWaits = !!miss && !miss.every((k) => slow.book.has(k));
      const before = { ...slow.counts };
      const w = slow.tripsOf(town, day);
      const spent = slow.counts.routeAsks - before.routeAsks + slow.counts.rosterAsks - before.rosterAsks;
      if (stillWaits) {
        assert.equal(w, undefined, `${key}: a word kept waiting answers undefined`);
        (spent === 0 ? waitedCheap : waitedDear).push(key);
        continue;
      }
      if (w === undefined || answered.has(key)) continue;
      answered.add(key);
      assert.deepEqual(wordView(w), wordView(all.tripsOf(town, day)), `${town.name} day ${day}: the word a reader with every way known gives`);
      assert.deepEqual(partiesView(slow, town, day), partiesView(all, town, day), `${town.name} day ${day}: every party about it`);
    }
  };
  // the clock running: a new day every hundred frames, a tick every third frame
  for (let f = 0; f < DAYS * 100; f++) {
    slow.frame();
    if (f % 3 === 0) tick(day0 + Math.floor(f / 100));
  }
  // the clock held: every word asked is answered in the end
  for (let f = 0; f < 4000 && answered.size < asked.size; f++) {
    slow.frame();
    if (f % 3 === 0) for (let d = day0; d < day0 + DAYS; d++) tick(d);
  }
  assert.equal(answered.size, asked.size, `every word answered in the end (${answered.size} of ${asked.size})`);
  assert.ok(waitedCheap.length > 20, `words kept waiting across ticks: ${waitedCheap.length}`);
  assert.deepEqual(waitedDear, [], 'a tick on a word kept waiting plans nothing');
  for (let f = 0; f < 2000 && slow.book.pending.size; f++) slow.frame();
  assert.equal(slow.book.pending.size, 0, 'every waiting trip asked again till it is known');
  // the way book: one walk a pair and a direction, shared by the pair's trips
  const a = slow.m.towns[0], b = slow.m.towns[1];
  const ab = wayBetween(a, b, slow.world, slow.book, true), ba = wayBetween(b, a, slow.world, slow.book, true);
  assert.ok(ab && ba && ab !== ba && ab.pts[0][0] === ba.pts.at(-1)[0], 'each direction its own walk');
  assert.equal(wayBetween(a, b, slow.world, slow.book, true), ab, 'kept');
  assert.notEqual(wayBetween(a, b, slow.world, slow.book, false), ab, 'a dive\'s line is not the inns\' way');
});

test('a frame asks the waiting trips again PENDING_PER_FRAME at most, each still waiting moved behind the rest, so every one gets its turn (mutants: the cap gone; the order never turned)', () => {
  const h = host({ perFrame: 0 });   // no way ever lands
  const town = h.m.towns[40], roster = h.world.rosterOf(town);
  const keys = [];
  for (let k = 50; keys.length < PENDING_PER_FRAME + 10; k++) for (const res of roster) { if (keys.length >= PENDING_PER_FRAME + 10) break; if (memoTrip(res, town, k, h.world, h.o()) === undefined) keys.push(`${res.id}:${k}`); }
  assert.deepEqual([...h.book.pending.keys()], keys, 'pending in the order asked');
  const asked = [];
  const waits = h.book.waits.bind(h.book);
  h.book.waits = (key, ...rest) => { asked.push(key); waits(key, ...rest); };
  h.frame();
  assert.deepEqual([...new Set(asked)], keys.slice(0, PENDING_PER_FRAME), 'the first PENDING_PER_FRAME asked, once each');
  assert.deepEqual([...h.book.pending.keys()], [...keys.slice(PENDING_PER_FRAME), ...keys.slice(0, PENDING_PER_FRAME)], 'the asked moved behind the rest');
});

test('A TURN RENEWS ONLY WHAT IT REACHES: a place\'s turn drops the places\' entries of that place and its town\'s trips (the other towns\' stand, their ways walked); a fight\'s end drops the troubles and every kept town\'s parties, no trip; a tale drops nothing; another character\'s record, or more turns than the record keeps, drops everything - and after each the words equal a reader\'s with the same turns and every way known (mutants: the town prefix wrong; the troubles kept; the other towns dropped; the tale clearing)', () => {
  const h = host();
  const A = h.m.towns[40], B = h.m.towns[31], C = h.m.towns[22], inn = h.byId.get(INN);
  // a place of A the road takes in a cycle about day 400, and a day inside that cycle
  const rosterA = h.world.rosterOf(A);
  let fated = null;
  for (const r of rosterA) {
    const k0 = placeCycle(r, rosterA, 400, 1);
    for (let k = k0 - 6; k <= k0 + 6 && !fated; k++) if (placeAt(r, k, {}).dies) fated = [r, k];
    if (fated) break;
  }
  assert.ok(fated, 'a place of the town the road takes about then');
  const [placeA, kA] = fated;
  const days = [];
  for (let d = 300; d < 500; d++) if (placeCycle(placeA, rosterA, d, 1) === kA) days.push(d);
  const day = days[Math.floor(days.length / 2)], noon = day * DAY_MIN + 240 + 720;
  for (const t of [A, B, C, inn]) assert.ok(h.tripsOf(t, day), 'every way known: the word at once');
  const fought = [B, A, C].flatMap((t) => townTrips(t, noon, h.world, h.o())).find((tr) => tr.enc);
  assert.ok(fought, 'a party with a trouble');
  const keysOf = (town) => [...h.book.keys()].filter((k) => k.startsWith(`L${town.mapId}.`) || k.startsWith(`town:${town.mapId}:`));
  const before = { a: keysOf(A), b: keysOf(B), c: keysOf(C), size: h.book.size, fates: h.books.fates.size, places: h.books.places.size };
  assert.ok(before.a.length > 5 && before.b.length > 5 && before.c.length > 5 && before.fates > 5 && before.places > 5, 'the books hold the three towns');
  // a tale: nothing of the trips reads it
  h.R.rel.turn('held', 'R17.100~1', { t: noon, who: 'Someone' });
  h.books.turnsFresh();
  assert.deepEqual([h.book.size, h.books.fates.size, h.books.places.size], [before.size, before.fates, before.places], 'a tale drops nothing');
  // a place spared: its town's trips and its places' entries go, the others stand; every trouble read again
  const turns = [['spared', turnKey(placeA, kA)]];
  h.R.rel.turn('spared', turnKey(placeA, kA));
  h.books.turnsFresh();
  assert.deepEqual(keysOf(A), [], 'the town\'s trips dropped');
  assert.deepEqual([keysOf(B), keysOf(C)], [before.b, before.c], 'the other towns\' stand');
  assert.equal([...h.books.places.keys()].filter((k) => k.startsWith(`${placeA.id}@`)).length, 0, 'the place\'s entries dropped');
  assert.ok(h.books.places.size > 0, 'the other places\' stand');
  assert.equal(h.books.fates.size, 0, 'the troubles read again');
  for (const [k, kept] of h.book) if (k.startsWith('town:')) assert.deepEqual([kept.pass, kept.out], [null, null], `${k}: its parties made again`);
  const same = host({ turns });
  for (const t of [A, B, C, inn]) {
    assert.deepEqual(wordView(h.tripsOf(t, day)), wordView(same.tripsOf(t, day)), `${t.name}: the word with the turn`);
    assert.deepEqual(partiesView(h, t, day), partiesView(same, t, day), `${t.name}: every party about it, with the turn`);
  }
  const plain = host();
  assert.notDeepEqual([wordView(h.tripsOf(A, day)), partiesView(h, A, day)], [wordView(plain.tripsOf(A, day)), partiesView(plain, A, day)], 'the turn is seen: the spared place\'s word changed');
  // a fight won: the troubles and the parties again, every trip kept
  const sizeBefore = h.book.size;
  turns.push(['won', fought.enc.id]);
  h.R.rel.turn('won', fought.enc.id);
  h.books.turnsFresh();
  assert.equal(h.book.size, sizeBefore, 'no trip dropped');
  assert.equal(h.books.fates.size, 0, 'the troubles read again');
  const same2 = host({ turns });
  for (const t of [A, B, C]) assert.deepEqual(partiesView(h, t, day), partiesView(same2, t, day), `${t.name}: every party, the fight won`);
  // a hand death in another town: that town's trips go, the rest stand
  const resC = h.world.rosterOf(C)[0];
  const kC = placeCycle(resC, h.world.rosterOf(C), day, 1);
  const slain = ['slain', turnKey(resC, kC), { t: noon - 60, seen: true, who: resC.name }];
  turns.push(slain);
  h.R.rel.turn(...slain);
  const bKeys = keysOf(B);
  h.books.turnsFresh();
  assert.deepEqual([keysOf(C), keysOf(B)], [[], bKeys], 'the slain one\'s town dropped, the other kept');
  const same3 = host({ turns });
  for (const t of [A, B, C]) assert.deepEqual(wordView(h.tripsOf(t, day)), wordView(same3.tripsOf(t, day)), `${t.name}: the word, a hand death made`);
  // more turns than the record keeps: everything again
  for (let i = 0; i <= TURNS_RECENT; i++) h.R.rel.turn('won', `e${i}`);
  h.books.turnsFresh();
  assert.deepEqual([h.book.size, h.books.places.size], [0, 0], 'everything made again');
  h.tripsOf(A, day);
  assert.ok(h.book.size > 0);
  // another character's record: everything again
  h.R.rel = createRelations();
  h.books.turnsFresh();
  assert.deepEqual([h.book.size, h.books.fates.size, h.books.places.size], [0, 0, 0], 'another record: everything made again');
  // a turn whose key is no place's (another shape): everything again, never a wrong town kept
  h.tripsOf(A, day);
  h.R.rel.turn('fallen', 'strange-key');
  h.books.turnsFresh();
  assert.equal(h.book.size, 0, 'a turn the books cannot place: everything made again');
});

test('the host wires the books: the step before the ways\' frame (the budget left), the word kept waiting answered before any planning, the word that waits kept, the answer ending the watch, the places\' book the module\'s (mutants: the step after the renewal; the wait unkept)', () => {
  assert.match(WORLD, /livingBooks\.step\(\); livingWays\.frame\(\); livingMemoFresh\(\);/);
  assert.match(WORLD, /if \(livingBooks\.waits\(town, day\)\) return undefined;/);
  assert.match(WORLD, /if \(trips === undefined \|\| roadVisitors === undefined \|\| guests === undefined\) return livingBooks\.wait\(town, day\);/);
  assert.match(WORLD, /return livingBooks\.done\(\{ away, visitors, holders, news, places \}\);/);
  assert.match(WORLD, /const livingBooks = createLivingBooks\(\{ book: _livingTripMemo, world: livingTripWorld, townOfId: livingTownOfId, relations: \(\) => livingRelations, mpm: \(\) => PERSON_MOVE_SPEED \/ livingBaseRate\(\), fresh: livingMemoFresh \}\);/);
  assert.match(WORLD, /const livingPlaceOf = livingBooks\.placeOf;/);
  assert.match(WORLD, /const _livingFates = livingBooks\.fates;/);
});
