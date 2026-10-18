import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSmartPaperDollMotionState,
  deformSmartPaperDollVertices,
  stepSmartPaperDollMotion,
} from '../../src/characters/paperDollMotion.js';

test('Smart PaperDoll motion stays still when the feet do not move', () => {
  const state = createSmartPaperDollMotionState();
  const first = stepSmartPaperDollMotion(state, { feet: [0, 0, 0], yaw: 0, time: 1000 });
  const second = stepSmartPaperDollMotion(state, { feet: [0, 0, 0], yaw: 0, time: 1016, gender: 'female' });
  assert.equal(first.moveWeight, 0);
  assert.equal(second.moveWeight, 0);
  assert.ok(Number.isFinite(second.chestOffset));
});

test('Smart PaperDoll motion follows movement and keeps spring values bounded', () => {
  const state = createSmartPaperDollMotionState();
  stepSmartPaperDollMotion(state, { feet: [0, 0, 0], yaw: 0, time: 1000, gender: 'female' });
  let pose;
  for (let frame = 1; frame <= 30; frame++) {
    pose = stepSmartPaperDollMotion(state, {
      feet: [frame * 0.035, 0, 0],
      yaw: 0.02 * frame,
      time: 1000 + frame * 16,
      gender: 'female',
    });
  }
  assert.ok(pose.moveWeight > 0);
  assert.ok(Math.abs(pose.chestOffset) <= 0.022);
  assert.ok(Number.isFinite(pose.sway));
  assert.ok(Number.isFinite(pose.bob));
});

test('vertex deformation preserves color and normal channels and returns finite positions', () => {
  const base = new Float32Array([
    0.1, 0.9, 0.02, 1, 0.5, 0.25, 0, 0, 1,
    -0.1, 0.4, -0.02, 0.2, 0.3, 0.4, 0, 0, -1,
  ]);
  const pose = { phase: 1.2, moveWeight: 0.8, bob: 0.01, sway: 0.005, breath: 0.001, chestOffset: 0.01 };
  const out = deformSmartPaperDollVertices(base, pose, { gender: 'female' });
  assert.equal(out.length, base.length);
  for (const i of [3, 4, 5, 6, 7, 8, 12, 13, 14, 15, 16, 17]) assert.equal(out[i], base[i]);
  for (const i of [0, 1, 2, 9, 10, 11]) assert.ok(Number.isFinite(out[i]));
  assert.notDeepEqual(Array.from(out.slice(0, 3)), Array.from(base.slice(0, 3)));
});

test('vertex deformation rejects an invalid packed mesh', () => {
  assert.throws(() => deformSmartPaperDollVertices(new Float32Array([1, 2]), {}), /9-float/);
});
