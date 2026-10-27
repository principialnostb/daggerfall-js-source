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

/** A fresh idle begun at its quiet start (refreshIdle's pick, after a movement empties). */
export function settleIdle(state, source, sampleTrack) {
  if (state && source) state.time = quietIdleTime(state, source, sampleTrack);
}
