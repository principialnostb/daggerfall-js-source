import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWalkAnimationAssets, isWalkAnimationGroup, isWalkAnimationKey, isRunAnimationGroup, isRunAnimationKey, isWalkVariantEnabled, isRunVariantEnabled, walkVariantForActor, runVariantForActor, firstPersonAnimationProviderForChoice, isOpenMWDynamicFirstPersonClip, openMWDynamicFirstPersonGroup, hitReactionVariantForSkeleton, isHitReactionAssetForSkeleton, isFirstPersonAnimationRigCompatible, remapAnimationGroupKeys, hitReactionTargetGroup, openMWDynamicThirdPersonTargetGroup, openMWDynamicThirdPersonSourceGroup, selectOpenMWDynamicAnimationVariants, hitReactionRecoveryBlend, hitReactionTransitionBlend } from '../../src/formats/morrowind/mwWalkAnimationAssets.js';

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


test('MW-ANIM-4: first-person providers are limited to the skeleton they ship for', () => {
  assert.equal(isFirstPersonAnimationRigCompatible('meshes/xbase_anim.1st.nif'), true);
  assert.equal(isFirstPersonAnimationRigCompatible('meshes/base_anim_female.1st.nif'), false);
  assert.equal(isFirstPersonAnimationRigCompatible('meshes/xbase_animkna.1st.nif'), false);
  assert.equal(isFirstPersonAnimationRigCompatible('meshes/xbase_anim.nif'), false);
});

test('MW-ANIM-4: first-person source modes and layered providers are stable', () => {
  assert.equal(firstPersonAnimationProviderForChoice(0), 'vanilla');
  assert.equal(firstPersonAnimationProviderForChoice(1), 'reanimation-v3');
  assert.equal(firstPersonAnimationProviderForChoice(2), 'reanimation-v3+openmw-dynamic-first-person');
  assert.equal(firstPersonAnimationProviderForChoice(-1), 'vanilla');
  assert.equal(firstPersonAnimationProviderForChoice(99), 'openmw-dynamic-first-person');
});

test('MW-ANIM-4: OpenMW Dynamic Animations admits only directional first-person locomotion clips', () => {
  const base = 'Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim.1st/';
  for (const clip of [
    'WalkForward_base;.kf', 'WalkBack_base;.kf', 'WalkLeft_base;.kf', 'WalkRight_base;.kf',
    'RunForward_base;.kf', 'RunBack_base;.kf', 'RunLeft_base;.kf', 'RunRight_base;.kf',
    'SneakForward_base;.kf', 'SneakBack_base;.kf', 'SneakLeft_base;.kf', 'SneakRight_base;.kf',
  ]) {
    assert.equal(isOpenMWDynamicFirstPersonClip(base + clip), true, clip);
  }
  assert.equal(openMWDynamicFirstPersonGroup(base + 'WalkForward_base;.kf'), 'walkforward');
  assert.equal(openMWDynamicFirstPersonGroup(base + 'RunBack_base;.kf'), 'runback');
  assert.equal(openMWDynamicFirstPersonGroup(base + 'SneakRight_base;.kf'), 'sneakright');
  assert.equal(openMWDynamicFirstPersonGroup(base + 'IdleSneak_base;.kf'), null);
  assert.equal(isOpenMWDynamicFirstPersonClip(base + 'IdleSneak_base;.kf'), false);
  assert.equal(isOpenMWDynamicFirstPersonClip(base + 'SneakMovement; Skip.kf'), false);
  assert.equal(isOpenMWDynamicFirstPersonClip('Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim/WalkForward_base11;.kf'), false);
  assert.equal(isOpenMWDynamicFirstPersonClip('Mods/Animations/ReAnimation v3/00 Core/Animations/xbase_anim.1st/x1hMovement.kf'), false);
});


test('MW-ANIM-5: hit-reaction clips are selected only for the active third-person rig', () => {
  const root = 'Mods/Animations/Hit Reactions Animated v2 -- OpenMW/Animations/';
  assert.equal(hitReactionVariantForSkeleton('meshes/xbase_anim.nif'), 'male');
  assert.equal(hitReactionVariantForSkeleton('meshes/xbase_anim_female.nif'), 'female');
  assert.equal(hitReactionVariantForSkeleton('meshes/xbase_animkna.nif'), 'beast');
  assert.equal(hitReactionVariantForSkeleton('meshes/xbase_anim.1st.nif'), null);
  assert.equal(isHitReactionAssetForSkeleton(root + 'xbase_anim/HitFront.kf', 'meshes/xbase_anim.nif'), true);
  assert.equal(isHitReactionAssetForSkeleton(root + 'xbase_anim_female/HitFront.kf', 'meshes/xbase_anim.nif'), false);
  assert.equal(isHitReactionAssetForSkeleton(root + 'xbase_animkna/HitFront.kf', 'meshes/xbase_animkna.nif'), true);
  assert.equal(isHitReactionAssetForSkeleton(root + 'xbase_anim/HitFront.kf', 'meshes/xbase_anim.1st.nif'), false);
});

test('MW-ANIM-6: OpenMW directional clips map to the lowercase runtime group names', () => {
  const base = 'Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim.1st/';
  assert.equal(openMWDynamicFirstPersonGroup(base + 'WalkForward_base;.kf'), 'walkforward');
  assert.equal(openMWDynamicFirstPersonGroup(base + 'RunBack_base;.kf'), 'runback');
  assert.equal(openMWDynamicFirstPersonGroup(base + 'SneakRight_base;.kf'), 'sneakright');
});

