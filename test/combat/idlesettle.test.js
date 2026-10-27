// IDLE-SETTLE (MOTION-DOCTRINE; bible/05-Combat/Motion-Doctrine.md): a stop lands the fresh idle where its legs are
// quiet - read off the clip's own lower-body tracks - instead of at its start, where a stance's idle shifts its weight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quietIdleTime, settleIdle, IDLE_SETTLE } from '../../src/combat/idleSettle.js';

/** A track turning about z by `angle(t)` radians - what the fake sampler answers. */
const turning = (angle) => ({ angle });
const sampleTrack = (track, t) => {
  const a = track.angle(t);
  return { rotation: [0, 0, Math.sin(a / 2), Math.cos(a / 2)], translation: [0, 0, 0], scale: 1 };
};
/** Two weight shifts, as Morrowind Animation Overhaul's Idle1h has them: 0.3-0.7 s and 2.3-2.7 s of a 3 s group. */
const bump = (t, a, b) => (t <= a ? 0 : t >= b ? 0.3 : 0.3 * (t - a) / (b - a));
const shifting = (t) => bump(t, 0.3, 0.7) - bump(t, 2.3, 2.7);

test('IDLE-SETTLE: a stop begins the idle after its first weight shift, in the stretch where the legs stand still', () => {
  const source = { trackMap: new Map([['bip01 l thigh', turning(shifting)], ['bip01 r thigh', turning(shifting)], ['bip01 head', turning((t) => t)]]) };
  const q = quietIdleTime({ group: 'idle1h', startTime: 0, stopTime: 3 }, source, sampleTrack);
  assert.ok(q >= 0.65 && q <= 1.1 + 1e-9, `the quiet start ${q} s lies past the first shift and leaves ${IDLE_SETTLE.window} s before the second`);
});

test('IDLE-SETTLE: only the lower body counts - a head that never stops does not move the start', () => {
  const source = { trackMap: new Map([['bip01 head', turning((t) => 3 * t)], ['bip01 spine1', turning((t) => Math.sin(9 * t))]]) };
  assert.equal(quietIdleTime({ group: 'idle', startTime: 2, stopTime: 6 }, source, sampleTrack), 2, 'no legs: the clip\'s own start');
});

test('IDLE-SETTLE: a group no longer than the window, or a state with no source, keeps its start', () => {
  const source = { trackMap: new Map([['bip01 l thigh', turning(shifting)]]) };
  assert.equal(quietIdleTime({ group: 'idlehh', startTime: 5, stopTime: 5 + IDLE_SETTLE.window }, source, sampleTrack), 5);
  assert.equal(quietIdleTime({ group: 'idle', startTime: 1, stopTime: 4 }, null, sampleTrack), 1);
});

test('IDLE-SETTLE: the start is read once per source and group, and settleIdle moves the fresh state there', () => {
  let asked = 0;
  const counted = (track, t) => { asked++; return sampleTrack(track, t); };
  const source = { trackMap: new Map([['bip01 r calf', turning(shifting)]]) };
  const state = { group: 'idle2c', startTime: 0, stopTime: 3, time: 0 };
  settleIdle(state, source, counted);
  const first = asked;
  settleIdle({ ...state, time: 0 }, source, counted);
  assert.equal(asked, first, 'the second stop reads the memo');
  assert.ok(state.time > 0.6, `the state begins at its quiet start (${state.time})`);
});

test('IDLE-SETTLE: the rig settles the idle only on a stop, behind the MotionDoctrine switch', () => {
  const src = readFileSync(new URL('../../src/combat/fpArm.js', import.meta.url), 'utf8');
  assert.match(src, /if \(movementState\) \{ resetMovement\(\); resetIdle\(modSetting\('morrowind-animation', 'MotionDoctrine'\) !== 0\); \}/);
  assert.match(src, /function resetIdle\(settle = false\) \{ idleState = null; idleGroup = null; refreshIdle\(true, settle\); \}/);
  assert.match(src, /if \(settle\) settleIdle\(idleState, idleSource, sampleTrack\);/);
});
