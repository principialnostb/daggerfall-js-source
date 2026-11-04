// @ts-check
// HIT-RESPONSE (2026-10-27, MOTION-DOCTRINE pilot step 3 - RESPONSE, bible/05-Combat/Motion-Doctrine.md): THE WORLD
// ANSWERS A BLOW. When the player's melee blow lands (combat/playerWeapon.js resolveHit, a struck foe with damage):
//   - HITSTOP: the striking arm (both views - combat/fpArm.js scales the player's rig's clock) and the struck foe's own
//     animation (characters/mobile/mobileUnit.js update) hold for a short, firm beat - longer the heavier the weapon and
//     the harder the blow, and shorter for each further foe of one swing (a sweep never drags). Only those two: the
//     world, the clock and every other body run on (multiplayer is never slowed - Precision's rule, the doctrine's);
//   - THE TARGET'S REACTION after the beat: the foe's own clock is held, so its flinch - DFU's knockback and hurt frames,
//     which the blow already starts - plays out from the hitstop's end, as Precision delays its reaction;
//   - A SOFT SHAKE: a smooth decaying sine on the look (player/cameraRecoiler.js lays it beside DFU's own reel), a few
//     tenths of a degree, never the vanilla jerk.
// The idea is Precision's (Ershin, Skyrim SE, Nexus 72347: hitstop on attacker and target only, the reaction after it,
// a sine shake, diminishing returns within a swing); the code is the port's own. Daggerfall Unity has none of it - a
// departure in presentation only: the damage, the to-hit and the knockback are DFU's, untouched.

import { modSetting } from '../systems/modSettings.js';

/**
 * THE LAWS. `stop` seconds, `[light, heavy]` by the weapon's weight (`kg` its weightInKg at which it is heavy; the fists
 * light), times `[soft, hard]` by the damage (`hard` points the full beat); `diminish` per further foe of one swing
 * (`swing` seconds is one swing); `hold` the held clock's speed (0: a frozen frame). The shake: `deg` its amplitude light
 * to heavy, `hz` its sine, `tau` its decay.
 */
export const HIT_RESPONSE = Object.freeze({
  stop: Object.freeze([0.05, 0.095]), kg: 6, damage: Object.freeze([0.7, 1]), hard: 18, diminish: 0.6, swing: 0.25, hold: 0,
  shake: Object.freeze({ deg: Object.freeze([0.35, 0.8]), hz: 18, tau: 0.1, floor: 0.02 }),
});

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** Is the doctrine's switch on (the MotionDoctrine setting - "Формула движения")? */
export const responseOn = () => modSetting('morrowind-animation', 'MotionDoctrine') !== 0;

/** THE STATE, one for the player (the one who strikes this way): the arm's beat, the swing's count, the shake, and the
 *  held foes. Exported as a factory for the pins; the module's own instance is the game's. */
export function createHitResponse({ on = responseOn, now = () => performance.now() / 1000 } = {}) {
  let armLeft = 0, swingAt = -Infinity, swingHits = 0;
  let shakeT = Infinity, shakeAmp = 0, shakeDir = [1, 0];
  /** @type {WeakMap<object, number>} */
  const held = new WeakMap();
  const r = {
    /** A landed blow: `foe` struck (its `mobile` the sprite unit), `damage` dealt, `weapon` the striking item. */
    hit({ foe = null, damage = 0, weapon = null, rolls = Math.random } = {}) {
      if (!on() || !(Number(damage) > 0)) return 0;
      const t = now();
      if (t - swingAt > HIT_RESPONSE.swing) { swingAt = t; swingHits = 0; }
      const heavy = clamp01((Number(weapon?.weightInKg) || 0) / HIT_RESPONSE.kg);
      const hard = lerp(HIT_RESPONSE.damage[0], HIT_RESPONSE.damage[1], clamp01(Number(damage) / HIT_RESPONSE.hard));
      const beat = lerp(HIT_RESPONSE.stop[0], HIT_RESPONSE.stop[1], heavy) * hard * HIT_RESPONSE.diminish ** swingHits;
      swingHits++;
      armLeft = Math.max(armLeft, beat);
      const unit = foe?.mobile ?? null;
      if (unit && typeof unit === 'object') held.set(unit, Math.max(held.get(unit) ?? 0, beat));
      shakeT = 0; shakeAmp = Math.max(shakeAmp * 0.5, lerp(HIT_RESPONSE.shake.deg[0], HIT_RESPONSE.shake.deg[1], heavy) * hard);
      const a = rolls() * 2 * Math.PI; shakeDir = [Math.cos(a) * 0.4, 0.9 + Math.sin(a) * 0.1];   // mostly a nod, a little sideways
      return beat;
    },
    /** The striking arm's clock this frame: `dt` held to `hold` while its beat lasts (the beat spends real time). */
    armDt(dt) {
      if (!(armLeft > 0) || !(dt > 0)) return dt;
      const spent = Math.min(armLeft, dt);
      armLeft -= spent;
      return (dt - spent) + spent * HIT_RESPONSE.hold;
    },
    /** A struck foe's own clock this frame (its sprite's animation): held while its beat lasts. */
    unitDt(unit, dt) {
      const left = unit ? held.get(unit) : 0;
      if (!(left > 0) || !(dt > 0)) return dt;
      const spent = Math.min(left, dt);
      if (left - spent > 0) held.set(unit, left - spent); else held.delete(unit);
      return (dt - spent) + spent * HIT_RESPONSE.hold;
    },
    /** The shake on the look this frame, degrees `[pitch, yaw]` - a smooth decaying sine (zero at rest). */
    shake(dt) {
      if (!Number.isFinite(shakeT)) return [0, 0];
      shakeT += Math.max(0, dt);
      const k = shakeAmp * Math.exp(-shakeT / HIT_RESPONSE.shake.tau);
      if (k < HIT_RESPONSE.shake.floor) { shakeT = Infinity; shakeAmp = 0; return [0, 0]; }
      const s = Math.sin(2 * Math.PI * HIT_RESPONSE.shake.hz * shakeT) * k;
      return [s * shakeDir[1], s * shakeDir[0]];
    },
    reset() { armLeft = 0; swingAt = -Infinity; swingHits = 0; shakeT = Infinity; shakeAmp = 0; },
  };
  return r;
}

/** The game's one instance. */
export const hitResponse = createHitResponse();
