import test from 'node:test';
import assert from 'node:assert/strict';
import { createDungeonPropPreviews, closeDungeonPropPreviews } from '../../src/scenes/dungeonPropPreviews.js';
import { executeConsoleCommand, hasConsoleCommand } from '../../src/systems/consoleCommands.js';
import { identity } from '../../src/world/mat4.js';
import { drawTreasurePiles, releaseTreasurePile } from '../../src/render/treasurePiles.js';

test('the violet sarcophagus panel entry spawns its object mesh as a single prop and as a set', async () => {
  const draws = [];
  const renderer = {
    _view: identity(),
    createBillboardBatch: () => ({}),
    createMesh: data => ({ data }),
    drawMesh: (mesh, pose) => draws.push({ mesh, pose }),
    uploadTexture() {},
    destroyMesh() {},
    releaseTexture() {},
    destroyBatch(batch) { releaseTreasurePile(this, batch); },
  };
  const batches = createDungeonPropPreviews({
    renderer, active: () => true,
    getTexture() { throw new Error('ARCH3D preview should not load a sprite'); },
    getGpuMesh: async () => ({ original: true }),
    cpuModels: new Map([41315, 41322, 41323, 41325, 41326].map(id => [id, { positions: [-1, -.5, -1, 1, .5, 1] }])),
    collider: { raycastHit: (_, direction) => ({ dist: direction[1] < 0 ? 2 : Infinity }) },
  });
  try {
    assert.match(executeConsoleCommand('prop_preview', ['arch3d:41324', '4']), /Loading/);
    assert.match(executeConsoleCommand('prop_preview', ['set', 'Саркофаги']), /Размещаю/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(batches.length, 6);
    assert.deepEqual(drawTreasurePiles(renderer, batches), []);
    assert.equal(draws.length, 6);
    assert.equal(draws[0].mesh.pixelKind, 'objects');
    assert.equal(draws[0].mesh.pixelFootprint, undefined);
    assert.equal(draws[0].mesh.pixelBlockScale, 1.5);
    assert.ok(draws[0].mesh.data.subMeshes.some(sub => sub.textureArchive === 92 && sub.textureRecord === 11));
    assert.ok(draws[0].mesh.data.subMeshes.some(sub => sub.textureArchive === 92 && sub.textureRecord === 8));
    const lidEdges = ({ mesh, pose }) => {
      const { positions, indices, subMeshes } = mesh.data;
      const lid = subMeshes.find(sub => sub.textureArchive === 92 && sub.textureRecord === 8);
      const points = [...indices.slice(lid.startIndex, lid.startIndex + 3)].map(i =>
        [positions[3 * i] * pose[0], positions[3 * i + 2] * pose[10]]);
      return points.map(([x, z], i) => Math.hypot(x - points[(i + 1) % 3][0], z - points[(i + 1) % 3][1])).sort((a, b) => a - b);
    };
    const closedEdges = lidEdges(draws[1]);
    lidEdges(draws[2]).forEach((edge, i) => assert.ok(Math.abs(edge - closedEdges[i]) < 1e-6));
    assert.ok(Math.abs(draws[0].pose[13] - .13 + 2) < 1e-6);
    assert.match(executeConsoleCommand('prop_preview', ['arch3d:41315']), /Loading/);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(drawTreasurePiles(renderer, [batches[6]]), []);
    assert.equal(draws.at(-1).mesh.original, true);
    assert.equal(draws.at(-1).pose[13], -1.5);
    assert.match(executeConsoleCommand('prop_preview', ['clear']), /cleared/);
    assert.equal(batches.length, 0);
  } finally {
    closeDungeonPropPreviews(batches);
  }
});

test('offline decor preview places a registered record on the floor and clears its own batch', async () => {
  const removed = [];
  const renderer = {
    _view: identity(),
    createBillboardBatch: (archive, record, size, centers) => ({ archive, record, size, centers }),
    destroyBatch: batch => removed.push(batch),
  };
  const texture = { recordCount: 48, getSize: () => ({ width: 32, height: 32 }), getScale: () => ({ width: 0, height: 0 }) };
  const batches = createDungeonPropPreviews({
    renderer, active: () => true, getTexture: async () => texture, uploadRecord() {},
    collider: { raycastHit: (_, direction) => ({ dist: direction[1] < 0 ? 2 : Infinity }) },
  });
  try {
    assert.match(executeConsoleCommand('prop_preview', ['206:26', '4', '0.5']), /Loading/);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(batches[0].centers.map(center => center.map(v => v + 0)), [[0, -1.5, -4]]);
    const batch = batches[0];
    assert.match(executeConsoleCommand('prop_preview', ['216:47']), /Loading/);
    assert.match(executeConsoleCommand('prop_preview', ['216:42']), /No 3D/);
    await new Promise(resolve => setImmediate(resolve));
    const loot = batches[1];
    assert.equal(loot.archive, 216);
    assert.equal(loot.record, 47);
    assert.match(executeConsoleCommand('prop_preview', ['clear']), /cleared/);
    assert.deepEqual(removed, [batch, loot]);
    assert.equal(batches.length, 0);
  } finally {
    closeDungeonPropPreviews(batches);
  }
  assert.equal(hasConsoleCommand('prop_preview'), false);
});

test('a complete loot set replaces the previous set and leaves individual previews alone', async () => {
  const removed = [];
  let blocked = false;
  const renderer = {
    _view: identity(),
    createBillboardBatch: (archive, record, size, centers) => ({ archive, record, size, centers }),
    destroyBatch: batch => removed.push(batch),
  };
  const texture = { recordCount: 48, getSize: () => ({ width: 32, height: 32 }), getScale: () => ({ width: 0, height: 0 }) };
  const batches = createDungeonPropPreviews({
    renderer, active: () => true, getTexture: async () => texture, uploadRecord() {},
    collider: { raycastHit: (_, direction) => ({ dist: direction[1] < 0 ? 2 : blocked ? .25 : Infinity }) },
  });
  const settled = () => new Promise(resolve => setImmediate(resolve));
  try {
    executeConsoleCommand('prop_preview', ['216:47']);
    await settled();
    const single = batches[0];
    assert.match(executeConsoleCommand('prop_preview', ['set', 'Лут']), /Размещаю/);
    await settled();
    const firstSet = batches.slice(1);
    assert.deepEqual(firstSet.map(batch => batch.record), [0, 20, 22, 24, 25, 30, 37, 43, 45, 46, 47]);
    assert.equal(new Set(firstSet.map(batch => batch.centers[0].join(','))).size, firstSet.length);
    blocked = true;
    executeConsoleCommand('prop_preview', ['set', 'Лут']);
    await settled();
    assert.deepEqual(batches, [single, ...firstSet]);
    blocked = false;
    executeConsoleCommand('prop_preview', ['set', 'Лут', '5']);
    await settled();
    assert.equal(batches.length, 12);
    assert.equal(batches[0], single);
    assert.deepEqual(removed, firstSet);
    executeConsoleCommand('prop_preview', ['clear']);
    assert.equal(batches.length, 0);
    assert.equal(removed.length, 23);
  } finally {
    closeDungeonPropPreviews(batches);
  }
});
