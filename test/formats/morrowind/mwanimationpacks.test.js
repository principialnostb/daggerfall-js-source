import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMATION_PACK_IDS, ANIMATION_PACK_PROVIDERS, animationPackFamily, inspectAnimationPackAssets, listAnimationPackAssets, loadHitReactionAnimationAssets, loadReAnimationAnimationAssets, loadDynamicIdleAnimationAsset,
  resolveAnimationPackProvider, selectDeterministicReactionGroup, reAnimationPrefixesForWeaponGroup, selectStableAnimationVariant,
} from '../../src/formats/morrowind/mwAnimationPackAssets.js';

test('MW-ANIM-PACKS: pack discovery is safe outside the browser', () => {
  const inventory = inspectAnimationPackAssets();
  assert.equal(inventory.browser, false);
  assert.deepEqual(inventory.countByPack, {
    'reanimation-v3': 0,
    'openmw-dynamic-animations': 0,
    'hit-reactions-v2': 0,
  });
  assert.deepEqual(listAnimationPackAssets(), []);
});

test('MW-ANIM-PACKS: each asset family is classified explicitly', () => {
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.reanimation, 'x2cChop.kf'), 'combat');
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.reanimation, 'x1hMovement.kf'), 'locomotion');
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.dynamic, 'WalkForward_base15;.kf'), 'walk');
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.dynamic, 'RunBack_base;.kf'), 'run');
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.dynamic, 'Idle2_copy;.kf'), 'idle');
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.hitReactions, 'xHitReact.kf'), 'hit-reaction');
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.hitReactions, 'xStaggerBack.kf'), 'stagger');
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.hitReactions, 'xDeathBack.kf'), 'death');
});

test('MW-ANIM-PACKS: unknown and non-animation files never acquire a gameplay family', () => {
  assert.equal(animationPackFamily('unknown-pack', 'WalkForward.kf'), 'other');
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.hitReactions, 'menu.lua'), 'other');
  assert.equal(animationPackFamily(ANIMATION_PACK_IDS.dynamic, 'animation-config.yaml'), 'other');
});

test('MW-ANIM-PACKS: every new pack has explicit domains and an honest status', () => {
  assert.equal(ANIMATION_PACK_PROVIDERS.length, 3);
  assert.deepEqual(ANIMATION_PACK_PROVIDERS.map((provider) => provider.status), [
    'needs-validation', 'needs-validation', 'needs-validation',
  ]);
  assert.ok(ANIMATION_PACK_PROVIDERS.every((provider) => provider.id && provider.domains.length));
});

test('MW-ANIM-PACKS: unresolved providers fall back to Vanilla rather than winning by file order', () => {
  assert.deepEqual(resolveAnimationPackProvider('animation.player.walk'), {
    requested: 'vanilla', effective: 'vanilla', provider: null, fallback: false, reason: 'Vanilla selected',
  });
  const dynamic = resolveAnimationPackProvider('animation.player.walk', 'dynamic-animations.locomotion');
  assert.equal(dynamic.effective, 'dynamic-animations.locomotion');
  assert.equal(dynamic.fallback, false);
  assert.equal(dynamic.provider, 'dynamic-animations.locomotion');
  assert.match(dynamic.reason, /backward\/side movement, sneak\/run, player idle/);
  const dynamicIdle = resolveAnimationPackProvider('animation.npc.idle', 'dynamic-animations.locomotion');
  assert.equal(dynamicIdle.effective, 'dynamic-animations.locomotion');
  assert.equal(dynamicIdle.fallback, false);
  const unknown = resolveAnimationPackProvider('animation.player.walk', 'not-a-provider');
  assert.equal(unknown.effective, 'vanilla');
  assert.equal(unknown.fallback, true);
  const wrongDomain = resolveAnimationPackProvider('animation.player.firstPerson.attack', 'hit-reactions-v2.reactions');
  assert.equal(wrongDomain.effective, 'vanilla');
  assert.equal(wrongDomain.fallback, true);
  const reaction = resolveAnimationPackProvider('animation.actor.hitReaction', 'hit-reactions-v2.reactions');
  assert.equal(reaction.effective, 'hit-reactions-v2.reactions');
  assert.equal(reaction.fallback, false);
  assert.match(reaction.reason, /visual, timing, and skeleton compatibility/);
});

test('MW-ANIM-PACKS: reaction variants use a sorted deterministic candidate list', () => {
  const groups = ['StaggerRight', 'HitReact', 'StaggerBack', 'StaggerRight', 'DeathBack'];
  assert.equal(selectDeterministicReactionGroup(groups, 'hit', 0), 'hitreact');
  assert.equal(selectDeterministicReactionGroup(groups, 'hit', 1), 'staggerback');
  assert.equal(selectDeterministicReactionGroup(groups, 'hit', 2), 'staggerright');
  assert.equal(selectDeterministicReactionGroup(groups, 'death', 0), 'deathback');
  assert.equal(selectDeterministicReactionGroup(['DeathDremora1', 'DeathDremora2'], 'death', 0), null);
  assert.equal(selectDeterministicReactionGroup([], 'hit', 0), null);
});

test('MW-ANIM-PACKS: hit reaction assets safely fall back to no bundled data outside the browser', async () => {
  assert.deepEqual(await loadHitReactionAnimationAssets(), []);
});

test('MW-ANIM-PACKS: ReAnimation maps only known weapon families to canonical clip sets', () => {
  assert.deepEqual(reAnimationPrefixesForWeaponGroup('1s'), ['xdagger', 'x1s']);
  assert.deepEqual(reAnimationPrefixesForWeaponGroup('2c'), ['x2c']);
  assert.deepEqual(reAnimationPrefixesForWeaponGroup('2w'), ['x2w', 'x2h']);
  assert.deepEqual(reAnimationPrefixesForWeaponGroup('crossbow'), ['xcrossbow']);
  assert.deepEqual(reAnimationPrefixesForWeaponGroup('hh'), ['xh2h', 'xhh']);
  assert.deepEqual(reAnimationPrefixesForWeaponGroup('1b'), ['x1h']);
  assert.deepEqual(reAnimationPrefixesForWeaponGroup('unknown'), []);
});

test('MW-ANIM-PACKS: ReAnimation asset loading is safe outside the browser', async () => {
  assert.deepEqual(await loadReAnimationAnimationAssets({ weaponShortGroup: '2c' }), []);
});

test('MW-ANIM-PACKS: ReAnimation action variants are selected by a stable semantic seed', () => {
  const candidates = [{ source: { name: 'z.kf' }, pick: 'z' }, { source: { name: 'a.kf' }, pick: 'a' }, { source: { name: 'm.kf' }, pick: 'm' }];
  const first = selectStableAnimationVariant(candidates, 'weapontwohand|chop');
  assert.equal(first?.pick, selectStableAnimationVariant([...candidates].reverse(), 'weapontwohand|chop')?.pick);
  assert.ok(['a', 'm', 'z'].includes(first?.pick));
  assert.equal(selectStableAnimationVariant([], 'weapontwohand|chop'), null);
});

test('MW-ANIM-PACKS: Dynamic Animations idle asset loader is safe outside the browser', async () => {
  assert.equal(await loadDynamicIdleAnimationAsset({ female: false, variant: '3' }), null);
});
