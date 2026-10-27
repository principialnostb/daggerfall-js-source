// @ts-check
// BODY-WEIGHT (2026-10-27, MOTION-DOCTRINE pilot step 2, bible/05-Combat/Motion-Doctrine.md section 7): THE BODY'S MASS,
// SHOWN. One number from what the body wears and holds - plate heavier than chain, chain than leather, a two-hander than
// a one-hander - and the trunk's answer to the body's REAL acceleration (the doctrine's decision: the motion of the
// character is not changed; the animation reads it): it leans into a start, back against a stop, into a sidestep, and
// settles - a stiff spring with a little overshoot, so a stop is not a frame's halt but the trunk coming to rest. The
// heavier the body, the slower and deeper that answer. Laid ADDITIVELY over the clip's trunk (the spine above the bone
// the thighs hang from), never replacing it: the clip still draws the arc of the arms and the weapon (section 4).
// Daggerfall Unity draws no body to lean and Morrowind's clips carry no acceleration, so this is the port's own.

import { algebra, bodyOf, bodyTurn, turnOf, transpose, mul, clamp, clamp01, ease, at } from './bodyKit.js';
import { MW_WEAPON_TYPE } from '../../formats/morrowind/mwFirstPerson.js';
import { orthonormal } from '../../combat/climbRig.js';

const { lerp } = algebra;

/** Each classic armour piece's share of a full suit's mass, by its Daggerfall template (102 cuirass .. 108 boots), and a
 *  shield's. */
export const PIECE_SHARE = Object.freeze({ 102: 0.32, 103: 0.06, 104: 0.2, 105: 0.07, 106: 0.07, 107: 0.1, 108: 0.1 });
export const SHIELD_SHARE = 0.08;
/** A material's heft by its Daggerfall class (the material's high byte: leather 0, chain 1, plate 2 and up). */
export const MATERIAL_HEFT = Object.freeze([0.3, 0.6, 1]);
/** How much of the body's weight the armour gives and the weapon gives; a weapon's heft by its grip. */
export const WEIGHT_MIX = Object.freeze({ armor: 0.65, weapon: 0.35, twoHanded: 1, oneHanded: 0.45 });
/** The Morrowind weapon types held in two hands (a bow's draw is the arms', not the body's heft). */
/** @type {readonly number[]} */
const TWO_HANDED_TYPES = Object.freeze([MW_WEAPON_TYPE.LongBladeTwoHand, MW_WEAPON_TYPE.BluntTwoClose, MW_WEAPON_TYPE.BluntTwoWide, MW_WEAPON_TYPE.SpearTwoWide, MW_WEAPON_TYPE.AxeTwoHand]);

/** THE WEIGHT, 0 (bare and empty-handed) to 1 (full plate and a two-hander): `armor` the worn pieces
 *  (mwItemMap.js dfWornEquipment's - `{ kind, templateIndex, material }`), `mwType` the drawn weapon's Morrowind type. */
export function bodyWeightOf({ armor = null, mwType = MW_WEAPON_TYPE.None } = {}) {
  let a = 0;
  for (const p of armor ?? []) {
    if (!p || p.kind === 'clothing' || typeof p.templateIndex !== 'number') continue;
    const share = PIECE_SHARE[p.templateIndex] ?? (p.templateIndex > 108 ? SHIELD_SHARE : 0);
    a += share * (MATERIAL_HEFT[Math.min(2, Math.max(0, (Number(p.material) || 0) >> 8))] ?? 1);
  }
  const armorW = clamp01(a);
  const weaponW = TWO_HANDED_TYPES.includes(mwType) ? WEIGHT_MIX.twoHanded : mwType >= 0 && mwType <= MW_WEAPON_TYPE.MarksmanThrown ? WEIGHT_MIX.oneHanded : 0;
  return { armor: armorW, weapon: weaponW, w: clamp01(WEIGHT_MIX.armor * armorW + WEIGHT_MIX.weapon * weaponW) };
}

/**
 * THE LEAN LAW. The body's velocity in its own frame is followed over `velTau` (the motor's speed changes in a frame;
 * the body's mass does not), its change is the acceleration, and the trunk is asked `accel` radians per m/s^2 of it,
 * pitched forward for a start and back for a stop, rolled toward a sidestep, never past `max`. A spring takes the trunk
 * there: `omega` (radians a second) light to heavy, `zeta` its damping - under 1, so it overshoots a little and settles
 * (SHARPNESS: stiff, never jelly). `gain` the lean's depth, light to heavy. `limit` m/s: a step faster than that is a
 * teleport, not a run.
 */
