import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWalkAnimationAssets } from '../../src/formats/morrowind/mwWalkAnimationAssets.js';

test('MW-ANIM-1: walk asset inventory is safe to import in Node tests', () => {
  const assets = inspectWalkAnimationAssets();
  assert.equal(assets.browser, false, 'Node tests intentionally do not fetch browser-bundled URLs');
  assert.equal(assets.standardMale, null);
  assert.equal(assets.standardFemale, null);
  assert.equal(assets.feminineFemale, null);
});
