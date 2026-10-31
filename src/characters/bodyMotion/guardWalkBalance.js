// @ts-check
// GUARD-WALK-LEVEL: reduce vertical bounce without moving the stride's ankle targets or changing its clock.
import { bodyOf, algebra, at, apply, ease, clamp01 } from './bodyKit.js';
import { rotationPart } from '../../combat/climbRig.js';
import { solveBody } from './bodySolve.js';
const { add, sub, scale, len, norm } = algebra;

// A slightly lower centre leaves knee room at the low point: lifting it toward the mean
// would hit the reach ceiling twice per step and retain a sharp vertical notch.
const GUARD_KNEE_LEAN = 0.08;
export const GUARD_WALK_LEVEL = Object.freeze({ share: 0.25, mean: 0.18, ease: 0.16, reach: 0.97, settle: 0.035 });

/** GUARD-KNEE-POLE: the knee's way, the clip's, leaning a little toward the toes. Taken alone, knee minus hip on a nearly
 *  straight leg lies along the hip-to-ankle line, its small remainder can change side, and the solve folds the knee
 *  backward for two frames: a 25 cm leap of the rear knee on the back walk (the owner's 12-36-29 recording). */
export function kneePole(hip, knee, toe, length) {
  return norm(add(sub(knee, hip), scale(norm(toe), length * GUARD_KNEE_LEAN)));
}

/** @param {{share: number, mean: number, ease: number, reach: number, settle: number}} [config] */
export function createGuardWalkBalance(config = GUARD_WALK_LEVEL) {
  let w = 0, mean = null, dt = 0, cached = null;
  const layer = {
    step(seconds, on) {
      dt = Math.max(0, seconds);
      w = ease(w, on ? 1 : 0, config.ease, dt);
      if (!on && w < 1e-3) { w = 0; mean = null; }
    },
    apply(skeleton, pose, root, skelMats) {
      if (!(w > 1e-3)) return null;
      const body = bodyOf(skeleton, root, skelMats);
      if (!body?.footAxes) return null;
      const mats = skelMats(skeleton, pose, root);
      const mid = scale(add(at(mats, body.bones.L.thigh), at(mats, body.bones.R.thigh)), 0.5);
      mean = mean == null ? mid[2] : ease(mean, mid[2], config.mean, dt);
      let z = mid[2] + (mean - body.leg * config.settle + (mid[2] - mean) * config.share - mid[2]) * clamp01(w);
      const feet = {};
      for (const side of ['L', 'R']) {
        const b = body.bones[side], hip = at(mats, b.thigh), knee = at(mats, b.calf), ankle = at(mats, b.foot);
        const length = len(sub(knee, hip)) + len(sub(ankle, knee));
        const horizontal = Math.hypot(ankle[0] - hip[0], ankle[1] - hip[1]);
        const reach = Math.max(config.reach * length, len(sub(ankle, hip)));
        if (horizontal < reach) z = Math.min(z, ankle[2] + Math.sqrt(reach * reach - horizontal * horizontal) - (hip[2] - mid[2]));
        const R = rotationPart(mats.get(b.foot).a), axes = body.footAxes[side];
        feet[side] = { at: [...ankle], toe: norm(apply(R, axes.fwd)), up: norm(apply(R, axes.up)),
          pole: kneePole(hip, knee, apply(R, axes.fwd), length), stance: true, w: 1 };
      }
      if (Math.abs(z - mid[2]) < 1e-5) return null;
      return solveBody(skeleton, pose, root, skelMats, { w: 1, hip: { at: [mid[0], mid[1], z], keepTurn: true }, feet });
    },
    slot(inner) {
      if (cached && cached.inner === inner) return cached.fn;
      cached = { inner, fn: (skeleton, pose, root, skelMats) => {
        layer.apply(skeleton, pose, root, skelMats);
        return inner ? inner(skeleton, pose, root, skelMats) : null;
      } };
      return cached.fn;
    },
  };
  return layer;
}
