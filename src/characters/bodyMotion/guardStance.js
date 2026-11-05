// @ts-check
// GUARD-STANCE (the owner, 2026-11-04: the one-hander's walk and run in the stance differ from the two-hander's, "and they
// must not" - the two-hander's is the tuned one): the weapons that walk, run and strike moving as the two-hander does -
// every blade, axe and blunt held close, one-handed or two. One list, so no part of the stance is one weapon's alone.
import { MW_WEAPON_TYPE } from '../../formats/morrowind/mwFirstPerson.js';

export const GUARD_TYPES = Object.freeze([
  MW_WEAPON_TYPE.LongBladeTwoHand, MW_WEAPON_TYPE.BluntTwoClose, MW_WEAPON_TYPE.AxeTwoHand,
  MW_WEAPON_TYPE.ShortBladeOneHand, MW_WEAPON_TYPE.LongBladeOneHand, MW_WEAPON_TYPE.BluntOneHand, MW_WEAPON_TYPE.AxeOneHand,
]);

/** Does the drawn weapon `type` move in the fighting stance? */
export const guardStance = (type) => GUARD_TYPES.includes(type);
