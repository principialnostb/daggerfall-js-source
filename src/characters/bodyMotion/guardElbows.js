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
import { guardTraveling } from './guardTravel.js';

const { sub, add, scale, dot, norm, len, cross } = algebra;

/** `tuck` the share of the elbow's way to straight below its shoulder-to-wrist line, `max` radians at most, `ease` the
 *  seconds the guard takes up and lets go (a blow's arms are the blow's). */
export const GUARD_ELBOWS = Object.freeze({ tuck: 0.55, max: 0.6, ease: 0.12 });

// GUARD-RAISE (2026-11-07, the owner's 02-30-02 recording: the fists "pressed into the chest", the guard not a guard).
// Every hand-to-hand pose the game has - idlehh, each blow's start and follow stop, the equip - holds the same guard,
// measured on a woman's body in the chest's frame (right, forward, up; arm lengths): the fists at the chest bone's
// height, 0.33 to the side and 0.69 ahead, the forearms level. A guard stands the fists before the chin. So each fist is
// carried from that guard (`from`) to the chin's (`to`), `keep` of the clip's own motion about it kept (the breath,
// FISTS-PUMP's bob - whole, the walk's swing threw a fist across the chest), the arm laid to it by a two-bone reach, the
// elbow on its own side, the fist's turn in the world kept; the tuck below then brings the elbow under it. The left
// leads, a little further out; the right stands by the chin.
export const GUARD_RAISE = Object.freeze({
  from: Object.freeze({ L: [-0.33, 0.69, 0.09], R: [0.33, 0.69, 0.09] }),
  to: Object.freeze({ L: [-0.26, 0.56, 0.3], R: [0.24, 0.46, 0.36] }),
  keep: 0.5,
  /** how far the reach's elbow leans from its own side toward straight down (0 its side, 1 down) */
  drop: 0.5,
});

/** The share of the tuck the motion word (bodyMotion.js motionWord's) wants: the fists drawn, both hands free, no blow. */
export function guardElbowShare(word) {
  if (!word || !word.on || word.busy || word.equip || word.spell || word.blow || word.shield || word.torch || word.spellHand) return 0;
  return carryClassOf(word) === 'fists' && !guardTraveling(word) ? 1 : 0;
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
      const raised = clamp01(share) ** 3;
      const k = raised * GUARD_ELBOWS.tuck;
      if (!(k > 1e-4)) return out;
      const body = bodyOf(skeleton, rootRef, skelMats);
      if (!body?.bones?.L || !body.bones.R) return out;
      raise(skeleton, pose, rootRef, skelMats, body, raised);   // GUARD-RAISE, before the tuck
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
const mulv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

/** The shortest turn taking unit `a` onto unit `b`. */
function arc(a, b) {
  const axis = cross(a, b), s = len(axis), c = Math.max(-1, Math.min(1, dot(a, b)));
  return s < 1e-9 ? IDENT : rotAxisAngle(scale(axis, 1 / s), Math.atan2(s, c));
}

/** GUARD-RAISE on `pose`, `k` of the way: each fist carried by GUARD_RAISE's step, its arm reaching it. */
function raise(skeleton, pose, rootRef, skelMats, body, k) {
  if (!(k > 1e-4)) return;
  const mats = skelMats(skeleton, pose, rootRef, [body.chest, body.bones.pelvis, body.bones.L.hand, body.bones.R.hand]);
  const F = bodyFrames(body, mats);
  if (!F) return;
  const C = at(mats, body.chest);
  if (!C) return;
  const inWorld = (v) => [0, 1, 2].map((i) => F.right[i] * v[0] + F.fwd[i] * v[1] + F.up[i] * v[2]);
  const inChest = (p) => { const d = sub(p, C); return [dot(d, F.right), dot(d, F.fwd), dot(d, F.up)].map((v) => v / body.arm); };
  for (const side of /** @type {const} */ (['L', 'R'])) {
    const b = body.bones[side];
    const S = at(mats, b.upper), E = at(mats, b.fore), W = at(mats, b.hand);
    const upper = skeleton.nodes.get(b.upper), fore = skeleton.nodes.get(b.fore), hand = skeleton.nodes.get(b.hand);
    if (!S || !E || !W || !upper || !fore || !hand) continue;
    // the fist's place in the chest's frame, the guard's `to` plus `keep` of the clip's motion off its `from`
    const w = inChest(W), from = GUARD_RAISE.from[side], to = GUARD_RAISE.to[side];
    const goal = [0, 1, 2].map((i) => to[i] + GUARD_RAISE.keep * (w[i] - from[i]));
    const step = scale(inWorld(sub(goal, w)), body.arm * k);
    const l1 = len(sub(E, S)), l2 = len(sub(W, E)), reach = sub(add(W, step), S);
    const D = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, len(reach)));
    const d = norm(reach);
    // the elbow on its own side of the reach (its offset off the new line), leaned `drop` toward straight down
    const off = sub(sub(E, S), scale(d, dot(sub(E, S), d))), down = sub(scale(F.up, -1), scale(d, -dot(F.up, d)));
    const own = len(off) > 1e-6 ? norm(off) : norm(down);
    let pole = len(down) > 1e-6 ? add(scale(own, 1 - GUARD_RAISE.drop), scale(norm(down), GUARD_RAISE.drop)) : own;
    pole = len(pole) > 1e-6 ? norm(pole) : own;
    const cosA = Math.max(-1, Math.min(1, (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D)));
    const E2 = add(S, scale(add(scale(d, cosA), scale(pole, Math.sqrt(1 - cosA * cosA))), l1));
    const T = add(S, scale(d, D));
    const Q1 = arc(norm(sub(E, S)), norm(sub(E2, S)));
    const Q2 = arc(norm(mulv(Q1, sub(W, E))), norm(sub(T, E2)));
    const Wu = turnOf(mats, b.upper), Wf = turnOf(mats, b.fore), Wh = turnOf(mats, b.hand);
    const Wp = upper.parent != null ? turnOf(mats, upper.parent) : null, Wfp = turnOf(mats, fore.parent), Whp = turnOf(mats, hand.parent);
    if (!Wu || !Wf || !Wh || !Wfp || !Whp) continue;
    const lu = pose.get(b.upper) ?? upper.rest, lf = pose.get(b.fore) ?? fore.rest, lh = pose.get(b.hand) ?? hand.rest;
    // the upper arm turned by Q1; the forearm's parent rides with it and the forearm turns on by Q2; the fist keeps its turn
    pose.set(b.upper, { rotation: orthonormal(mul(Wp ? transpose(Wp) : IDENT, mul(Q1, Wu))), translation: lu.translation, scale: lu.scale });
    pose.set(b.fore, { rotation: orthonormal(mul(transpose(mul(Q1, Wfp)), mul(Q2, mul(Q1, Wf)))), translation: lf.translation, scale: lf.scale });
    pose.set(b.hand, { rotation: orthonormal(mul(transpose(mul(Q2, mul(Q1, Whp))), Wh)), translation: lh.translation, scale: lh.scale });
  }
}

