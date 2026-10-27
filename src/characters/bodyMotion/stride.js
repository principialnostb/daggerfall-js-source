// @ts-check
// STRIDE (2026-10-27, MOTION-DOCTRINE; the owner: "run all the animations, walk to run, every variation - I see many
// small problem moments"). MEASURED on the retail clips (Morrowind.bsa xbase_anim.kf, the port's own readers): the
// walk's accumulation root travels 154 MW units a second (2.2 m/s), the run's 223 (3.2 m/s), the sneak's 33.5
// (0.48 m/s) - and Daggerfall moves its body far faster (player/motor.js at Speed 50: a walk 4.4 m/s, a run 8.1, a
// crouched walk about 1.9). The reference plays a movement clip at the body's speed over the clip's
// (character.cpp:2392-2408, combat/fpArm.js refreshMovement), so the feet never slide - and so every Daggerfall walk
// played its legs at 2x, every run at 2.5x, every sneak at 4x: the frantic little steps of a sped-up film.
// The port's answer (a departure from that rate, presentation only): the speed's ratio `k` is SHARED between the
// cadence and the stride - the clip plays at `k ** CADENCE` and the legs swing `k / cadence` as far about their own
// mean pose of the cycle (thighs and calves, their turn from the cycle's mean scaled), never past `maxStride`; the
// planted foot then crosses the ground at the body's speed as before, in longer, fewer steps. A longer stride stands
// the hips higher over a straightened leg, so the body is lowered by however much the lower foot rose (`ground`): it
// keeps the ground the clip stood it on. The body-motion gait (BODY-MOTION, Body-Motion.md) drew its own legs instead
// and the fork took that out (2026-10-21): this keeps the clip's legs and only lengthens them.

import { rotAxisAngle, rotationPart } from '../../combat/climbRig.js';
import { quatToMat33, poseSkeleton, skeletonSpaceMatrices, accumRootRef, GRAPH_ROOT } from '../../formats/morrowind/mwSkin.js';
import { ease, mul, transpose, apply, clamp01 } from './bodyKit.js';

/** `cadence` the exponent of the ratio the clip plays at (0.5: the ratio shared evenly), `maxStride` the most the legs
 *  swing past their own, `ease` seconds the stride comes on and off with the movement, `samples` per cycle for its mean
 *  pose, `bones` the legs that swing. */
export const STRIDE = Object.freeze({
  cadence: 0.5, maxStride: 1.45, ease: 0.12, samples: 24,
  bones: Object.freeze(['bip01 l thigh', 'bip01 r thigh', 'bip01 l calf', 'bip01 r calf']),
  feet: Object.freeze(['bip01 l foot', 'bip01 r foot']),
});

/** THE SHARE of a speed ratio `k` (the body's speed over the clip's): the clip's playback `rate` and the legs' `stride`.
 *  `rate * stride === k` until the stride's cap, past which the rate takes the rest. */
export function strideShare(k) {
  if (!(k > 1)) return { rate: Math.max(0, k || 0), stride: 1 };
  const stride = Math.min(STRIDE.maxStride, k ** (1 - STRIDE.cadence));
  return { rate: k / stride, stride };
}

/** The rotation `D` (row-major 3x3) raised to the power `p`: its angle times p about its own axis. */
function powRot(D, p) {
  const c = Math.max(-1, Math.min(1, (D[0] + D[4] + D[8] - 1) / 2));
  const angle = Math.acos(c);
  if (angle < 1e-7) return D;
  const sn = 2 * Math.sin(angle);
  let axis = [(D[7] - D[5]) / sn, (D[2] - D[6]) / sn, (D[3] - D[1]) / sn];
  const l = Math.hypot(axis[0], axis[1], axis[2]);
  if (!(l > 1e-6)) return D;   // a half turn: no stride is that far from its mean
  axis = axis.map((v) => v / l);
  return Array.from(rotAxisAngle(axis, angle * p));
}

/** @type {WeakMap<object, Map<string, number[] | null>>} */
const MEANS = new WeakMap();
/** THE CYCLE'S MEAN TURN of a leg bone (a quaternion in the tracks' own [w, x, y, z]), off the clip state's loop window on its source - once per source,
 *  group and bone. Null where the source has no track for it. */
