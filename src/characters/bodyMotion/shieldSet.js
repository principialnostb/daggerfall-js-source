// @ts-check
// SHIELD-WALK-SET (2026-11-07, the owner): walking forward the shield is the neutral one (SHIELD-WALK-NEUTRAL,
// combat/leftArmLayer.js: the stance idle's arm) and should "rise a little higher than the neutral position"; running,
// on the run's strafe arm, it "nearly rests on the chin" - "just move the arm a little". So the shield arm is turned
// about its shoulder - `lift` up and forward about the body's right, `abduct` out about its facing, `yaw` round about the
// up - and the forearm `roll`ed about its own length, each per gait (walking forward, running), by the share the body
// walks or runs straight (eased in and out). Going back it is as it was. The port's own; Daggerfall Unity draws no arm.

import { bodyOf, turnOf, mul, transpose, clamp01, ease } from './bodyKit.js';
import { rotAxisAngle, orthonormal } from '../../combat/climbRig.js';
import { bodyFrames } from './bodySolve.js';

const DEG = Math.PI / 180;

/** Degrees per gait; `ease` seconds it takes up and lets go. Tunable live through globalThis.__shieldSet ({ walk, run }). */
export const SHIELD_SET = Object.freeze({
  walk: Object.freeze({ lift: 15, abduct: 0, yaw: 0, roll: 0 }),
  run: Object.freeze({ lift: -15, abduct: 8, yaw: 0, roll: 0 }),
  ease: 0.2,
});

const KEYS = ['lift', 'abduct', 'yaw', 'roll'];
const setOf = (name) => ({ ...SHIELD_SET[name], ...(globalThis.__shieldSet?.[name] ?? {}) });

export function createShieldSet() {
  let walk = 0, run = 0;
  return {
    /** One frame: `on` the shield carried (no blow), `gait` the body layer's gait state (gait.js). */
    step(dt, on, gait) {
      const dir = gait?.dir ?? [0, 1], len = Math.hypot(dir[0], dir[1]) || 1;
      const straight = clamp01((Math.abs(dir[1]) / len - 0.7) / 0.25), move = on ? clamp01(gait?.move ?? 0) * straight : 0;
      const r = clamp01(gait?.run ?? 0);
      const wantWalk = gait?.back ? 0 : move * (1 - r), wantRun = move * r;
      const d = Math.max(0, dt);
      walk = ease(walk, wantWalk, SHIELD_SET.ease, d); if (Math.abs(walk - wantWalk) < 1e-3) walk = wantWalk;
      run = ease(run, wantRun, SHIELD_SET.ease, d); if (Math.abs(run - wantRun) < 1e-3) run = wantRun;
    },
    /** The set laid on the left arm of `pose`; answers the shares laid. */
    apply(skeleton, pose, rootRef, skelMats) {
      if (!(walk > 1e-3 || run > 1e-3)) return null;
      const W = setOf('walk'), R = setOf('run');
      const P = Object.fromEntries(KEYS.map((k) => [k, W[k] * walk + R[k] * run]));
      const body = bodyOf(skeleton, rootRef, skelMats);
      const b = body?.bones?.L;
      if (!b) return null;
      const mats = skelMats(skeleton, pose, rootRef, [body.chest, b.hand]);
      const F = bodyFrames(body, mats), upper = skeleton.nodes.get(b.upper), fore = skeleton.nodes.get(b.fore);
      const Wu = turnOf(mats, b.upper), Wp = upper?.parent != null ? turnOf(mats, upper.parent) : null;
      if (!F || !upper || !fore || !Wu) return null;
      // up and forward about the right; out about the facing (the left arm away from the body); round about the up
      const Q = mul(rotAxisAngle(F.up, P.yaw * DEG), mul(rotAxisAngle(F.fwd, -P.abduct * DEG), rotAxisAngle(F.right, P.lift * DEG)));
      const lu = pose.get(b.upper) ?? upper.rest;
      pose.set(b.upper, { rotation: orthonormal(mul(Wp ? transpose(Wp) : [1, 0, 0, 0, 1, 0, 0, 0, 1], mul(Q, Wu))), translation: lu.translation, scale: lu.scale });
      if (Math.abs(P.roll) > 1e-3) {
        const lf = pose.get(b.fore) ?? fore.rest;
        pose.set(b.fore, { rotation: orthonormal(mul(lf.rotation, rotAxisAngle([1, 0, 0], P.roll * DEG))), translation: lf.translation, scale: lf.scale });
      }
      return { walk, run };
    },
    reset() { walk = 0; run = 0; },
  };
}
