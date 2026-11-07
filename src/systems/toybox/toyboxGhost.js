// @ts-check
// THE TOYBOX'S GHOST, THIS SCREEN'S HALF. Online the relay hides a ghost from everyone but developers and moderators
// (server/src/staffGhost.js); here it is the switch, the send, and the look: my own body and arms drawn see-through at
// GHOST_SELF_ALPHA while it is on, so I can tell. Offline there is nobody to hide from, so it is the look alone.
// A ghost seen by staff is drawn veiled, with the same plain blend an ally's veil uses (egClient.js ALLY_VEIL).
import { GHOST_SELF_ALPHA } from './toyboxLaw.js';

/** combatVisuals.js CONCEAL_MODE.reveal: the opacity alone, no shimmer (held equal by its test). */
const REVEAL = 3;
/** How a ghost a developer or moderator still sees is drawn on their screen. */
export const GHOST_PEER_ALPHA = 0.5;

let _on = false;
/** @type {((on: boolean) => unknown) | null} */
let _send = null;

/** The online send (net/online.js sendGhost on each session the host holds), or null offline. @param {unknown} fn */
export function setGhostSend(fn) {
  _send = typeof fn === 'function' ? /** @type {(on: boolean) => unknown} */ (fn) : null;
}
/** Whether my ghost is on. */
export const ghostOn = () => _on;
/** Turns my ghost on or off: the look at once, and the relay told when online. Answers what is on now. @param {unknown} on */
export function setGhost(on) {
  _on = on === true;
  try {
    _send?.(_on);
  } catch (e) {
    console.warn('[ghost] send failed', /** @type {any} */ (e)?.message ?? e);
  }
  return _on;
}
/** The alpha my own body and arms are drawn at: GHOST_SELF_ALPHA while a ghost, else 1. */
export const ghostAlpha = () => (_on ? GHOST_SELF_ALPHA : 1);

const SELF_VEIL = Object.freeze({ mode: REVEAL, alpha: GHOST_SELF_ALPHA, t: 0, phase: 0 });
const PEER_VEIL = Object.freeze({ mode: REVEAL, alpha: GHOST_PEER_ALPHA, t: 0, phase: 0, named: true });
/** My body's veil for a character draw's `conceal` (fpArm.js drawThird, eotbBody.js), or null while not a ghost. */
export const ghostSelfVeil = () => (_on ? SELF_VEIL : null);
/** A peer's veil when its pose says it is a ghost (`gh`, net/wire.js validPose), else null. @param {any} shown */
export const ghostPeerVeil = (shown) => (shown?.gh === 1 ? PEER_VEIL : null);
