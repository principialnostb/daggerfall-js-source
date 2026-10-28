// @ts-check
// BLOW-LEGS (2026-10-28, MOTION-DOCTRINE, bible/05-Combat/Motion-Doctrine.md 7f): THE BODY UNDER A BLOW STRUCK STANDING.
// The owner: "when he stands and strikes the legs barely move, and there is no feeling of one whole movement" - and the
// frames bore it out: Morrowind's weapononehand (xbase_anim.kf) strikes from a planted stance - the pelvis drops 4-6
// units at the hit, the knees stay straight, the chop's right foot slides 8 units and stays, and the thrust's left foot
// slides 13 units forward FLAT and back again inside 0.13 s at the hit. A moving blow's legs are the stride's (LOWER-BODY,
// rule 26); a standing one's were that stance. This layer gives a standing blow its body, by key poses rather than a
// running physics (7d: motion laid continuously over the clips read as plastic): the wind-up LOADS - the weight back,
// the body turned away from the swing; the release DRIVES - snapped, the hips forward and down and turned through the
// swing, the lead foot STEPPING (lifted and set down, never slid) on a thrust and a chop; the hit holds the low point;
// the follow-through RECOVERS - slower than the strike, the foot stepping home. Both feet stand where the stance put them
// (the clip's own slides gone), the knees taking up what the hips ask. Additive over the clip's hips; the upper body,
// the arms and the weapon's arc stay the clip's, carried by the hips as a body carries them. Daggerfall Unity draws no
// body to strike with and OpenMW plays the clip as it is: the port's own (SCOPE1).

import { algebra, bodyOf, bodyTurn, transpose, mul, apply, clamp01, ease, smooth, at } from './bodyKit.js';
import { solveBody } from './bodySolve.js';
import { rotationPart } from '../../combat/climbRig.js';

const { add, sub, scale, len, norm, lerp3 } = algebra;

/**
 * THE KEY POSES, each blow its own, in shares of the leg (hip to ankle) and radians: `wind` the wind-up's (`back` the
 * hips behind the feet, `drop`, `yaw` the turn away - bodyKit.js bodyTurn's sense, + to the body's left - `pitch` +
 * the front down), `hit` the strike's (`fwd` the hips ahead, `drop`, `yaw` through the swing, `pitch`), `step` the lead
 * foot's step forward at the hit. A backhand's turns are the forehand's mirrored; a left hand's blow mirrors the turns
 * and leads with the right foot.
 */
export const BLOW_LEGS = Object.freeze({
  chop: Object.freeze({ wind: { back: 0.035, drop: 0.015, yaw: -0.1, pitch: -0.06 }, hit: { fwd: 0.07, drop: 0.075, yaw: 0.1, pitch: 0.12 }, step: 0.15 }),
  slash: Object.freeze({ wind: { back: 0.03, drop: 0.02, yaw: -0.24, pitch: 0 }, hit: { fwd: 0.045, drop: 0.065, yaw: 0.3, pitch: 0.04 }, step: 0 }),
  thrust: Object.freeze({ wind: { back: 0.045, drop: 0.015, yaw: -0.2, pitch: -0.03 }, hit: { fwd: 0.1, drop: 0.055, yaw: 0.22, pitch: 0.07 }, step: 0.24 }),
});
/**
 * THE TIMING: the follow-through holds the hit for `hold` of itself, then recovers over the rest; the foot steps home
 * once the follow-through is `home` through. A step takes `step` seconds, its foot lifted `lift` of the leg at its
 * middle. The pose is followed over `tau` (a chained blow takes the last one's pose from where it stands, never a
 * frame's jump); the layer comes on over `in` and goes over `out` (a body set moving gives its legs to the stride). A
 * body heavier by `heavy` (bodyWeight.js's 0..1) strikes deeper by that share. `still` m/s: under it the body stands.
 */
export const BLOW_LEGS_TIME = Object.freeze({ hold: 0.25, home: 0.55, step: 0.16, lift: 0.06, tau: 0.035, in: 0.06, out: 0.12, heavy: 0.4, still: 0.3 });

