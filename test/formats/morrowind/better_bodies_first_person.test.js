import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betterBodiesFallbackSectionKey } from '../../../src/formats/morrowind/mwFirstPerson.js';

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
