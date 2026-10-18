import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWalkAnimationAssets, isWalkAnimationGroup, isWalkVariantEnabled } from '../../src/formats/morrowind/mwWalkAnimationAssets.js';

test('MW-ANIM-1: bundled walk asset inventory is safe to import in Node', () => {
  const assets = inspectWalkAnimationAssets();
  assert.equal(assets.browser, false);
  assert.equal(assets.standardMale, null);
  assert.equal(assets.standardFemale, null);
  assert.equal(assets.feminineFemale, null);
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
  assert.equal(isWalkVariantEnabled({ walkOnly: true, walkVariant: 'female' }, true), true);
  assert.equal(isWalkVariantEnabled({ name: 'vanilla' }, false), true);
});
