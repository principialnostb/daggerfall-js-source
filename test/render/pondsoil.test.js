import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../../src/render/renderer.js';
import { pondSoilLayer } from '../../src/render/pondSoilTexture.js';
import { TWIN_LAYERS } from '../../src/render/snowCoverGlsl.js';

test('pond soil retains its footprint in both archive sizes and averages the packed masks when reduced', () => {
  const art = pondSoilLayer(128, 128);
  const small = pondSoilLayer(64, 64), large = pondSoilLayer(256, 256);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) for (let c = 0; c < 4; c++) {
    const k = 4 * (2 * y * 128 + 2 * x) + c;
    assert.equal(small[4 * (y * 64 + x) + c], Math.round((art[k] + art[k + 4] + art[k + 512] + art[k + 516]) / 4));
    assert.equal(large[4 * (4 * y * 256 + 4 * x) + c], art[k]);
  }
});

test('pond material follows the last winter record without shifting the season lookup', () => {
  const uploads = [], tex = {};
  let depth;
  const gl = {
    createTexture: () => tex, bindTexture() {}, texParameteri() {}, generateMipmap() {},
    texImage3D: (...args) => { depth = args[5]; },
    texSubImage3D: (...args) => { uploads.push([args[4], args.at(-1)]); },
  };
  const host = { gl, tileArrays: new Map(), _tileDims: new Map(), _arrLayers: new WeakMap(), _setGroundSampler() {} };
  const layers = Array.from({ length: 2 * TWIN_LAYERS }, (_, i) => ({ width: 2, height: 2, colors: new Uint8Array(16).fill(i) }));
  Array.from(Renderer.prototype.uploadTileArraySteps.call(host, 302, layers));
  assert.equal(depth, layers.length + 1);
  assert.equal(host._arrLayers.get(tex), layers.length);
  assert.deepEqual(uploads.slice(0, -1).map(([layer, bytes]) => [layer, bytes[0]]), layers.map((_, i) => [i, i]));
  assert.deepEqual(uploads.at(-1), [layers.length, pondSoilLayer(2, 2)]);
});