export const LEAN = Object.freeze({
  velTau: 0.08, accel: 0.01, side: 0.6, max: 0.3,
  omega: Object.freeze([14, 9]), zeta: Object.freeze([0.5, 0.42]), gain: Object.freeze([0.5, 1]), limit: 25,
});

/**
 * THE CARRY OF MASS while the body travels (the owner, 2026-10-27, walking in plate: "I see no difference" - the lean
 * answers only a change of speed, and a steady walk had nothing of the weight): a heavy body leans a little into its
 * travel (`carry` radians, bare to full weight, at a walk's pace and over - back a half of it when backing) and shifts
 * its trunk over the foot it stands on with every step (`roll`, read off the clip's own feet each frame - the lower
 * foot is the one standing - so it is always in step: full at a foot raised `lift` of the leg). Both come on with
 * the travel over `ease` seconds; `pace` m/s is a walk (DFU's walk at Speed 50).
 */
export const SWAY = Object.freeze({ carry: Object.freeze([0, 0.07]), roll: Object.freeze([0.012, 0.075]), lift: 0.12, pace: 4.4, on: 0.6, ease: 0.15 });

/** One spring step toward `goal` of x'' = w^2 (goal - x) - 2 z w x' - semi-implicit Euler, sub-stepped at 120 Hz so it is
 *  stable at any frame time. */
function springStep(s, goal, omega, zeta, dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (omega * omega * (goal - s.x) - 2 * zeta * omega * s.v) * h;
    s.x += s.v * h;
  }
}

