import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaperDollVoxelFaces, SMART_PAPERDOLL_HEIGHT, SMART_PAPERDOLL_DEPTH } from '../../src/characters/paperDollVoxel.js';

function image(width, height, paint) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const c = paint(x, y);
    rgba.set(c, (y * width + x) * 4);
  }
  return { width, height, rgba, version: 1 };
}

test('transparent paperdoll pixels do not become voxels', () => {
  const faces = buildPaperDollVoxelFaces(image(4, 4, () => [0, 0, 0, 0]));
  assert.deepEqual(faces, []);
});

test('opaque pixels create a colored, thick, bounded voxel mesh', () => {
  const faces = buildPaperDollVoxelFaces(image(4, 4, (x, y) => (
    x === 1 && y >= 1 && y <= 2 ? [180, 90, 40, 255] : [0, 0, 0, 0]
  )), { maxWidth: 4, maxHeight: 4 });
  assert.ok(faces.length > 0);
  assert.ok(faces.every((f) => f.p.length === 12 && f.n.length === 3 && f.c.length === 3));
  assert.ok(faces.every((f) => f.c[0] === 180 && f.c[1] === 90 && f.c[2] === 40));
  const ys = faces.flatMap((f) => f.p.filter((_, i) => i % 3 === 1));
  const zs = faces.flatMap((f) => f.p.filter((_, i) => i % 3 === 2));
  assert.ok(Math.abs(Math.max(...ys) - SMART_PAPERDOLL_HEIGHT) < 1e-6);
  assert.ok(Math.abs((Math.max(...zs) - Math.min(...zs)) - SMART_PAPERDOLL_DEPTH) < 1e-6);
});

test('malformed and zero-sized images fail closed', () => {
  assert.deepEqual(buildPaperDollVoxelFaces(null), []);
  assert.deepEqual(buildPaperDollVoxelFaces({ width: 0, height: 4, rgba: new Uint8Array() }), []);
  assert.deepEqual(buildPaperDollVoxelFaces({ width: 2, height: 2, rgba: new Uint8Array(3) }), []);
});
