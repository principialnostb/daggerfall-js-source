// @ts-check
// GUARD-STANCE (the owner, 2026-11-04: the one-hander's walk and run in the stance differ from the two-hander's, "and they
// must not" - the two-hander's is the tuned one): the weapons that walk, run and strike moving as the two-hander does -
// every blade, axe and blunt held close, one-handed or two. One list, so no part of the stance is one weapon's alone.
import { MW_WEAPON_TYPE } from '../../formats/morrowind/mwFirstPerson.js';

// FISTS-GUARD (the owner, 2026-11-06: "carry every rule of the movement - the trunk, the legs - over to the fists' stance"):
// the fists drawn walk, run and step as the weapons do - the worked gait, its clock, the stance's walk - not the
// hand-to-hand clips (whose walk-to-run change threw the fists half an arm in a frame).
export const GUARD_TYPES = Object.freeze([
  MW_WEAPON_TYPE.LongBladeTwoHand, MW_WEAPON_TYPE.BluntTwoClose, MW_WEAPON_TYPE.AxeTwoHand,
  MW_WEAPON_TYPE.ShortBladeOneHand, MW_WEAPON_TYPE.LongBladeOneHand, MW_WEAPON_TYPE.BluntOneHand, MW_WEAPON_TYPE.AxeOneHand,
  MW_WEAPON_TYPE.HandToHand,
]);

/** Does the drawn weapon `type` move in the fighting stance? */
export const guardStance = (type) => GUARD_TYPES.includes(type);
