// LOAD-STALL 3 (bible/07-Rendering/Load-Stalls.md section 5): THE PLAYER'S BODY BEFORE THE OTHERS'.
//
// Every other body - an online peer's, the family's, a townsperson's - is built through one queue (peerBodies.js
// BODY_BUILD_GATE), one at a time; the player's own is not, it is the rig's (combat/fpArm.js). While the player's rig
// built or swapped (a weapon drawn from the pack), the queue went on starting the street's bodies, and their work took
// the frame's thread between the player's own steps and the texture pool's workers ahead of its pictures - a sword the
// owner saw "иногда 5-10 секунд" after the click, in a town. The queue now asks this module before it starts a body and
// waits while the player's rig is busy.
//
// The player's rig registers the question (fpArm.js, the page's singleton); nothing registered answers "not busy", so a
// test's queue and a page with no player rig run as they did.

let probe = () => false;

/** The player's rig says how to ask whether it is building. @param {() => boolean} fn */
export function setPlayerBusyProbe(fn) { probe = typeof fn === 'function' ? fn : () => false; }

/** Is the player's own body being built or changed right now? */
export function playerBuilding() {
  try { return !!probe(); } catch { return false; }
}

/** How long a queue waits before it asks again (ms). */
export const PLAYER_HOLD_RETRY_MS = 50;
