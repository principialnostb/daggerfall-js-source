// @ts-check
// SHIELD-GUARD (2026-10-26): THE FISTS BEHIND A SHIELD. Morrowind's hand-to-hand clips raise both fists, the shield
// arm's too, so a shield worn with no weapon hung from a boxer's guard, and a blow its clip threw with the left hand had
// nothing to throw. Here the fists behind a shield stand as a one-hander does (the stance), hold the shield where a
// one-hander's strafe holds it (the guard - combat/fpArm.js lays the strafe's left arm over the clip), and a blow the
// clip throws with the shield hand is a SHIELD BASH: the hand driven forward and back along the body's facing, its
// frame held, so the shield (the Shield Bone hangs from the left hand) travels face-first and never turns. Departures
// from the reference, which keeps hand-to-hand's stance, arms and blows whatever is worn.

import { MW_WEAPON_TYPE } from '../formats/morrowind/mwFirstPerson.js';
import { applyClimbRig, climbBones, handFrame, rotationPart, rotAxisAngle, orthonormal } from './climbRig.js';
import { algebra, at, smooth, mul, transpose, RAD } from '../characters/bodyMotion/bodyKit.js';
import { U, blowU } from '../characters/bodyMotion/melee.js';

const { add, sub, scale, len } = algebra;

/** The stance (the idle, the walk, the jump): a one-hander's where the fists stand behind a shield. The blows stay the
 *  fists' (fpArm.js refreshWeaponGroup's group is the drawn type's), and a shield is not an empty hand, so the right
 *  throws them (twoHands/handsLaw.js handsModeOf). */
export function shieldGuardStance(type, shield) {
  return shield && type === MW_WEAPON_TYPE.HandToHand ? MW_WEAPON_TYPE.LongBladeOneHand : type;
}
/** A rig carrying a shield piece - in the hand or slung (`shield-back`, the third person's stow copy). */
export const carriesShield = (r) => !!r?.ok && !!r.arm?.pieces?.some((p) => /^shield\b/.test(p.slot ?? ''));
/** The shield in the HAND, not the stow copy on the back. */
export const isHandShieldSlot = (slot) => /^shield\b/.test(slot ?? '') && !/^shield-back\b/.test(slot ?? '');

/** THE BASH, per view, in arm lengths along the body's facing: drawn `back` over the wind-up, driven out to `reach` on
 *  the machine's hit (melee.js U.hit - where Daggerfall deals the damage) and brought home over the follow; `rise`
 *  lifts the shield as it goes out and `out` carries it to the left, away from the middle of the picture. The third
 *  person throws the trunk behind it (Mac: "more hip, more arm"): the chest turned `yaw` degrees on the hit (negative:
 *  the left shoulder forward), wound `wind` the other way over the wind-up, leaning `lean` into it. The first person's
 *  trunk is the camera's (the eye hangs off the neck), so it keeps it - and a somewhat shorter reach, straight out into
 *  the picture: the bash is seen, the guard's shield (not the fists' clip) is what kept half the screen clear. */
export const BASH = Object.freeze({
  third: Object.freeze({ back: 0.14, reach: 0.46, rise: 0.1, out: 0, yaw: -24, wind: 9, lean: 7 }),
  // (Mac: "in the first person the bash is not seen at all" - 0.22 out and to the side was lost at the picture's edge)
  first: Object.freeze({ back: 0.1, reach: 0.38, rise: 0.06, out: 0, yaw: 0, wind: 0, lean: 0 }),
});
const SECTION_OF = Object.freeze({ AttackWindUp: 'windup', AttackRelease: 'release', AttackEnd: 'follow' });

/** The bash's stroke at u (melee.js's blow clock: the wind-up to U.windup, the hit at U.hit): -1 drawn back fully at
 *  the wind-up's end, 1 out on the hit, 0 at rest - eased between. */
