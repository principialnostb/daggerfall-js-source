import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBetterBodiesUvEdits, betterBodiesFallbackSectionKey, betterBodiesSectionKey } from '../../../src/formats/morrowind/mwFirstPerson.js';

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
    { meshIndex: 0, name: 'Tri Left Upper Arm', transform: { u: 0.1, v: 0, su: 0.5, sv: 1 } },
  ]);
  assert.equal(applied, 1);
  assert.deepEqual([...arm.uvs], [0.35, 0.25, 0.6, 0.75]);
  assert.deepEqual([...chest.uvs], [0.25, 0.5, 0.75, 1], 'a stale mesh index must not edit the chest instead');
});
