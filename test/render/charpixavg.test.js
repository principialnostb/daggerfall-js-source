// CHAR-PIX-AVG (2026-11-07, src/render/charPixelLayer.js): a pixelated block is the mean of the body texels it holds,
// drawn up to PIX_SUB_MAX times finer each way, never finer than the screen - not one point of the texture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pixSub, PIX_SUB_MAX } from '../../src/render/charPixelLayer.js';

test('CHAR-PIX-AVG: a block holds up to PIX_SUB_MAX low texels a side, never more than its own pixels (mutant: one texel a block)', () => {
  assert.equal(PIX_SUB_MAX, 4);
  assert.equal(pixSub(1), 1);
  assert.equal(pixSub(3), 3);
  assert.equal(pixSub(5), 4);
  assert.equal(pixSub(12), 4);
});
