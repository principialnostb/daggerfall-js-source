import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pixelViewport } from '../../src/render/pixelViewport.js';

test('pixel passes restore confirmed driver rectangles across nested targets and context restoration', () => {
  let reads = 0, current = [3, 5, 800, 600];
  const gl = {
    canvas: new EventTarget(), VIEWPORT: 1,
    getParameter(key) {
      assert.equal(key, this.VIEWPORT);
      reads++;
      return Int32Array.from(current);
    },
    viewport(x, y, w, h) {
      if (w >= 0 && h >= 0) current = [x, y, Math.min(w, 2048), Math.min(h, 2048)];
    },
  };
  assert.deepEqual([...pixelViewport(gl)], current);
  gl.viewport(0, 0, 4096, 4096);
  const saved = pixelViewport(gl);
  gl.viewport(3, 4, 640, 360);
  assert.deepEqual([...pixelViewport(gl)], [3, 4, 640, 360]);
  gl.viewport(0, 0, 4096, 4096);
  assert.deepEqual([...saved], [0, 0, 2048, 2048]);
  assert.equal(pixelViewport(gl), saved);
  assert.equal(reads, 3);
  gl.viewport(0, 0, -1, 1);
  assert.deepEqual([...pixelViewport(gl)], current);
  assert.equal(reads, 4);
  gl.canvas.dispatchEvent(new Event('webglcontextlost'));
  gl.canvas.dispatchEvent(new Event('webglcontextrestored'));
  gl.viewport(0, 0, 4096, 4096);
  assert.notEqual(pixelViewport(gl), saved);
  assert.equal(reads, 5);
});