test('MW-ANIM-6: custom reaction clip keys are remapped to groups the combat state machine requests', () => {
  const keys = [
    { time: 0, text: 'HitReact: start' },
    { time: 0.3, text: 'HitReact: stop' },
    { time: 0.1, text: 'SoundGen: hit' },
  ];
  assert.deepEqual(remapAnimationGroupKeys(keys, ['HitReact'], 'hit1'), [
    { time: 0, text: 'hit1: start' },
    { time: 0.3, text: 'hit1: stop' },
  ]);
  assert.deepEqual(hitReactionTargetGroup('/Animations/xbase_anim/xStaggerBack.kf', 3, 2), { family: 'hit', group: 'hit3' });
  assert.deepEqual(hitReactionTargetGroup('/Animations/xbase_anim/xDeathBack.kf', 3, 2), { family: 'death', group: 'death2' });
  assert.equal(hitReactionTargetGroup('/Animations/xbase_anim/xWalk.kf', 3, 2), null);
});

test('MW-ANIM-7: OpenMW third-person asset names map to canonical runtime groups', () => {
  const base = 'Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim/';
  assert.equal(openMWDynamicThirdPersonTargetGroup(base + 'WalkForward_base11;.kf'), 'walkforward');
  assert.equal(openMWDynamicThirdPersonTargetGroup(base + 'WalkForward_march13;.kf'), 'walkforward');
  assert.equal(openMWDynamicThirdPersonTargetGroup(base + 'zIdle2;.kf'), 'idle2');
  assert.equal(openMWDynamicThirdPersonTargetGroup(base + 'ArmsAkimbo;.kf'), 'armsakimbo');
  assert.equal(openMWDynamicThirdPersonTargetGroup(base + 'xWalkForward;.kf'), 'walkforward');
  assert.equal(openMWDynamicThirdPersonTargetGroup(base + 'UnknownClip;.kf'), null);
  assert.equal(openMWDynamicThirdPersonSourceGroup(base + 'WalkForward_base11;.kf'), 'walkforward_base11');
});

test('MW-ANIM-7: OpenMW third-person variant selection is deterministic and one-per-group', () => {
  const assets = [
    { name: 'b.kf', targetGroup: 'walkforward' },
    { name: 'a.kf', targetGroup: 'walkforward' },
    { name: 'idle.kf', targetGroup: 'idle' },
    { name: 'idle2.kf', targetGroup: 'idle2' },
  ];
  const first = selectOpenMWDynamicAnimationVariants(assets, 'darkelf|female|head-12');
  const second = selectOpenMWDynamicAnimationVariants(assets, 'darkelf|female|head-12');
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map((asset) => asset.targetGroup)).size, 3);
  assert.deepEqual(first.map((asset) => asset.name), [...first.map((asset) => asset.name)].sort());
});

test('MW-ANIM-7: ODAR base15 is the stable general walk-forward preset when present', () => {
  const assets = [
    { name: 'Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim/WalkForward_base11;.kf', targetGroup: 'walkforward' },
    { name: 'Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim/WalkForward_march13;.kf', targetGroup: 'walkforward' },
    { name: 'Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim/WalkForward_base15;.kf', targetGroup: 'walkforward' },
  ];
  assert.equal(selectOpenMWDynamicAnimationVariants(assets, 'male|default')[0].name, assets[2].name);
  assert.equal(selectOpenMWDynamicAnimationVariants(assets, 'female|other')[0].name, assets[2].name);
});

test('MW-ANIM-8: stagger recovery uses the mod-authored cubicOut 0.5 second blend', () => {
  const stagger = { animationPack: 'hit-reactions-v2', reactionKind: 'stagger' };
  const idle = { animationPack: 'archive' };
  assert.deepEqual(hitReactionRecoveryBlend(idle, 0.5), null);
  assert.deepEqual(hitReactionRecoveryBlend(stagger, 0), { duration: 0.5, weight: 0 });
  assert.deepEqual(hitReactionRecoveryBlend(stagger, 1), { duration: 0.5, weight: 1 });
  const mid = hitReactionRecoveryBlend(stagger, 0.5);
  assert.equal(mid.duration, 0.5);
  assert.ok(Math.abs(mid.weight - 0.875) < 1e-12);
});

test('MW-ANIM-8: Hit Reactions per-clip entry and exit blend rules are ported', () => {
  const archive = { animationPack: 'archive' };
  const hit = { animationPack: 'hit-reactions-v2', reactionKind: 'hit' };
  const stagger = { animationPack: 'hit-reactions-v2', reactionKind: 'stagger' };
  const death = { animationPack: 'hit-reactions-v2', reactionKind: 'death' };
  assert.equal(hitReactionTransitionBlend(archive, hit, 1).duration, 0.1);
  assert.equal(hitReactionTransitionBlend(archive, stagger, 1).duration, 0.08);
  assert.equal(hitReactionTransitionBlend(archive, death, 1).duration, 0.08);
  assert.equal(hitReactionTransitionBlend(stagger, archive, 1).duration, 0.5);
  assert.equal(hitReactionTransitionBlend(hit, archive, 1).duration, 0.25);
  assert.ok(Math.abs(hitReactionTransitionBlend(archive, hit, 0.5).weight - Math.sin(Math.PI / 4)) < 1e-12);
  assert.equal(hitReactionTransitionBlend(archive, archive, 0.5), null);
});