const smoothBack = (t) => 1 - (1 - clamp01(t)) ** 3;   // the release's snap: fast out of the wind-up, settling into the hit

/** Where in its key poses a blow stands: the wind-up's load, the release's drive, the follow-through's recovery - each
 *  0..1 - read off the machine's section and that section's progress. */
export function blowPhase(section, progress) {
  const p = clamp01(Number(progress) || 0);
  if (section === 'windup') return { load: smooth(p), drive: 0, recover: 0 };
  if (section === 'release') return { load: 1, drive: smoothBack(p), recover: 0 };
  if (section === 'follow') return { load: 1, drive: 1, recover: smooth((p - BLOW_LEGS_TIME.hold) / (1 - BLOW_LEGS_TIME.hold)) };
  return null;
}

/** The pose the blow asks now (shares of the leg, radians), and whether its lead foot wants to be forward (true), home
 *  (false) or left where it stands (null - a wind-up does not step). */
export function blowLegsPose(blow, heavy = 0) {
  const keys = BLOW_LEGS[blow?.type];
  const ph = keys ? blowPhase(blow.section, blow.progress) : null;
  if (!keys || !ph) return null;
  const k = (0.75 + 0.25 * clamp01(Number(blow.strength ?? 1))) * (1 + BLOW_LEGS_TIME.heavy * clamp01(heavy));
  const mirror = (blow.reversed ? -1 : 1) * (blow.hand === 'L' ? -1 : 1);
  const { wind: w, hit: h } = keys;
  const mix = (a, b) => ((1 - ph.drive) * a * ph.load + ph.drive * b) * (1 - ph.recover) * k;
  const fwd = mix(-w.back, h.fwd), drop = mix(w.drop, h.drop), yaw = mix(w.yaw, h.yaw) * mirror, pitch = mix(w.pitch, h.pitch);
  const forward = !(keys.step > 0) ? false : blow.section === 'windup' ? null : blow.section === 'release' || clamp01(blow.progress) < BLOW_LEGS_TIME.home;
  return { fwd, drop, yaw, pitch, step: keys.step * k, lead: blow.hand === 'L' ? 'R' : 'L', forward };
}

/** One foot's steps: planted at `off` (rig units from its anchor), or on its way from `from` to `to` - lifted, never
 *  slid. A new goal mid-step starts from where the foot is. */
function createFoot() {
  let off = [0, 0, 0], from = null, to = null, t = 0;
  const now = (lift) => {
    if (!to) return off;
    const p = lerp3(from, to, smooth(t));
    return [p[0], p[1], p[2] + Math.sin(Math.PI * clamp01(t)) * lift];
  };
  return {
    /** The foot this frame, `goal` the offset it wants (null: where it stands or is going), `dt` the frame's clock. */
    goal(goal, dt, lift) {
      if (to) { t += dt / BLOW_LEGS_TIME.step; if (t >= 1) { off = to; from = to = null; t = 0; } }
      if (goal && len(sub(goal, to ?? off)) > 0.5) { from = now(lift); to = goal; t = 0; }
      return now(lift);
    },
    air: () => !!to,
    reset() { off = [0, 0, 0]; from = to = null; t = 0; },
  };
}

/** THE LAYER. `step` each frame with the motion word (bodyMotion.js motionWord's) and the body's weight; `apply` in the
 *  third-person motion slot (bodyWeight.js's), after the carry and before the elbows' clearance. */
