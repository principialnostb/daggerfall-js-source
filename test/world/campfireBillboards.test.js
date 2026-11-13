import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseCampfireBatch, drawCampfireBillboards } from '../../src/render/campfireBillboards.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { Renderer } from '../../src/render/renderer.js';

test('layout campfires share the 3D visual, track origins and movement, and release their lease', () => {
  const previous = getPref('enhancedCampfire');
  const draws = [], freed = [], uploads = [];
  const renderer = {
    gl: new Proxy({}, { get: (_, key) => key === 'getParameter' ? () => [0, 0, 320, 200] : key.startsWith('create') ? () => ({}) : () => {} }),
    stats: { vaoBinds: 0 }, _bindVao: Renderer.prototype._bindVao,
    createMesh: m => m, destroyMesh: m => freed.push(m),
    uploadTexture: (...args) => uploads.push(args), releaseTexture() {},
    drawMesh: (mesh, matrix) => draws.push({ mesh, pos: Array.from(matrix.slice(12, 15)) }),
  };
  const fire = Renderer.prototype.createBillboardBatch.call(renderer, 210, 1, { w: 1, h: 1 }, [[1, 2, 3], [4, 5, 6]], { dynamic: true });
  fire.origin = [100, 0, -50];
  const other = { archive: 210, record: 20, vao: {} };
  const second = Renderer.prototype.createBillboardBatch.call(renderer, 210, 1, { w: 1, h: 1 }, [[0, 0, 0]]);
  try {
    setPref('enhancedCampfire', true);
    assert.deepEqual(drawCampfireBillboards(renderer, [fire, other, second], 0), [other]);
    assert.equal(draws.length, 12);
    assert.deepEqual(draws[0].pos, [101, 2, -47]);
    assert.deepEqual(draws[4].pos, [104, 5, -44]);
    assert.equal(uploads.length, 10);
    Renderer.prototype.moveBillboardBatch.call(renderer, fire, [[10, 20, 30], [40, 50, 60]]);
    fire.origin = [0, 0, 0];
    draws.length = 0;
    drawCampfireBillboards(renderer, [fire], 1);
    assert.deepEqual(draws[0].pos, [10, 20, 30]);
    setPref('enhancedCampfire', false);
    const classic = [fire, other];
    assert.equal(drawCampfireBillboards(renderer, classic), classic);
    Renderer.prototype.destroyBillboardBatch.call(renderer, fire);
    assert.equal(freed.length, 0);
    Renderer.prototype.destroyBatch.call(renderer, second);
    assert.equal(freed.length, 49);
    releaseCampfireBatch(second);
    assert.equal(freed.length, 49);
  } finally {
    releaseCampfireBatch(fire); releaseCampfireBatch(second);
    setPref('enhancedCampfire', previous);
  }
});
