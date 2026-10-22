import test from 'node:test';
import assert from 'node:assert/strict';
import { SIMPLY_CLOAK_MODEL_ALIASES, SIMPLY_ANIMATED_CLOAK_ASSET_CATALOG, simplyAnimatedCloaksArchive } from '../../src/systems/simplyAnimatedCloaksAssets.js';

test('CLOAKS1: each selected cloak model aliases a real skinned NIF from Simply Animated Cloaks', () => {
  assert.deepEqual(SIMPLY_CLOAK_MODEL_ALIASES, {
    'simply_cape_blue_skins.nif': 'common_cape_blue_skins.nif',
    'simply_cape_grey_skins.nif': 'common_cape_grey_skins.nif',
    'simply_cape_red_skins.nif': 'common_cape_red_skins.nif',
    'simply_cape_black_skins.nif': 'common_cape_black_skins.nif',
    'simply_cape_brwn_blue_skins.nif': 'common_cape_brwn_blue_skins.nif',
    'simply_cape_brown_skins.nif': 'common_cape_brown_skins.nif',
    'simply_cape_03_b_skins.nif': 'common_cape_03_b_skins.nif',
    'simply_cape_green_skins.nif': 'common_cape_green_skins.nif',
  });
  assert.equal(Object.keys(SIMPLY_CLOAK_MODEL_ALIASES).length, 8);
  for (const source of Object.values(SIMPLY_CLOAK_MODEL_ALIASES)) {
    assert.match(source, /^common_cape_.*_skins\.nif$/);
    assert.doesNotMatch(source, /_skins[13]\.nif$/);
  }
});

test('CLOAKS1: the mounted archive obeys the Morrowind VFS contract', () => {
  const archive = simplyAnimatedCloaksArchive();
  assert.equal(typeof archive.has, 'function');
  assert.equal(typeof archive.get, 'function');
  assert.equal(typeof archive.load, 'function');
  assert.equal(typeof archive.loaded, 'function');
  // Node intentionally has no Vite URL table; browser discovery is separately diagnosed.
  if (typeof window === 'undefined') {
    assert.equal(SIMPLY_ANIMATED_CLOAK_ASSET_CATALOG.models.length, 0);
    assert.equal(archive.has('meshes/simply_cape_blue_skins.nif'), false);
  }
});
