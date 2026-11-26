import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureHidden, tilesHideBounds, withFixtureDepth } from '../../src/render/fixtureDepth.js';
import { drawCampScene } from '../../src/scenes/campfireVisual.js';
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

test('exterior fixtures use the world depth buffer without a CPU readback', () => {
  const fbo = {};
  const renderer = { _worldFixtureDestination: { framebuffer: fbo }, _frameFbo: fbo, _air: { frame: { fbo, depth: {} } } };
  const marker = {};
  const result = withFixtureDepth(renderer, () => {
    for (let i = 0; i < 30; i++) assert.equal(fixtureHidden(renderer, [[0, 0, 0]], 1), false);
    return marker;
  });
  assert.equal(result, marker);
});

test('both dungeon hosts submit billboard fixtures inside the main world destination', () => {
  let scoped = false;
  const seen = [], batches = [], right = [1,0,0], up = [0,1,0];
  const renderer = {
    withWorldFixtureDestination(draw) { scoped = true; try { draw(); } finally { scoped = false; } },
    drawBillboards(...args) { assert.equal(scoped, true); seen.push(args); },
  };
  const camps = {draw(r) { assert.equal(r, renderer); assert.equal(scoped, false); }, drawFlames() { assert.equal(scoped, false); }};
  drawCampScene(renderer, {camps}, batches, right, up);
  assert.deepEqual(seen, [[batches, right, up]]);
  assert.equal(scoped, false);
});
