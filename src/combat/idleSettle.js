// @ts-check
// IDLE-SETTLE (2026-10-27, MOTION-DOCTRINE; the owner: "when the character stops, the animation into the idle plays and
// the feet are set a little differently - after any movement it plays twice"). The reference restarts the idle from its
// START the frame a movement empties (character.cpp:646-651, MW-D29), and a stance's idle is a body shifting its weight:
// Morrowind Animation Overhaul's Idle1h moves both thighs twice in its first three seconds (0.3-0.7 s and 2.3-2.7 s),
// its Idle2c the same. So every stop drew the cross-fade's settle and then the clip's own two shuffles - one stop, three
// foot movements, the same every time (CONNECTION: one transition, not three). A stop now lands the idle where its legs
// are QUIET: the start, of the clip's own, after which its lower body moves least over the next `window` seconds -
// read off the clip itself, once per source and group, so any pack's idle is judged by its own legs. The loop dice
// and everything else of MW-D29's reset stand; only where the fresh idle begins is the port's (a departure from
// character.cpp:646-651's start point, presentation only).

/** `window` seconds of quiet asked for after the start; `step` the sampling; `bones` the lower body's that count. */
export const IDLE_SETTLE = Object.freeze({ window: 1.2, step: 0.05, bones: /^bip01(?: pelvis| [lr] (?:thigh|calf|foot))?$/, translation: 0.02 });

/** @type {WeakMap<object, Map<string, number>>} */
const MEMO = new WeakMap();

/** The quaternion distance of two rotations (0 the same, 1 a half turn apart), either sign. */
const quatGap = (a, b) => (a && b ? 1 - Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])) : 0);
const gap3 = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);

/** THE QUIET START of a clip state's group on its source: the time in [startTime, stopTime - window] after which the
 *  lower body's bones move least over `window` seconds (the earliest of equals); the start itself when the group is no
 *  longer than the window or the source has none of those bones. */
export function quietIdleTime(state, source, sampleTrack) {
  const start = Number(state?.startTime), stop = Number(state?.stopTime);
  const tracks = source?.trackMap;
  if (!Number.isFinite(start) || !Number.isFinite(stop) || !(tracks instanceof Map)) return Number.isFinite(start) ? start : 0;
  const key = `${String(state.group ?? '').toLowerCase()}|${start}|${stop}`;
  let memo = MEMO.get(source);
  if (memo?.has(key)) return /** @type {number} */ (memo.get(key));
  const { window, step } = IDLE_SETTLE;
  let best = start;
  const legs = [...tracks.entries()].filter(([name]) => IDLE_SETTLE.bones.test(String(name).toLowerCase())).map(([, t]) => t);
  if (legs.length && stop - start > window + step) {
    const n = Math.floor((stop - start) / step);
    const motion = new Array(n).fill(0);   // motion[i]: the legs' change from sample i to i+1
    let prev = legs.map((t) => sampleTrack(t, start));
    for (let i = 0; i < n; i++) {
      const now = legs.map((t) => sampleTrack(t, Math.min(stop, start + (i + 1) * step)));
      for (let k = 0; k < legs.length; k++) motion[i] += quatGap(prev[k]?.rotation, now[k]?.rotation) + IDLE_SETTLE.translation * gap3(prev[k]?.translation, now[k]?.translation);
      prev = now;
    }
    const w = Math.round(window / step);
    let sum = 0;
    for (let i = 0; i < w; i++) sum += motion[i];
    let bestSum = sum;
    for (let i = 1; i + w <= n; i++) {
      sum += motion[i + w - 1] - motion[i - 1];
      if (sum < bestSum - 1e-9) { bestSum = sum; best = start + i * step; }
    }
  }
  if (!memo) { memo = new Map(); MEMO.set(source, memo); }
  memo.set(key, best);
  return best;
}

