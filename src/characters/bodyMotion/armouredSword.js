// @ts-check
// Armoured-Twohand-Pilot.md: a grounded armoured body's collected support. The
// clips keep their cadence and feet; starts/stops load the knees and trunk,
// also sheathed. Sword blows add trunk effort. A steady walk has no added sway.
// DFU has no articulated
// body (WeaponManager/FPSWeapon); this is a presentation departure.
import { MW_WEAPON_TYPE } from '../../formats/morrowind/mwFirstPerson.js';
import { clamp, ease, bodyOf, at, transpose, apply, algebra } from './bodyKit.js';
import { blowLegsPose } from './blowLegs.js';
import { solveBody } from './bodySolve.js';
import { rotationPart } from '../../combat/climbRig.js';

export const ARMOURED_SWORD = Object.freeze({
  acceleration: 0.009, maxPitch: 0.14, maxRoll: 0.065,
  runPitch: 0.075, response: 0.10, velocityResponse: 0.12, minimumArmour: 0.4,
  compression: 0.035, loadAcceleration: 28,
});

export const collectedSwordRecovery = (view, type, on) => !!on && view === 'third' && type === MW_WEAPON_TYPE.LongBladeTwoHand;

export function createArmouredSword() {
  let previous = null;
  let pitch = 0, roll = 0, yaw = 0, drop = 0;
  const layer = {
    step(dt, active, word, armour = 0) {
      if (!(dt > 0)) return layer.pose();
      if (!active || !word?.kind || word.busy || word.grounded === false || word.swimming || word.levitating) {
        layer.reset(); return layer.pose();
      }
      const eligible = active && word?.kind && !word.busy && !word.rifle
        && word.grounded !== false && !word.swimming && !word.levitating
        && armour >= ARMOURED_SWORD.minimumArmour;
      // Actual displacement, in the body's current frame: turning the camera
      // while travelling must not be mistaken for a sideways acceleration.
      const tr = word?.travel;
      let vf = 0, vr = 0, af = 0, ar = 0;
      if (eligible && Array.isArray(tr) && tr.every(Number.isFinite)) {
        const heading = Number(word.yaw) || 0, c = Math.cos(heading), s = Math.sin(heading);
        if (previous) {
          const vx = (tr[0] - previous.x) / dt, vz = (tr[2] - previous.z) / dt;
          if (Math.hypot(vx, vz) < 25) {
            vf = vx * s + vz * c; vr = vx * c - vz * s;
            const fx = ease(previous.vx ?? vx, vx, ARMOURED_SWORD.velocityResponse, dt);
            const fz = ease(previous.vz ?? vz, vz, ARMOURED_SWORD.velocityResponse, dt);
            if (previous.vx != null) {
              const ax = (fx - previous.vx) / dt, az = (fz - previous.vz) / dt;
              af = ax * s + az * c; ar = ax * c - az * s;
            }
            previous = { x: tr[0], z: tr[2], vx: fx, vz: fz };
          } else previous = { x: tr[0], z: tr[2], vx: null, vz: null };
        } else previous = { x: tr[0], z: tr[2], vx: 0, vz: 0 };
      } else previous = null;
      const moving = eligible && Math.hypot(vf, vr) > 0.3;
      // Standing blows already have BLOW-LEGS' accepted hip movement. Moving
      // blows keep the stride and convey a smaller share through the trunk.
      const blow = moving && word.shown && word.mwType === MW_WEAPON_TYPE.LongBladeTwoHand && word.blow ? blowLegsPose({ ...word.blow, sword: true }, armour) : null;
      const run = eligible && word.running ? ARMOURED_SWORD.runPitch * clamp(vf / 8, -0.4, 1) : 0;
      const goalP = eligible ? clamp(af * ARMOURED_SWORD.acceleration + run + (blow?.pitch ?? 0) * 0.35, -ARMOURED_SWORD.maxPitch, ARMOURED_SWORD.maxPitch) : 0;
      const goalR = eligible ? clamp(ar * ARMOURED_SWORD.acceleration * 0.5, -ARMOURED_SWORD.maxRoll, ARMOURED_SWORD.maxRoll) : 0;
      pitch = ease(pitch, goalP, ARMOURED_SWORD.response, dt);
      roll = ease(roll, goalR, ARMOURED_SWORD.response, dt);
      yaw = ease(yaw, (blow?.yaw ?? 0) * 0.3, ARMOURED_SWORD.response, dt);
      const load = eligible && !word.blow ? Math.min(1, Math.hypot(af, ar) / ARMOURED_SWORD.loadAcceleration) * ARMOURED_SWORD.compression * armour : 0;
      drop = ease(drop, load, ARMOURED_SWORD.response, dt);
      return layer.pose();
    },
    pose: () => ({ pitch, roll, yaw, drop }),
    // Compress the support at a start/stop. Preserve the clip's two foot
    // positions and orientations, then let the knees accommodate the pelvis.
    apply(skeleton, pose, rootRef, skelMats) {
      if (!(drop > 1e-5)) return null;
      const body = bodyOf(skeleton, rootRef, skelMats);
      if (!body) return null;
      const mats = skelMats(skeleton, pose, rootRef), feet = {};
      for (const side of ['L', 'R']) {
        const ref = body.bones[side].foot, axes = body.footAxes[side];
        if (ref == null || !axes) return null;
        const R = rotationPart(mats.get(ref).a);
        feet[side] = { at: [...at(mats, ref)], toe: apply(R, axes.fwd), up: apply(R, axes.up), w: 1 };
      }
      const ref = body.bones.pelvis, node = skeleton.nodes.get(ref);
      if (!node) return null;
      const parent = mats.get(node.parent), local = pose.get(ref) ?? node.rest;
      const delta = [0, 0, -drop * body.leg];
      const dv = parent ? algebra.scale(apply(transpose(rotationPart(parent.a)), delta), 1 / (Math.hypot(parent.a[0], parent.a[3], parent.a[6]) || 1)) : delta;
      pose.set(ref, { ...local, translation: algebra.add(local.translation, dv) });
      return solveBody(skeleton, pose, rootRef, skelMats, { w: 1, feet });
    },
    reset() { previous = null; pitch = roll = yaw = drop = 0; },
  };
  return layer;
}
