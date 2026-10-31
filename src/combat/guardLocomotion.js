// @ts-check
// GUARD-STEP-BASE: use accepted free locomotion under the two-handed carry; the armed walk's foot path is abrupt.
// DFU PlayerMotor controls travel, not a 3D body; this presentation choice leaves speed and blows unchanged.
import { composeMovementGroup, MW_WEAPON_TYPE } from '../formats/morrowind/mwFirstPerson.js';

export function guardMovementGroup(base, type, hasGroup, on = false) {
  if (on && (base === 'runforward' || base === 'walkforward') && type === MW_WEAPON_TYPE.LongBladeTwoHand && hasGroup(base)) {
    return { group: base, walked: false };
  }
  return composeMovementGroup(base, type, hasGroup);
}
