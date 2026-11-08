// @ts-check
// GUARD-STEP-BASE: use accepted free locomotion under the two-handed carry; the armed walk's foot path is abrupt.
// DFU PlayerMotor controls travel, not a 3D body; this presentation choice leaves speed and blows unchanged.
import { composeMovementGroup, MW_WEAPON_TYPE } from '../formats/morrowind/mwFirstPerson.js';
import { guardStance } from '../characters/bodyMotion/guardStance.js';   // GUARD-STANCE: the one-handers as the two-hander
import { ARM_HOLD } from './leftArmLayer.js';   // ARM-HOLD: the armed upper body held, swung by the legs' own walk

// GUARD-DIRECTION-BASE: the armed back and side walks too; only the armed walk swaps, the armed side and back runs stay accepted.
const GUARD_BASES = /^(?:runforward|walk(?:forward|back|left|right))$/;

export function guardMovementGroup(base, type, hasGroup, on = false) {
  const bareHands = type === MW_WEAPON_TYPE.HandToHand && /^(?:walk|run)(?:forward|back|left|right)$/.test(base);
  if (on && (bareHands || GUARD_BASES.test(base)) && guardStance(type) && hasGroup(base)) {
    return { group: base, walked: false };
  }
  return composeMovementGroup(base, type, hasGroup);
}

/** SHIELD-RUN-LEGS (the owner, 2026-11-05: the one-hander with a shield "runs on its toes, not as the two-hander"): its legs
 *  walk and run on the stance's own clips, as the two-hander's (guardMovementGroup), and its upper body - the trunk, the
 *  arms, the shield tuned on it - is its armed clip's, laid from the lower spine up (combat/leftArmLayer.js, a second
 *  layer) on the stride. Null where the frame's own clip is the body's. */
/** @param {{ on?: boolean, shield?: boolean, type?: number, base?: string | null, moving?: boolean, attacking?: boolean }} [o] */
export function armedUpperPlan({ on = false, shield = false, type = -1, base = null, moving = false, attacking = false } = {}) {
  if (!on || attacking) return null;
  const b = String(base ?? ''), walking = moving && /^(?:walk|run)(?:forward|back|left|right)$/.test(b);
  // Bare hands use ordinary locomotion. A shield retains its accepted carriage.
  if (type === MW_WEAPON_TYPE.HandToHand) {
    if (shield) return walking ? (GUARD_BASES.test(b) ? { kind: 'movement', base: b, stance: 'drawn', type: MW_WEAPON_TYPE.LongBladeOneHand, still: false, rigOrder: true, sway: 0, hold: ARM_HOLD.upper, freeSide: 'R' } : null)
      : moving ? null : { kind: 'stance', base: 'idle', stance: 'bare', still: false, side: 'R', sway: 1, w: ARM_HOLD.restRight };
    // The primary movement clip already contains the ordinary arms. A second
    // upper-body layer would keep sampling locomotion during the stop or punch.
    return null;
  }
  if (!shield || !moving || type === MW_WEAPON_TYPE.LongBladeTwoHand || !guardStance(type) || !GUARD_BASES.test(b)) return null;
  return { kind: 'movement', base, stance: 'drawn', still: false, rigOrder: true, sway: 0, hold: ARM_HOLD.upper };
}
