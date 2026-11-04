// @ts-check
// SERIES-FLOW (combat/blowFlow.js): IS THE PLAYER STILL ATTACKING? A series is one picture - the attack button held, or
// pressed again and again in whatever rhythm - and the arm reads it to carry its blows into each other rather than
// stopping in the window between them. And A PRESS IS NEVER LOST: one the machine or the arm could not take (a blow
// still in the hands) is buffered for SERIES.buffer seconds and taken the frame it can be - tapping fast through a
// blow struck the next only if the press happened to fall on a free frame, and the series broke into windows.

/** `buffer`: how long a press waits to be taken; `intent`: how long after a press the series counts as going on. */
export const SERIES = Object.freeze({ buffer: 0.45, intent: 0.85, held: 0.25 });   // `held`: a button down this long is a held attack, not a click   // INTENT 0.85 (MOTION-DOCTRINE 7c): at 0.7 a click every 0.7 s fell out of its series - the idle cut in for 0.09 s between blows

export function createAttackSeries() {
  let prevHeld = false;
  let sinceRise = Infinity;
  let buffered = 0;
  let heldFor = 0;   // SERIES-OWN-PRESS: how long the button has been down
  return {
    /** One frame of the button (`held`); answers whether it was pressed this frame. */
    step(dt, held) {
      const rise = !!held && !prevHeld;
      prevHeld = !!held;
      const d = Math.max(0, dt || 0);
      sinceRise = rise ? 0 : sinceRise + d;
      heldFor = held ? (rise ? 0 : heldFor + d) : 0;
      buffered = rise ? SERIES.buffer : Math.max(0, buffered - d);
      return rise;
    },
    /** The series goes on: the button held past a click, or pressed again within SERIES.intent - a press the blow it
     *  began has spent is not one (SERIES-OWN-PRESS, the owner's game 2026-11-04: every lone click was a series, and its
     *  follow-through drifted at a series' pace). */
    wanted: (flow = false) => (flow ? prevHeld : heldFor >= SERIES.held) || sinceRise < SERIES.intent,   // BLOW-STYLE 'Прежний': any press
    /** A press is waiting to be taken. */
    buffered: () => buffered > 0,
    /** A blow began: the waiting press is spent, and with it the series it would have meant. */
    consume(flow = false) { buffered = 0; if (!flow) sinceRise = Infinity; },
    reset() { prevHeld = false; sinceRise = Infinity; buffered = 0; heldFor = 0; },
  };
}
