// @ts-check
// LOOK-AROUND (2026-10-27, the owner: "функция при нажатии кнопки ... что бы я мог осматривать персонажа от 3го лица
// ... а то он вертится вместе с прицелом"): OpenMW's PREVIEW MODE, which mwCamera.js left out for want of a binding.
// The reference (camera.lua:86-111): TogglePOV TAPPED switches the view, as it always has; HELD past 0.25 s it is the
// preview - the mouse swings the camera round the actor while the actor stands as it stood, and the release brings
// the camera back behind. Here the release eases it home rather than cutting (a departure: a cut across the whole body
// reads as a jump). Only in third person - held in first, it is a tap on the release, as before.
//
// LOOK-AROUND2 (2026-10-27, the owner: "не на удержание кнопки чуть подержал активировалось и крути верти делай че
// хочешь, потом снова подержал отключилось"): a departure from the reference's hold - the hold is a SWITCH. Held past
// HOLD_SECONDS it turns the swing on, and it stays on after the release; held again it turns it off and the camera eases
// home. A tap still switches the view, but not while the swing is on (it would leave the body it is looking at), and
// the swing ends of itself when the view leaves third person.
//
// The mouse is taken where every host feeds it (player/lookFilter.js add), the swing laid on the third-person eye where
// it is made (player/mwView.js), and the hosts' views follow the eye's `look`.

export const HOLD_SECONDS = 0.25;   // camera.lua's own threshold
const PITCH_UP = 1.0, PITCH_DOWN = 1.2;   // the swing's reach over and under the level, radians
const EASE_HOME = 9;   // per second: back behind in about a third of a second

let downFor = -1, held = false, active = false, yawOff = 0, pitchOff = 0;

/** Once a frame: `isHeld` the TogglePerspective action held now, `toggle` the view switch, `thirdPerson` whether the
 *  body is the view. */
export function stepLookAround(dt, isHeld, toggle, thirdPerson) {
  if (isHeld) {
    downFor = downFor < 0 ? 0 : downFor + dt;
    if (!held && downFor >= HOLD_SECONDS) {   // this press is a hold: it throws the switch, once
      held = true;
      if (active) active = false;
      else if (thirdPerson()) { active = true; yawOff = 0; pitchOff = 0; }
    }
  } else if (downFor >= 0) {
    if (!held && !active) toggle();   // a tap
    downFor = -1; held = false;
  }
  if (active && !thirdPerson()) active = false;
  if (!active && (yawOff || pitchOff)) {
    const k = Math.exp(-EASE_HOME * Math.max(0, dt));
    yawOff *= k; pitchOff *= k;
    if (Math.abs(yawOff) < 1e-3 && Math.abs(pitchOff) < 1e-3) { yawOff = 0; pitchOff = 0; }
  }
}

/** The mouse's look, taken while the preview holds it (true) - the actor does not turn. */
export function takeLook(dyaw, dpitch) {
  if (!active) return false;
  yawOff += dyaw;
  pitchOff = Math.max(-PITCH_DOWN, Math.min(PITCH_UP, pitchOff + dpitch));
  return true;
}

/** The swing laid on the third-person camera now - [yaw, pitch] offsets, both 0 when there is none. */
export const lookAroundSwing = () => [yawOff, pitchOff];
export const lookAroundActive = () => active;
/** No aiming while inspecting or while the inspection camera is easing home. */
export const lookAroundHidesAim = () => active || !!yawOff || !!pitchOff;

/** Sky rays must use the same direction as the scene, not the actor's aim. */
export function skyLookAngles(yaw, pitch, look) {
  if (!look || !look.every(Number.isFinite) || Math.hypot(...look) < 1e-8) return [yaw, pitch];
  return [Math.atan2(look[0], look[2]), Math.atan2(look[1], Math.hypot(look[0], look[2]))];
}


/** The eye's own forward while it is swung (the hosts' views read `look`). */
export function swingLook(out, yaw, pitch) {
  if ((yawOff || pitchOff) && out?.thirdPerson) {
    const y = yaw + yawOff, p = pitch + pitchOff, cp = Math.cos(p);
    out.look = [Math.sin(y) * cp, Math.sin(p), Math.cos(y) * cp];
  }
  return out;
}

/** Tests: back to rest. */
export function resetLookAround() { downFor = -1; held = false; active = false; yawOff = 0; pitchOff = 0; }
