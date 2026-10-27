// @ts-check
// LOOK-AROUND (2026-10-27, the owner: "функция при нажатии кнопки ... что бы я мог осматривать персонажа от 3го лица
// ... а то он вертится вместе с прицелом"): OpenMW's PREVIEW MODE, which mwCamera.js left out for want of a binding.
// The reference (camera.lua:86-111): TogglePOV TAPPED switches the view, as it always has; HELD past 0.25 s it is the
// preview - the mouse swings the camera round the actor while the actor stands as it stood, and the release brings
// the camera back behind. Here the release eases it home rather than cutting (a departure: a cut across the whole body
// reads as a jump). Only in third person - held in first, it is a tap on the release, as before.
//
// The mouse is taken where every host feeds it (player/lookFilter.js add), the swing laid on the third-person eye where
// it is made (player/mwView.js), and the hosts' views follow the eye's `look`.

export const HOLD_SECONDS = 0.25;   // camera.lua's own threshold
const PITCH_UP = 1.0, PITCH_DOWN = 1.2;   // the swing's reach over and under the level, radians
const EASE_HOME = 9;   // per second: back behind in about a third of a second

let downFor = -1, active = false, yawOff = 0, pitchOff = 0;

/** Once a frame: `isHeld` the TogglePerspective action held now, `toggle` the view switch, `thirdPerson` whether the
 *  body is the view. */
export function stepLookAround(dt, isHeld, toggle, thirdPerson) {
  if (isHeld) {
    downFor = downFor < 0 ? 0 : downFor + dt;
    if (!active && downFor >= HOLD_SECONDS && thirdPerson()) { active = true; yawOff = 0; pitchOff = 0; }
  } else if (downFor >= 0) {
    if (!active) toggle();
    downFor = -1; active = false;
  }
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

/** The eye's own forward while it is swung (the hosts' views read `look`). */
export function swingLook(out, yaw, pitch) {
  if ((yawOff || pitchOff) && out?.thirdPerson) {
    const y = yaw + yawOff, p = pitch + pitchOff, cp = Math.cos(p);
    out.look = [Math.sin(y) * cp, Math.sin(p), Math.cos(y) * cp];
  }
  return out;
}

/** Tests: back to rest. */
export function resetLookAround() { downFor = -1; active = false; yawOff = 0; pitchOff = 0; }
