import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMATION_PACK_IDS, animationPackFamily, inspectAnimationPackAssets, listAnimationPackAssets,
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
