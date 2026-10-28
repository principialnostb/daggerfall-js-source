// @ts-check
// FP-INERTIA (2026-10-27, MOTION-DOCTRINE pilot step 4, bible/05-Combat/Motion-Doctrine.md): THE FIRST-PERSON HANDS
// CARRY WEIGHT. The viewmodel was glued to the eye (RULE 54: the camera is a node of the rig, so a turn of the head never
// moved the arms against the view); now the arms and what they hold answer the look and the body - they lag a turn
// and a glance and swing back, sway against a start and a stop, dip on a landing and lift on a jump - through stiff
// springs (SHARPNESS: a little overshoot, never jelly) whose stiffness, depth and damping are the body's WEIGHT
// (characters/bodyMotion/bodyWeight.js): a dagger is quick and light, a two-hander in plate slow and deep. The idea is
// First Person (FP) Inertia's (TheShinyHaxorus, Skyrim SE, Nexus 167883, MIT) - one spring per weapon class, a look
// spring and a movement spring, pivoted at the shoulder; the code is the port's own. Laid in front of the lens as the
// gun's kick is (combat/gun/gunFeel.js armKickMatrix), so the whole viewmodel moves as one and nothing else in the
// pass does. Daggerfall Unity draws its hands as a screen sprite that never lags, so this is a departure from it.
// 2026-10-28, Armoured-Twohand-Pilot.md: camera-driven sway retired at the
// owner's judgement; only acceleration, jumping and landing remain active.

import { bodyWeightOf } from '../characters/bodyMotion/bodyWeight.js';
import { algebra, clamp, ease } from '../characters/bodyMotion/bodyKit.js';
import { multiply } from '../world/mat4.js';
import { MW_WEAPON_TYPE } from '../formats/morrowind/mwFirstPerson.js';

const { lerp } = algebra;

/**
 * THE LAWS, each `[light, heavy]` by the weight:
 *   look  - radians of lag per radian a second of turn (`yaw`) and of glance (`pitch`), never past `maxRot`; the arms
 *           also slide `slide` metres per radian a second against a turn and roll `roll` of the yaw lag into it;
 *   move  - metres of sway per m/s^2 of the body's own acceleration (back against a start, sideways against a step),
 *           never past `maxMove`; the body's velocity followed over `velTau`;
 *   land  - a landing's dip (metres a second of the spring's velocity, at a full fall of `fall` seconds aloft) and a
 *           jump's lift;
 *   omega, zeta - the springs' stiffness (radians a second) and damping (under 1: a little overshoot).
 * `pivot` the shoulder in the eye's space (metres: right, up, back - the eye looks down -Z).
 */
export const FP_INERTIA = Object.freeze({
  cameraSway: false,   // Owner, 2026-10-28: added look lag distracts; existing clip motion is sufficient.
  look: Object.freeze({ yaw: Object.freeze([0.018, 0.032]), pitch: Object.freeze([0.014, 0.026]), maxRot: 0.16, slide: Object.freeze([0.004, 0.008]), roll: 0.35 }),
  move: Object.freeze({ gain: Object.freeze([0.0009, 0.0015]), maxMove: 0.05, velTau: 0.08 }),
  land: Object.freeze({ dip: Object.freeze([0.5, 0.9]), lift: Object.freeze([0.18, 0.3]), fall: 0.8 }),
  omega: Object.freeze([18, 11]), zeta: Object.freeze([0.55, 0.45]),
  pivot: Object.freeze([0.18, -0.2, 0.05]),
  limit: 25,
});

/** One spring step toward `goal` - semi-implicit Euler, sub-stepped at 120 Hz (bodyWeight.js's). */
function spring(s, goal, omega, zeta, dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (omega * omega * (goal - s.x) - 2 * zeta * omega * s.v) * h;
    s.x += s.v * h;
  }
}
const sp = () => ({ x: 0, v: 0 });

