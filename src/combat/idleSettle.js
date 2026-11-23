// @ts-check
// Blend from the last displayed moving pose when a character stops to avoid a jump to the idle clip's first
// frame.

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

/** Let brief turn transitions settle before treating the idle as a second stop. */
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

/** Start from the pose actually drawn, including layers that changed it after the clip was sampled. */
export function blendSourceOf(assembly, on = true) {
  const p = on && assembly?.shownPose instanceof Map ? assembly.shownPose : assembly?.rawPose;
  return p instanceof Map ? new Map(p) : null;
}

/** Carry the active blend into the next phase to keep the hands continuous at blow entry. */
export function carriesBlend(seconds, from, elapsed, running, on = true) {
  return !!on && seconds === 0 && !!from && running > 0 && elapsed < running;
}

/** A one-frame idle at landing can be followed by running again. Hold the transition through the landing. */
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
