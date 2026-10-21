import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  walkVariantForActor,
} from '../../../src/formats/morrowind/mwWalkAnimationAssets.js';
import {
  isHitReactionGroup, isDeathReactionGroup, isHitReactionKey, isDeathReactionKey, chooseReactionGroup,
} from '../../../src/formats/morrowind/mwHitReactionAssets.js';

test('Dynamic Animations walk choice resolves to the explicit dynamic provider for every actor scope', () => {
  assert.equal(walkVariantForActor({ player: true, female: false, playerChoice: 4 }), 'dynamic');
  assert.equal(walkVariantForActor({ player: true, female: true, playerChoice: 4 }), 'dynamic');
  assert.equal(walkVariantForActor({ female: false, npcMaleChoice: 2 }), 'dynamic');
  assert.equal(walkVariantForActor({ female: true, npcFemaleChoice: 4 }), 'dynamic');
});

test('Hit Reactions group filters isolate hit/stagger and death groups', () => {
  assert.equal(isHitReactionGroup('HitReact'), true);
  assert.equal(isHitReactionGroup('xStaggerBack'), true);
  assert.equal(isHitReactionGroup('WalkForward'), false);
  assert.equal(isDeathReactionGroup('xDeathBack'), true);
  assert.equal(isDeathReactionGroup('Death2'), true);
  assert.equal(isDeathReactionGroup('Idle'), false);
  assert.equal(isHitReactionKey({ text: 'SoundGen: foo\nxStaggerBack: start' }), true);
  assert.equal(isDeathReactionKey({ text: 'xDeathForward: start' }), true);
  assert.equal(isDeathReactionKey({ text: 'WalkForward: start' }), false);
});

test('Hit Reactions clip choice is stable for the same supplied roll and sorted group set', () => {
  const sources = [{
    animationPack: 'hit-reactions-v2',
    groups: ['StaggerBack', 'HitReact', 'xDeathForward', 'xDeathBack'],
  }];
  assert.equal(chooseReactionGroup(sources, 'hit', 0), 'HitReact');
  assert.equal(chooseReactionGroup(sources, 'hit', 1), 'StaggerBack');
  assert.equal(chooseReactionGroup(sources, 'death', 0), 'xDeathBack');
  assert.equal(chooseReactionGroup(sources, 'death', 1), 'xDeathForward');
  assert.equal(chooseReactionGroup(sources, 'death', 1), chooseReactionGroup(sources, 'death', 1));
  assert.equal(chooseReactionGroup([], 'hit', 0), null);
});
