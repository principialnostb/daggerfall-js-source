// @ts-check
// LOOP-SEAM (2026-10-27, MOTION-DOCTRINE, CONNECTION; found running every movement clip through the port's own readers,
// the owner's ask). A looping group plays from its loop start to its loop stop and jumps back, and where a clip's stop
// pose is not its start pose the body jumps at every wrap: retail's sneakforward2c and sneakforward2w move the left knee
// 11 units in a frame (Morrowind.bsa xbase_anim.kf), Morrowind Animation Overhaul's turns 2 to 4.6. The reference wraps
// as the clip is (animation.cpp runAnimation). The port's own: over the last `window` of a loop the sampled pose is
// carried toward the loop's start, per bone, by the seam's own difference - so the stop arrives where the start is and
// the wrap is not seen. Only a seam larger than `minAngle` / `minMove` is carried; a clean clip samples as it was.

import { getPref } from '../systems/uiPrefs.js';

/** CLIP-SMOOTH's switch, the viewer's - on unless turned off (the owner, 2026-10-29: "combine them, I will check"). */
const smoothOn = () => getPref('mwClipSmooth') !== false;

/** `window` seconds (at most `share` of the loop) the seam is carried over; seams under `minAngle` radians and `minMove`
 *  units are left alone. */
export const LOOP_SEAM = Object.freeze({ window: 0.15, share: 0.2, minAngle: 0.02, minMove: 0.3 });

/** @type {WeakMap<object, Map<string, { dq: number[] | null, dt: number[] | null } | null>>} */
const SEAMS = new WeakMap();

// quaternions in the tracks' own order, [w, x, y, z]
const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
/** The rotation `q` taken `u` of its way from the identity (the shorter way). */
function qpow(q, u) {
  const s = q[0] < 0 ? -1 : 1, w = Math.min(1, q[0] * s);
  const ang = Math.acos(w), sn = Math.sin(ang);
  if (sn < 1e-8) return [1, 0, 0, 0];
  const k = Math.sin(ang * u) / sn;
  return [Math.cos(ang * u), q[1] * s * k, q[2] * s * k, q[3] * s * k];
}
const smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** THE SEAM of one track over a loop window: the turn and the move that take the stop's pose to the start's, or null
 *  where it is smaller than LOOP_SEAM's floor. Once per track and window. */
export function seamOf(track, window, sampleTrack) {
  if (!track || typeof track !== 'object') return null;
  const key = `${window.start}|${window.stop}`;
  let memo = SEAMS.get(track);
  if (memo?.has(key)) return memo.get(key) ?? null;
  const a = sampleTrack(track, window.start), b = sampleTrack(track, window.stop);
  let dq = null, dt = null;
  if (a?.rotation && b?.rotation) {
    const q = qmul(a.rotation, qconj(b.rotation));
    if (2 * Math.acos(Math.min(1, Math.abs(q[0]))) > LOOP_SEAM.minAngle) dq = q;
  }
  if (a?.translation && b?.translation) {
    const d = [0, 1, 2].map((i) => a.translation[i] - b.translation[i]);
    if (Math.hypot(...d) > LOOP_SEAM.minMove) dt = d;
  }
  const seam = dq || dt ? { dq, dt } : null;
  if (!memo) { memo = new Map(); SEAMS.set(track, memo); }
  memo.set(key, seam);
  return seam;
}

/** A sample at `time` carried over its loop's seam: the share `u` (0 before the last window, 1 at the stop) of the
 *  seam's turn laid before the sample's, and of its move added. */
export function carryOverSeam(sample, seam, u) {
  if (!seam || !(u > 0) || !sample) return sample;
  return {
    rotation: seam.dq && sample.rotation ? qmul(qpow(seam.dq, u), sample.rotation) : sample.rotation,
    translation: seam.dt && sample.translation ? sample.translation.map((v, i) => v + seam.dt[i] * u) : sample.translation,
    scale: sample.scale,
  };
}

/** THE SAMPLER for one looping clip state on its source: `under` (the frame's sampler) for every track, with the clip's
 *  own tracks carried over its seam in the last window of its loop. `window` the loop's ({ start, stop }). */
export function seamSampler(under, sampleTrack, state, source, window) {
  if (!state || !source || !window || !(window.stop > window.start)) return under;
  const own = source.trackMap;
  if (!(own instanceof Map)) return under;
  const span = window.stop - window.start, w = Math.min(LOOP_SEAM.window, span * LOOP_SEAM.share);
  return (track, time) => {
    const s = under(track, time);
    if (!track || track.__overlay || !(time > window.stop - w)) return s;
    const seam = seamOf(track, window, sampleTrack);
    return seam ? carryOverSeam(s, seam, smooth((time - (window.stop - w)) / w)) : s;
  };
}

/** The rig's door (combat/fpArm.js): the frame's sampler `under`, carried over the seam of `state` when it is a looping
 *  movement or idle clip and the switch is `on`; `loopWindow` leftArmLayer.js's. Memoised on its inputs. */
/**
 * CLIP-SMOOTH (2026-10-29, Proving-Ground.md; the owner: "my animations are better, but there is no smoothness - much
 * sharpness from the mix of packs"): a clip's keys are joined by straight lines (the reference's interpolation - linear,
 * and slerp for every rotation, MW-D33), so at every key the motion changes speed at once - the pelvis of Morrowind
 * Animation Overhaul's run has one or two position keys a second. The third-person sampler reads the clip at the time
 * asked and `h` seconds either side, weighted 1/4, 1/2, 1/4: the corners of the lines rounded over 2h, the curve's own
 * shape and timing kept. On by default; the viewer's switch is uiPrefs `mwClipSmooth` (false turns it off).
 */
export const CLIP_SMOOTH = Object.freeze({ h: 1 / 60 });
const nlerpQ = (a, b, w) => {
  const sg = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q = a.map((v, i) => v + (b[i] * sg - v) * w), l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => v / l);
};
/** `under` read with its corners rounded (CLIP_SMOOTH). */
export function smoothSampler(under, h = CLIP_SMOOTH.h) {
  return (track, time) => {
    const a = under(track, time - h), b = under(track, time), c = under(track, time + h);
    const mix = (x, y, z) => (x && y && z ? y.map((v, i) => 0.25 * x[i] + 0.5 * v + 0.25 * z[i]) : y);
    return {
      rotation: a.rotation && b.rotation && c.rotation ? nlerpQ(nlerpQ(a.rotation, c.rotation, 0.5), b.rotation, 0.5) : b.rotation,
      translation: mix(a.translation, b.translation, c.translation),
      scale: b.scale,
    };
  };
}

export function createLoopSeam({ sampleTrack, loopWindow }) {
  let memo = null;
  let smoothMemo = null;
  const smoothOf = (under) => { if (!smoothMemo || smoothMemo.under !== under) smoothMemo = { under, fn: smoothSampler(under) }; return smoothMemo.fn; };
  return {
    sampler(under, state, source, on = true) {
      const smooth = on && smoothOn();   // CLIP-SMOOTH: every clip's corners rounded, a loop's seam carried first
      if (!on || !state || !source || !/^(walk|run|sneak|turn|swim|idle)/.test(String(state.group ?? ''))) return smooth ? smoothOf(under) : under;
      if (memo && memo.under === under && memo.state === state && memo.source === source && memo.smooth === smooth) return memo.fn;
      const seam = seamSampler(under, sampleTrack, state, source, loopWindow(state, source.keys));
      memo = { under, state, source, smooth, fn: smooth ? smoothSampler(seam) : seam };
      return memo.fn;
    },
  };
}
