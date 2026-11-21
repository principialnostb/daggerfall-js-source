import assert from 'node:assert/strict';
import test from 'node:test';
import { flatGrid } from '../../../src/world/water/waterBed.js';
import { groundRelief } from '../../../src/world/terrain/groundRelief.js';

const width = 32,
  height = 24;
const grid = flatGrid(width, height, 0);
const build = (byte, extra = {}) =>
  groundRelief(grid.positions, grid.normals, grid.indices, null, {
    width,
    height,
    bytes: new Uint8Array(width * height).fill(byte),
    tileDim: width,
    originX: -128,
    originZ: 256,
    ...extra,
  });

test('earth forms rebuild identically at the same address and vary across map pixels', () => {
  const a = build(10 << 2),
    again = build(10 << 2),
    elsewhere = build(10 << 2, { originX: 4096 });
  assert.ok(a && again && elsewhere);
  assert.deepEqual(a.positions, again.positions);
  assert.deepEqual(a.indices, again.indices);
  assert.notDeepEqual(a.positions, elsewhere.positions);
  assert.deepEqual(a.positions.subarray(0, grid.positions.length), grid.positions);
  assert.equal(a.finish.length, a.positions.length);
  assert.ok(a.positions.some((v, i) => i % 3 === 1 && v > 0.1));
  assert.ok(a.finish.some((v, i) => i % 3 === 0 && v > 0.5));
  assert.ok(build(15 << 2).finish.some((v, i) => i % 3 === 0 && v < -0.5));
  const pos = a.positions;
  for (let i = 0; i < a.indices.length; i += 3) {
    const [p, q, r] = Array.from(a.indices.subarray(i, i + 3), (n) => n * 3);
    assert.ok((pos[q + 2] - pos[p + 2]) * (pos[r] - pos[p]) - (pos[q] - pos[p]) * (pos[r + 2] - pos[p + 2]) > 0);
  }
});

test('paved, flooded, steeply folded and path-marked tiles keep their original surface', () => {
  for (const byte of [0, 46 << 2]) assert.equal(build(byte), null);
  assert.equal(build(8, { paths: new Uint8Array(width * height).fill(1) }), null);
  const folded = grid.positions.slice();
  for (let i = 0; i < folded.length / 3; i++)
    folded[3 * i + 1] = (i % (width + 1)) % 2 === Math.floor(i / (width + 1)) % 2 ? 1 : 0;
  assert.equal(
    groundRelief(folded, grid.normals, grid.indices, null, {
      width,
      height,
      tileDim: width,
      bytes: new Uint8Array(width * height).fill(8),
    }),
    null,
  );
});

test('near-ground decoration preserves the coarse water vertices and the shared far index layout', () => {
  const fine = build(8);
  assert.ok(fine);
  assert.deepEqual(fine.positions.subarray(0, grid.positions.length), grid.positions);
  const far = flatGrid(width / 4, height / 4, 0, 25.6);
  assert.equal(
    groundRelief(far.positions, far.normals, far.indices, null, {
      width,
      height,
      tileDim: width,
      bytes: new Uint8Array(width * height).fill(8),
    }),
    null,
  );
});