export function cycleMean(state, source, bone, sampleTrack, window) {
  const tracks = source?.trackMap;
  const track = tracks instanceof Map ? tracks.get(bone) : null;
  if (!track) return null;
  const key = `${String(state?.group ?? '').toLowerCase()}|${bone}|${window.start}|${window.stop}`;
  let memo = MEANS.get(source);
  if (memo?.has(key)) return memo.get(key) ?? null;
  const acc = [0, 0, 0, 0];
  let ref = null;
  for (let i = 0; i < STRIDE.samples; i++) {
    const q = sampleTrack(track, window.start + (window.stop - window.start) * (i + 0.5) / STRIDE.samples)?.rotation;
    if (!q) continue;
    ref ??= q;
    const s = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? -1 : 1;
    for (let j = 0; j < 4; j++) acc[j] += q[j] * s;
  }
  const l = Math.hypot(...acc);
  const mean = l > 1e-9 ? acc.map((v) => v / l) : null;
  if (!memo) { memo = new Map(); MEANS.set(source, memo); }
  memo.set(key, mean);
  return mean;
}

/**
 * THE LEGS LENGTHENED on a posed frame: each leg bone's local turn from its cycle's mean scaled by `stride` (toward 1 by
 * `w`), then the body lowered by the rise of its lower foot. `means` bone name -> mean quaternion; `pose` the frame's
 * locals (written, never mutated in place); answers how far it lowered the body (rig units), or null when it did nothing.
 */
export function lengthenLegs(skeleton, pose, rootRef, skelMats, { stride = 1, w = 1, means = null, rootBone = 'bip01' } = {}) {
  const s = 1 + (stride - 1) * clamp01(w);
  if (!(Math.abs(s - 1) > 1e-4) || !means || !skeleton?.byName) return null;
  const feet = STRIDE.feet.map((n) => skeleton.byName.get(n)).filter((r) => r != null);
  const before = feet.length ? skelMats(skeleton, pose, rootRef) : null;
  const lowBefore = before ? Math.min(...feet.map((r) => before.get(r)?.t?.[2] ?? Infinity)) : null;
  let did = false;
  for (const name of STRIDE.bones) {
    const ref = skeleton.byName.get(name), mean = means.get(name);
    if (ref == null || !mean) continue;
    const local = pose.get(ref) ?? skeleton.nodes.get(ref)?.rest;
    if (!local?.rotation) continue;
    const M = quatToMat33(mean);
    const D = mul(local.rotation, transpose(M));
    pose.set(ref, { rotation: Float32Array.from(mul(powRot(D, s), M)), translation: local.translation, scale: local.scale });
    did = true;
  }
  if (!did) return null;
  if (!feet.length || !Number.isFinite(lowBefore)) return 0;
  const after = skelMats(skeleton, pose, rootRef);
  const dz = Math.min(...feet.map((r) => after.get(r)?.t?.[2] ?? Infinity)) - lowBefore;
  const root = skeleton.byName.get(rootBone);
  if (!(Math.abs(dz) > 1e-3) || root == null) return 0;
  const node = skeleton.nodes.get(root), local = pose.get(root) ?? node.rest;
  const parent = node.parent != null ? after.get(node.parent) : null;
  let lv = [0, 0, -dz];
  if (parent) {
    const sp = Math.hypot(parent.a[0], parent.a[3], parent.a[6]) || 1;   // bodySolve.js moveSubtree's: the rig vector in the parent's frame
    lv = apply(transpose(rotationPart(parent.a)), lv).map((v) => v / sp);
  }
  pose.set(root, { rotation: local.rotation, translation: [local.translation[0] + lv[0], local.translation[1] + lv[1], local.translation[2] + lv[2]], scale: local.scale });
  return dz;
}

/** `ground` units over the cycle's lowest foot a foot still counts as planted; `minShare` the least share of the root's
 *  speed a measure is believed at (a clip whose feet barely touch keeps the reference's velocity). */
export const FOOT_SPEED = Object.freeze({ ground: 1.5, hz: 60, minShare: 0.5 });

/** @type {WeakMap<object, Map<string, number | null>>} */
const FEET = new WeakMap();
/**
 * THE CLIP'S TRUE PACE (FOOT-SPEED): how fast its planted foot crosses the ground (MW units a second at rate 1),
 * measured off the skeleton over the loop - the speed the body must move at for the feet to stand still. The reference
 * divides by the accumulation root's travel (mwAnim.js animVelocity), and retail's clips do not keep their feet to it:
 * a run's planted foot crosses 202 units a second against its root's 223, a sideways run's 74 against 104 (Morrowind.bsa,
 * measured), so a run slid 10 and a strafe 29 per cent. Null where nothing stands on the ground long enough to tell.
 */
