// @ts-check
// ARM-CLEARANCE (2026-10-28, MOTION-DOCTRINE 7c; the owner, holding a claymore in Skyrim's plate: "the left arm goes
// into the body with this pose"). Measured in the owner's game: the claymore stance's left elbow stood 0.08-0.13 m off
// the spine's axis - inside a cuirass - and it is the CLIP's (the stance's idle and walks hold the left arm; the carry's
// haft grip never takes it there), drawn for Morrowind's slight bodies, not for plate. So the elbow is cleared where the
// clip leaves it: an elbow inside the trunk's radius (a share of the body's shoulder width, wider in heavier armour)
// swings the arm about the line from its shoulder to its wrist - the hand stays where the clip put it, its turn kept -
// the least way out, never past `maxTurn`. The port's own; Daggerfall Unity draws no arm, the clips none to plate.

import { bodyOf, turnOf, at, mul, transpose, algebra, ease } from './bodyKit.js';
import { rotAxisAngle, orthonormal } from '../../combat/climbRig.js';
import { bodyFrames } from './bodySolve.js';
import { relaxHeldArms, heldPoseAnatomy } from './armAnatomy.js';
import { trunkRadius, LIMB } from './trunkProfile.js';   // TRUNK-SKIN: the body's own trunk, the breasts and the shoulders' height

const { sub, add, scale, dot, norm, len } = algebra;

/** The trunk as an ellipse about the chest, in shares of the shoulder width: `width` side to side and `depth` front to
 *  back (half-axes, bare), `armor` added to both at full armour; `maxTurn` radians, `step` the search's. The retail
 *  body's shoulders stand 21.75 units apart, its elbows hang 14 out: a hanging arm is clear, a crossed one is not. */
export const ARM_CLEARANCE = Object.freeze({ width: 0.5, depth: 0.42, armor: 0.14, maxTurn: 0.9, step: 0.05 });

/** How far out of the trunk's ellipse `p` stands (rig space: x the right, y the facing, z up; 1 on its edge). */
/** TRUNK-SKIN: the ellipse's shortfall outweighs the skin's (a turn that clears it is taken as ARM-CLEARANCE took it),
 *  and a turn of the arm costs TURN_COST of shortfall a radian. */
const ELLIPSE_WEIGHT = 10, TURN_COST = 0.08, SKIN_TURN = 0.6, SKIN_TURN_HELD = 0.6;

/** CLEAR-SMOOTH (2026-11-07, the owner's 12-40-11 recording: the free arm, the sword arm and the shield arm twitch at an
 *  interval; the two-hander's held hands do not). The search took its turn on a 0.05-radian grid, so as an idle carried
 *  the arm a hair into the breasts the turn leapt a whole step - twice an idle loop, 0.35 s apart, the elbow swinging
 *  with the hand still; a held grip never searched the skin (SKIN_TURN_HELD only in a blow). Read in the owner's game
 *  (a woman standing in zIdle): the lower way out of the breasts closes as the idle moves the arm, and the best turn
 *  leapt to the upper one, 0.1 radian in 0.18 s, once a loop - no hold can keep a way out that is gone. Now the
 *  ellipse's least clearing turn is found by `iterations` halvings, and the skin's turn is a soft minimum over a `grid`
 *  of turns: each weighted by exp(-(its cost - the least) / `temperature`), so it moves as the costs move. What is left
 *  is the clip's own: about zIdle's wrap the trunk moves quicker and the turn humps 0.08 radian in 0.3 s. The turn is
 *  eased toward its target over `ease` seconds - `still` standing, `quick` walking (`moving`, 0..1) or in a blow, where
 *  the arms are quick and the clearance must keep up. */
export const CLEAR_SMOOTH = Object.freeze({ iterations: 12, grid: 0.02, temperature: 0.008, ease: Object.freeze({ still: 0.3, quick: 0.07 }) });

const outOf = (p, c, a, b) => Math.hypot((p[0] - c[0]) / a, (p[1] - c[1]) / b);

/** CLEAR THE ARMS of the trunk on a posed frame: `armor` the armour's weight 0..1 (bodyWeight.js bodyWeightOf's), `kind`
 *  the body's (bodyKindOf's: TRUNK-SKIN reads a woman's trunk for 'female'), `swinging` a blow or the return from one on
 *  the arms. Writes new entries into `pose`; answers the
 *  turns made { L, R } (radians), or null when the skeleton is no biped. */
