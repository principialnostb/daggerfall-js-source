// @ts-check
// Errands sent from the Discord PDA, taken up by the game. The service keeps a ledger of what was sent and never writes
// the save; the game asks it what waits, now and then while an online character plays, and sets each errand out as the
// Companions page would - the same law, the service's seed and the world's minute it set out - or calls one home. Each
// is answered, so the service knows which were taken. An errand sent or recalled from the Companions page is told to the
// service too, so the PDA shows who is abroad. The haul is the game's own, drawn when the revenant comes back.
import { call, storedSession, serviceBase } from '../../net/accountClient.js';
import { REALM_CHARACTER_RE } from '../../net/identityToken.js';
import { appStorage } from '../appStorage.js';
import { characterIdOf } from '../characterId.js';
import { sharedClockOn } from '../worldTick.js';
import { remoteErrandOf, remoteRoadMinutes } from './revenantRemoteLaw.js';
import { t } from '../textManager.js';

/** How often the game asks the service, while it plays an online character. */
export const REMOTE_POLL_MS = 90_000;
/** A refusal's words the service keeps, at most. */
export const REMOTE_WHY_MAX = 120;

/** @typedef {{ fetch: any, base?: string, secret: string }} RemoteIo */
/** @typedef {{ send: (id: string, place: string, venture: string, o: { now: number, seed: number, world: number }) => string|null, recall: (id: string, now: number) => boolean, record: (id: string) => any }} RemoteActs */

const state = {
  /** @type {number} */ last: -Infinity,
  /** @type {boolean} */ asking: false,
  /** @type {any[]} */ waiting: [],
  /** @type {string|null} */ character: null,
  /** @type {boolean} */ applying: false,
};
/** Tests stand a fresh game. */
export function _resetRemoteErrands() {
  state.last = -Infinity;
  state.asking = false;
  state.waiting = [];
  state.character = null;
  state.applying = false;
}

/** The service, as this device's stored session reaches it, or null. @returns {RemoteIo|null} */
function deviceIo() {
  const st = appStorage();
  const s = storedSession(st);
  return s ? { fetch: (/** @type {any} */ u, /** @type {any} */ i) => globalThis.fetch(u, i), base: serviceBase(st), secret: s.secret } : null;
}
/** The online character's realm id, or null offline. */
function realmIdOf(/** @type {any} */ player) {
  if (!player || !sharedClockOn()) return null;
  const id = characterIdOf(player);
  return typeof id === 'string' && REALM_CHARACTER_RE.test(id) ? id : null;
}

/** The pending errands of one character, checked. @param {RemoteIo} io @param {string} character */
export async function pendingCall(io, character) {
  const r = await call(io, `/v1/expeditions/pending?character=${encodeURIComponent(character)}`);
  const list = r?.ok ? r.data?.errands : null;
  return (Array.isArray(list) ? list : []).map(remoteErrandOf).filter(Boolean);
}
/** One errand's answer. @param {RemoteIo} io */
export const ackCall = (io, /** @type {{ id: string, taken: boolean, why?: string, due?: number }} */ a) =>
  call(io, '/v1/expeditions/ack', a);

/**
 * ONE ERRAND TAKEN UP: set out, or called home. Answers the service's answer for it. A revenant already abroad on this
 * very errand (an answer the service never heard, asked again) is answered taken, and set out no second time.
 * @param {any} e @param {number} now @param {RemoteActs} acts
 * @returns {{ id: string, taken: boolean, why?: string, due?: number }}
 */
