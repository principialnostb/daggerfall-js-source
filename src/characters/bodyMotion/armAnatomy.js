// @ts-check
// A held weapon fixes the wrist and palm, not the forearm's axial rotation.
import { mat33ToQuat } from '../../combat/heldPose.js';
import { rotAxisAngle, solveReach, rotFromTo, rotFrames, orthonormal } from '../../combat/climbRig.js';
import { algebra, apply, mul, transpose, clamp, RAD, bodyOf, turnOf, at } from './bodyKit.js';
const { sub, add, scale, dot, cross, norm, len } = algebra;
// Pose-local ownership also survives frames where the carry yields to an attack.
const heldPoses = new WeakMap();
export function markHeldPose(pose, states, weight) { heldPoses.set(pose, { states, weight }); }
export function heldPoseAnatomy(pose) { return heldPoses.get(pose) ?? null; }

/** `trunkGive` (TRUNK-SKIN): how much deeper (shoulder widths) the wrist's ease may take the elbow into the trunk than
 *  the preferred elbow stood - a graze the wrist's own skin is worth (ARM-ANATOMY's volume pins), never a fold. */
export const ARM_ANATOMY = Object.freeze({ wristBend: 60 * RAD, foreTurn: 100 * RAD, turnSpeed: 540 * RAD, trunkGive: 0.15 });

/** Keep the preferred elbow unless it unnecessarily bends the held wrist. The
 * closest feasible elbow on the shoulder/wrist circle leaves both endpoints fixed. */
export function wristPole(shoulder, wrist, fingers, upperLength, foreLength, preferred, weight = 1, inside = null) {
  if (!fingers || !preferred) return preferred;
  const d = norm(sub(wrist, shoulder)), f = norm(fingers), fp = sub(f, scale(d, dot(f, d)));
  if (len(fp) < 1e-6) return preferred;
  const sol = solveReach(shoulder, upperLength, foreLength, wrist, preferred, 0.999);
  const along = dot(sub(sol.mid, shoulder), d), center = add(shoulder, scale(d, along));
  const radius = len(sub(sol.mid, center));
  if (radius < 1e-6) return preferred;
  const best = scale(norm(fp), -1), own = norm(sub(sol.mid, center));
  const angle = Math.atan2(dot(cross(best, own), d), dot(best, own));
  const limit = Math.acos(clamp((foreLength * Math.cos(ARM_ANATOMY.wristBend) - dot(sub(sol.end, center), f)) / (radius * len(fp)), -1, 1));
  const wanted = clamp(angle, -limit, limit), turn = (wanted - angle) * weight;
  // TRUNK-SKIN (2026-11-06, the owner's 19-47-18 recording: running with a two-hander, the right shoulder in the chest):
  // the wrist's ease never takes the elbow deeper into the trunk than the preferred elbow stood - a run's held right arm,
  // its fingers trailing the blade down behind, swung its elbow round to the breastbone once a stride, 9.8 units into a
  // woman's chest. The wrist bends past its ease instead, by as little of the turn as the trunk allows (trunkGive).
  if (inside && Math.abs(turn) > 1e-6) {
    const elbow = (t) => add(center, scale(apply(rotAxisAngle(d, t), own), radius));
    const was = inside(add(center, scale(own, radius)), shoulder) + ARM_ANATOMY.trunkGive;
    for (let f = 1; f > 0; f -= 0.125) if (inside(elbow(turn * f), shoulder) <= was) return norm(apply(rotAxisAngle(d, turn * f), own));
    return own;
  }
  return norm(apply(rotAxisAngle(d, turn), own));
}

/** Minimise the larger of the elbow/forearm and forearm/hand bind-relative
 * turns. Only the forearm rotates about its own axis; the elbow plane, wrist,
 * palm and weapon remain fixed. Candidate extrema and equal-cost crossings
 * solve the one-axis problem without searching a grid each frame. */
