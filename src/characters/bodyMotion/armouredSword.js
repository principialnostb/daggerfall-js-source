// @ts-check
// Armoured-Twohand-Pilot.md: a grounded sword's collected posture. The clips keep
// their cadence and feet. Starts/stops ask the trunk for extra effort; the
// blow's amplitude belongs to blowLegs.js in every gait. DFU has no articulated
// body (WeaponManager/FPSWeapon); this is a presentation departure.
import { MW_WEAPON_TYPE } from '../../formats/morrowind/mwFirstPerson.js';
import { clamp, ease } from './bodyKit.js';

export const ARMOURED_SWORD = Object.freeze({
  acceleration: 0.004, maxPitch: 0.085, maxRoll: 0.045,
  runPitch: 0.045, response: 0.075, velocityResponse: 0.08, minimumArmour: 0.4,
});

export function createArmouredSword() {
  let previous = null;
  let pitch = 0, roll = 0, yaw = 0;
  const layer = {
    step(dt, active, word, armour = 0) {
      if (!(dt > 0)) return layer.pose();
      const eligible = active && word?.on && !word.busy && !word.equip && !word.spell && !word.rifle
        && word.grounded !== false && !word.swimming && !word.levitating
        && word.shown && word.mwType === MW_WEAPON_TYPE.LongBladeTwoHand
        && armour >= ARMOURED_SWORD.minimumArmour;
      // Actual displacement, in the body's current frame: turning the camera
      // while travelling must not be mistaken for a sideways acceleration.
      const tr = word?.travel;
      let vf = 0, af = 0, ar = 0;
      if (eligible && Array.isArray(tr) && tr.every(Number.isFinite)) {
        const heading = Number(word.yaw) || 0, c = Math.cos(heading), s = Math.sin(heading);
        if (previous) {
          const vx = (tr[0] - previous.x) / dt, vz = (tr[2] - previous.z) / dt;
          if (Math.hypot(vx, vz) < 25) {
            vf = vx * s + vz * c;
            const fx = ease(previous.vx ?? vx, vx, ARMOURED_SWORD.velocityResponse, dt);
            const fz = ease(previous.vz ?? vz, vz, ARMOURED_SWORD.velocityResponse, dt);
            if (previous.vx != null) {
              const ax = (fx - previous.vx) / dt, az = (fz - previous.vz) / dt;
              af = ax * s + az * c; ar = ax * c - az * s;
            }
            previous = { x: tr[0], z: tr[2], vx: fx, vz: fz };
          } else previous = { x: tr[0], z: tr[2], vx: null, vz: null };
        } else previous = { x: tr[0], z: tr[2], vx: null, vz: null };
      } else previous = null;
      // BLOW-LEGS owns the same attack amplitude standing and moving. This
      // layer supplies only locomotion posture, never a second attack turn.
      const run = eligible && word.running ? ARMOURED_SWORD.runPitch * clamp(vf / 8, -0.4, 1) : 0;
      const goalP = eligible ? clamp(af * ARMOURED_SWORD.acceleration + run, -ARMOURED_SWORD.maxPitch, ARMOURED_SWORD.maxPitch) : 0;
      const goalR = eligible ? clamp(ar * ARMOURED_SWORD.acceleration * 0.5, -ARMOURED_SWORD.maxRoll, ARMOURED_SWORD.maxRoll) : 0;
      pitch = ease(pitch, goalP, ARMOURED_SWORD.response, dt);
      roll = ease(roll, goalR, ARMOURED_SWORD.response, dt);
      yaw = 0;
      return layer.pose();
    },
    pose: () => ({ pitch, roll, yaw }),
    reset() { previous = null; pitch = roll = yaw = 0; },
  };
  return layer;
}