export function bashStroke(u) {
  if (u <= U.windup) return -smooth(u / U.windup);
  if (u <= U.hit) return -1 + 2 * smooth((u - U.windup) / (U.hit - U.windup));
  return 1 - smooth((u - U.hit) / (1 - U.hit));
}
/** How far out the shield stands at u, in arm lengths, for a view's BASH. */
export function bashReach(u, view = 'third') {
  const b = BASH[view] ?? BASH.third, s = bashStroke(u);
  return s < 0 ? s * b.back : s * b.reach;
}

/** The trunk's turn about the rig's up (+Z) by `deg`, spread over the spine (each bone a share, the lowest least), and
 *  bent forward by `lean` - every bone turned in the rig's frame about its own joint. */
function turnTrunk(skeleton, pose, rootRef, skelMats, spine, deg, lean) {
  if (!spine?.length || (!deg && !lean)) return;
  const shares = spine.map((_, i) => (i + 1) / ((spine.length * (spine.length + 1)) / 2));
  spine.forEach((ref, i) => {
    const node = skeleton.nodes.get(ref);
    if (!node) return;
    const mats = skelMats(skeleton, pose, rootRef);
    const parent = mats.get(node.parent);
    const Rp = parent ? rotationPart(parent.a) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const D = mul(rotAxisAngle([0, 0, 1], deg * shares[i] * RAD), rotAxisAngle([-1, 0, 0], lean * shares[i] * RAD));
    const local = pose.get(ref) ?? node.rest;
    pose.set(ref, { ...local, rotation: orthonormal(mul(mul(mul(transpose(Rp), D), Rp), local.rotation)) });
  });
}

/**
 * THE BASH ON THE SKELETON, over the pose as it stands (the clip and the guard's arm laid on it): in the third person
 * the trunk wound and thrown first, then the left wrist moved along the rig's facing (+Y) by bashReach's arm lengths,
 * up by its share of `rise` and left by `out`, reached by the climb's own solver (climbRig.js applyClimbRig) with the
 * hand's frame as the guard held it. Answers the solver's report, or null.
 */
export function applyShieldBash(skeleton, pose, rootRef, skelMats, { u, view = 'third' }) {
  const b = BASH[view] ?? BASH.third, s = bashStroke(u);
  if (!(Math.abs(s) > 1e-4)) return null;
  const bones = climbBones(skeleton);
  const limb = bones?.L;
  if (!limb || limb.upper == null || limb.fore == null || limb.hand == null) return null;
  const before = skelMats(skeleton, pose, rootRef);
  const W0 = at(before, limb.hand), frame = handFrame(before, limb, 'L');
  if (!W0 || !frame) return null;
  turnTrunk(skeleton, pose, rootRef, skelMats, bones.spine, s < 0 ? -s * b.wind : s * b.yaw, Math.max(0, s) * b.lean);
  const mats = skelMats(skeleton, pose, rootRef);
  const S = at(mats, limb.upper), E = at(mats, limb.fore), W = at(mats, limb.hand);
  if (!S || !E || !W) return null;
  const arm = len(sub(E, S)) + len(sub(W, E));
  const out = s < 0 ? s * b.back : s * b.reach, up = Math.max(0, s) * b.rise, side = Math.max(0, s) * b.out;
  // from where the guard held the wrist before the trunk turned: the turn throws the shoulder, the reach the shield
  const target = add(W0, [-side * arm, out * arm, up * arm]);
  return applyClimbRig(skeleton, pose, rootRef, skelMats, { w: 1, hands: { L: { at: target, fingers: frame.fingers, palm: frame.palm } } });
}

/** poseAssembly's `hold` slot for a bash in the machine's section (`upper`, fpArm.js UPPER_BODY_NAME) at its section's
 *  `progress`, in a `view` - or null outside a blow. */
export function shieldBashHold(upper, progress, view = 'third') {
  const section = SECTION_OF[upper];
  if (!section) return null;
  const u = blowU(section, progress);
  return (skeleton, pose, rootRef, skelMats) => applyShieldBash(skeleton, pose, rootRef, skelMats, { u, view });
}
