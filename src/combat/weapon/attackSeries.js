// @ts-check
// SERIES-FLOW (combat/blowFlow.js): IS THE PLAYER STILL ATTACKING? A series is one picture - the attack button held, or
// pressed again and again in whatever rhythm - and the arm reads it to carry its blows into each other rather than
// stopping in the window between them. And A PRESS IS NEVER LOST: one the machine or the arm could not take (a blow
// still in the hands) is buffered for SERIES.buffer seconds and taken the frame it can be - tapping fast through a
// blow struck the next only if the press happened to fall on a free frame, and the series broke into windows.

/** `buffer`: how long a press waits to be taken; `intent`: how long after a press the series counts as going on. */
export const SERIES = Object.freeze({ buffer: 0.45, intent: 0.85 });   // INTENT 0.85 (MOTION-DOCTRINE 7c): at 0.7 a click every 0.7 s fell out of its series - the idle cut in for 0.09 s between blows

export function createAttackSeries() {
  let prevHeld = false;
  let sinceRise = Infinity;
  let buffered = 0;
  return {
    /** One frame of the button (`held`); answers whether it was pressed this frame. */
    step(dt, held) {
      const rise = !!held && !prevHeld;
      prevHeld = !!held;
      const d = Math.max(0, dt || 0);
      sinceRise = rise ? 0 : sinceRise + d;
      buffered = rise ? SERIES.buffer : Math.max(0, buffered - d);
      return rise;
    },
    /** The series goes on: the button held, or pressed within SERIES.intent. */
    wanted: () => prevHeld || sinceRise < SERIES.intent,
    /** A press is waiting to be taken. */
    buffered: () => buffered > 0,
    /** A blow began: the waiting press is spent. */
    consume() { buffered = 0; },
    reset() { prevHeld = false; sinceRise = Infinity; buffered = 0; },
  };
}
