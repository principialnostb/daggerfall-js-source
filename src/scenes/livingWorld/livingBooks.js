// @ts-check
// The living world's books: what the host keeps of the trips, the places and the troubles so the same answers cost
// less each frame, and what each thing that can change an answer makes again. Every entry is a pure function of the
// world, a seed and the character's turns, so a kept answer equals the one worked out afresh.
import { memoTrip } from '../../systems/livingWorld/trips.js';
import { mintResident } from '../../systems/livingWorld/census.js';
import { placeAt, turnKey } from '../../systems/livingWorld/lives.js';

/** The trips still waiting on a way are asked again each frame, at most this many; the ways' own budget bounds the
 *  planning a frame does. */
export const PENDING_PER_FRAME = 64;
/** The most places kept before the places' book starts over. */
export const PLACE_BOOK_MAX = 30000;
/** A turn of these kinds names a place and a cycle: that place's book entries and its town's trips are made again. */
export const PLACE_TURNS = Object.freeze(['spared', 'fallen', 'slain', 'died', 'killed']);
/** A turn of these kinds changes a trouble (a fight's end, a band routed): every trouble is read again. */
export const TROUBLE_TURNS = Object.freeze(['won', 'lost', 'routed']);

/**
 * The trips' book: the Map the trips read and write (trips.js memoTrip, townTrips, wayBetween), which also knows the
 * trips that answered undefined (`pending`: a way still asked), which of them a town's roads' word waited on while it
 * was asked (`watch`), and each town's word that waits (`misses`, by town and day). Cleared, it forgets those too:
 * they named entries of the old book.
 * @extends {Map<string, any>}
 */
export class TripBook extends Map {
  constructor() {
    super();
    /** @type {Map<string, { res: any, town: any, k: number }>} */
    this.pending = new Map();
    /** @type {Set<string> | null} */
    this.watch = null;
    /** @type {Map<string, string[]>} */
    this.misses = new Map();
  }

  /** A trip asked that still waits on a way: remembered, and noted for the word being asked. */
  waits(key, res, town, k) {
    if (!this.pending.has(key)) this.pending.set(key, { res, town, k });
    this.watch?.add(key);
  }

  /** @param {string} key @param {any} value */
  set(key, value) {
    this.pending?.delete(key);
    return super.set(key, value);
  }

  clear() {
    super.clear();
    this.pending.clear();
    this.misses.clear();
    this.watch = null;
  }
}

/**
 * @param {{ book: TripBook, world: any, townOfId: (id: number) => any, relations: () => any, mpm: () => number,
 *   fresh: () => void }} deps - `book` the trips' memo; `world` the trips' world (the host's holderOf, fated and fate
 *   stand on it); `townOfId` a town's record by its map id (a newcomer's mint); `relations` the character's record (its
 *   turns and their version); `mpm` the clock's pace the trips are planned at; `fresh` keeps the memo to the network
 *   and the world's places, asked before the book is read
 */
export function createLivingBooks({ book, world, townOfId, relations, mpm, fresh }) {
  /** @type {Map<string, { holder: any, dies: boolean, hand: number | null }>} */
  const places = new Map();
  /** @type {Map<string, any>} */
  const fates = new Map();
  let rel = null;
  let seen = -1;
  const wordKey = (town, day) => `${town.mapId >>> 0}:${day}`;

  /** A resident's place in cycle `k`: who holds it (null: empty), whether the road takes its holder that cycle, and
   *  the minute a hand took them (null: none). A townsperson's as a traveller's; the newcomer the census's own mint. */
  const placeOf = (res, k) => {
    const key = turnKey(res, k);
    let got = places.get(key);
    if (!got) {
      const place = placeAt(res, k, relations().turns());
      const town = place.vacant || place.holder == null ? null : townOfId(res.town);
      const holder = place.vacant ? null : place.holder == null ? res
        : (town ? mintResident(town, res.roll ?? 't', res.slot, res.job, { gen: place.holder, home: res.home, work: res.work, faction: res.faction }) : res);
      got = { holder, dies: !place.vacant && place.dies, hand: place.hand };
      if (places.size > PLACE_BOOK_MAX) places.clear();
      places.set(key, got);
    }
    return got;
  };

  /** The troubles' book cleared, and every kept town's parties made again, so each trouble is read anew. */
  const troublesAgain = () => {
    fates.clear();
    for (const [key, kept] of book) {
      if (key.startsWith('town:')) { kept.pass = null; kept.out = null; }
    }
  };
  /** A turn on a place (`L<town>.<slot>@<cycle>`): the place's entries and its town's trips go, the other towns' stand.
   *  False for a key of another shape. */
  const placeTurned = (key) => {
    const at = key.indexOf('@'), dot = key.indexOf('.');
    if (key[0] !== 'L' || dot < 2 || at < dot) return false;
    const place = `${key.slice(0, at)}@`, own = key.slice(0, dot + 1), town = `town:${key.slice(1, dot)}:`;
    for (const k of places.keys()) if (k.startsWith(place)) places.delete(k);
    for (const k of book.keys()) if (k.startsWith(own) || k.startsWith(town)) book.delete(k);
    for (const k of book.pending.keys()) if (k.startsWith(own)) book.pending.delete(k);
    return true;
  };
  const everything = () => { places.clear(); fates.clear(); book.clear(); };
  /** The character's turns read: only what the new ones can change is made again. Another character's record, or
   *  more turns than the record keeps, makes everything again. */
  const turnsFresh = () => {
    const record = relations(), version = record.turnsVersion();
    if (rel === record && seen === version) return;
    const made = rel === record ? record.turnsSince?.(seen) ?? null : null;
    rel = record;
    seen = version;
    if (!made) { everything(); return; }
    let troubles = false;
    for (const { kind, key } of made) {
      if (PLACE_TURNS.includes(kind)) {
        if (!placeTurned(key)) { everything(); return; }
        troubles = true;
      } else if (TROUBLE_TURNS.includes(kind)) troubles = true;
    }
    if (troubles) troublesAgain();
    book.misses.clear();
  };

  /** Is a town's roads' word for `day` still waiting on the trips it waited on last time? Not waiting, the asking
   *  begins and the trips it waits on are watched. */
  const waits = (town, day) => {
    const key = wordKey(town, day), miss = book.misses.get(key);
    if (miss) {
      if (!miss.every((k) => book.has(k))) return true;
      book.misses.delete(key);
    }
    book.watch = new Set();
    return false;
  };
  /** The word answered undefined: the trips it waited on are kept by the town and the day. Answers undefined. */
  const wait = (town, day) => {
    book.misses.set(wordKey(town, day), [...(book.watch ?? [])]);
    book.watch = null;
    return undefined;
  };
  /** The word answered: nothing waits. @template T @param {T} word */
  const done = (word) => {
    book.watch = null;
    return word;
  };
  /** A frame: the trips still waiting on a way are asked again, PENDING_PER_FRAME at most, each still waiting moved
   *  behind the rest so every one gets its turn. The ways' own budget bounds what a frame plans. */
  const step = () => {
    fresh();
    turnsFresh();
    const options = { mpm: mpm(), memo: book };
    const it = book.pending.entries();
    for (let n = Math.min(book.pending.size, PENDING_PER_FRAME); n > 0; n--) {
      const next = it.next();
      if (next.done) break;
      const [key, e] = next.value;
      if (memoTrip(e.res, e.town, e.k, world, options) !== undefined) continue;
      book.pending.delete(key);
      book.pending.set(key, e);
    }
  };
  return { places, fates, placeOf, turnsFresh, waits, wait, done, step };
}