/** THE LAYER: the weight, the followed velocity and the trunk's two springs (pitch, roll). */
export function createBodyWeight() {
  let travel = null; let yaw0 = null;
  const vel = { f: 0, r: 0 }; let velPrev = null;
  const pitch = { x: 0, v: 0 }, roll = { x: 0, v: 0 };
  let weight = 0; let on = false; let slotMemo = null; let moving = 0;
  const layer = {
    /**
     * One frame: `active` (the switch, the third person, on the ground and on its feet), `move` the motor's word
     * (`travel` world metres cumulative, x/y/z with y up; `bodyYaw` radians), and the weight's inputs.
     */
    step(dt, { active = false, move = null, armor = null, mwType = MW_WEAPON_TYPE.None } = {}) {
      weight = bodyWeightOf({ armor, mwType }).w;
      on = !!active;
      if (!(dt > 0)) return layer.lean();
      const tr = move?.travel, yaw = Number(move?.bodyYaw);
      let vf = 0, vr = 0, fresh = true;
      if (Array.isArray(tr) && tr.every(Number.isFinite) && Number.isFinite(yaw)) {
        if (travel && yaw0 != null) {
          const wx = tr[0] - travel[0], wz = tr[2] - travel[2];
          if (Math.hypot(wx, wz) / dt <= LEAN.limit) {
            const c = Math.cos(yaw0), s = Math.sin(yaw0);
            vr = (wx * c - wz * s) / dt; vf = (wx * s + wz * c) / dt; fresh = false;
          }
        }
        travel = [tr[0], tr[1], tr[2]]; yaw0 = yaw;
      } else { travel = null; yaw0 = null; }
      if (fresh) { vel.f = vf; vel.r = vr; velPrev = null; }
      vel.f = ease(vel.f, vf, LEAN.velTau, dt); vel.r = ease(vel.r, vr, LEAN.velTau, dt);
      const af = velPrev ? (vel.f - velPrev.f) / dt : 0, ar = velPrev ? (vel.r - velPrev.r) / dt : 0;
      velPrev = { f: vel.f, r: vel.r };
      const g = lerp(LEAN.gain[0], LEAN.gain[1], weight);
      const speed = Math.hypot(vel.f, vel.r);
      moving = ease(moving, on && speed > SWAY.on ? Math.min(1, speed / SWAY.pace) : 0, SWAY.ease, dt);
      const carry = lerp(SWAY.carry[0], SWAY.carry[1], weight) * moving * (speed > 1e-3 ? clamp(vel.f / speed, -0.5, 1) : 0);
      const goalP = on ? clamp(LEAN.accel * g * af + carry, -LEAN.max, LEAN.max) : 0;
      const goalR = on ? clamp(LEAN.accel * LEAN.side * g * ar, -LEAN.max, LEAN.max) : 0;
      const omega = lerp(LEAN.omega[0], LEAN.omega[1], weight), zeta = lerp(LEAN.zeta[0], LEAN.zeta[1], weight);
      springStep(pitch, goalP, omega, zeta, dt);
      springStep(roll, goalR, omega, zeta, dt);
      if (!on && Math.abs(pitch.x) < 1e-4 && Math.abs(roll.x) < 1e-4) { pitch.x = pitch.v = roll.x = roll.v = 0; }
      return layer.lean();
    },
    /** The rig's frame (combat/fpArm.js, positional so the host spends one line): `on` the switch in third person, the
     *  frame's `cam` (its `move` word), the worn pieces and the drawn weapon's type, and whether the body is dead. */
    stepRig(dt, on, cam, armor, mwType, dead) {
      const mv = cam?.move ?? null;
      const active = !!on && !dead && !!mv && mv.grounded !== false && !mv.swimming && !mv.levitating && !mv.climbing && !cam?.climb && !cam?.seat && !cam?.saddle;
      return layer.step(dt, { active, move: mv, armor, mwType });
    },
    /** The trunk's lean now (radians, bodyTurn's sense: pitch + the front down, roll + the right side down). */
    lean: () => ({ pitch: pitch.x, roll: roll.x }),
    /** The step's shift over the standing foot now: its full roll (radians) and how far it is on (0..1). */
    sway: () => ({ roll: lerp(SWAY.roll[0], SWAY.roll[1], weight) * moving, on: moving }),
    weight: () => weight,
    /** poseAssembly's `motion` slot with this layer after `inner` (the body-motion layer's): the lean on the trunk. */
    slot(inner) {
      if (slotMemo && slotMemo.inner === inner) return slotMemo.fn;
      slotMemo = { inner, fn: (skeleton, pose, rootRef, skelMats) => {
        const report = inner ? inner(skeleton, pose, rootRef, skelMats) : null;
        const lean = layer.lean(), sway = layer.sway();
        let mats = null;
        if (sway.roll > 1e-4) {
          const body = bodyOf(skeleton, rootRef, skelMats);
          mats = body ? skelMats(skeleton, pose, rootRef) : null;
          const zl = mats ? at(mats, body.bones.L.foot)?.[2] : null, zr = mats ? at(mats, body.bones.R.foot)?.[2] : null;
          if (Number.isFinite(zl) && Number.isFinite(zr)) lean.roll -= sway.roll * clamp((zr - zl) / (SWAY.lift * body.leg), -1, 1);
        }
        leanTrunk(skeleton, pose, rootRef, skelMats, lean, mats);
        return report;
      } };
      return slotMemo.fn;
    },
    reset() { moving = 0; travel = null; yaw0 = null; vel.f = vel.r = 0; velPrev = null; pitch.x = pitch.v = roll.x = roll.v = 0; },
  };
  return layer;
}

/** THE LEAN ON THE TRUNK: the turn spread evenly up the spine above the bone the thighs hang from (bodyKit.js `trunk`),
 *  each share turned about the body's own axes in rig space over what the clip posed - the legs and the hips untouched.
 *  Writes new entries into `pose`; `posed` this pose's matrices when the caller has them. Answers whether it posed. */
export function leanTrunk(skeleton, pose, rootRef, skelMats, { pitch = 0, roll = 0 } = {}, posed = null) {
  if (!(Math.abs(pitch) > 1e-5 || Math.abs(roll) > 1e-5)) return false;
  const body = bodyOf(skeleton, rootRef, skelMats);
  if (!body || !body.trunk?.length) return false;
  const mats = posed ?? skelMats(skeleton, pose, rootRef);   // the slot's own, when it read the feet off this pose
  const n = body.trunk.length;
  const step = bodyTurn(0, roll / n, pitch / n);
  /** @type {ArrayLike<number>} */
  let C = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (const ref of body.trunk) {
    const node = skeleton.nodes.get(ref);
    const W = turnOf(mats, ref), Wp = node?.parent != null ? turnOf(mats, node.parent) : null;
    if (!node || !W) continue;
    const Cprev = C; C = mul(step, C);
    const newWorld = mul(C, W), newParent = Wp ? mul(Cprev, Wp) : null;
    const local = pose.get(ref) ?? node.rest;
    pose.set(ref, { rotation: orthonormal(newParent ? mul(transpose(newParent), newWorld) : newWorld), translation: local.translation, scale: local.scale });
  }
  return true;
}
