import test from 'node:test';
import assert from 'node:assert/strict';
import { tilesHideBounds } from '../../src/render/fixtureDepth.js';
import { identity } from '../../src/world/mat4.js';

function snapshot() {
  return { layer: { w: 2, h: 1, data: Uint8Array.from([64, 0, 0, 255, 255, 255, 0, 255]) },
    width: 32, height: 16, pv: identity() };
}

test('a hidden flame remains visible to the renderer if its pixel block reaches an uncovered tile', () => {
  const tiles = snapshot();
  const corners = [[-.25, 0, .5], [-.125, .25, .75]];
  assert.equal(tilesHideBounds(tiles, corners, 1), true);
  assert.equal(tilesHideBounds(tiles, corners, 2), false);
});

test('a flame touching the wall depth or the near plane always takes the regular draw path', () => {
  const tiles = snapshot();
  const depth = (64 * 256 / 65535) * 2 - 1;
  assert.equal(tilesHideBounds(tiles, [[-.5, 0, depth]], 1), false);
  assert.equal(tilesHideBounds(tiles, [[-.5, 0, -1], [-.4, 0, .6]], 1), false);
});
