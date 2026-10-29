// LOOK-AROUND2 (2026-10-27, the owner: "чуть подержал активировалось и крути верти делай че хочешь, потом снова
// подержал отключилось"): the TogglePerspective hold is a SWITCH for the swing round the body - on with one hold, kept
// after the release, off with the next; a tap still switches the view, but not while the swing is on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepLookAround, takeLook, lookAroundActive, lookAroundSwing, resetLookAround, HOLD_SECONDS } from '../../src/player/lookAround.js';

const press = (frames, view, toggles) => {   // held for `frames` steps of 0.05 s, then released
  for (let i = 0; i < frames; i++) stepLookAround(0.05, true, () => toggles.push(1), () => view.third);
  stepLookAround(0.05, false, () => toggles.push(1), () => view.third);
};
const holdFrames = Math.ceil(HOLD_SECONDS / 0.05) + 2;

test('LOOK-AROUND2: a hold turns the swing on and it stays on after the release; the next hold turns it off', () => {
  resetLookAround();
  const view = { third: true }, toggles = [];
  press(holdFrames, view, toggles);
  assert.equal(lookAroundActive(), true, 'on, the key released');
  assert.equal(takeLook(0.5, 0.2), true, 'the mouse swings the camera, not the body');
  assert.deepEqual(lookAroundSwing(), [0.5, 0.2]);
  stepLookAround(1, false, () => toggles.push(1), () => view.third);
  assert.deepEqual(lookAroundSwing(), [0.5, 0.2], 'held in place while on - no easing home');
  press(holdFrames, view, toggles);
  assert.equal(lookAroundActive(), false, 'off');
  assert.equal(takeLook(0.5, 0), false, 'the mouse is the body\'s again');
  stepLookAround(1, false, () => {}, () => true);
  assert.deepEqual(lookAroundSwing(), [0, 0], 'eased home');
  assert.equal(toggles.length, 0, 'a hold never switches the view');
});

test('LOOK-AROUND2: a tap switches the view - but not while the swing is on; leaving third person ends the swing', () => {
  resetLookAround();
  const view = { third: true }, toggles = [];
  press(1, view, toggles);
  assert.equal(toggles.length, 1, 'a tap is the view switch');
  press(holdFrames, view, toggles);
  press(1, view, toggles);
  assert.equal(toggles.length, 1, 'a tap while the swing is on does not leave the body');
  assert.equal(lookAroundActive(), true);
  view.third = false;
  stepLookAround(0.05, false, () => {}, () => view.third);
  assert.equal(lookAroundActive(), false, 'the view left third person');
  press(holdFrames, view, toggles);
  assert.equal(lookAroundActive(), false, 'a hold in first person turns nothing on');
});


test('inspection hides aim through the return transition and sky rays follow the rendered camera', async () => {
  const { lookAroundHidesAim, skyLookAngles, swingLook } = await import('../../src/player/lookAround.js');
  resetLookAround();
  assert.equal(lookAroundHidesAim(), false);
  const view = { third: true };
  press(holdFrames, view, []);
  assert.equal(lookAroundHidesAim(), true);
  takeLook(.8, .3);
  const rendered = swingLook({ thirdPerson: true }, .4, -.1);
  const angles = skyLookAngles(.4, -.1, rendered.look);
  assert.ok(Math.abs(angles[0] - 1.2) < 1e-8);
  assert.ok(Math.abs(angles[1] - .2) < 1e-8);
  assert.deepEqual(skyLookAngles(.4, -.1, null), [.4, -.1], 'normal/travel camera is unchanged');
  assert.deepEqual(skyLookAngles(.4, -.1, [0, 0, 0]), [.4, -.1]);
  press(holdFrames, view, []);
  assert.equal(lookAroundActive(), false);
  assert.equal(lookAroundHidesAim(), true, 'return animation still has no valid aim');
  stepLookAround(2, false, () => {}, () => true);
  assert.equal(lookAroundHidesAim(), false);
  resetLookAround();
});
