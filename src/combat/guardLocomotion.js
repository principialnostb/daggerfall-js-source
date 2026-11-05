// @ts-check
// GUARD-STEP-BASE: use accepted free locomotion under the two-handed carry; the armed walk's foot path is abrupt.
// DFU PlayerMotor controls travel, not a 3D body; this presentation choice leaves speed and blows unchanged.
import { composeMovementGroup } from '../formats/morrowind/mwFirstPerson.js';
import { guardStance } from '../characters/bodyMotion/guardStance.js';   // GUARD-STANCE: the one-handers as the two-hander

// GUARD-DIRECTION-BASE: the armed back and side walks too; only the armed walk swaps, the armed side and back runs stay accepted.
const GUARD_BASES = /^(?:runforward|walk(?:forward|back|left|right))$/;

// STANCE-LEGS (the owner, 2026-11-05: a one-hander's run with a shield "differs from the standard"): a shield no longer
// takes the legs off the stance's walks and run - its arm is the left arm layer's (combat/leftArmLayer.js)
export function guardMovementGroup(base, type, hasGroup, on = false) {
  if (on && GUARD_BASES.test(base) && guardStance(type) && hasGroup(base)) {
    return { group: base, walked: false };
  }
  return composeMovementGroup(base, type, hasGroup);
}
