import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closestPointOnTriangle3d,
  buildTriangleGrid3d,
  queryTriangleGrid3d,
  nearestTrianglePoint3d,
} from '../src/formats/morrowind/mwCloakContact3d.js';

test('closest point on a triangle handles its face and edges in 3D', () => {
  const face = closestPointOnTriangle3d(0.25, 3, 0.25, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  assert.ok(Math.abs(face.x - 0.25) < 1e-9);
  assert.ok(Math.abs(face.z - 0.25) < 1e-9);
  assert.ok(Math.abs(face.distanceSq - 9) < 1e-9);

  const edge = closestPointOnTriangle3d(0.5, 1, -1, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  assert.ok(Math.abs(edge.x - 0.5) < 1e-9);
  assert.ok(Math.abs(edge.z) < 1e-9);
  assert.ok(Math.abs(edge.distanceSq - 2) < 1e-9);
});

test('closest point falls back to segments for a degenerate triangle', () => {
  const q = closestPointOnTriangle3d(1, 2, 0, 0, 0, 0, 2, 0, 0, 4, 0, 0);
  assert.ok(Math.abs(q.x - 1) < 1e-9);
  assert.ok(Math.abs(q.y) < 1e-9);
  assert.ok(Math.abs(q.distanceSq - 4) < 1e-9);
});

test('3D triangle grid returns local candidates once and finds the nearest contact', () => {
  const positions = new Float32Array([
    0, 0, 0,  4, 0, 0,  0, 0, 4,
    20, 20, 20,  24, 20, 20,  20, 20, 24,
  ]);
  const indices = new Uint16Array([0, 1, 2, 3, 4, 5]);
  const grid = buildTriangleGrid3d(positions, indices, 2);
  const candidates = queryTriangleGrid3d(grid, 1, 1, 1, 2);
  assert.deepEqual(candidates, [0]);
  assert.deepEqual(queryTriangleGrid3d(grid, 1, 1, 1, 2, candidates), [0]);
  const nearest = nearestTrianglePoint3d(grid, 1, 1, 1, 2);
  assert.equal(nearest.triangleOffset, 0);
  assert.ok(Math.abs(nearest.distanceSq - 1) < 1e-9);
  assert.equal(nearestTrianglePoint3d(grid, 10, 10, 10, 1), null);
});

test('3D triangle grid rejects invalid cell sizes', () => {
  assert.throws(() => buildTriangleGrid3d(new Float32Array(0), new Uint16Array(0), 0), RangeError);
});
