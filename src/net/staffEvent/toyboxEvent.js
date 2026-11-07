// @ts-check
// A TOYBOX EVENT AS A STAFF EVENT: a developer's invasion or dragon attack, built in the staff event's one shape so the
// account service signs it, the hub keeps it in its book and the game runs it as it runs a staff event. Its own fields
// are `tb` (its kind), `fm` (an invasion's family) and `go` (when it begins, TOYBOX_EVENT_WAIT_MS after its staging).
// An invasion's kill meter is its ten waves' sum; its fight is its city's cell's (net/invasion/invasionBrain.js), which
// keeps the event's ledger and counts past the meter through the boss's third phase. A dragon attack is no raid: its event calls the world dragon down at its city at
// `go` (net/dragon/dragonLaw.js dragonCalledOf), and stands as long as that dragon may.
// PURE. The account service, the relay, the game and the offline runner read it.
import {
  validStaffEvent,
  staffEventFault,
  STAFF_EVENT_TOTAL_MAX,
  STAFF_EVENT_LONGEST_MS,
  STAFF_BOSS_SIZE_MIN,
  TB_INVASION,
  TB_DRAGON,
} from './staffEventLaw.js';
import {
  TOYBOX_EVENT_WAIT_MS,
  DRAGON_ATTACK_RUN_MS,
  INVASION_WAVES,
  INVASION_FAMILIES,
  DRAGON_ATTACK_KIND,
  invasionFamily,
} from '../../systems/toybox/toyboxLaw.js';

/** The toybox's two kinds, as the window names them. */
export const TOYBOX_EVENT_KINDS = Object.freeze({ invasion: TB_INVASION, dragon: TB_DRAGON });
/** Wave `k` (0 the first) stands this many and one more each wave after. */
export const INVASION_WAVE_BASE = 6;
/** A third phase's waves, each. */
export const INVASION_PHASE3_WAVE = 8;
/** How long a toybox event may run once it begins, ms; its book's slot is freed then. */
export const TOYBOX_EVENT_RUN_MS = 2 * 60 * 60 * 1000;
/** The invasion's boss: the largest a staff event's boss may be, and its health. */
export const INVASION_BOSS_SIZE = 300;
export const INVASION_BOSS_HP = 60000;

/** Wave `k`'s size. @param {number} k */
export const invasionWaveSize = (k) => INVASION_WAVE_BASE + k;
/** The kills before wave `k` (0..INVASION_WAVES). @param {number} k */
export const invasionKillsBefore = (k) => k * INVASION_WAVE_BASE + (k * (k - 1)) / 2;
/** The kill meter: every wave's kills. */
export const INVASION_METER = invasionKillsBefore(INVASION_WAVES);
/** The wave under way after `n` kills: 0 the first, INVASION_WAVES once the tenth fell. @param {number} n */
export function invasionWaveOf(n) {
  let k = 0;
  while (k < INVASION_WAVES && invasionKillsBefore(k + 1) <= n) k++;
  return k;
}

/**
 * THE EVENT the toybox stages: `kind` 'invasion' or 'dragon', `place` the city's fields (toyboxCities.js), `family` an
 * invasion's id, `id` and `at` the service's (or the offline runner's), `by` who staged it, `wait` the ms before it
 * begins. `{ ev }`, or `{ error }`: `kind`, `family`, or the law's own field (staffEventFault's word).
 * @param {{ kind: unknown, place: any, family?: unknown, id: string, at: number, by: string, wait?: number }} o
 * @returns {{ ev: import('./staffEventLaw.js').StaffEvent } | { error: string }}
 */
export function toyboxStaffEvent({ kind, place, family, id, at, by, wait = TOYBOX_EVENT_WAIT_MS }) {
  const kindCode = TOYBOX_EVENT_KINDS[/** @type {'invasion'|'dragon'} */ (kind)];
  if (kindCode !== TB_INVASION && kindCode !== TB_DRAGON) return { error: 'kind' };
  const fam = kindCode === TB_INVASION ? invasionFamily(family) : null;
  if (kindCode === TB_INVASION && !fam) return { error: 'family' };
  const go = at + wait;
  const raw = {
    id,
    rg: place?.rg,
    loc: place?.loc,
    px: place?.px,
    py: place?.py,
    nm: place?.nm,
    ct: 1,
    mt: fam ? [...fam.kinds] : [DRAGON_ATTACK_KIND],
    n: fam ? STAFF_EVENT_TOTAL_MAX : 1,
    m: fam ? INVASION_METER : 1,
    b: fam ? fam.boss : DRAGON_ATTACK_KIND,
    bs: fam ? INVASION_BOSS_SIZE : STAFF_BOSS_SIZE_MIN,
    bh: 10,
    hp: fam ? INVASION_BOSS_HP : 0,
    at,
    ue: Math.min(at + STAFF_EVENT_LONGEST_MS, go + (fam ? TOYBOX_EVENT_RUN_MS : DRAGON_ATTACK_RUN_MS)),
    eb: 1,
    fb: 0,
    by,
    tb: kindCode,
    fm: fam ? INVASION_FAMILIES.indexOf(fam) : 0,
    go,
  };
  const event = validStaffEvent(raw);
  return event ? { ev: event } : { error: staffEventFault(raw) ?? 'event' };
}

/** Is this event a toybox event? @param {{ tb?: number }|null|undefined} e */
export const isToyboxEvent = (e) => e?.tb === TB_INVASION || e?.tb === TB_DRAGON;
/** An invasion's family, or null. @param {{ tb?: number, fm?: number }|null|undefined} e */
export const familyOfEvent = (e) => (e?.tb === TB_INVASION ? (INVASION_FAMILIES[e.fm ?? 0] ?? null) : null);
