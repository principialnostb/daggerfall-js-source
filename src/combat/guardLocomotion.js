// @ts-check
// GUARD-STEP-BASE: use accepted free locomotion under the two-handed carry; the armed walk's foot path is abrupt.
// DFU PlayerMotor controls travel, not a 3D body; this presentation choice leaves speed and blows unchanged.
import { composeMovementGroup, MW_WEAPON_TYPE } from '../formats/morrowind/mwFirstPerson.js';
import { guardStance } from '../characters/bodyMotion/guardStance.js';   // GUARD-STANCE: the one-handers as the two-hander
import { ARM_HOLD } from './leftArmLayer.js';   // ARM-HOLD: the armed upper body held, swung by the legs' own walk

// GUARD-DIRECTION-BASE: the armed back and side walks too; only the armed walk swaps, the armed side and back runs stay accepted.
const GUARD_BASES = /^(?:runforward|walk(?:forward|back|left|right))$/;

/** FIST-STANCE (the owner, 2026-11-12: "can you not repeat the legs of the two-hander's and the one-hander's stance?"): the
 *  fists STAND on the two-hander's own stance - its clip, whole, is the frame's (fistStanceType) - and the hand-to-hand
 *  stance is laid over it from the lower spine up (FIST_GUARD), standing and moving. One pair of legs for every
 *  stance weapon: the clip's, not a copy of its numbers. The third person's; the first person's arms keep their clip. */
export const FIST_GUARD = Object.freeze({ kind: 'stance', base: 'idle', stance: 'drawn', type: MW_WEAPON_TYPE.HandToHand, still: false, sway: 1, w: 1 });
/** The weapon type whose stance clip the body stands on: the two-hander's under the fists (`on`: the third person, the
 *  doctrine on, no shield - a shield's fists have their own carriage), else the type's own. */
export const fistStanceType = (type, on = false) => (on && type === MW_WEAPON_TYPE.HandToHand ? MW_WEAPON_TYPE.LongBladeTwoHand : type);

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
    // FIST-GUARD (the owner, 2026-11-12: "we take out the lowering of the hands - a fighting stance is a fighting
    // stance"): the legs are the two-hander's stance's and the ordinary walk's, so the upper body is the hand-to-hand
    // stance's own - its guard, on its breath - standing and moving. A punch is its own clip's (no plan attacking).
    return !moving || walking ? FIST_GUARD : null;
  }
  if (!shield || !moving || type === MW_WEAPON_TYPE.LongBladeTwoHand || !guardStance(type) || !GUARD_BASES.test(b)) return null;
  return { kind: 'movement', base, stance: 'drawn', still: false, rigOrder: true, sway: 0, hold: ARM_HOLD.upper };
}