export function takeUp(e, now, acts) {
  const r = acts.record(e.companion);
  const errand = r?.companion?.state === 'errand' ? r.companion.errand : null;
  if (e.kind === 'recall') {
    if (!errand || errand.seed !== e.seed) return { id: e.id, taken: false, why: 'not-abroad' };
    return acts.recall(e.companion, now) ? { id: e.id, taken: true } : { id: e.id, taken: false, why: 'no-recall' };
  }
  if (errand && errand.seed === e.seed) return { id: e.id, taken: true, ...(Number.isInteger(errand.due) ? { due: errand.due } : {}) };
  // Already home from this very errand: its seed is among the paid ones the save keeps, so it is never set out twice.
  const paid = r?.companion?.paid;
  if (Array.isArray(paid) && paid.includes(e.seed)) return { id: e.id, taken: true };
  state.applying = true;
  let why;
  try {
    why = acts.send(e.companion, e.place, e.venture, { now, seed: e.seed, world: e.world });
  } finally {
    state.applying = false;
  }
  if (why) return { id: e.id, taken: false, why: String(why).slice(0, REMOTE_WHY_MAX) };
  const due = acts.record(e.companion)?.companion?.errand?.due;
  return { id: e.id, taken: true, ...(Number.isInteger(due) ? { due } : {}) };
}

/**
 * THE GAME'S STEP, from the party's wake: the errands asked for last time taken up, each answered; and the service asked
 * again once REMOTE_POLL_MS has passed. Offline, or for a character that is not an online one, nothing.
 * @param {any} player @param {number} now the character's minute @param {RemoteActs} acts
 * @param {{ io?: RemoteIo|null, clock?: () => number, say?: (line: string) => void }} [o]
 */
export function remoteErrandsStep(player, now, acts, { io = undefined, clock = () => Date.now(), say = () => {} } = {}) {
  const character = realmIdOf(player);
  if (!character) return 0;
  if (state.character !== character) {
    state.character = character;
    state.waiting = [];
    state.last = -Infinity;
  }
  let taken = 0;
  // The device's session is read only when something is to be answered or asked: this runs every frame.
  const due = !state.asking && clock() - state.last >= REMOTE_POLL_MS;
  if (!state.waiting.length && !due) return 0;
  const reach = io === undefined ? deviceIo() : io;
  while (state.waiting.length) {
    const e = state.waiting.shift();
    const a = takeUp(e, now, acts);
    if (a.taken) taken++;
    else if (e.kind === 'send') {
      try {
        say(t('rvn.errand.backLine', '{name}: {body}', { name: acts.record(e.companion)?.name ?? '', body: a.why }));
      } catch {
        /* a word is nobody's failure */
      }
    }
    if (reach) ackCall(reach, a).catch(() => {});
  }
  if (due) state.last = clock(); // a device with no session waits its pause too, never asking every frame
  if (!reach || !due) return taken;
  state.asking = true;
  pendingCall(reach, character)
    .then((list) => {
      if (state.character === character) state.waiting.push(...list);
    })
    .catch(() => {})
    .finally(() => {
      state.asking = false;
    });
  return taken;
}

/**
 * AN ERRAND THE GAME SENT OR RECALLED, told to the service so the PDA shows it. Errands the PDA sent are its own already.
 * @param {any} player @param {'send'|'recall'} kind @param {any} r the revenant @param {any} e its errand
 * @param {{ io?: RemoteIo|null }} [o]
 */
export function reportGameErrand(player, kind, r, e, { io = undefined } = {}) {
  if (state.applying || !r?.id || !e || !Number.isInteger(e.seed)) return false;
  const character = realmIdOf(player);
  const reach = io === undefined ? deviceIo() : io;
  if (!character || !reach) return false;
  const len = remoteRoadMinutes(r, e.place);
  const body =
    kind === 'recall'
      ? { character, kind, companion: r.id, seed: e.seed >>> 0 }
      : {
          character,
          kind,
          companion: r.id,
          name: String(r.name ?? '').slice(0, 64),
          rank: r.rank | 0,
          place: e.place,
          venture: e.venture,
          seed: e.seed >>> 0,
          ...(Number.isInteger(e.due) ? { due: e.due, world: e.due - len } : {}),
        };
  call(reach, '/v1/expeditions/game', body).catch(() => {});
  return true;
}
