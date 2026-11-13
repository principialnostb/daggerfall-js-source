// @ts-check
// The errand law both ends read when a revenant is sent from Discord: the account service, which keeps its own ledger
// of the errands it sends and never writes the save, and the game, which takes each one up as if sent from the
// Companions page. It stays a leaf the Worker can bundle: revenantErrands.js brings the pack and the Materials Bag, so
// the few numbers the service needs are restated here, and test/systems/revenant/rvn_remote_law.test.js holds each to
// the game's own (the places, the ventures, the odds, the road's length, the city drawn).
import { rvnErrandSky } from './revenantStars.js';
import { gearPower } from './revenantGear.js';
import { idStream, isDevoted } from './revenantFeud.js';
import { CITIES } from '../../world/tamriel/tamrielGeography.js';
import { MINUTES_PER_DAY } from '../gameDate.js';
import { sharedClassicMinutes, wallMsForClassicMinutes } from '../../net/wire.js';
import { t } from '../textManager.js';

/** Each place's name in the player's language, through the game's own keys. */
const PLACE_WORDS = Object.freeze({
  HighRock: () => t('rvn.errand.place.highRock', 'High Rock'),
  Hammerfell: () => t('rvn.errand.place.hammerfell', 'Hammerfell'),
  Imperial: () => t('rvn.errand.place.imperial', 'Imperial Province'),
  Skyrim: () => t('rvn.errand.place.skyrim', 'Skyrim'),
  Valenwood: () => t('rvn.errand.place.valenwood', 'Valenwood'),
  Sumurset: () => t('rvn.errand.place.sumurset', 'Sumurset Isle'),
  Elsweyr: () => t('rvn.errand.place.elsweyr', 'Elsweyr'),
  Morrowind: () => t('rvn.errand.place.morrowind', 'Morrowind'),
  BlackMarsh: () => t('rvn.errand.place.blackMarsh', 'Black Marsh'),
});
const place = (/** @type {keyof typeof PLACE_WORDS} */ key, /** @type {number} */ days, /** @type {number} */ danger) =>
  Object.freeze({
    key,
    get name() {
      return PLACE_WORDS[key]();
    },
    days,
    danger,
  });
/** The places, as revenantErrands.js ERRAND_PLACES has them: days there and back, and danger 1 to 5. */
export const REMOTE_PLACES = Object.freeze([
  place('HighRock', 1, 1),
  place('Hammerfell', 1, 2),
  place('Imperial', 2, 2),
  place('Skyrim', 2, 3),
  place('Valenwood', 2, 3),
  place('Sumurset', 3, 3),
  place('Elsweyr', 3, 3),
  place('Morrowind', 3, 4),
  place('BlackMarsh', 4, 5),
]);
/** A place by its key, or null. */
export const remotePlace = (/** @type {unknown} */ key) => REMOTE_PLACES.find((p) => p.key === key) ?? null;

/** The ventures, as revenantErrands.js VENTURES has them, in the player's language. */
export const REMOTE_VENTURES = Object.freeze({
  plunder: Object.freeze({
    get label() {
      return t('rvn.errand.venture.plunder', 'Plunder');
    },
    get blurb() {
      return t('rvn.errand.venture.plunderBlurb', 'Loot first');
    },
  }),
  forage: Object.freeze({
    get label() {
      return t('rvn.errand.venture.forage', 'Forage');
    },
    get blurb() {
      return t('rvn.errand.venture.forageBlurb', 'Crafting materials first');
    },
  }),
  contract: Object.freeze({
    get label() {
      return t('rvn.errand.venture.contract', 'Sell-sword');
    },
    get blurb() {
      return t('rvn.errand.venture.contractBlurb', 'Gold first');
    },
  }),
});
export const isRemoteVenture = (/** @type {unknown} */ v) =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(REMOTE_VENTURES, v);

/** The most of a character's sworn abroad at once (revenantErrands.js ERRAND.MAX). */
export const REMOTE_ERRANDS_MAX = 2;
/** Online, revenants wait for this Renown (revenant.js REVENANT_MIN_RENOWN). */
export const REMOTE_MIN_RENOWN = 10;
/** The odds' numbers (revenantErrands.js ERRAND.ODDS). */
export const REMOTE_ODDS = Object.freeze({ BASE: 0.55, PER: 0.1, MIN: 0.3, MAX: 0.95, DEVOTED: 0.05 });

