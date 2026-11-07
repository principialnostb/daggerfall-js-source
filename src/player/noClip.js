// @ts-check
// A developer's flight through the world, the toybox's No-Clip switch. A departure from DFU's PlayerMotor, which
// always moves through its CharacterController: here the motor's one step is taken without the collider. The
// body moves where the view and the float keys point at NOCLIP_RUN_MULT times the player's own run, with no gravity,
// no ground under it, no fall to land and no water to swim in. The motor asks `noClipOn()` at the top of its step.
import { NOCLIP_RUN_MULT } from '../systems/toybox/toyboxLaw.js';

/** @type {(() => unknown) | null} */
let _on = null;
/** The one source of the switch (characters/playerEntity.js registers its staff power). @param {unknown} fn */
export function registerNoClip(fn) {
  _on = typeof fn === 'function' ? /** @type {() => unknown} */ (fn) : null;
}
/** Whether no-clip is on now. A source that throws is off. */
export const noClipOn = () => {
  try {
    return !!_on?.();
  } catch {
    return false;
  }
};

/** No-clip's pace, metres a second: the run's pace times NOCLIP_RUN_MULT. @param {number} runPace */
export const noClipSpeed = (runPace) => (Number.isFinite(runPace) && runPace > 0 ? runPace : 0) * NOCLIP_RUN_MULT;

/** The way one step moves, unit-free: the levitating motor's own (the look's pitch carries forward up and down, the
 *  float keys add their own, a diagonal is limited as DFU limits it), each axis at most 1 in size.
 *  @param {{ forward?: number, strafe?: number, up?: boolean, down?: boolean }} input
 *  @param {number} yaw @param {number} pitch */
export function noClipWay(input, yaw, pitch) {
  const ahead = Number(input?.forward) || 0,
    side = Number(input?.strafe) || 0;
  const k = ahead !== 0 && side !== 0 ? Math.SQRT1_2 : 1;
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw),
    cosPitch = Math.cos(pitch),
    sinPitch = Math.sin(pitch);
  let y = sinPitch * ahead * k;
  if (input?.up) y += 1;
  else if (input?.down) y -= 1;
  return [(sin * cosPitch * ahead + cos * side) * k, Math.max(-1, Math.min(1, y)), (cos * cosPitch * ahead - sin * side) * k];
}

/**
 * One motor step under no-clip: the position integrated straight, and every state that would pull the body back
 * into the world's law cleared - the fall (so nothing is owed on landing), the air's carry, the ground's key and any
 * climb or hold the step was in. Answers true: the step is spent.
 * @param {any} motor the PlayerMotor
 * @param {number} dt @param {any} input @param {number} yaw @param {number} pitch
 * @param {number} runPace the player's run pace now (motor.js runSpeed times its run modifiers)
 */
export function noClipStep(motor, dt, input, yaw, pitch, runPace) {
  const stride = noClipSpeed(runPace) * dt;
  const w = noClipWay(input, yaw, pitch);
  motor.pos[0] += w[0] * stride;
  motor.pos[1] += w[1] * stride;
  motor.pos[2] += w[2] * stride;
  motor.velY = 0;
  motor._airVelX = 0;
  motor._airVelZ = 0;
  motor.techFlight = false;
  motor.grounded = false;
  motor.groundKey = null;
  motor.jumping = false;
  motor.falling = false;
  motor.fallStart = motor.pos[1];
  motor.landedFallDistance = 0;
  motor.standing = !(w[0] || w[1] || w[2]);
  motor.movingLessThanHalfSpeed = motor.standing;
  motor._pkMove = null;
  motor._pkOffEdge = null;
  motor._pkLeap = null;
  if (motor._wall && typeof motor._wallEnd === 'function') motor._wallEnd();
  return true;
}
