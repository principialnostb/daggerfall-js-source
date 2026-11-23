import { test } from 'node:test';
import assert from 'node:assert/strict';
import { body, isCloak, isUnder } from '../../fixtures/mw/cloakRig.mjs';
import { ARMOR_MATERIAL } from '../../../src/systems/armorMaterials.js';
import { fitCloakOver, fitCloakDuringBuild, CLOAK_STILL_POSES } from '../../../src/formats/morrowind/mwCloakFit.js';

test('build-time cloak fitting on steel gives the same mesh at every vertex', async () => {
  const direct = await body(ARMOR_MATERIAL.Steel);
  const sliced = await body(ARMOR_MATERIAL.Steel);
  const options = { isCloak, isUnder, poses: CLOAK_STILL_POSES };
  const expected = fitCloakOver(direct, options);
  assert.ok(expected?.pushed > 0);
  assert.deepEqual(await fitCloakDuringBuild(sliced, options), expected);
  const selected = rig => rig.pieces.filter(isCloak).map(piece => [piece.batch.positions, piece.batch.normals, piece.positions]);
  assert.deepEqual(selected(sliced), selected(direct));
});