/** THE LAYER: six springs - the viewmodel's yaw, pitch and roll, its right, up and back - and what they read. */
export function createFpInertia() {
  const yaw = sp(), pitch = sp(), roll = sp(), x = sp(), y = sp(), z = sp();
  let lastYaw = null, lastPitch = null, travel = null, travelYaw = null, velPrev = null, airTime = 0, wasGrounded = true;
  const vel = { f: 0, r: 0 };
  let weight = 0, on = false;
  const layer = {
    /**
     * One frame: `active` (the switch, the first person, a body that stands), the frame's `cam` (`yaw`, `pitch` and its
     * `move` word: `travel` world metres, `bodyYaw`, `grounded`) and the weight's inputs.
     */
    step(dt, { active = false, cam = null, armor = null, mwType = MW_WEAPON_TYPE.None } = {}) {
      weight = bodyWeightOf({ armor, mwType }).w;
      on = !!active;
      if (!(dt > 0)) return layer.pose();
      const L = (pair) => lerp(pair[0], pair[1], weight);
      const omega = L(FP_INERTIA.omega), zeta = L(FP_INERTIA.zeta);
      // the look: the turn and the glance this frame, as rates
      const cy = Number(cam?.yaw), cp = Number(cam?.pitch);
      let yawRate = 0, pitchRate = 0;
      if (Number.isFinite(cy) && lastYaw != null) { let d = cy - lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yawRate = d / dt; }
      if (Number.isFinite(cp) && lastPitch != null) pitchRate = (cp - lastPitch) / dt;
      lastYaw = Number.isFinite(cy) ? cy : null; lastPitch = Number.isFinite(cp) ? cp : null;
      const maxRot = FP_INERTIA.look.maxRot;
      const lookOn = on && FP_INERTIA.cameraSway;
      const gYaw = lookOn ? clamp(L(FP_INERTIA.look.yaw) * yawRate, -maxRot, maxRot) : 0;
      const gPitch = lookOn ? clamp(-L(FP_INERTIA.look.pitch) * pitchRate, -maxRot, maxRot) : 0;
      // the body: its own velocity in its facing, followed, and its change
      const mv = cam?.move ?? null, tr = mv?.travel, by = Number(mv?.bodyYaw);
      let vf = 0, vr = 0, fresh = true;
      if (Array.isArray(tr) && tr.every(Number.isFinite) && Number.isFinite(by)) {
        if (travel && travelYaw != null) {
          const wx = tr[0] - travel[0], wz = tr[2] - travel[2];
          if (Math.hypot(wx, wz) / dt <= FP_INERTIA.limit) {
            const c = Math.cos(travelYaw), s = Math.sin(travelYaw);
            vr = (wx * c - wz * s) / dt; vf = (wx * s + wz * c) / dt; fresh = false;
          }
        }
        travel = [tr[0], tr[1], tr[2]]; travelYaw = by;
      } else { travel = null; travelYaw = null; }
      if (fresh) { vel.f = vf; vel.r = vr; velPrev = null; }
      vel.f = ease(vel.f, vf, FP_INERTIA.move.velTau, dt); vel.r = ease(vel.r, vr, FP_INERTIA.move.velTau, dt);
      const af = velPrev ? (vel.f - velPrev.f) / dt : 0, ar = velPrev ? (vel.r - velPrev.r) / dt : 0;
      velPrev = { f: vel.f, r: vel.r };
      const mg = L(FP_INERTIA.move.gain), mm = FP_INERTIA.move.maxMove;
      const gBack = on ? clamp(mg * af, -mm, mm) : 0;   // a start leaves the arms behind (toward the eye, +Z)
      const gSide = on ? clamp(-mg * ar, -mm, mm) - (lookOn ? clamp(L(FP_INERTIA.look.slide) * yawRate, -mm, mm) : 0) : 0;
      // a landing dips the arms, a jump lifts them: an impulse on the up spring
      const grounded = mv?.grounded !== false;
      if (on && grounded && !wasGrounded) y.v -= L(FP_INERTIA.land.dip) * Math.min(1, airTime / FP_INERTIA.land.fall);
      if (on && !grounded && wasGrounded && mv?.jumping) y.v += L(FP_INERTIA.land.lift);
      airTime = grounded ? 0 : airTime + dt;
      wasGrounded = grounded;
      spring(yaw, gYaw, omega, zeta, dt);
      spring(pitch, gPitch, omega, zeta, dt);
      spring(roll, on ? -FP_INERTIA.look.roll * gYaw : 0, omega, zeta, dt);
      spring(x, gSide, omega, zeta, dt);
      spring(y, 0, omega, zeta, dt);
      spring(z, gBack, omega, zeta, dt);
      if (!on) for (const s of [yaw, pitch, roll, x, y, z]) if (Math.abs(s.x) < 1e-5 && Math.abs(s.v) < 1e-4) { s.x = 0; s.v = 0; }
      return layer.pose();
    },
    /** The rig's frame (combat/fpArm.js, positional so the host spends one line). */
    stepRig(dt, on, cam, armor, mwType, dead) {
      const mv = cam?.move ?? null;
      const active = !!on && !dead && !mv?.climbing && !cam?.climb && !cam?.seat && !cam?.saddle;
      return layer.step(dt, { active, cam, armor, mwType });
    },
    /** The viewmodel's offset now: radians `yaw` (+ about up, to the left), `pitch` (+ up), `roll`, and metres
     *  `x` (right), `y` (up), `z` (back toward the eye). */
    pose: () => ({ yaw: yaw.x, pitch: pitch.x, roll: roll.x, x: x.x, y: y.x, z: z.x }),
    weight: () => weight,
    /** `view` (the lens, column-major) with the offset laid in front of it, or `view` itself at rest. */
    view(view, unitsPerMetre = 1) {
      const p = layer.pose();
      if (Math.abs(p.yaw) + Math.abs(p.pitch) + Math.abs(p.roll) < 1e-5 && Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z) < 1e-6) return view;
      return multiply(fpInertiaMatrix(p, unitsPerMetre), view, new Float32Array(16));
    },
    reset() {
      for (const s of [yaw, pitch, roll, x, y, z]) { s.x = 0; s.v = 0; }
      lastYaw = lastPitch = travel = travelYaw = velPrev = null; airTime = 0; wasGrounded = true; vel.f = vel.r = 0;
    },
  };
  return layer;
}

