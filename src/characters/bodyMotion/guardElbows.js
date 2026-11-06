// @ts-check
// GUARD-ELBOWS (2026-11-07, the owner's 01-06-55 recording: the fists' guard "a little wooden, maybe because the arms
// are spread so far to the sides"). Measured on a woman's body, the hand-to-hand clips (MAO's idlehh / walkforwardhh)
// hold the fists before the chin with the elbows out past the shoulders - 0.53-0.60 arm lengths off the chest's middle,
// where a hanging arm's stands 0.45 - drawn for the retail man's broad chest. A guard keeps its elbows under its fists,
// before the ribs. So each arm is swung about the line from its shoulder to its wrist - ARM-CLEARANCE's own turn: the
// fist stays where the clip holds it, its turn kept, only the elbow travels - a share of the way to straight below that
// line, never past `max`. clearArms runs after it, so an elbow never tucks into the trunk. The port's own; Daggerfall
// Unity draws no arm.

import { bodyOf, turnOf, at, mul, transpose, algebra, ease, clamp01 } from './bodyKit.js';
import { rotAxisAngle, orthonormal } from '../../combat/climbRig.js';
import { bodyFrames } from './bodySolve.js';
import { carryClassOf } from './carry.js';

const { sub, scale, dot, norm, len, cross } = algebra;

/** `tuck` the share of the elbow's way to straight below its shoulder-to-wrist line, `max` radians at most, `ease` the
 *  seconds the guard takes up and lets go (a blow's arms are the blow's). */
export const GUARD_ELBOWS = Object.freeze({ tuck: 0.55, max: 0.6, ease: 0.12 });

/** The share of the tuck the motion word (bodyMotion.js motionWord's) wants: the fists drawn, both hands free, no blow. */
export function guardElbowShare(word) {
  if (!word || !word.on || word.busy || word.equip || word.spell || word.blow || word.shield || word.torch || word.spellHand) return 0;
  return carryClassOf(word) === 'fists' ? 1 : 0;
}

/** The layer: the share eased to the word's, laid on the posed arms. */
export function createGuardElbows() {
  let share = 0;
  return {
    step(dt, on, word) {
      const want = on ? guardElbowShare(word) : 0;
      share = ease(share, want, GUARD_ELBOWS.ease, Math.max(0, dt));
      if (Math.abs(share - want) < 1e-3) share = want;
    },
    /** Swing each elbow in on `pose`; answers the turns made { L, R } (radians). */
    apply(skeleton, pose, rootRef, skelMats) {
      const out = { L: 0, R: 0 };
      const k = clamp01(share) * GUARD_ELBOWS.tuck;
      if (!(k > 1e-4)) return out;
      const body = bodyOf(skeleton, rootRef, skelMats);
      if (!body?.bones?.L || !body.bones.R) return out;
      const mats = skelMats(skeleton, pose, rootRef, [body.chest, body.bones.pelvis, body.bones.L.hand, body.bones.R.hand]);
      const frame = bodyFrames(body, mats);
      if (!frame) return out;
      const down = scale(frame.up, -1);
      for (const side of /** @type {const} */ (['L', 'R'])) {
        const b = body.bones[side];
        const S = at(mats, b.upper), E = at(mats, b.fore), W = at(mats, b.hand);
        if (!S || !E || !W) continue;
        const a = norm(sub(W, S));
        if (!(len(sub(W, S)) > 1e-6)) continue;
        const e0 = sub(sub(E, S), scale(a, dot(sub(E, S), a)));
        const t0 = sub(down, scale(a, dot(down, a)));
        if (!(len(e0) > 1e-6 && len(t0) > 1e-6)) continue;
        const e = norm(e0), t = norm(t0);
        const phi = Math.atan2(dot(cross(e, t), a), dot(e, t));
        const th = Math.max(-GUARD_ELBOWS.max, Math.min(GUARD_ELBOWS.max, k * phi));
        if (Math.abs(th) < 1e-5) continue;
        const Q = rotAxisAngle(a, th);
        const upper = skeleton.nodes.get(b.upper), hand = skeleton.nodes.get(b.hand);
        const Wu = turnOf(mats, b.upper), Wp = upper?.parent != null ? turnOf(mats, upper.parent) : null;
        const Wf = turnOf(mats, b.fore), Wh = turnOf(mats, b.hand);
        if (!upper || !hand || !Wu || !Wf || !Wh) continue;
        const lu = pose.get(b.upper) ?? upper.rest, lh = pose.get(b.hand) ?? hand.rest;
        pose.set(b.upper, { rotation: orthonormal(mul(Wp ? transpose(Wp) : IDENT, mul(Q, Wu))), translation: lu.translation, scale: lu.scale });
        // the fist keeps its turn in the world: its parent (the forearm) turned with the arm by Q
        pose.set(b.hand, { rotation: orthonormal(mul(transpose(mul(Q, Wf)), Wh)), translation: lh.translation, scale: lh.scale });
        out[side] = th;
      }
      return out;
    },
    status: () => share,
    reset() { share = 0; },
  };
}

const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

