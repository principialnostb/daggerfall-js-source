import test from 'node:test';
import assert from 'node:assert/strict';
import { firstPersonLens, stepAxePlacement, axeReadyHold } from '../../src/combat/weapon/axeViewPlacement.js';
import { lookAt } from '../../src/world/mat4.js';

const axe = () => ({ arm: {}, weapon: { model: 'skyrim_steel_battleaxe.nif' } });
const normal = lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
test('axe uses the original first-person lens; weapon changes never move the camera', () => {
  const rig = axe();
  stepAxePlacement(rig, true, 4);
  assert.deepEqual(firstPersonLens([0, 0, 0], 0, rig), normal);
  rig.weapon.model = 'w_iron_claymore.nif';
  stepAxePlacement(rig, true, 1 / 60);
  assert.deepEqual(firstPersonLens([0, 0, 0], 0, rig), normal);
  rig.weapon.model = 'skyrim_steel_battleaxe.nif';
  assert.deepEqual(firstPersonLens([0, 0, 0], 0, rig), normal);
  stepAxePlacement(rig, false, 1);
  assert.deepEqual(firstPersonLens([0, 0, 0], 0, rig), normal);
});
test('camera matches other weapons even with pitch and while the axe grip eases', () => {
  const rig = axe();
  for (const pitch of [-0.6, 0, 0.6]) for (const dt of [0, 0.016, 1]) {
    stepAxePlacement(rig, true, dt);
    const eye = [2, 100, -8];
    assert.deepEqual(firstPersonLens(eye, pitch, rig), lookAt(eye, [eye[0], eye[1] + Math.sin(pitch), eye[2] - Math.cos(pitch)], [0, 1, 0]));
  }
});
test('placement eases on game time, equally at 30/60/120 fps, and releases for occupied hands', () => {
  const matrices = [];
  for (const fps of [30, 60, 120]) {
    const rig = axe(); for (let i = 0; i < fps; i++) stepAxePlacement(rig, true, 1 / fps);
    matrices.push(firstPersonLens([0, 0, 0], 0, rig));
    assert.equal(typeof axeReadyHold(rig), 'function');
    stepAxePlacement(rig, false, 4);
    assert.equal(axeReadyHold(rig), null);
    assert.deepEqual(firstPersonLens([0, 0, 0], 0, rig), normal);
  }
  for (const m of matrices) for (let i = 0; i < 16; i++) assert.ok(Math.abs(m[i] - matrices[0][i]) < 1e-5);
});
