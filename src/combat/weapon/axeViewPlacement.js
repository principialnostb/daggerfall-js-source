// MW-SKY-AXE-READY: placement of the EXISTING first-person rig, hands and weapon together.
// DFU FPSWeapon.GetWeaponRect moves the sprite; this is the 3D lane's deliberate presentation equivalent.
// Existing hand bones are solved onto a wider grip; meshes, clocks, FOV and third person stay unchanged.
import { lookAt } from '../../world/mat4.js';
import { climbBones, handFrame, applyClimbRig, rotAxisAngle, rotationPart, rotFraction } from '../climbRig.js';
import { mat33Mul } from '../../formats/morrowind/mwNifMesh.js';
import { sampleTrack, resetClip } from '../../formats/morrowind/mwAnim.js';
import { pickAnimSource } from '../../formats/morrowind/mwFirstPerson.js';

const states = new WeakMap();
const isAxe = built => built?.weapon?.model === 'skyrim_steel_battleaxe.nif';
// Use the normal first-person camera. Only the ready hand solve needs a transition.
export const AXE_VIEW_PLACEMENT = Object.freeze({ ease: 0.12 });
// Retain the mod's gait phase and wrist travel; reduce the angle amplified by the long shaft.
export const AXE_GAIT_ANGLE_SHARE = 0.45;

/** Step on game time, once per frame, never on a screenshot/draw clock. Other weapons reset immediately. */
export function stepAxePlacement(built, wanted, dt, attacking = false, moving = false) {
  if (!built?.arm) return;
  if (!isAxe(built)) { states.delete(built.arm); return; }
  const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const oldHold = states.get(built.arm)?.holdWeight ?? 0;
  const holdGoal = wanted && !attacking ? 1 : 0;
  const holdWeight = holdGoal + (oldHold - holdGoal) * Math.exp(-elapsed / AXE_VIEW_PLACEMENT.ease);
  const oldMotion = states.get(built.arm)?.motionWeight ?? 0;
  const motionGoal = wanted && moving && !attacking ? 1 : 0;
  const motionWeight = motionGoal + (oldMotion - motionGoal) * Math.exp(-elapsed / AXE_VIEW_PLACEMENT.ease);
  states.set(built.arm, { ...states.get(built.arm), holdWeight, motionWeight });
}

/** Same lens as every other weapon: no retreat that exposes shoulder/forearm geometry. */
export function firstPersonLens(eye, pitch) {
  const fwd = [0, Math.sin(pitch), -Math.cos(pitch)];
  return lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 1, 0]);
}


const sub = (a, b) => a.map((v, k) => v - b[k]);
const add = (a, b) => a.map((v, k) => v + b[k]);
const scale = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);
const apply = (m, p) => [0, 1, 2].map(k => m[k * 3] * p[0] + m[k * 3 + 1] * p[1] + m[k * 3 + 2] * p[2]);
export const AXE_GRIP_SPAN = 22;

/** The selected idle source, sampled separately: never capture a moving frame as the reference. */
function idleHandReference(built, skeleton, root, skelMats, bones, current) {
  const state = states.get(built.arm);
  if (state.reference && state.referenceTracks === built.tracks && state.referenceSources === built.sources) return state.reference;
  // buildFpArm boots SHEATHED. Its built.clip is not the drawn axe's idle.
  const drawn = pickAnimSource(built.sources, 'idle2c', resetClip, { loopFallback: true });
  const tracks = drawn?.source.trackMap ?? built.tracks;
  const time = drawn?.state.startTime ?? built.clip?.startTime;
  let mats = current;
  if (tracks && Number.isFinite(time) && built.arm.fns?.poseSkeleton) {
    const idle = built.arm.fns.poseSkeleton(skeleton, tracks, sampleTrack, time, { accumRoot: built.accumRoot });
    mats = skelMats(skeleton, idle, root);
  }
  const reference = sub(mats.get(bones.R.hand).t, mats.get(built.cameraRef).t);
  state.reference = reference;
  state.referenceRotation = rotationPart(mats.get(bones.R.hand).a);
  state.referenceTracks = built.tracks;
  state.referenceSources = built.sources;
  return reference;
}

/** Wider ready grip, before skinning: the very same hands, cuffs and fingers as the normal arm. */
export function axeReadyHold(built, fallback = null) {
  const state = isAxe(built) && built?.arm ? states.get(built.arm) : null;
  if (!(state?.holdWeight > 1e-4)) return fallback;
  return (skeleton, pose, root, skelMats) => {
    const mats = skelMats(skeleton, pose, root), bones = climbBones(skeleton);
    const weapon = mats.get(skeleton.byName.get('weapon bone'));
    const eye = mats.get(built.cameraRef)?.t;
    const right = bones && handFrame(mats, bones.R, 'R'), left = bones && handFrame(mats, bones.L, 'L');
    if (!weapon || !eye || !right?.palm || !left?.palm) return null;
    const turn = mat33Mul(rotAxisAngle([0, 1, 0], 50 * Math.PI / 180), rotAxisAngle([1, 0, 0], -25 * Math.PI / 180));
    const reference = idleHandReference(built, skeleton, root, skelMats, bones, mats);
    const transpose = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
    const current = rotationPart(mats.get(bones.R.hand).a), idle = state.referenceRotation;
    const delta = mat33Mul(current, transpose(idle));
    const share = 1 - (1 - AXE_GAIT_ANGLE_SHARE) * (state.motionWeight ?? 0);
    const desired = mat33Mul(rotFraction(delta, share), idle);
    const correction = mat33Mul(desired, transpose(current));
    const orient = mat33Mul(turn, correction);
    const axis0 = [weapon.a[1], weapon.a[4], weapon.a[7]];
    const axis = scale(axis0, 1 / Math.hypot(...axis0));
    const along = apply(orient, axis);
    const across = sub(sub(left.wrist, right.wrist), scale(axis, dot(sub(left.wrist, right.wrist), axis)));
    // Keep the source translation/phase; only its rotation about the drawn idle is reduced.
    const motion = sub(sub(right.wrist, eye), reference);
    const atR = add(add(eye, [7, 28, -11]), motion);
    const atL = sub(add(atR, apply(orient, across)), scale(along, AXE_GRIP_SPAN));
    // No forced outward elbow poles: retain each source clip's natural elbow plane.
    return applyClimbRig(skeleton, pose, root, skelMats, { w: state.holdWeight, hands: {
      R: { at: atR, fingers: apply(orient, right.fingers), palm: apply(orient, right.palm), shrug: 0 },
      L: { at: atL, fingers: apply(orient, left.fingers), palm: apply(orient, left.palm), shrug: 0 },
    } });
  };
}
