import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWalkAnimationAssets, isWalkAnimationGroup, isWalkAnimationKey, isWalkVariantEnabled, walkVariantForActor } from '../../src/formats/morrowind/mwWalkAnimationAssets.js';

test('MW-ANIM-1: bundled walk asset inventory is safe to import in Node', () => {
  const assets = inspectWalkAnimationAssets();
  assert.equal(assets.browser, false);
  assert.equal(assets.standardMale, null);
  assert.equal(assets.standardFemale, null);
  assert.equal(assets.feminineFemale, null);
  assert.equal(assets.axelFemale, null);
});
test('MW-ANIM-1: only walk groups are overridden', () => {
  assert.equal(isWalkAnimationGroup('WalkForward'), true);
  assert.equal(isWalkAnimationGroup('walkforward1h'), true);
  assert.equal(isWalkAnimationGroup('RunForward'), false);
  assert.equal(isWalkAnimationGroup('Idle'), false);
});
test('MW-ANIM-1: female gait preference gates only the female walk source', () => {
  assert.equal(isWalkVariantEnabled({ walkOnly: true, walkVariant: 'standard' }, false), true);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, walkVariant: 'female' }, false), false);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, walkVariant: 'female' }, 'female'), true);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, walkVariant: 'female' }, 'female2'), false);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, walkVariant: 'female2' }, 'female2'), true);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, walkVariant: 'female2' }, 'female'), false);
  assert.equal(isWalkVariantEnabled({ name: 'vanilla' }, false), true);
});

test('MW-ANIM-1: walk keys survive additional text-key lines before the group marker', () => {
  assert.equal(isWalkAnimationKey({ text: 'WalkForward: Start' }), true);
  assert.equal(isWalkAnimationKey({ text: 'SoundGen: Left\nWalkForward: Start' }), true);
  assert.equal(isWalkAnimationKey({ text: 'SoundGen: Right\r\nWalkForward: Loop Start' }), true);
  assert.equal(isWalkAnimationKey({ text: 'SoundGen: Left' }), false);
  assert.equal(isWalkAnimationKey({ text: 'Idle: Start\nSoundGen: Left' }), false);
});

test('MW-ANIM-2: player, male NPC, and female NPC walk settings resolve independently', () => {
  assert.equal(walkVariantForActor({ player: true, playerChoice: 0 }), 'standard');
  assert.equal(walkVariantForActor({ player: true, playerChoice: 1 }), 'female');
  assert.equal(walkVariantForActor({ player: true, playerChoice: 2 }), 'female2');
  assert.equal(walkVariantForActor({ player: true, playerChoice: 3 }), 'vanilla');

  assert.equal(walkVariantForActor({ female: false, npcMaleChoice: 0 }), 'standard');
  assert.equal(walkVariantForActor({ female: false, npcMaleChoice: 1 }), 'vanilla');

  assert.equal(walkVariantForActor({ female: true, npcFemaleChoice: 0 }), 'standard');
  assert.equal(walkVariantForActor({ female: true, npcFemaleChoice: 1 }), 'female2');
  assert.equal(walkVariantForActor({ female: true, npcFemaleChoice: 2 }), 'vanilla');

  // Remote player bodies carry ownHeads, so they use the player selection
  // instead of inheriting the NPC setting.
  assert.equal(walkVariantForActor({ ownHeads: true, female: true, playerChoice: 2, npcFemaleChoice: 0 }), 'female2');
});

test('MW-ANIM-1: Vanilla disables bundled walk replacements only', () => {
  assert.equal(isWalkVariantEnabled({ walkOnly: true, walkVariant: 'standard' }, 'vanilla'), false);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, walkVariant: 'female' }, 'vanilla'), false);
  assert.equal(isWalkVariantEnabled({ name: 'archive animation' }, 'vanilla'), true);
});
