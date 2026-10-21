import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMATION_PACKS, ANIMATION_PACK_STATUS, animationPackById, resolveAnimationPack,
} from '../../../src/formats/morrowind/mwAnimationPackCatalog.js';

test('animation pack catalog uses stable IDs and contains the three animation packs', () => {
  assert.deepEqual(ANIMATION_PACKS.map((pack) => pack.id), [
    'reanimation-v3',
    'openmw-dynamic-animations',
    'hit-reactions-animated-v2',
  ]);
  assert.equal(animationPackById('reanimation-v3').sourceRoot,
    'Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core');
  assert.equal(animationPackById('openmw-dynamic-animations').sourceRoot,
    'Mods/Animations/OpenMW Dynamic Animations');
  assert.equal(animationPackById('hit-reactions-animated-v2').sourceRoot,
    'Mods/Animations/Hit Reactions Animated v2 -- OpenMW');
});

test('staged packs never become active by folder order or by being present on disk', () => {
  for (const pack of ANIMATION_PACKS.filter((item) => item.status === ANIMATION_PACK_STATUS.staged)) {
    const domain = pack.domains[0];
    assert.deepEqual(resolveAnimationPack({ providerId: pack.id, domain }), {
      ok: false, providerId: 'vanilla', reason: 'runtime-not-integrated', packId: pack.id,
    });
  }
});

test('ReAnimation and Hit Reactions are blocked until explicit conversion/asset-use permission is granted', () => {
  const reanimation = animationPackById('reanimation-v3');
  assert.equal(reanimation.status, ANIMATION_PACK_STATUS.blockedPermission);
  assert.deepEqual(resolveAnimationPack({
    providerId: reanimation.id, domain: 'first-person.combat',
  }), {
    ok: false, providerId: 'vanilla', reason: 'permission-required', packId: reanimation.id,
  });
  const pack = animationPackById('hit-reactions-animated-v2');
  assert.equal(pack.status, ANIMATION_PACK_STATUS.blockedPermission);
  assert.deepEqual(resolveAnimationPack({
    providerId: pack.id, domain: 'third-person.hit-reaction',
  }), {
    ok: false, providerId: 'vanilla', reason: 'permission-required', packId: pack.id,
  });
});

test('provider selection is domain-scoped and Vanilla is explicit', () => {
  assert.deepEqual(resolveAnimationPack({ providerId: 'vanilla', domain: 'third-person.death' }), {
    ok: true, providerId: 'vanilla', reason: 'explicit-vanilla',
  });
  assert.deepEqual(resolveAnimationPack({
    providerId: 'reanimation-v3', domain: 'third-person.death',
  }), {
    ok: false, providerId: 'vanilla', reason: 'domain-mismatch', packId: 'reanimation-v3',
  });
  assert.deepEqual(resolveAnimationPack({
    providerId: 'missing-provider', domain: 'first-person.combat',
  }), {
    ok: false, providerId: 'vanilla', reason: 'unknown-provider',
  });
});

test('catalog domains are explicit and unique per provider', () => {
  for (const pack of ANIMATION_PACKS) {
    assert.ok(pack.domains.length > 0, pack.id);
    assert.equal(new Set(pack.domains).size, pack.domains.length, pack.id);
    assert.ok(pack.nexusUrl.startsWith('https://www.nexusmods.com/morrowind/mods/'));
    assert.ok(pack.sourceRoot.startsWith('Mods/Animations/'));
  }
});
