import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MORROWIND_ASSET_PATHS,
  MORROWIND_ASSET_SOURCE_COMMIT,
  morrowindAssetUrl,
} from '../../../src/systems/morrowindAssetManifest.js';

test('MW-REMOTE-ASSETS: mod files are sourced from a pinned asset commit, not copied into the application branch', () => {
  assert.equal(MORROWIND_ASSET_SOURCE_COMMIT, 'a7128529d7dd7ca562f1bd4833911a249d2d9da2');
  assert.ok(MORROWIND_ASSET_PATHS.length > 7000, 'the manifest covers the active Morrowind mod asset set');
  assert.equal(new Set(MORROWIND_ASSET_PATHS).size, MORROWIND_ASSET_PATHS.length, 'paths are unique');
});

test('MW-REMOTE-ASSETS: the integrated packs have their runtime files in the manifest', () => {
  for (const path of [
    'Better Bodies/Nude/Data Files/Meshes/bb/bb_skinf_no.nif',
    'Better Bodies/Underwear/Data Files/Textures/bb/bb_skinf_no.dds',
    'High Resolution Better Body Female Textures/Nude_No_Hair/Textures/bb/bb_skinf_no.dds',
    'High Resolution Better Body Female Textures/Hands/Textures/bb/bb_handf_no.dds',
    'Simply Walking/Simply Walking Purist Edition/meshes/xbase_anim.kf',
    "Axel's Sexy Walk Fixed/Animation/axel fixed/female/WalkForward;.kf",
    'Better Morrowind Armor/Data Files/Better Morrowind Armor.esp',
    "Westly's Fine Clothiers of Tamriel/Westly_Presents_FCOT.esp",
  ]) assert.ok(MORROWIND_ASSET_PATHS.includes(path), path);
});

test('MW-REMOTE-ASSETS: source URLs encode path segments without changing archive-relative names', () => {
  assert.equal(
    morrowindAssetUrl('Better Bodies/Nude/Data Files/Meshes/bb/bb_skinf_no.nif'),
    'https://raw.githubusercontent.com/principialnostb/daggerfall-js-source/a7128529d7dd7ca562f1bd4833911a249d2d9da2/Morrowind%20Textures/Better%20Bodies/Nude/Data%20Files/Meshes/bb/bb_skinf_no.nif',
  );
  assert.ok(morrowindAssetUrl("Axel's Sexy Walk Fixed/Animation/axel fixed/female/WalkForward;.kf").includes('Axel%27s%20Sexy%20Walk%20Fixed'));
});
