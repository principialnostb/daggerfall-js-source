import test from 'node:test';
import assert from 'node:assert/strict';
import { blendPoseMaps } from '../../../src/formats/morrowind/mwSkin.js';

const identity = Float32Array.from([1,0,0, 0,1,0, 0,0,1]);
const z90 = Float32Array.from([0,-1,0, 1,0,0, 0,0,1]);

test('MW-ANIM-BLEND: endpoints preserve source and target transforms', () => {
  const from = new Map([[1, { rotation: identity, translation: [0, 0, 0], scale: 1 }]]);
  const to = new Map([[1, { rotation: z90, translation: [10, 2, 4], scale: 2 }]]);
  assert.deepEqual(blendPoseMaps(from, to, 0).get(1).translation, [0, 0, 0]);
  assert.deepEqual(blendPoseMaps(from, to, 1).get(1).translation, [10, 2, 4]);
});

test('MW-ANIM-BLEND: midpoint interpolates translation and keeps rotation orthonormal', () => {
  const from = new Map([[1, { rotation: identity, translation: [0, 0, 0], scale: 1 }]]);
  const to = new Map([[1, { rotation: z90, translation: [10, 2, 4], scale: 2 }]]);
  const mid = blendPoseMaps(from, to, 0.5).get(1);
  assert.deepEqual(mid.translation, [5, 1, 2]);
  assert.equal(mid.scale, 1.5);
  const m = mid.rotation;
  const dot01 = m[0] * m[1] + m[3] * m[4] + m[6] * m[7];
  const len0 = Math.hypot(m[0], m[3], m[6]);
  const len1 = Math.hypot(m[1], m[4], m[7]);
  assert.ok(Math.abs(dot01) < 1e-5);
  assert.ok(Math.abs(len0 - 1) < 1e-5);
  assert.ok(Math.abs(len1 - 1) < 1e-5);
});
