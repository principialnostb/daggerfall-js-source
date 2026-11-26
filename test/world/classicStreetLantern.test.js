import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassicStreetLantern, usesClassicStreetLantern } from '../../src/world/classicStreetLantern.js';
import { createTorchVisual } from '../../src/scenes/torchVisual.js';
import packed from '../../src/world/art/classicStreetLantern.json' with { type: 'json' };

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
  const pane = m.subMeshes[2];
  const xs = [...m.indices.slice(pane.startIndex)].map(index => m.positions[3 * index]);
  assert.deepEqual([xs.filter(x => x > 0).length, xs.filter(x => x < 0).length], [36, 36]);
  assert.ok(m.indices.length / 3 < 12000);
  for (const field of ['positions', 'normals', 'uvs', 'indices']) {
    const array = m[field];
    assert.deepEqual(Buffer.from(array.buffer, array.byteOffset, array.byteLength), Buffer.from(packed[field], 'base64'));
  }
  for (const [i, [, , paint]] of r.uploads.entries()) {
    assert.equal(paint.colors.length, paint.width * paint.height * 4);
    assert.deepEqual(Buffer.from(paint.colors), Buffer.from(packed.textures[i], 'base64'));
  }
  fixture.destroy();
  assert.deepEqual(r.freed, [m]);
  assert.equal(r.released.length, 3);
  assert.deepEqual(r.evicted, ['38342_42']);
});

test('game fixture pool shares street mesh and frees it after the last owner', () => {
  const r = renderer(), a = createTorchVisual(r, 14), b = createTorchVisual(r, 29);
  a.draw([0, 0, 0], 4.415, 0, null, undefined, 0, true);
  b.draw([3, 0, 0], 4.415, 0);
  assert.equal(r.draws.length, 2);
  const mesh = r.draws[0][0];
  assert.equal(mesh.indices, r.draws[1][0].indices);
  assert.equal(r.draws[1][0].subMeshes[2].primitiveCount * 2, mesh.subMeshes[2].primitiveCount);
  assert.deepEqual(r.uploads.map(([, record]) => record), [40, 41, 42]);
  a.destroy(); assert.ok(!r.freed.includes(mesh));
  b.destroy(); assert.deepEqual(r.freed, [mesh]);
  b.destroy(); assert.deepEqual(r.released.map(([, record]) => record), [40, 41, 42]);
});
