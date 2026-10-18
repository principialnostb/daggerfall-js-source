import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betterBodiesShadowSlot } from '../../../src/formats/morrowind/mwFirstPerson.js';

test('Better Bodies named torso sections map to Morrowind occlusion slots', () => {
  assert.equal(betterBodiesShadowSlot('Tri Chest'), 'chest');
  assert.equal(betterBodiesShadowSlot('Tri Groin'), 'groin');
  assert.equal(betterBodiesShadowSlot('Tri Neck'), 'neck');
});

test('Better Bodies sided sections map to the matching hand, limb and foot slots', () => {
  const cases = [
    ['Tri Left Hand', 'hand:left'],
    ['Tri Right Wrist', 'wrist:right'],
    ['Tri Left Forearm', 'forearm:left'],
    ['Tri Right Upper Arm', 'upperarm:right'],
    ['Tri Left Foot', 'foot:left'],
    ['Tri Right Ankle', 'ankle:right'],
    ['Tri Left Knee', 'knee:left'],
    ['Tri Right Upper Leg', 'upperleg:right'],
  ];
  for (const [name, slot] of cases) assert.equal(betterBodiesShadowSlot(name), slot, name);
});

test('unknown Better Bodies sections do not hide unrelated skin slots', () => {
  assert.equal(betterBodiesShadowSlot('Tri Left Clavicle'), null);
  assert.equal(betterBodiesShadowSlot(''), null);
});