export function createBlowLegs() {
  let w = 0; let want = null; let pose = { fwd: 0, drop: 0, yaw: 0, pitch: 0 }; let anchor = null; let lastDt = 0;
  const feet = { L: createFoot(), R: createFoot() };
  const layer = {
    /** One frame: `on` the switch in third person, `word` the motion word, `heavy` the body's weight (0..1). */
    step(dt, on, word, heavy = 0) {
      lastDt = Math.max(0, dt);
      const standing = !!word && word.on !== false && !word.busy && word.grounded !== false && !word.swimming && !word.levitating && !(Number(word.speed) > BLOW_LEGS_TIME.still);
      const asked = on && standing && word.blow ? blowLegsPose(word.blow, heavy) : null;
      if (asked) want = asked;
      w = ease(w, asked ? 1 : 0, asked ? BLOW_LEGS_TIME.in : BLOW_LEGS_TIME.out, dt);
      if (asked && w > 0.999) w = 1;
      const goal = asked ?? { fwd: 0, drop: 0, yaw: 0, pitch: 0 };
      pose = { fwd: ease(pose.fwd, goal.fwd, BLOW_LEGS_TIME.tau, dt), drop: ease(pose.drop, goal.drop, BLOW_LEGS_TIME.tau, dt), yaw: ease(pose.yaw, goal.yaw, BLOW_LEGS_TIME.tau, dt), pitch: ease(pose.pitch, goal.pitch, BLOW_LEGS_TIME.tau, dt) };
      if (!asked && w < 1e-3) layer.reset();
      return w;
    },
    weight: () => w,
    /** The layer's own word, for the rig's status. */
    status: () => ({ w, fwd: pose.fwd, drop: pose.drop, yaw: pose.yaw, air: { L: feet.L.air(), R: feet.R.air() }, anchored: !!anchor }),
    /** THE POSE over the clip's: the hips moved and turned, the feet set on their anchors (the lead one stepping). */
    apply(skeleton, pose0, rootRef, skelMats) {
      if (!(w > 1e-3)) return null;
      const body = bodyOf(skeleton, rootRef, skelMats);
      const pelvis = body?.bones?.pelvis;
      if (!body || pelvis == null) return null;
      let mats = skelMats(skeleton, pose0, rootRef);
      const leg = body.leg;
      // the anchors: where the stance stood the feet when the layer came on - the clip's own slides are not followed
      if (!anchor) {
        anchor = {};
        for (const s of ['L', 'R']) {
          const ref = body.bones[s].foot, ax = body.footAxes[s], R = rotationPart(mats.get(ref).a);
          anchor[s] = { at: [...at(mats, ref)], toe: ax ? norm(apply(R, ax.fwd)) : [0, 1, 0], up: ax ? norm(apply(R, ax.up)) : [0, 0, 1] };
        }
      }
      // the hips: turned about their own joint and moved, additively over the clip's
      const node = skeleton.nodes.get(pelvis);
      const local = pose0.get(pelvis) ?? node.rest;
      const parent = mats.get(node.parent);
      const P = parent ? rotationPart(parent.a) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const sp = parent ? Math.hypot(parent.a[0], parent.a[3], parent.a[6]) || 1 : 1;
      const T = bodyTurn(pose.yaw * w, 0, pose.pitch * w);
      const dv = scale([0, pose.fwd * leg, -pose.drop * leg], w);
      const lv = scale(apply(transpose(P), dv), 1 / sp);
      pose0.set(pelvis, {
        rotation: mul(transpose(P), mul(T, mul(P, local.rotation))),
        translation: [local.translation[0] + lv[0], local.translation[1] + lv[1], local.translation[2] + lv[2]],
        scale: local.scale,
      });
      // the feet: home on their anchors, the lead one stepping forward on a thrust's and a chop's drive
      const lift = BLOW_LEGS_TIME.lift * leg;
      const plan = { w, feet: {} };
      for (const s of ['L', 'R']) {
        const lead = want && want.lead === s;
        const fwdGoal = lead && want.forward != null ? (want.forward ? [0, want.step * leg, 0] : [0, 0, 0]) : null;
        const off = feet[s].goal(fwdGoal, lastDt, lift);
        plan.feet[s] = { at: add(anchor[s].at, off), toe: anchor[s].toe, up: anchor[s].up, w: 1, stance: !feet[s].air() };
      }
      lastDt = 0;   // a frame's clocks spent once
      return solveBody(skeleton, pose0, rootRef, skelMats, plan);
    },
    reset() { w = 0; want = null; anchor = null; pose = { fwd: 0, drop: 0, yaw: 0, pitch: 0 }; feet.L.reset(); feet.R.reset(); },
  };
  return layer;
}
