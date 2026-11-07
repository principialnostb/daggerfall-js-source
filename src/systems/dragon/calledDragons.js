// @ts-check
// THE CALLED DRAGONS THIS MACHINE KNOWS: each Dragon Attack in the hub's book (online) or the local runner's (offline),
// read off the events this machine holds (systems/staffEvents.js) as a dragon's omen (net/dragon/dragonLaw.js
// dragonCalledOf). The dragon's host draws and fights them; the toybox's marks and the local runner read whether one fell.
import { staffRaids } from '../staffEvents.js';
import { dragonCalledOf } from '../../net/dragon/dragonLaw.js';

/** The events whose dragon fell here, by id (the newest kept). */
let _fell = new Set();
const FELL_KEPT = 32;

/** The called omens of the events live here. @param {any[]} [raids] staffRaids()' */
export const calledDragons = (raids = staffRaids()) =>
  raids.map((raid) => dragonCalledOf(raid?.staff)).filter((omen) => omen !== null);

/** A called dragon fell (its fall heard, or this machine's own fight). @param {unknown} eventId */
export function noteCalledFell(eventId) {
  if (typeof eventId !== 'string' || !eventId) return;
  _fell.add(eventId);
  while (_fell.size > FELL_KEPT) _fell.delete(_fell.values().next().value);
}
/** Did this event's dragon fall? @param {unknown} eventId */
export const calledFell = (eventId) => typeof eventId === 'string' && _fell.has(eventId);

/** Test seam. */
export function _resetCalledDragons() {
  _fell = new Set();
}
