// @ts-check
// One leg transform and one height history across locomotion changes.
import { createStride, runStrideShare, RUN_STRIDE, walkStrideShare, WALK_STRIDE } from './stride.js';
import { GUARD_STRIDE, GUARD_WALK, guardStrideShare } from './guardStride.js';
import { createGuardWalkBalance } from './guardWalkBalance.js';
import { createGuardWalkPose } from './guardWalkPose.js';
import { createFistLegs } from './fistLegs.js'; // A punch's lower body held at the stance, for BLOW-LEGS
import { createGuardStand } from './guardStand.js'; // Every stance weapon stands at the two-hander's level

const WALK = Object.freeze({ ...WALK_STRIDE, share: walkStrideShare, knees: true });
const RUN = Object.freeze({ ...RUN_STRIDE, share: runStrideShare, knees: false });
const GUARD = Object.freeze({ ...GUARD_STRIDE.walk, share: guardStrideShare, knees: false });

export function travelStrideProfile(group) {
  return GUARD_WALK.test(String(group ?? '')) ? GUARD : /^run/i.test(String(group ?? '')) ? RUN : WALK;
}
export function createTravelStride({ sampleTrack, loopWindow }) {
  const guard = createGuardWalkPose();
  const armedWalk = { ...WALK, share: (k) => guard.share(k) };
  const profile = (group) =>
    /^walk(?:forward|back)$/i.test(String(group ?? '')) ? armedWalk : travelStrideProfile(group);
  const stride = createStride({ sampleTrack, loopWindow, groups: /^(?:walk|run)/i, profile });
  const balance = createGuardWalkBalance();
  const stand = createGuardStand();
  const fist = createFistLegs();
  return {
    stepRig(dt, on, state, source, cam, animSpeed, units, word = null) {
      guard.step(dt, on, word, state?.group);
      stand.step(dt, on, word);
      fist.step(dt, on, word);
      stride.stepRig(dt, on, state, source, cam, animSpeed, units);
      balance.step(dt, !!on && GUARD_WALK.test(String(state?.group ?? '')));
    },
    rate: (k, on, group) => stride.rate(k, on, group),
    slot: (inner) => stride.slot(balance.slot(guard.slot(fist.slot(stand.slot(inner))))),
  };
}
