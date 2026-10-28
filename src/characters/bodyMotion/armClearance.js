// @ts-check
// ARM-CLEARANCE (2026-10-28, MOTION-DOCTRINE 7c; the owner, holding a claymore in Skyrim's plate: "the left arm goes
// into the body with this pose"). Measured in the owner's game: the claymore stance's left elbow stood 0.08-0.13 m off
// the spine's axis - inside a cuirass - and it is the CLIP's (the stance's idle and walks hold the left arm; the carry's
// haft grip never takes it there), drawn for Morrowind's slight bodies, not for plate. So the elbow is cleared where the
// clip leaves it: an elbow inside the trunk's radius (a share of the body's shoulder width, wider in heavier armour)
// swings the arm about the line from its shoulder to its wrist - the hand stays where the clip put it, its turn kept -
// the least way out, never past `maxTurn`. The port's own; Daggerfall Unity draws no arm, the clips none to plate.

import { bodyOf, turnOf, at, mul, transpose, algebra } from './bodyKit.js';
import { rotAxisAngle, orthonormal } from '../../combat/climbRig.js';
import { bodyFrames } from './bodySolve.js';

const { sub, add, scale, dot, norm, len } = algebra;

/** The trunk as an ellipse about the chest, in shares of the shoulder width: `width` side to side and `depth` front to
 *  back (half-axes, bare), `armor` added to both at full armour; `maxTurn` radians, `step` the search's. The retail
 *  body's shoulders stand 21.75 units apart, its elbows hang 14 out: a hanging arm is clear, a crossed one is not. */
export const ARM_CLEARANCE = Object.freeze({ width: 0.5, depth: 0.42, armor: 0.14, maxTurn: 0.9, step: 0.05 });

/** How far out of the trunk's ellipse `p` stands (rig space: x the right, y the facing, z up; 1 on its edge). */
const outOf = (p, c, a, b) => Math.hypot((p[0] - c[0]) / a, (p[1] - c[1]) / b);

/** CLEAR THE ARMS of the trunk on a posed frame: `armor` the armour's weight 0..1 (bodyWeight.js bodyWeightOf's).
 *  Writes new entries into `pose`; answers the turns made { L, R } (radians), or null when the skeleton is no biped. */
export function clearArms(skeleton, pose, rootRef, skelMats, { armor = 0 } = {}) {
  const body = bodyOf(skeleton, rootRef, skelMats);
  if (!body || !body.bones?.L || !body.bones?.R) return null;
  const mats = skelMats(skeleton, pose, rootRef);
  const chest = at(mats, body.chest), pelvis = at(mats, body.bones.pelvis);
  const frame = bodyFrames(body, mats);
  if (!chest || !pelvis || !frame) return null;
  const sw = body.shoulderWidth || 0, extra = ARM_CLEARANCE.armor * Math.max(0, Math.min(1, armor));
  const A = sw * (ARM_CLEARANCE.width + extra), Bd = sw * (ARM_CLEARANCE.depth + extra);
  const out = { L: 0, R: 0 };
  if (!(A > 0 && Bd > 0)) return out;
  // The armour turns with the chest. Rig-space x/y only describes a facing,
  // upright body; a turned guard otherwise clears against the wrong ellipse.
  const local = (p) => { const d = sub(p, chest); return [dot(d, frame.right), dot(d, frame.fwd), dot(d, frame.up)]; };
  const offAxis = (p) => outOf(local(p), [0, 0, 0], A, Bd);
  const bottom = dot(sub(pelvis, chest), frame.up);
  const clearance = (S, E, W) => {
    // Include the flesh between joints: a clear elbow can still leave most
    // of the forearm inside the cuirass. Keep the fixed shoulder/wrist out.
    const points = [E, add(scale(S, 0.25), scale(E, 0.75)), add(scale(E, 0.75), scale(W, 0.25)), add(scale(E, 0.5), scale(W, 0.5))];
    const trunk = points.filter(p => local(p)[2] >= bottom && local(p)[2] <= 0);
    return trunk.length ? Math.min(...trunk.map(offAxis)) : 1;
  };
  for (const side of ['L', 'R']) {
    const b = body.bones[side];
    const S = at(mats, b.upper), E = at(mats, b.fore), W = at(mats, b.hand);
    if (!S || !E || !W || clearance(S, E, W) >= 1) continue;
    const a = norm(sub(W, S));
    if (!(len(a) > 0.5)) continue;
    const along = scale(a, dot(sub(E, S), a)), e0 = sub(sub(E, S), along);
    const elbowAt = (th) => add(add(S, along), apply3(rotAxisAngle(a, th), e0));
    let best = 0, bestD = clearance(S, E, W);
    for (let k = 1; k * ARM_CLEARANCE.step <= ARM_CLEARANCE.maxTurn + 1e-9; k++) {
      let done = false;
      for (const th of [k * ARM_CLEARANCE.step, -k * ARM_CLEARANCE.step]) {
        const d = clearance(S, elbowAt(th), W);
        if (d > bestD + 1e-6) { bestD = d; best = th; }
        if (d >= 1) { best = th; done = true; break; }
      }
      if (done) break;
    }
    if (!best) continue;
    const Q = rotAxisAngle(a, best);
    const upper = skeleton.nodes.get(b.upper), hand = skeleton.nodes.get(b.hand);
    const Wu = turnOf(mats, b.upper), Wp = upper?.parent != null ? turnOf(mats, upper.parent) : null;
    const Wf = turnOf(mats, b.fore), Wh = turnOf(mats, b.hand);
    if (!upper || !hand || !Wu || !Wf || !Wh) continue;
    const lu = pose.get(b.upper) ?? upper.rest, lh = pose.get(b.hand) ?? hand.rest;
    pose.set(b.upper, { rotation: orthonormal(mul(Wp ? transpose(Wp) : IDENT, mul(Q, Wu))), translation: lu.translation, scale: lu.scale });
    // the hand keeps its turn in the world: its parent (the forearm) turned with the arm by Q
    pose.set(b.hand, { rotation: orthonormal(mul(transpose(mul(Q, Wf)), Wh)), translation: lh.translation, scale: lh.scale });
    out[side] = best;
  }
  return out;
}

const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** A row-major 3x3 applied to a column vector. */
function apply3(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
