import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBetterBodiesUvEdits, betterBodiesFallbackSectionKey, betterBodiesSectionKey } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { betterBodiesFirstPersonHandAssetPaths, firstPersonHandsSource } from '../../../src/formats/morrowind/mwBetterBodiesPaths.js';


test('first-person hand selector keeps Vanilla, Robert/Better Hands, and Better Bodies independent', () => {
  assert.equal(firstPersonHandsSource(0), 'vanilla');
  assert.equal(firstPersonHandsSource(1), 'robert-bodies');
  assert.equal(firstPersonHandsSource(2), 'better-bodies');
  assert.equal(firstPersonHandsSource(undefined), 'vanilla');
  assert.equal(firstPersonHandsSource(99), 'vanilla');
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('first-person Better Bodies fallback maps each arm slot to its side-specific section', () => {
  for (const slot of ['hand', 'wrist', 'forearm', 'upperarm']) {
    assert.equal(betterBodiesFallbackSectionKey(slot, 'Bip01 Left Hand'), `${slot}:left`);
    assert.equal(betterBodiesFallbackSectionKey(slot, 'Bip01 Right Hand'), `${slot}:right`);
  }
});

test('first-person Better Bodies fallback does not guess a side or invent a body section', () => {
  assert.equal(betterBodiesFallbackSectionKey('hand', 'Bip01 Finger0'), null);
  assert.equal(betterBodiesFallbackSectionKey('chest', 'Bip01 Spine'), null);
  assert.equal(betterBodiesFallbackSectionKey('HAND', 'Bip01 LEFT HAND'), 'hand:left');
});

test('Better Bodies arm sections match common NIF naming variants without swallowing unrelated shapes', () => {
  const cases = [
    ['Tri Left Hand', 'hand:left'],
    ['Right Hand', 'hand:right'],
    ['Left Wrist', 'wrist:left'],
    ['Forearm Right', 'forearm:right'],
    ['Tri Left Upper Arm', 'upperarm:left'],
    ['Upperarm Right', 'upperarm:right'],
    ['Left_Lower_Arm', 'forearm:left'],
    ['Hand L', 'hand:left'],
    ['R Hand', 'hand:right'],
    ['Bip01 L Hand', 'hand:left'],
    ['Bip01 R Hand', 'hand:right'],
    ['Bip01 L Forearm', 'forearm:left'],
    ['Bip01 R Upper Arm', 'upperarm:right'],
    ['Tri Chest', 'chest'],
  ];
  for (const [shape, expected] of cases) assert.equal(betterBodiesSectionKey(shape), expected, shape);
  for (const shape of ['Finger0 Left', 'Weapon Bone', 'Left Shoulder', 'Tri Unknown']) {
    assert.equal(betterBodiesSectionKey(shape), null, shape);
  }
});

test('Better Bodies UV corrections target stable NIF section names before fallback indices', () => {
  const chest = { name: 'Tri Chest', uvs: new Float32Array([0.25, 0.5, 0.75, 1]) };
  const arm = { name: 'Tri Left Upper Arm', uvs: new Float32Array([0.5, 0.25, 1, 0.75]) };
  const applied = applyBetterBodiesUvEdits([chest, arm], [
    { meshIndex: 0, name: 'Tri Left Upper Arm', transform: { u: 0.125, v: 0, su: 0.5, sv: 1 } },
  ]);
  assert.equal(applied, 1);
  assert.deepEqual([...arm.uvs], [0.375, 0.25, 0.625, 0.75]);
  assert.deepEqual([...chest.uvs], [0.25, 0.5, 0.75, 1], 'a stale mesh index must not edit the chest instead');
});

test('Better Bodies first-person hand paths cover all eight races, both sexes, and both body variants', () => {
  const races = {
    Breton: 'br', 'Dark Elf': 'de', 'High Elf': 'he', Imperial: 'im',
    Nord: 'no', Orc: 'or', Redguard: 'rg', 'Wood Elf': 'we',
  };
  for (const [race, code] of Object.entries(races)) {
    for (const female of [false, true]) {
      for (const underwear of [false, true]) {
        const asset = betterBodiesFirstPersonHandAssetPaths({ race, female, underwear });
        const sex = female ? 'f' : 'm';
        const variant = underwear ? 'Underwear' : 'Nude';
        const stem = `bb_hand${sex}_${code}`;
        assert.equal(asset.raceKey, code);
        assert.equal(asset.genderKey, sex);
        assert.equal(asset.variant, variant);
        assert.equal(asset.modelPath, `Mods/Bodies/Better Bodies/${variant}/Data Files/Meshes/bb/${stem}.nif`);
        assert.equal(asset.texturePath, `Mods/Bodies/Better Bodies/${variant}/Data Files/Textures/bb/${stem}.dds`);
        assert.equal(asset.runtimeTexturePath, `textures/bb/${stem}.dds`);
        assert.ok(existsSync(resolve(repoRoot, asset.modelPath)), `missing model: ${asset.modelPath}`);
        assert.ok(existsSync(resolve(repoRoot, asset.texturePath)), `missing texture: ${asset.texturePath}`);
      }
    }
  }
});

test('Better Bodies first-person hand path resolver rejects unsupported races', () => {
  assert.equal(betterBodiesFirstPersonHandAssetPaths({ race: 'Khajiit', female: false }), null);
});