export function clipFootSpeed(state, source, skeleton, window, sampleTrack, { poseSkeleton, skeletonSpaceMatrices, accumRootRef, root }) {
  const tracks = source?.trackMap;
  if (!(tracks instanceof Map) || !skeleton?.byName || !(window?.stop > window?.start)) return null;
  const key = `${String(state?.group ?? '').toLowerCase()}|${window.start}|${window.stop}`;
  let memo = FEET.get(source);
  if (memo?.has(key)) return memo.get(key) ?? null;
  const L = skeleton.byName.get(STRIDE.feet[0]), R = skeleton.byName.get(STRIDE.feet[1]);
  let speed = null;
  if (L != null && R != null) {
    const accum = accumRootRef(skeleton, tracks), dt = 1 / FOOT_SPEED.hz;
    const at = (t) => { const m = skeletonSpaceMatrices(skeleton, poseSkeleton(skeleton, tracks, sampleTrack, t, { accumRoot: accum }), root); return [m.get(L).t, m.get(R).t]; };
    const frames = [];
    for (let t = window.start; t <= window.stop + 1e-9; t += dt) frames.push(at(Math.min(t, window.stop)));
    const ground = Math.min(...frames.map(([a, b]) => Math.min(a[2], b[2])));
    let sum = 0, n = 0;
    for (let i = 1; i < frames.length; i++) {
      const side = frames[i][0][2] < frames[i][1][2] ? 0 : 1, was = frames[i - 1][0][2] < frames[i - 1][1][2] ? 0 : 1;
      const f = frames[i][side], p = frames[i - 1][side];
      if (side === was && f[2] < ground + FOOT_SPEED.ground) { sum += Math.hypot(f[0] - p[0], f[1] - p[1]) / dt; n++; }
    }
    speed = n >= 4 ? sum / n : null;
  }
  if (!memo) { memo = new Map(); FEET.set(source, memo); }
  memo.set(key, speed);
  return speed;
}

/** THE LAYER: the stride the movement asks, eased on and off, and the cycle means of the clip that walks. */
export function createStride({ sampleTrack, loopWindow }) {
  let w = 0, stride = 1, means = null, slotMemo = null;
  const layer = {
    /** One frame: `on` (the switch, the third person), the movement's clip `state`, its `source`, and the speed ratio
     *  `k` it was asked to cover (the body's speed over the clip's). */
    step(dt, { on = false, state = null, source = null, k = 1 } = {}) {
      const share = strideShare(k);
      const live = !!on && !!state && !!source && share.stride > 1.0001;
      if (live) {
        stride = share.stride;
        const win = loopWindow(state, source.keys);
        means = new Map(STRIDE.bones.map((b) => [b, cycleMean(state, source, b, sampleTrack, win)]));
      }
      w = ease(w, live ? 1 : 0, STRIDE.ease, dt);
      if (!live && w < 1e-3) { w = 0; means = null; stride = 1; }
      return w;
    },
    /** The rig's frame (combat/fpArm.js, positional so the host spends one line): `on` the switch in third person, the
     *  movement's clip `state` and `source`, the frame's `cam` (its `move.speed`, m/s) and the clip's own speed (MW
     *  units a second). A turn in place plays at its own rate and takes no stride. */
    stepRig(dt, on, state, source, cam, animSpeed, unitsPerMetre) {
      const turning = /^turn/.test(String(state?.group ?? ''));
      const k = animSpeed > 0 ? ((Number(cam?.move?.speed) || 0) * unitsPerMetre) / animSpeed : 1;
      return layer.step(dt, { on: !!on && !turning, state, source, k });
    },
    /** THE DIVISOR the movement's rate is read against (FOOT-SPEED): the clip's planted-foot pace on `skeleton` where it
     *  is believable, else `rootVel` (the reference's) - and the reference's whenever the switch is off. */
    pace(source, state, skeleton, rootVel, on) {
      if (!on || !source || !state || !skeleton) return rootVel;
      const fs = clipFootSpeed(state, source, skeleton, loopWindow(state, source.keys), sampleTrack, { poseSkeleton, skeletonSpaceMatrices, accumRootRef, root: GRAPH_ROOT });
      return fs != null && fs > rootVel * FOOT_SPEED.minShare && fs > 1 ? fs : rootVel;
    },
    /** The clip's playback rate for a speed ratio `k`, the switch `on`: the share's, or the reference's `k`. */
    rate: (k, on) => (on ? strideShare(k).rate : k),
    weight: () => w,
    stride: () => stride,
    /** poseAssembly's `motion` slot with the legs lengthened before `inner` (the lean, the body motion) sees them. */
    slot(inner) {
      if (slotMemo && slotMemo.inner === inner) return slotMemo.fn;
      slotMemo = { inner, fn: (skeleton, pose, rootRef, skelMats) => {
        if (w > 1e-3 && means) lengthenLegs(skeleton, pose, rootRef, skelMats, { stride, w, means });
        return inner ? inner(skeleton, pose, rootRef, skelMats) : null;
      } };
      return slotMemo.fn;
    },
  };
  return layer;
}