/** THE OFFSET AS A MATRIX in the eye's space (column-major, mat4.js's layout; the eye looks down -Z, +Y up): turned
 *  about the shoulder (`pivot`) by roll about the look, pitch about the right and yaw about the up, then moved. */
export function fpInertiaMatrix({ yaw = 0, pitch = 0, roll = 0, x = 0, y = 0, z = 0 } = {}, unitsPerMetre = 1, pivot = FP_INERTIA.pivot) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), spp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry(yaw) * Rx(pitch) * Rz(roll), row-major entries
  const r00 = cy * cr + sy * spp * sr, r01 = -cy * sr + sy * spp * cr, r02 = sy * cp;
  const r10 = cp * sr, r11 = cp * cr, r12 = -spp;
  const r20 = -sy * cr + cy * spp * sr, r21 = sy * sr + cy * spp * cr, r22 = cy * cp;
  const P = [pivot[0] * unitsPerMetre, pivot[1] * unitsPerMetre, pivot[2] * unitsPerMetre];
  // t = P - R P + offset
  const tx = P[0] - (r00 * P[0] + r01 * P[1] + r02 * P[2]) + x * unitsPerMetre;
  const ty = P[1] - (r10 * P[0] + r11 * P[1] + r12 * P[2]) + y * unitsPerMetre;
  const tz = P[2] - (r20 * P[0] + r21 * P[1] + r22 * P[2]) + z * unitsPerMetre;
  return new Float32Array([r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, tx, ty, tz, 1]);
}