/**
 * TURN-GATE (2026-10-27, found running the owner's own game: "after any movement the settle plays twice"). The port
 * started a turn in place on ANY change of the yaw (combat/fpArm.js refreshMovement, MW-D39's `d !== 0`), held 0.05 s -
 * and the yaw moves by itself the frame a body stops (the view and the body's facing settle), so every stop drew
 * walk -> turnleft/turnright for about six frames -> idle: the cross-fade began, was cut by the turn's clip (its feet
 * step), and began again. Measured in the game: `walkback` -> `turnright` x6 -> `idle`. A turn in place now needs a turn:
 * at least `rate` radians a second for `frames` frames running; a real look round passes at once, a stop's twitch never.
 * `hold` the reference's own tail (the 0.05 s turnHold). With the switch off, the old law.
 */
export const TURN_GATE = Object.freeze({ rate: 0.6, frames: 2, hold: 0.05 });

/** THE GATE: one per rig. `step(d, dt, on)` takes the frame's yaw change and answers the turn's direction (-1, 0, 1). */
export function createTurnGate() {
  let dir = 0, hold = 0, run = 0, runDir = 0;
  return {
    step(d, dt, on = true) {
      if (!on) {
        if (d !== 0) { dir = Math.sign(d); hold = TURN_GATE.hold; } else { hold -= dt; if (hold <= 0) dir = 0; }
        return dir;
      }
      const fast = dt > 0 && Math.abs(d) / dt >= TURN_GATE.rate;
      const sign = Math.sign(d);
      run = fast && sign === runDir ? run + 1 : fast ? 1 : 0;
      runDir = fast ? sign : 0;
      if (run >= TURN_GATE.frames) { dir = sign; hold = TURN_GATE.hold; } else { hold -= dt; if (hold <= 0) dir = 0; }
      return dir;
    },
    reset() { dir = 0; hold = 0; run = 0; runDir = 0; },
  };
}

/**
 * SHOWN-POSE (2026-10-28, the owner's game, a per-frame probe of the drawn body). A cross-fade began from the assembly's
 * RAW pose - the clip as sampled, before the fade - so a transition begun while another still ran started from the new
 * clip at full weight, and the unfinished part of the old fade was a jump in one frame: the second frame of every
 * claymore blow (the hands 0.22-0.25 m, the blade 0.38 m), the stop after a blow on the move, the landing of a running
 * jump (the feet 0.4-0.5 m). The fade now starts from the pose the frame SHOWED (mwFirstPerson.js poseAssembly's
 * `shownPose`); with the switch off, the raw one as before.
 */
export function blendSourceOf(assembly, on = true) {
  const p = on && assembly?.shownPose instanceof Map ? assembly.shownPose : assembly?.rawPose;
  return p instanceof Map ? new Map(p) : null;
}

/**
 * MOVE-GRACE (2026-10-28, the same probe): a running jump landed as runforward -> idle (one frame) -> runforward - the
 * movement emptied for a frame and MW-D29's reset dropped the run, restarted the idle and faded twice. A movement that
 * empties now waits `seconds` before it is let go - the landing's own airborne flicker too (a jump that truly leaves the
 * ground shows its clip that much later); a stop is
 * that much later, a flicker is no stop.
 */
export const MOVE_GRACE = Object.freeze({ seconds: 0.06 });

/** THE GRACE: `step(empty, dt, on)` - true while an empty movement is still inside its grace (keep the clip playing). */
export function createMoveGrace() {
  let emptyFor = 0;
  return {
    step(empty, dt, on = true) {
      if (!empty || !on) { emptyFor = 0; return false; }
      emptyFor += Math.max(0, dt);
      return emptyFor < MOVE_GRACE.seconds;
    },
    reset() { emptyFor = 0; },
  };
}

/** A fresh idle begun at its quiet start (refreshIdle's pick, after a movement empties). */
export function settleIdle(state, source, sampleTrack) {
  if (state && source) state.time = quietIdleTime(state, source, sampleTrack);
}
