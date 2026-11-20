import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStreetFountain, registerStreetFountain, STREET_FOUNTAIN_MODEL } from '../../src/world/streetFountain.js';
import { customModelFor, unregisterCustomModel } from '../../src/world/customModels.js';
import { Collider } from '../../src/player/collider.js';
import { DEFAULT_ACTIVATION_DISTANCE, pickActivatableHit } from '../../src/player/activate.js';
import { identity } from '../../src/world/mat4.js';
import { WATER_SOURCE_MODELS } from '../../src/systems/survival/items.js';
import { classicPixelKind } from '../../src/systems/worldPixelConfig.js';

test('street fountain keeps the classic footprint, water level and object pixelation ID', () => {
  registerStreetFountain();
  try {
    const model = customModelFor(STREET_FOUNTAIN_MODEL);
    assert.ok(model);
    assert.ok(WATER_SOURCE_MODELS.includes(STREET_FOUNTAIN_MODEL));
    assert.equal(classicPixelKind(STREET_FOUNTAIN_MODEL), 'objects');
    const { positions, indices, subMeshes } = model;
    const x = positions.filter((_, i) => i % 3 === 0);
    const z = positions.filter((_, i) => i % 3 === 2);
    assert.ok(Math.abs(Math.min(...x) + 2.355) < .002);
    assert.ok(Math.abs(Math.max(...x) - 2.911) < .002);
    assert.ok(Math.abs(Math.max(...z) - Math.min(...z) - 5.538) < .002);
    const water = subMeshes.find(s => s.textureArchive === 85 && s.textureRecord === 0);
    assert.ok(water);
    const waterIndices = indices.slice(water.startIndex, water.startIndex + water.primitiveCount * 3);
    assert.ok(waterIndices.length && waterIndices.every(i => Math.abs(positions[i * 3 + 1] + .123) < 1e-6));
  } finally {
    for (const id of [STREET_FOUNTAIN_MODEL, 41221, 41222]) unregisterCustomModel(id);
  }
});

test('the fountain rim is solid and the water source can be picked over it', () => {
  const model = buildStreetFountain();
  const collider = new Collider(() => -Infinity);
  collider.addMesh('fountain', model.positions, model.indices, identity());
  assert.ok(collider.raycastHit([-3, .2, 0], [1, 0, 0], 6).dist < 1);
  const targets = [{
    key: 'water:0', aabb: { min: [-.8, 0, -.8], max: [.8, 1.6, .8] }, reach: DEFAULT_ACTIVATION_DISTANCE,
  }];
  for (const [x, z] of [[3.15, 0], [0, 3.15], [-3.15, 0], [0, -3.15]]) {
    const length = Math.hypot(x, .9, z);
    const hit = pickActivatableHit([x, 1.7, z], [-x / length, -.9 / length, -z / length], targets, collider);
    assert.equal(hit?.key, 'water:0');
    assert.ok(hit.distance <= hit.reach);
  }
});

test('both pentagonal fountains keep the authored waterline and a separate upper pool', () => {
  registerStreetFountain();
  try {
    for (const [id, radius, lower, upper] of [[41221, 2.886, -.436, .983], [41222, 2.15, -.545, .819]]) {
      const { positions, indices, subMeshes } = customModelFor(id);
      const pools = subMeshes.filter(s => s.fountainWater === 1);
      assert.equal(pools.length, 1);
      assert.ok(subMeshes.some(s => s.fountainWater === -1));
      const part = pools[0];
      assert.equal(part.primitiveCount, 15);
      const vertices = indices.slice(part.startIndex, part.startIndex + part.primitiveCount * 3);
      assert.deepEqual([...new Set(Array.from(vertices, i => +positions[i * 3 + 1].toFixed(3)))], [lower, upper]);
      assert.ok(Math.abs(Math.max(...Array.from(vertices, i => positions[i * 3])) - radius) < .001);
      assert.ok(WATER_SOURCE_MODELS.includes(id));
      assert.equal(classicPixelKind(id), 'objects');
    }
  } finally {
    for (const id of [STREET_FOUNTAIN_MODEL, 41221, 41222]) unregisterCustomModel(id);
  }
});
