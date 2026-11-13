// CLOAK-CONTACT: the port's own steel body and cloak - the cloth meets the live limbs' capsules, stays by its fit standing,
// and costs a fraction of the refit it replaced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARMOR_MATERIAL } from '../../../src/systems/armorMaterials.js';
import { poseAssembly } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { fitCloakOver, CLOAK_FIT_POSES, CLOAK_STILL_POSES } from '../../../src/formats/morrowind/mwCloakFit.js';
import { createCloakPhysics, stepCloakPhysics } from '../../../src/formats/morrowind/mwCloakPhysics.js';
import { cloakColliders, pushOutOfCapsules, cloakGearDue, segmentReach, CLOAK_CONTACT } from '../../../src/formats/morrowind/mwCloakColliders.js';
import { body, isCloak, isUnder, SWEEP, turned, crossings } from '../../fixtures/mw/cloakRig.mjs';

test('CLOAK-CONTACT: a capsule pushes a free vertex straight out to its radius and leaves a fixed one and a far one alone', () => {
  const state = { pos: new Float32Array([1, 0, 5, 1, 0, 5, 9, 0, 5]) };
  const moved = pushOutOfCapsules(state, [{ a: [0, 0, 0], b: [0, 0, 10], r: 3 }], (v) => v === 1);
  assert.equal(moved, 1);
  assert.ok(Math.abs(segmentReach(state.pos, 0, [0, 0, 0], [0, 0, 10]).d - 3) < 1e-5);
  assert.deepEqual([...state.pos.slice(3)], [1, 0, 5, 9, 0, 5]);
  assert.equal(pushOutOfCapsules(state, null, () => false), 0);
});

test('CLOAK-CONTACT: the gear footprint is taken five times a second, not every frame', () => {
  const arm = {}; let taken = 0;
  for (let f = 0; f < 60; f++) if (cloakGearDue(arm, 1 / 60)) taken++;
  assert.ok(taken >= 5 && taken <= 6, `${taken} a second`);
  assert.equal(CLOAK_CONTACT.gearEvery, 0.2);
});

test('CLOAK-CONTACT: an animated cloak is fitted to the four poses and a still one to the blows too; standing, the cloth stays by its fit, no capsule pushing; through the sweep nothing comes through it', async () => {
  assert.equal(CLOAK_FIT_POSES.length, 4);
  assert.equal(CLOAK_STILL_POSES.length, 11);
  const a = await body(ARMOR_MATERIAL.Steel);
  fitCloakOver(a, { isCloak, isUnder });
  const piece = a.pieces.find(isCloak);
  piece.clothPhysics = createCloakPhysics(piece); piece.clothPhysicsFallbackMesh = true;
  const st = piece.clothPhysics;
  poseAssembly(a);
  const rest = cloakColliders(a, piece);
  assert.ok(rest.length >= 8, 'the trunk, the legs and the arms');
  assert.equal(pushOutOfCapsules({ pos: Float32Array.from(st.base) }, rest, () => false), 0, 'standing, the fitted cloth is outside every capsule');
  const off = () => { let sum = 0; for (let i = 0; i < st.pos.length; i += 3) sum += Math.hypot(st.pos[i] - st.base[i], st.pos[i + 1] - st.base[i + 1], st.pos[i + 2] - st.base[i + 2]); return sum / (st.pos.length / 3); };
  for (let i = 0; i < 180; i++) stepCloakPhysics(piece, 1 / 60, { gait: 0, gaitPhase: 0, colliders: cloakColliders(a, piece) });
  assert.ok(off() < 1, `standing three seconds the cloth is ${off().toFixed(2)} units off its fit`);
  for (const [name, turns] of Object.entries(SWEEP)) {
    const pose = Object.keys(turns).length ? turned(a, turns) : {};
    poseAssembly(a, pose);
    for (let i = 0; i < 60; i++) stepCloakPhysics(piece, 1 / 60, { gait: 0, gaitPhase: 0, colliders: cloakColliders(a, piece) });
    poseAssembly(a, pose);
    assert.equal(crossings(a, isUnder), 0, `${name}: nothing through the cloak`);
  }
});
