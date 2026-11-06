// @ts-check
// Experimental replacement of the return only; the attack and steady carry supply endpoints.
import { blendPoseMaps } from '../../formats/morrowind/mwSkin.js';
import { solveReach, rotFromTo, rotationPart, orthonormal } from '../../combat/climbRig.js';
import { bodyFrames } from './bodySolve.js';
import { bodyOf, algebra, mul, transpose, apply } from './bodyKit.js';
const { sub, norm, len, add, scale, dot } = algebra;
const goals = new WeakMap();
// One seventh-degree Bezier arc: three repeated controls at each end
// give zero endpoint velocity/acceleration without stops inside the return.
export const RETURN_BEATS = Object.freeze([0, 0, 0, 0.18, 0.14, 0, 0, 0].map((forward, i) =>
  Object.freeze({ forward, up: [0, 0, 0, 0.11, 0.07, 0, 0, 0][i] })));
export function recoveryOffset(progress, forward, up, armLength) {
  const t = Math.max(0, Math.min(1, progress));
  const controls = RETURN_BEATS.map((p) => [p.forward, p.up]);
  for (let count = controls.length - 1; count > 0; count--) for (let i = 0; i < count; i++) {
    controls[i] = controls[i].map((x, j) => x + (controls[i + 1][j] - x) * t);
  }
  return add(scale(forward, controls[0][0] * armLength), scale(up, controls[0][1] * armLength));
}
export const returnProgress = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * u * (10 + u * (-15 + 6 * u)); };

export const freshReturnEnabled = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('fresh2hReturn') !== '0';
export function setReturnGoal(pose, goal, live = false) { goals.set(pose, { pose: goal, live }); }

/** Two world-space endpoint poses, one clock; solve the arm to the interpolated
 * wrist and elbow, retaining interpolated axial roll rather than resetting it.
 * Hand attachment correction happens on the interpolated weapon frame. */
export function interpolateReturn(skeleton, pose, from, goal, root, skelMats, progress, authored = true) {
  const body = bodyOf(skeleton, root, skelMats);
  if (!body) return;
  const a = skelMats(skeleton, from, root), z = skelMats(skeleton, goal, root), current = skelMats(skeleton, pose, root);
  const chest = current.get(body.chest), chestTurn = rotationPart(chest.a);
  const samples = (m) => {
    const origin = m.get(body.chest), turn = mul(chestTurn, transpose(rotationPart(origin.a)));
    return new Map([...m].map(([ref, v]) => [ref, {
      rotation: mul(turn, rotationPart(v.a)), translation: add(chest.t, apply(turn, sub(v.t, origin.t))), scale: 1,
    }]));
  };
  const t = Math.max(0, Math.min(1, progress)), u = returnProgress(t);
  const desired = blendPoseMaps(samples(a), samples(z), u);
  const frame = bodyFrames(body, current);
  const offset = authored ? recoveryOffset(t, frame.fwd, frame.up, body.arm) : [0, 0, 0];
  const write = (ref, parent, world) => {
    const local = pose.get(ref) ?? skeleton.nodes.get(ref).rest;
    pose.set(ref, { ...local, rotation: orthonormal(mul(transpose(parent), world)) });
  };
  const hand = (side, wrist = null) => {
    const b = body.bones[side], S = current.get(b.upper).t, d = desired.get(b.hand), W = wrist ?? add(d.translation, offset);
    const E0 = desired.get(b.fore).translation, pole = sub(add(E0, scale(offset, 0.5)), S);
    const A = len(sub(current.get(b.fore).t, S)), B = len(sub(current.get(b.hand).t, current.get(b.fore).t));
    const sol = solveReach(S, A, B, W, pole, 0.999);
    const ru = desired.get(b.upper).rotation, rf = desired.get(b.fore).rotation;
    const upperAxis = norm(sub(desired.get(b.fore).translation, desired.get(b.upper).translation));
    const foreAxis = norm(sub(d.translation, desired.get(b.fore).translation));
    const U = mul(rotFromTo(upperAxis, norm(sub(sol.mid, S))), ru);
    const F = mul(rotFromTo(foreAxis, norm(sub(sol.end, sol.mid))), rf);
    write(b.upper, rotationPart(current.get(skeleton.nodes.get(b.upper).parent).a), U);
    write(b.fore, U, F); write(b.hand, F, d.rotation);
  };
  hand('R');
  // On the close two-hander, pin the actual left attachment to the shaft,
  // compensating for the interpolated palm's offset from its wrist.
  let left = null;
  if (body.wbL != null && body.wb != null) {
    const m = skelMats(skeleton, pose, root), wb = m.get(body.wb), lb = current.get(body.wbL), lh = current.get(body.bones.L.hand);
    const axis = norm([wb.a[1], wb.a[4], wb.a[7]]), target = add(desired.get(body.wbL).translation, offset);
    const grip = add(wb.t, scale(axis, dot(sub(target, wb.t), axis)));
    const off = apply(mul(desired.get(body.bones.L.hand).rotation, transpose(rotationPart(lh.a))), sub(lb.t, lh.t));
    left = sub(grip, off);
  }
  hand('L', left);
}

