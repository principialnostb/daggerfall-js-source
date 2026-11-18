import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassicStreetLantern, usesClassicStreetLantern } from '../../src/world/classicStreetLantern.js';
import { createTorchVisual } from '../../src/scenes/torchVisual.js';

function renderer() {
  const state = { uploads: [], freed: [], released: [], evicted: [], draws: [] };
  return Object.assign(state, {
    createMesh: m => m,
    uploadTexture: (a, r, p) => state.uploads.push([a, r, p]),
    destroyMesh: m => state.freed.push(m),
    releaseTexture: (a, r) => state.released.push([a, r]),
    evictEmissionTexture: k => state.evicted.push(k),
    drawMesh: (...args) => state.draws.push(args),
  });
}

test('street replacement selects lamp posts, preserves candles and hanging lamps', () => {
  assert.deepEqual(Array.from({ length: 30 }, (_, i) => i).filter(usesClassicStreetLantern), [14, 15, 28, 29]);
});

test('Blender mesh has finite indexed geometry, normalized height and no flame', () => {
  const r = renderer(), fixture = createClassicStreetLantern(r), m = fixture.mesh;
  assert.deepEqual(fixture.flames, []);
  assert.ok(m.positions.every(Number.isFinite));
  assert.ok(m.indices.every(i => i < m.positions.length / 3));
  const ys = m.positions.filter((_, i) => i % 3 === 1);
  assert.ok(Math.abs(Math.min(...ys)) < .001);
  assert.ok(Math.abs(Math.max(...ys) - 1) < .001);
  assert.equal(m.subMeshes.reduce((n, p) => n + p.primitiveCount * 3, 0), m.indices.length);
  assert.ok(m.indices.length / 3 < 12000);
  assert.ok(r.uploads.every(([, , p]) => p.colors.length === p.width * p.height * 4));
  fixture.destroy();
  assert.deepEqual(r.freed, [m]);
  assert.equal(r.released.length, 3);
  assert.deepEqual(r.evicted, ['38342_42']);
});

test('game fixture pool shares street mesh and frees it after the last owner', () => {
  const r = renderer(), a = createTorchVisual(r, 14), b = createTorchVisual(r, 29);
  a.draw([0, 0, 0], 4.415, 0); b.draw([3, 0, 0], 4.415, 0);
  assert.equal(r.draws.length, 2);
  const mesh = r.draws[0][0];
  assert.equal(mesh, r.draws[1][0]);
  assert.equal(r.uploads.filter(([, record]) => record === 40).length, 1);
  a.destroy(); assert.ok(!r.freed.includes(mesh));
  b.destroy(); assert.equal(r.freed.filter(m => m === mesh).length, 1);
  b.destroy(); assert.equal(r.released.filter(([, record]) => record === 40).length, 1);
});