export function clearArms(skeleton, pose, rootRef, skelMats, { armor = 0, previous = null, dt = 0, held = null, kind = 'male', swinging = false, moving = 1 } = {}) {
  const body = bodyOf(skeleton, rootRef, skelMats);
  if (!body || !body.bones?.L || !body.bones?.R) return null;
  const mats = skelMats(skeleton, pose, rootRef, [body.chest, body.bones.pelvis, body.bones.L.hand, body.bones.R.hand]);
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
  // TRUNK-SKIN: how far out of the trunk's own skin a point on a limb's bone stands, its limb's thickness on it (1 on the
  // skin); the armour's pad as the ellipse's. Infinity where no trunk is (the shoulders' seam, below the hips).
  const pad = extra;
  const skinOut = (p, limb) => {
    const [x, y, z] = local(p).map((v) => v / sw), R = trunkRadius(kind, x, y, z);
    return R > 0 ? Math.hypot(x, y) / (R + limb + pad) : Infinity;
  };
  // How deep a posed arm stands in the trunk: the ellipse's shortfall (ARM-CLEARANCE's, weighted so that a turn which
  // clears it is taken as before) and TRUNK-SKIN's - each point's shortfall against the body's own skin, summed, so that
  // a turn buys its way out of the breasts or the shoulder's front. A turn costs TURN_COST a radian: an arm the turn
  // cannot free (a two-hander's hands held at the belly) is left as the clip and the carry put it, not wrung for a hair.
  const cost = (S, E, W) => {
    // Include the flesh between joints: a clear elbow can still leave most
    // of the forearm inside the cuirass. Keep the fixed shoulder/wrist out.
    const points = [E, add(scale(S, 0.25), scale(E, 0.75)), add(scale(E, 0.75), scale(W, 0.25)), add(scale(E, 0.5), scale(W, 0.5))];
    const trunk = points.filter(p => local(p)[2] >= bottom && local(p)[2] <= 0);
    const ellipse = trunk.length ? Math.min(1, ...trunk.map(offAxis)) : 1;
    // TRUNK-SKIN: the upper arm's lower half too, at any height the trunk has - the shoulder's own seam excepted
    const upper = [add(scale(S, 0.5), scale(E, 0.5)), add(scale(S, 0.25), scale(E, 0.75))].map((p) => skinOut(p, LIMB.upper));
    const fore = [E, add(scale(E, 0.75), scale(W, 0.25)), add(scale(E, 0.5), scale(W, 0.5))].map((p) => skinOut(p, LIMB.fore));
    return [1 - ellipse, [...upper, ...fore].reduce((sum, o) => sum + Math.max(0, 1 - o), 0)];
  };
  const total = (/** @type {number[]} */ c) => ELLIPSE_WEIGHT * c[0] + c[1];
  const gripped = !!(heldPoseAnatomy(pose) ?? held);
  for (const side of ['L', 'R']) {
    const b = body.bones[side];
    const S = at(mats, b.upper), E = at(mats, b.fore), W = at(mats, b.hand);
    if (!S || !E || !W) continue;
    const a = norm(sub(W, S));
    if (!(len(a) > 0.5)) continue;
    const along = scale(a, dot(sub(E, S), a)), e0 = sub(sub(E, S), along);
    const elbowAt = (th) => add(add(S, along), apply3(rotAxisAngle(a, th), e0));
    // ARM-CLEARANCE's own turn first, as it always chose it: the least that clears the ellipse, or its best
    let base = 0, baseD = 1 - cost(S, E, W)[0];
    const clearOf = (th) => 1 - cost(S, elbowAt(th), W)[0];
    for (let k = 1; baseD < 1 && k * ARM_CLEARANCE.step <= ARM_CLEARANCE.maxTurn + 1e-9; k++) {
      let done = false;
      for (const th of [k * ARM_CLEARANCE.step, -k * ARM_CLEARANCE.step]) {
        const d = clearOf(th);
        if (d > baseD + 1e-6) { baseD = d; base = th; }
        if (d >= 1) {
          // CLEAR-SMOOTH: the least turn that clears, found between the step that did not and the one that did - not the
          // step itself, which a breathing chest moves a whole step at a time (the owner's 12-40-11 recording)
          let lo = th - Math.sign(th) * ARM_CLEARANCE.step, hi = th;
          for (let i = 0; i < CLEAR_SMOOTH.iterations; i++) { const mid = (lo + hi) / 2; if (clearOf(mid) >= 1) hi = mid; else lo = mid; }
          base = hi; done = true; break;
        }
      }
      if (done) break;
    }
    if (baseD < 1 && base !== 0) base = refine((th) => -clearOf(th), base - ARM_CLEARANCE.step, base + ARM_CLEARANCE.step, ARM_CLEARANCE.maxTurn);
    // TRUNK-SKIN then turns it on, by no more than SKIN_TURN. A held grip (ARM-ANATOMY's forearm balance) the skin turns
    // only while it swings - a blow, or the carry's return from one (SKIN_TURN_HELD): the hand kept on the hilt, the turn
    // wrings the wrist's and the elbow's skin, which ARM-ANATOMY's pins hold through the walks and the runs. A held guard
    // standing in the breasts is the carry's to place, not this.
    let best = base, bestC = total(cost(S, elbowAt(base), W));
    const reach = !gripped ? SKIN_TURN : swinging ? SKIN_TURN_HELD : 0;
    for (let k = 1; bestC > 1e-9 && k * ARM_CLEARANCE.step <= reach + 1e-9; k++) {
      for (const th of [base + k * ARM_CLEARANCE.step, base - k * ARM_CLEARANCE.step]) {
        if (Math.abs(th) > ARM_CLEARANCE.maxTurn + 1e-9) continue;
        const c = total(cost(S, elbowAt(th), W)) + TURN_COST * Math.abs(th - base);
        if (c < bestC - 1e-6) { bestC = c; best = th; }
      }
    }
    if (reach > 0 && bestC > 1e-9) {
      // CLEAR-SMOOTH: not the one best turn but every turn in reach weighted by how near the best it is (a soft minimum,
      // `temperature` in the cost's units) - where two ways out of the skin cost alike the turn stands between them, and
      // as one closes its weight goes and the turn flows to the other, where the best leapt
      const lo = Math.max(base - reach, -ARM_CLEARANCE.maxTurn), hi = Math.min(base + reach, ARM_CLEARANCE.maxTurn);
      const ths = [], cs = [];
      for (let th = lo; th <= hi + 1e-9; th += CLEAR_SMOOTH.grid) { ths.push(th); cs.push(total(cost(S, elbowAt(th), W)) + TURN_COST * Math.abs(th - base)); }
      const cMin = Math.min(...cs), T = CLEAR_SMOOTH.temperature;
      let sw = 0, st = 0;
      for (let i = 0; i < ths.length; i++) { const w = Math.exp(-(cs[i] - cMin) / T); sw += w; st += w * ths[i]; }
      // taken as far as the clearance's own turn is worse than the best: an arm best left where it is stays exactly there
      const g = 1 - Math.exp(-(total(cost(S, elbowAt(base), W)) - cMin) / T);
      if (sw > 0) best = base + (st / sw - base) * Math.max(0, Math.min(1, g));
    }
    // CLEAR-SMOOTH: standing, the turn eased slowly; walking or in a blow, quickly
    const tau = swinging ? CLEAR_SMOOTH.ease.quick : CLEAR_SMOOTH.ease.still + (CLEAR_SMOOTH.ease.quick - CLEAR_SMOOTH.ease.still) * Math.max(0, Math.min(1, moving));
    if (previous) { best = ease(previous[side] ?? 0, best, tau, dt); previous[side] = best; }
    if (Math.abs(best) < 1e-5) continue;
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
  held = heldPoseAnatomy(pose) ?? held;
  if (held) relaxHeldArms(skeleton, pose, rootRef, skelMats, held);
  return out;
}

const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The turn in [lo, hi] (inside ±max) where `f` is least - golden-section, CLEAR_SMOOTH.iterations steps. */
function refine(f, lo, hi, max) {
  let a = Math.max(lo, -max), b = Math.min(hi, max);
  if (!(b > a)) return a;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < CLEAR_SMOOTH.iterations; i++) {
    if (fc <= fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}
/** A row-major 3x3 applied to a column vector. */
function apply3(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
