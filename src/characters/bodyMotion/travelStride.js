// @ts-check
// GUARD-CONTINUITY: one leg transform and one height history across locomotion changes.
import { createStride, runStrideShare, RUN_STRIDE, walkStrideShare, WALK_STRIDE } from './stride.js';
import { GUARD_STRIDE, GUARD_WALK, guardStrideShare } from './guardStride.js';
import { createGuardWalkBalance } from './guardWalkBalance.js';
import { createGuardWalkPose } from './guardWalkPose.js';

const WALK = Object.freeze({ ...WALK_STRIDE, share: walkStrideShare, knees: true });
const RUN = Object.freeze({ ...RUN_STRIDE, share: runStrideShare, knees: false });
const GUARD = Object.freeze({ ...GUARD_STRIDE.walk, share: guardStrideShare, knees: false });

export function travelStrideProfile(group) {
  return GUARD_WALK.test(String(group ?? '')) ? GUARD : /^run/i.test(String(group ?? '')) ? RUN : WALK;
}
export function createTravelStride({ sampleTrack, loopWindow }) {
  const guard = createGuardWalkPose();
  const armedWalk = { ...WALK, share: (k) => guard.share(k) };
  const profile = (group) => /^walkforward$/i.test(String(group ?? '')) ? armedWalk : travelStrideProfile(group);
  const stride = createStride({ sampleTrack, loopWindow, groups: /^(?:walk|run)/i, profile });
  const balance = createGuardWalkBalance();
  return {
    stepRig(dt, on, state, source, cam, animSpeed, units, word = null) {
      guard.step(dt, on, word, state?.group);
      stride.stepRig(dt, on, state, source, cam, animSpeed, units);
      balance.step(dt, !!on && GUARD_WALK.test(String(state?.group ?? '')));
    },
    rate: (k, on, group) => stride.rate(k, on, group),
    slot: (inner) => stride.slot(balance.slot(guard.slot(inner))),
  };
}
