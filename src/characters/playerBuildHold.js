// While the player's body is building, other rigs yield their build slot so a crowd cannot delay the player's
// own equipment.

let probe = () => false;

/** The player's rig says how to ask whether it is building. @param {() => boolean} fn */
export function setPlayerBusyProbe(fn) { probe = typeof fn === 'function' ? fn : () => false; }

/** Is the player's own body being built or changed right now? */
export function playerBuilding() {
  try { return !!probe(); } catch { return false; }
}

/** How long a queue waits before it asks again (ms). */
export const PLAYER_HOLD_RETRY_MS = 50;
