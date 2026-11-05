// @ts-check
// GUARD-STEP-BASE: use accepted free locomotion under the two-handed carry; the armed walk's foot path is abrupt.
// DFU PlayerMotor controls travel, not a 3D body; this presentation choice leaves speed and blows unchanged.
import { composeMovementGroup, MW_WEAPON_TYPE } from '../formats/morrowind/mwFirstPerson.js';
import { guardStance } from '../characters/bodyMotion/guardStance.js';   // GUARD-STANCE: the one-handers as the two-hander

// GUARD-DIRECTION-BASE: the armed back and side walks too; only the armed walk swaps, the armed side and back runs stay accepted.
const GUARD_BASES = /^(?:runforward|walk(?:forward|back|left|right))$/;

// SHIELD-WALK (the owner, 2026-11-05: "the shield raised while moving, as before"): a one-hander with a shield keeps
// its armed clips, where the shield arm is up - the free walk swung it
export function guardMovementGroup(base, type, hasGroup, on = false, shield = false) {
  if (on && GUARD_BASES.test(base) && guardStance(type) && !(shield && type !== MW_WEAPON_TYPE.LongBladeTwoHand) && hasGroup(base)) {
    return { group: base, walked: false };
  }
  return composeMovementGroup(base, type, hasGroup);
}