export function balanceForearm(upper, fore, hand, axis, restFore, restHand, weight = 1, state = null) {
  const e = mat33ToQuat(mul(mul(transpose(upper), fore), transpose(restFore)));
  const h = mat33ToQuat(mul(mul(transpose(fore), hand), transpose(restHand)));
  const ea = apply(transpose(upper), axis), ha = apply(transpose(fore), axis);
  const A = e[0], B = -dot(e.slice(1), ea), C = h[0], D = dot(h.slice(1), ha);
  const limit = ARM_ANATOMY.foreTurn;
  const candidates = [0, -limit, limit];
  for (const angle of [2 * Math.atan2(B, A), 2 * Math.atan2(D, C),
    2 * Math.atan2(-(A - C), B - D), 2 * Math.atan2(-(A + C), B + D)]) {
    for (const offset of [-2 * Math.PI, 0, 2 * Math.PI]) if (Math.abs(angle + offset) <= limit) candidates.push(angle + offset);
  }
  const cost = (angle) => {
    const c = Math.cos(angle / 2), s = Math.sin(angle / 2);
    return 1 - Math.min(Math.abs(A * c + B * s), Math.abs(C * c + D * s));
  };
  let angle = 0, score = cost(0);
  for (const candidate of candidates) {
    const next = cost(candidate);
    if (next < score - 1e-8 || (Math.abs(next - score) < 1e-8 && Math.abs(candidate - (state?.angle ?? 0)) < Math.abs(angle - (state?.angle ?? 0)))) {
      angle = candidate; score = next;
    }
  }
  angle *= weight;
  if (state && Number.isFinite(state.dt) && Number.isFinite(state.frame)) {
    if (state.seen !== state.frame) { state.start = state.angle ?? angle; state.seen = state.frame; }
    const step = ARM_ANATOMY.turnSpeed * Math.max(0, state.dt ?? 0);
    angle = clamp(angle, state.start - step, state.start + step);
    state.angle = angle;
  }
  return mul(rotAxisAngle(axis, angle), fore);
}


/** Clearance can move the elbow after the grip solve. Rebalance its twist last,
 * preserving every joint position and the hand's rig-space rotation. */
export function relaxHeldArms(skeleton, pose, root, skelMats, states) {
  const body = bodyOf(skeleton, root, skelMats);
  if (!body || !states) return;
  const mats = skelMats(skeleton, pose, root, [body.bones.L.hand, body.bones.R.hand]);
  for (const side of ['L', 'R']) {
    const b = body.bones[side], upper = turnOf(mats, b.upper), fore = turnOf(mats, b.fore), hand = turnOf(mats, b.hand);
    const axis = norm(sub(at(mats, b.hand), at(mats, b.fore)));
    const plane = norm(cross(sub(at(mats, b.fore), at(mats, b.upper)), axis));
    if (len(plane) < 1e-5) continue;
    const neutral = mul(rotFrames(axis, apply(fore, body.armHinge[side].fore), axis, plane), fore);
    const node = skeleton.nodes.get(b.fore), hn = skeleton.nodes.get(b.hand);
    let balanced = balanceForearm(upper, neutral, hand, axis, node.rest.rotation, hn.rest.rotation, states.weight ?? 1, states.states?.[side]);
    const memory = states.states?.[side];
    if (memory) {
      if (memory.worldFrame !== memory.frame) { memory.worldStart = memory.world; memory.axisStart = memory.axis; memory.worldFrame = memory.frame; }
      if (memory.worldStart && memory.axisStart) {
        const localBefore = apply(transpose(memory.worldStart), memory.axisStart), localNow = apply(transpose(fore), axis);
        const transported = mul(mul(rotFromTo(memory.axisStart, axis), memory.worldStart), rotFromTo(localNow, localBefore));
        const delta = mul(balanced, transpose(transported));
        const sine = dot(axis, [delta[7] - delta[5], delta[2] - delta[6], delta[3] - delta[1]]) / 2;
        const turn = Math.atan2(sine, (delta[0] + delta[4] + delta[8] - 1) / 2);
        const step = ARM_ANATOMY.turnSpeed * Math.max(0, memory.dt ?? 0);
        balanced = mul(rotAxisAngle(axis, clamp(turn, -step, step)), transported);
      }
      balanced = orthonormal(mul(rotFromTo(apply(balanced, norm((pose.get(b.hand) ?? hn.rest).translation)), axis), balanced));
      memory.world = balanced; memory.axis = axis;
    }
    const fl = pose.get(b.fore) ?? node.rest, hl = pose.get(b.hand) ?? hn.rest;
    pose.set(b.fore, { ...fl, rotation: orthonormal(mul(transpose(upper), balanced)) });
    pose.set(b.hand, { ...hl, rotation: orthonormal(mul(transpose(balanced), hand)) });
  }
}
