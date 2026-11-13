import assert from 'node:assert/strict';
import test from 'node:test';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { RANDOM_TREASURE_ICONS } from '../../src/systems/loot/lootDataTables.js';
import { dungeonRemainsKind, dungeonRemainsVariant } from '../../src/world/dungeonRemainsModel.js';
import { footprintBlockPixels } from '../../src/render/charPixelLayer.js';
import { buildTreasureModel, hasTreasureModel, selectTreasureAppearance } from '../../src/world/treasureModel.js';
import { drawTreasurePiles, markDungeonProp, markTreasurePile, releaseTreasurePile } from '../../src/render/treasurePiles.js';

test('dungeon treasure rolls stay in the approved set and preserve approved appearances', () => {
  const approved = [0, 20, 22, 24, 25, 30, 37, 43, 45, 46, 47];
  assert.deepEqual(RANDOM_TREASURE_ICONS.filter(hasTreasureModel), approved);
  for (const record of RANDOM_TREASURE_ICONS) {
    const selected = selectTreasureAppearance(record, () => .58);
    assert.ok(approved.includes(selected));
    if (!approved.includes(record)) continue;
    assert.equal(selected, record);
    const mesh = buildTreasureModel(record);
    assert.ok(mesh.positions.every(Number.isFinite), String(record));
    assert.ok(mesh.aabb.extent[2] > 0, String(record));
    assert.ok(Math.abs(mesh.aabb.extent[0] - .5) < 1e-6, String(record));
    assert.ok(Math.abs(mesh.aabb.center[1] + mesh.aabb.extent[1] - 1) < 1e-6, String(record));
  }
});

test('marked dungeon piles replace only their own sprites and share a GPU lease', () => {
  const meshes = [], drawn = [], destroyed = [], uploaded = [], released = [];
  const renderer = {
    createMesh: data => { const mesh = { data }; meshes.push(mesh); return mesh; },
    drawMesh: (mesh, matrix) => drawn.push([mesh, matrix]),
    destroyMesh: mesh => destroyed.push(mesh),
    uploadTexture: (_, record) => uploaded.push(record),
    releaseTexture: (_, record) => released.push(record),
  };
  const sprite = { archive: 216, record: 30, size: { w: .5, h: .7 }, vao: {} };
  const a = markTreasurePile({ ...sprite, origin: [10, 0, 0] }, [1, 2, 3]);
  const b = markTreasurePile({ ...sprite }, [4, 5, 6]);
  const unknown = markTreasurePile({ ...sprite, record: 1 }, [0, 0, 0]);
  assert.deepEqual(drawTreasurePiles(renderer, [sprite, a, b, unknown]), [sprite, unknown]);
  assert.equal(meshes.length, 1);
  assert.equal(drawn[0][0], drawn[1][0]);
  assert.deepEqual(Array.from(drawn[0][1].slice(12, 15)), [11, 2, 3]);
  const prior = getPref('enhancedTreasurePiles');
  const chain = markDungeonProp({ ...sprite, archive: 211, record: 4 }, [[0, 0, 0]]);
  try {
    setPref('enhancedTreasurePiles', false);
    assert.deepEqual(drawTreasurePiles(renderer, [a, b, chain]), [a, b]);
    assert.equal(drawn.length, 3);
    setPref('enhancedTreasurePiles', true);
    assert.deepEqual(drawTreasurePiles(renderer, [a]), []);
    assert.equal(drawn[3][0], drawn[0][0]);
    const propsPrior = getPref('enhancedDungeonProps');
    try {
      setPref('enhancedDungeonProps', false);
      assert.deepEqual(drawTreasurePiles(renderer, [a, chain]), [chain]);
      assert.equal(drawn[4][0], drawn[0][0]);
    } finally {
      setPref('enhancedDungeonProps', propsPrior);
    }
  } finally {
    setPref('enhancedTreasurePiles', prior);
  }
  releaseTreasurePile(renderer, a);
  assert.equal(destroyed.length, 0);
  releaseTreasurePile(renderer, b);
  assert.deepEqual(destroyed, [meshes[0]]);
  releaseTreasurePile(renderer, chain);
  assert.deepEqual(destroyed, meshes);
  assert.deepEqual(released, uploaded);
});

test('large treasure close-ups use coarser Medium blocks without affecting small piles or HD', () => {
  assert.equal(footprintBlockPixels(1080, 360, .015, .035), 3);
  assert.equal(footprintBlockPixels(1080, 360, .14, .035), 5);
  assert.equal(footprintBlockPixels(1080, 0, .14, .035), 1);
});

test('single dungeon chains replace both records and share a mesh across grouped placements', () => {
  const draws = [], destroyed = [];
  const renderer = {
    createMesh: data => data,
    drawMesh: (mesh, matrix) => draws.push([mesh, matrix]),
    destroyMesh: mesh => destroyed.push(mesh),
    uploadTexture() {},
    releaseTexture() {},
  };
  const first = markDungeonProp({ archive: 211, record: 4, size: { w: .325, h: 1.95 }, vao: {} }, [[1, 2, 3], [4, 5, 6]]);
  const second = markDungeonProp({ ...first, archive: 100, record: 5 }, [[7, 8, 9]]);
  const double = markDungeonProp({ ...first, record: 6 }, [[0, 0, 0]]);
  assert.deepEqual(drawTreasurePiles(renderer, [first, second, double]), []);
  assert.equal(draws.length, 4);
  assert.ok(draws.slice(0, 3).every(([mesh]) => mesh === draws[0][0]));
  assert.ok(draws[3][0].indices.length > draws[0][0].indices.length);
  assert.deepEqual(Array.from(draws[1][1].slice(12, 15)), [4, 5, 6]);
  releaseTreasurePile(renderer, first);
  assert.equal(destroyed.length, 0);
  releaseTreasurePile(renderer, second);
  assert.deepEqual(destroyed, [draws[0][0]]);
  releaseTreasurePile(renderer, double);
  assert.deepEqual(destroyed, [draws[0][0], draws[3][0]]);
});

test('static remains distinguish piles, mounted skulls and standalone bones', () => {
  assert.deepEqual([[206, 0], [206, 1], [206, 8], [100, 17], [206, 10], [206, 7], [206, 29], [206, 30], [206, 31], [206, 32], [206, 26], [100, 4], [211, 34]].map(args => dungeonRemainsKind(...args)),
    ['skull', 'skull', 'bones', 'bones', 'standing', 'stakes', 'ribs', 'arm', 'bone', null, 'cage', 'cage', 'broken-cage']);
  for (const kind of ['skull', 'bones']) {
    const variants = Array.from({ length: 32 }, (_, i) => dungeonRemainsVariant(kind, i * .35, .5));
    assert.equal(new Set(variants).size, kind === 'skull' ? 4 : 3);
    assert.deepEqual(variants, variants.map((_, i) => dungeonRemainsVariant(kind, i * .35, .5)));
  }
});