/** The world's minute at a wall instant (ms): the online clock every client reads. */
export const worldMinuteAt = (/** @type {number} */ ms) => Math.floor(sharedClassicMinutes(ms));
/** The wall second at which the world reads a minute. */
export const wallSecondOf = (/** @type {number} */ minute) => Math.ceil(wallMsForClassicMinutes(minute) / 1000);

/** The minutes an errand of `r` to `key` takes: the place's days, less its Road's share (newErrand's length). */
export function remoteRoadMinutes(/** @type {any} */ r, /** @type {unknown} */ key) {
  const p = remotePlace(key);
  if (!p) return 0;
  return Math.round(p.days * (1 - rvnErrandSky(r).road) * MINUTES_PER_DAY);
}

/** Its chance to come back with the whole haul (revenantErrands.js errandOdds, before it sets out). */
export function remoteErrandOdds(/** @type {any} */ r, /** @type {unknown} */ key) {
  const p = remotePlace(key);
  if (!p) return 0;
  const power = Math.max(1, r?.rank | 0) + gearPower(r) + rvnErrandSky(r).odds;
  const O = REMOTE_ODDS;
  const odds = O.BASE + O.PER * (power - p.danger) + (isDevoted(r?.companion?.loyalty) ? O.DEVOTED : 0);
  return Math.round(Math.max(O.MIN, Math.min(O.MAX, odds)) * 1000) / 1000;
}
/** The odds in the game's words: good, fair or grim. */
export const remoteOddsWord = (/** @type {number} */ odds) =>
  odds >= 0.75
    ? t('rvn.errand.odds.good', 'Good odds')
    : odds >= 0.5
      ? t('rvn.errand.odds.fair', 'Fair odds')
      : t('rvn.errand.odds.grim', 'Grim odds');

/** The city an errand names, drawn as newErrand draws it, or null. */
export function remoteErrandCity(/** @type {any} */ r, /** @type {unknown} */ key, /** @type {number} */ seed) {
  const s = Number.isInteger(seed) && seed >= 0 ? seed >>> 0 : 0;
  const cities = CITIES.filter((c) => c.province === key);
  if (!cities.length) return null;
  return cities[Math.min(cities.length - 1, Math.floor(idStream(`${r?.id}`, `errand-city:${s}`)() * cities.length))].name;
}

/**
 * The sworn as a save holds them (its per-mod slot `Revenant`): each one's id, name, rank, state, rest and errand. A
 * record that is not sworn, has fallen or is a tombstone is left out. Read only; the save is never written here.
 * @param {any} save
 */
export function swornInSave(save) {
  const list = Array.isArray(save?.modData?.Revenant?.list) ? save.modData.Revenant.list : [];
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object' || r.gone || r.defeated || r.sworn !== true) continue;
    if (typeof r.id !== 'string' || !r.id || r.id.length > 64) continue;
    const c = r.companion && typeof r.companion === 'object' ? r.companion : {};
    const state = ['with', 'away', 'resting', 'errand'].includes(c.state) ? c.state : 'with';
    out.push({
      id: r.id,
      name: (typeof r.name === 'string' && r.name ? r.name : String(r.given || r.id)).slice(0, 64),
      rank: Math.max(1, Math.min(5, Number.isInteger(r.rank) ? r.rank : 1)),
      state,
      until: Number.isFinite(c.until) ? Number(c.until) : null,
      errand: state === 'errand' && c.errand && typeof c.errand === 'object' ? c.errand : null,
      loyalty: Number.isFinite(c.loyalty) ? Number(c.loyalty) : 0,
      record: r,
    });
  }
  return out;
}

/** An errand id the service mints. */
export const REMOTE_ERRAND_ID_RE = /^x[0-9a-f]{20}$/;
/**
 * One of the service's pending errands as the game takes it: an errand to set out (`send`) or one to call home
 * (`recall`). Null for anything else.
 * @param {any} e
 */
export function remoteErrandOf(e) {
  if (!e || typeof e !== 'object' || !REMOTE_ERRAND_ID_RE.test(String(e.id))) return null;
  if (typeof e.companion !== 'string' || !e.companion || e.companion.length > 64) return null;
  if (!Number.isInteger(e.seed) || e.seed < 0 || e.seed > 0xffffffff) return null;
  if (e.kind === 'recall') return { id: e.id, kind: 'recall', companion: e.companion, seed: e.seed };
  if (e.kind !== 'send' || !remotePlace(e.place) || !isRemoteVenture(e.venture) || !Number.isInteger(e.world)) return null;
  return { id: e.id, kind: 'send', companion: e.companion, seed: e.seed, place: e.place, venture: e.venture, world: e.world };
}