// The arm solve follows the current chest. Join that chest to the live clip too,
// otherwise a raw upper-body clip switch is faithfully carried into both hands.
function joinTrunk(skeleton, pose, from, root, skelMats, progress) {
  const body = bodyOf(skeleton, root, skelMats);
  if (!body || !from) return;
  const source = new Map(), target = new Map();
  for (const ref of body.trunk) {
    const rest = skeleton.nodes.get(ref).rest;
    source.set(ref, from.get(ref) ?? rest); target.set(ref, pose.get(ref) ?? rest);
  }
  const mixed = blendPoseMaps(source, target, returnProgress(progress));
  for (const ref of body.trunk) {
    const local = pose.get(ref) ?? skeleton.nodes.get(ref).rest;
    const rotation = mixed.get(ref)?.rotation;
    if (rotation) pose.set(ref, { ...local, rotation });
  }
}

export function createFreshReturn({ enabled = freshReturnEnabled, seconds = 0.5, interruptSeconds = 0.08, settleSeconds = 0.16 } = {}) {
  let mode = 'off', active = false, age = 0, last = null, from = null, target = null, dt = 0;
  const layer = {
    step(delta, attacking, allowed) {
      dt = Math.max(0, delta);
      if (!enabled() || !allowed) { layer.reset(); return; }
      const next = !!attacking;
      if (next === active && (mode === 'return' || mode === 'interrupt' || mode === 'settle')) age += dt;
      if (next && !active) {
        if ((mode === 'return' || mode === 'settle' || target) && last) { mode = 'interrupt'; from = last; age = 0; }
        else mode = 'attack';
        target = null;
      } else if (!next && active && last) {
        mode = 'return'; from = last; target = null; age = 0;
      } else if (mode === 'off') mode = next ? 'attack' : 'carry';
      active = next;
    },
    apply(skeleton, pose, root, skelMats) {
      if (!enabled() || mode === 'off') return;
      if (mode === 'return') {
        // Capture once. A recomputed destination is not a transition endpoint.
        const requested = goals.get(pose);
        if (requested && (!target || requested.live)) target = new Map(requested.pose);
        if (target) {
          const progress = Math.min(1, age / seconds);
          joinTrunk(skeleton, pose, from, root, skelMats, progress);
          interpolateReturn(skeleton, pose, from, target, root, skelMats, progress);
          if (progress >= 1) { mode = 'carry'; from = null; }

        } else if (from) interpolateReturn(skeleton, pose, from, from, root, skelMats, 0, false);
      } else if (mode === 'carry' && target) {
        // Cover the short ownership handoff until bodyMotion resumes its steady
        // arms. Never expose the underlying raw clip for those final frames.
        if (goals.has(pose)) {
          const requested = goals.get(pose);
          if (requested.live) target = new Map(requested.pose);
          interpolateReturn(skeleton, pose, target, target, root, skelMats, 1);
        }
        else {
          mode = 'settle'; from = last; target = null; age = 0;
          interpolateReturn(skeleton, pose, from, pose, root, skelMats, 0, false);
        }
      } else if (mode === 'settle') {
        // Join the live carry, including its current breathing/gait phase.
        // A moving destination keeps its own velocity when the blend finishes.
        const progress = Math.min(1, age / settleSeconds);
        interpolateReturn(skeleton, pose, from, new Map(pose), root, skelMats, progress, false);
        if (progress >= 1) { mode = 'carry'; from = null; }
      } else if (mode === 'interrupt') {
        const progress = Math.min(1, age / interruptSeconds), attack = new Map(pose);
        joinTrunk(skeleton, pose, from, root, skelMats, progress);
        interpolateReturn(skeleton, pose, from, attack, root, skelMats, progress, false);
        if (progress >= 1) { mode = 'attack'; from = null; }

      }
      last = new Map(pose);
    },
    status: () => ({ mode, age, hasTarget: !!target }),
    reset() { mode = 'off'; active = false; age = 0; last = null; from = null; target = null; dt = 0; },
  };
  return layer;
}
