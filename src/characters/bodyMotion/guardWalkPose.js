// @ts-check
// GUARD-WALK-POSE: the guard continues through the step: shorter travel, lower hips, yielding knees.
import { MW_WEAPON_TYPE } from '../../formats/morrowind/mwFirstPerson.js';
import { ease } from './bodyKit.js';
import { walkStrideShare } from './stride.js';
import { createGuardWalkBalance } from './guardWalkBalance.js';

export const GUARD_WALK_POSE = Object.freeze({ share: 0.6, mean: 0.18, ease: 0.18, reach: 0.97, settle: 0.055, stride: 1.55 });

export function guardWalks(word, group) {
  return !!word?.on && !!word.shown && word.mwType === MW_WEAPON_TYPE.LongBladeTwoHand &&
    !word.busy && !word.swimming && !word.levitating && !word.spell && word.grounded !== false && !word.running && /^walk(?:forward|back)$/i.test(String(group ?? ''));
}

export function createGuardWalkPose() {
  const balance = createGuardWalkBalance(GUARD_WALK_POSE);
  let weight = 0;
  return {
    step(dt, on, word, group) {
      const active = !!on && guardWalks(word, group);
      weight = ease(weight, active ? 1 : 0, GUARD_WALK_POSE.ease, dt);
      if (!active && weight < 1e-3) weight = 0;
      balance.step(dt, active);
    },
    share(k) {
      const ordinary = walkStrideShare(k);
      if (!weight) return ordinary;
      const shorter = Math.min(ordinary.stride, GUARD_WALK_POSE.stride);
      const stride = ordinary.stride + (shorter - ordinary.stride) * weight;
      return { stride, rate: ordinary.rate * ordinary.stride / stride };
    },
    slot: (inner) => balance.slot(inner),
  };
}
