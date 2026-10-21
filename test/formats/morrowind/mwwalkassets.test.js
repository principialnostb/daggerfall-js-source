import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWalkAnimationAssets, isWalkAnimationGroup, isWalkAnimationKey, isRunAnimationGroup, isRunAnimationKey, isWalkVariantEnabled, isRunVariantEnabled, walkVariantForActor, runVariantForActor, dynamicWalkStyleForActor } from '../../src/formats/morrowind/mwWalkAnimationAssets.js';

test('MW-ANIM-1: bundled walk asset inventory is safe to import in Node', () => {
  const assets = inspectWalkAnimationAssets();
  assert.equal(assets.browser, false);
  assert.equal(assets.standardMale, null);
  assert.equal(assets.feminineFemale, null);
  assert.equal(assets.puristFemale, null);
  assert.equal(assets.axelFemale, null);
  assert.equal(assets.axelRunFemale, null);
});
test('MW-ANIM-1: only walk groups are overridden', () => {
  assert.equal(isWalkAnimationGroup('WalkForward'), true);
  assert.equal(isWalkAnimationGroup('walkforward1h'), true);
  assert.equal(isWalkAnimationGroup('RunForward'), false);
  assert.equal(isWalkAnimationGroup('Idle'), false);
  assert.equal(isRunAnimationGroup('RunForward'), true);
  assert.equal(isRunAnimationGroup('WalkForward'), false);
});
test('MW-ANIM-1: female gait preference gates only the female walk source', () => {
  assert.equal(isWalkVariantEnabled({ walkOnly: true, animationFamily: 'walk', walkVariant: 'simply' }, 'vanilla'), false);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, animationFamily: 'walk', walkVariant: 'simply' }, 'simply'), true);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, animationFamily: 'walk', walkVariant: 'axel' }, 'simply'), false);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, animationFamily: 'walk', walkVariant: 'axel' }, 'axel'), true);
  assert.equal(isWalkVariantEnabled({ name: 'vanilla' }, false), true);
});

test('MW-ANIM-1: walk keys survive additional text-key lines before the group marker', () => {
  assert.equal(isWalkAnimationKey({ text: 'WalkForward: Start' }), true);
  assert.equal(isWalkAnimationKey({ text: 'SoundGen: Left\nWalkForward: Start' }), true);
  assert.equal(isWalkAnimationKey({ text: 'SoundGen: Right\r\nWalkForward: Loop Start' }), true);
  assert.equal(isWalkAnimationKey({ text: 'SoundGen: Left' }), false);
  assert.equal(isWalkAnimationKey({ text: 'Idle: Start\nSoundGen: Left' }), false);
  assert.equal(isRunAnimationKey({ text: 'SoundGen: Left\nRunForward: Start' }), true);
  assert.equal(isRunAnimationKey({ text: 'WalkForward: Start' }), false);
});

test('MW-ANIM-2: player, male NPC, and female NPC walk settings resolve independently', () => {
  assert.equal(walkVariantForActor({ player: true, playerChoice: 0 }), 'vanilla');
  assert.equal(walkVariantForActor({ player: true, playerChoice: 1 }), 'simply');
  assert.equal(walkVariantForActor({ player: true, playerChoice: 2 }), 'axel');

  assert.equal(walkVariantForActor({ female: false, npcMaleChoice: 0 }), 'vanilla');
  assert.equal(walkVariantForActor({ female: false, npcMaleChoice: 1 }), 'simply');

  assert.equal(walkVariantForActor({ female: true, npcFemaleChoice: 0 }), 'vanilla');
  assert.equal(walkVariantForActor({ female: true, npcFemaleChoice: 1 }), 'simply');
  assert.equal(walkVariantForActor({ female: true, npcFemaleChoice: 2 }), 'axel');

  assert.equal(walkVariantForActor({ ownHeads: true, female: true, playerChoice: 2, npcFemaleChoice: 0 }), 'axel');
  assert.equal(walkVariantForActor({ player: true, female: true, playerChoice: 4 }), 'dynamic');
  assert.equal(walkVariantForActor({ player: true, female: false, playerChoice: 4 }), 'dynamic');
  assert.equal(walkVariantForActor({ female: false, npcMaleChoice: 2 }), 'dynamic');
  assert.equal(walkVariantForActor({ female: true, npcFemaleChoice: 4 }), 'dynamic');
});

test('MW-ANIM-1: Vanilla disables bundled walk replacements only', () => {
  assert.equal(isWalkVariantEnabled({ walkOnly: true, animationFamily: 'walk', walkVariant: 'simply' }, 'vanilla'), false);
  assert.equal(isWalkVariantEnabled({ walkOnly: true, animationFamily: 'walk', walkVariant: 'axel' }, 'vanilla'), false);
  assert.equal(isWalkVariantEnabled({ name: 'archive animation' }, 'vanilla'), true);
});

test('MW-ANIM-3: walk and run preferences gate only their own clip families', () => {
  const walk = { walkOnly: true, animationFamily: 'walk', walkVariant: 'axel' };
  const run = { runOnly: true, animationFamily: 'run', walkVariant: 'axel' };
  assert.equal(isWalkVariantEnabled(walk, 'vanilla'), false);
  assert.equal(isWalkVariantEnabled(run, 'vanilla'), true);
  assert.equal(isRunVariantEnabled(run, 'vanilla'), false);
  assert.equal(isRunVariantEnabled(walk, 'vanilla'), true);
  assert.equal(isRunVariantEnabled(run, 'axel'), true);
  assert.equal(isRunVariantEnabled({ name: 'archive animation' }, 'axel'), true);
});
test('MW-ANIM-3: run choices resolve independently for player and female NPC', () => {
  assert.equal(runVariantForActor({ player: true, playerChoice: 0 }), 'vanilla');
  assert.equal(runVariantForActor({ player: true, female: true, playerChoice: 1 }), 'axel');
  assert.equal(runVariantForActor({ player: true, female: false, playerChoice: 1 }), 'vanilla');
  assert.equal(runVariantForActor({ female: true, npcFemaleChoice: 1 }), 'axel');
  assert.equal(runVariantForActor({ female: false, npcFemaleChoice: 1 }), 'vanilla');
  assert.equal(runVariantForActor({ ownHeads: true, female: true, playerChoice: 1 }), 'axel');
});

test('MW-ANIM-PACKS: Dynamic Animations style selection is stable for the same actor context', () => {
  const actor = { female: true, race: 'Breton', faceIndex: 7, appearanceHeadId: 'head-12' };
  assert.equal(dynamicWalkStyleForActor(actor), dynamicWalkStyleForActor(actor));
  assert.ok(['base11', 'base13', 'base15', 'dirn15', 'march13', 'march15', 'mwf15', 'noble11', 'noble13']
    .includes(dynamicWalkStyleForActor(actor)));
  assert.equal(dynamicWalkStyleForActor({ female: true, player: true }), 'base15');
  assert.equal(dynamicWalkStyleForActor({ female: false, player: true }), 'base15');
});
