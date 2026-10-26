import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robertBodiesFirstPersonAssetPaths } from '../../../src/formats/morrowind/mwBetterBodies.js';

test('Robert Bodies + Better Hands paths are resolved for the selected race and sex', () => {
  const nord = robertBodiesFirstPersonAssetPaths({ race: 'Nord', female: false });
  // BETTER-HANDS: the arm comes from the whole body - Robert's .1st carries hands alone
  assert.equal(nord.bodyModelPath, "Robert's bodies/Data Files/Meshes/bbr/no_m.nif");
  assert.equal(nord.bodyTexturePath, "Robert's bodies/Data Files/Textures/bbr/no_m.dds");
  assert.equal(nord.handModelPath, 'Better Hands/Meshes/b/b_n_Nord_m_hands.1st.nif');
  assert.equal(nord.handTexturePath, 'Better Hands/Textures/bbr/no_m.dds');
  assert.equal(nord.texturePath, 'textures/bbr/no_m.dds');
});

test('Robert Bodies + Better Hands preserves the Breton male filename shipped by the mod', () => {
  const breton = robertBodiesFirstPersonAssetPaths({ race: 'Breton', female: false });
  assert.equal(breton.handModelPath, 'Better Hands/Meshes/b/b_n_breton_m_hand.1st.nif');
});

test('Robert Bodies + Better Hands maps race labels and leaves unsupported beasts on their normal path', () => {
  assert.equal(robertBodiesFirstPersonAssetPaths({ race: 'Dark Elf', female: true }).bodyModelPath,
    "Robert's bodies/Data Files/Meshes/bbr/de_f.nif");
  assert.equal(robertBodiesFirstPersonAssetPaths({ race: 'Khajiit', female: false }), null);
});
