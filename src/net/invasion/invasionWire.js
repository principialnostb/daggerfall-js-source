// @ts-check
// AN INVASION'S WORDS ON THE WIRE (`t: 'inv'`): a fighter's to the cell its city stands in, `in` (I am here) and `hit`
// (my blow on a foe, which the cell judges), and the cell's back, `st` (the whole fight) and `no` (a refusal). Each is
// projected here, its numbers bounded, so neither end trusts the other's shape. A relay older than INVASION_RELAY_MIN
// closes a socket on the frame, so the game says none to it.
import { STAFF_EVENT_ID_RE } from '../staffEvent/staffEventLaw.js';
import { egStampOk } from '../eliteGates/egShape.js';
import { INVASION_BLOW, INVASION_PHASES, INVASION_STAMP_BOUND } from './invasionBlows.js';

/** The first relay that hosts an invasion (the toybox's own, world304). */
export const INVASION_RELAY_MIN = 304;
/** Whether the relay named `version` (its welcome's `world<N>`) hosts one. @param {unknown} version */
export const relaySupportsInvasion = (version) => {
  const match = /^world(\d+)$/.exec(typeof version === 'string' ? version : '');
  return !!match && Number(match[1]) >= INVASION_RELAY_MIN;
};
/** A site's native point is bounded as a pose is (net/wire.js POSE_BOUND, which imports this file). */
export const INVASION_SITE_BOUND = 1e9;
/** The kinds each end says. */
export const INVASION_IN_KINDS = Object.freeze(['in', 'hit']);
export const INVASION_OUT_KINDS = Object.freeze(['st', 'no']);
/** The refusals a cell says. */
export const INVASION_NO_WORDS = Object.freeze(['gone', 'far', 'full', 'old']);
/** The most a blow may claim, a foe's number, and a level on the wire. */
export const INVASION_HIT_MAX = 100000;
export const INVASION_FOE_NUM_MAX = 1_000_000;
export const INVASION_LV_MAX = 999;
/** The most bodies and blows a state names. */
export const INVASION_BODIES_MAX = 32;
export const INVASION_BLOWS_MAX = 32;
/** The most fighters a state counts; the blows' numbers and the stamps a blow may lay. */
export const INVASION_NP_MAX = 1000;
const BLOW_NUMS = Object.values(INVASION_BLOW);
const STAMP_KINDS = Object.freeze(['d', 'l', 'c', 'r']);

const finite = (/** @type {unknown} */ value) => typeof value === 'number' && Number.isFinite(value);
const intIn = (/** @type {unknown} */ value, /** @type {number} */ low, /** @type {number} */ high) =>
  Number.isInteger(value) && /** @type {number} */ (value) >= low && /** @type {number} */ (value) <= high;
const idOk = (/** @type {unknown} */ id) => typeof id === 'string' && STAFF_EVENT_ID_RE.test(id);

/** A fighter's word, projected: `{k:'in', id, lv}` or `{k:'hit', id, i, d, r}` - else null. @param {any} msg */
export function validInvasionIn(msg) {
  if (!msg || typeof msg !== 'object' || !INVASION_IN_KINDS.includes(msg.k) || !idOk(msg.id)) return null;
  if (msg.k === 'in') return intIn(msg.lv, 1, INVASION_LV_MAX) ? { k: 'in', id: msg.id, lv: msg.lv } : null;
  if (!intIn(msg.i, 0, INVASION_FOE_NUM_MAX) || !intIn(msg.r, 0, 2) || !finite(msg.d)) return null;
  if (!(msg.d > 0) || msg.d > INVASION_HIT_MAX) return null;
  return { k: 'hit', id: msg.id, i: msg.i, d: msg.d, r: msg.r };
}

/** A body row: `[i, kind, h, m, x, z, tx, tz, v, at, up, dead]` (invasionBrain.js bodyRow). */
function bodyRowOk(/** @type {unknown} */ row) {
  if (!Array.isArray(row) || row.length !== 12) return false;
  const [num, kind, health, most, ...rest] = row;
  if (!intIn(num, 0, INVASION_FOE_NUM_MAX) || !intIn(kind, 0, 4095)) return false;
  if (!intIn(health, 0, 1e9) || !intIn(most, 1, 1e9)) return false;
  if (!rest.every(finite) || ![rest[0], rest[1], rest[2], rest[3]].every((coord) => Math.abs(coord) <= 1e5)) return false;
  return rest[7] === 0 || rest[7] === 1;
}
/** A blow row: `[s, i, a, at, wu, p, stamp]`, its stamp one of the gate's shapes on the ground. */
function blowRowOk(/** @type {unknown} */ row) {
  if (!Array.isArray(row) || row.length !== 7 || !row.slice(0, 6).every(finite)) return false;
  if (!intIn(row[0], 0, 1e9) || !intIn(row[1], 0, INVASION_FOE_NUM_MAX) || !BLOW_NUMS.includes(row[2])) return false;
  if (!intIn(row[4], 1, 60_000) || !(row[5] > 0) || row[5] > 1) return false;
  const stamp = row[6];
  return Array.isArray(stamp) && STAMP_KINDS.includes(stamp[0]) && egStampOk(stamp, INVASION_STAMP_BOUND);
}

/** A cell's word, projected for the game, or null. @param {any} msg */
export function validInvasionOut(msg) {
  if (!msg || typeof msg !== 'object' || !INVASION_OUT_KINDS.includes(msg.k) || !idOk(msg.id)) return null;
  if (msg.k === 'no') return INVASION_NO_WORDS.includes(msg.m) ? { k: 'no', id: msg.id, m: msg.m } : null;
  if (!finite(msg.sx) || !finite(msg.sz) || Math.abs(msg.sx) > INVASION_SITE_BOUND || Math.abs(msg.sz) > INVASION_SITE_BOUND) return null;
  if (!intIn(msg.w, 0, 99) || !intIn(msg.p3, 0, 1) || !intIn(msg.n, 0, 1e6) || !finite(msg.fl)) return null;
  if (!intIn(msg.ph, 0, INVASION_PHASES) || !intIn(msg.np, 0, INVASION_NP_MAX)) return null;
  if (!Array.isArray(msg.f) || msg.f.length > INVASION_BODIES_MAX || !msg.f.every(bodyRowOk)) return null;
  if (!Array.isArray(msg.b) || msg.b.length > INVASION_BLOWS_MAX || !msg.b.every(blowRowOk)) return null;
  return {
    k: 'st',
    id: msg.id,
    sx: msg.sx,
    sz: msg.sz,
    w: msg.w,
    ph: msg.ph,
    p3: msg.p3,
    n: msg.n,
    np: msg.np,
    f: msg.f.map((/** @type {number[]} */ row) => [...row]),
    b: msg.b.map((/** @type {any[]} */ row) => [...row.slice(0, 6), [...row[6]]]),
    fl: msg.fl,
  };
}
