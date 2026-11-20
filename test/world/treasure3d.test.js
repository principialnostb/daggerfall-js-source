import assert from 'node:assert/strict';
import test from 'node:test';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { RANDOM_TREASURE_ICONS } from '../../src/systems/loot/lootDataTables.js';
import { dungeonRemainsKind, dungeonRemainsVariant } from '../../src/world/dungeonRemainsModel.js';
import { footprintBlockPixels } from '../../src/render/charPixelLayer.js';
import { buildTreasureModel, hasTreasureModel, selectTreasureAppearance } from '../../src/world/treasureModel.js';
import { acquireTreasureModel, drawTreasurePiles, markDungeonProp, markTreasurePile, releaseTreasureModel, releaseTreasurePile } from '../../src/render/treasurePiles.js';
import { drawPlacedFurnishings, markPlacedFurnishing, placedFurnishingModels, releasePlacedFurnishing } from '../../src/render/furnishingMorrowind.js';

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
  assert.deepEqual(drawTreasurePiles(renderer, [sprite, a, b, unknown], false, true), [sprite, unknown]);
  assert.equal(meshes.length, 1);
  assert.equal(drawn[0][0], drawn[1][0]);
  assert.deepEqual(Array.from(drawn[0][1].slice(12, 15)), [11, 2, 3]);
  const prior = getPref('enhancedTreasurePiles');
  const chain = markDungeonProp({ ...sprite, archive: 211, record: 4 }, [[0, 0, 0]]);
  try {
    setPref('enhancedTreasurePiles', false);
    assert.deepEqual(drawTreasurePiles(renderer, [a, b, chain], true, false), [a, b]);
    assert.equal(drawn.length, 3);
    setPref('enhancedTreasurePiles', true);
    assert.deepEqual(drawTreasurePiles(renderer, [a], false, true), []);
    assert.equal(drawn[3][0], drawn[0][0]);
    const propsPrior = getPref('enhancedDungeonProps');
    try {
      setPref('enhancedDungeonProps', false);
      assert.deepEqual(drawTreasurePiles(renderer, [a, chain], false, true), [chain]);
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
  assert.deepEqual(drawTreasurePiles(renderer, [first, second, double], true), []);
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

test('placed barrels and their DET aliases share the dungeon fallback without Morrowind', () => {
  const drawn = [], destroyed = [];
  const renderer = {
    createMesh: data => data,
    drawMesh: (mesh, pose) => drawn.push({ mesh, pose }),
    destroyMesh: mesh => destroyed.push(mesh),
    uploadTexture() {},
    releaseTexture() {},
  };
  const barrel = (archive, record) => markPlacedFurnishing({
    archive, record, vao: {}, size: { w: 1, h: 1.25 }, origin: [10, 0, 2],
  }, [[2, .5, 3]]);
  const batches = [barrel(205, 0), barrel(10027, 10)];
  assert.equal(placedFurnishingModels(batches[0]).spec[0], 'o/contain_barrel_01.nif');
  assert.deepEqual(drawPlacedFurnishings(renderer, batches, acquireTreasureModel), []);
  assert.equal(drawn.length, 2);
  assert.equal(drawn[0].mesh, drawn[1].mesh);
  for (const { pose } of drawn) assert.ok(Math.abs(pose[5] - .78) < 1e-6);
  assert.deepEqual(Array.from(drawn[0].pose.slice(12, 15)), [12, .5, 5]);
  releasePlacedFurnishing(renderer, batches[0], releaseTreasureModel);
  assert.equal(destroyed.length, 0);
  releasePlacedFurnishing(renderer, batches[1], releaseTreasureModel);
  assert.deepEqual(destroyed, [drawn[0].mesh]);
});

test('placed goblets retain their authored dimensions and books have a separate cap', () => {
  const poses = [];
  const renderer = { drawMesh: (_, pose) => poses.push(pose) };
  const goblet = h => markPlacedFurnishing({
    archive: 200, record: 0, vao: {}, size: { w: h * 2 / 3, h },
  }, [[2, .75, 3]]);
  const batches = [goblet(.45), goblet(.12)];
  assert.equal(placedFurnishingModels({ archive: 56790, record: 1 }).maxLength, undefined);
  const bottle = placedFurnishingModels({ archive: 205, record: 12 });
  assert.equal(bottle.maxLength, undefined);
  assert.equal(bottle.spec[0], 'm/misc_com_bottle_03.nif');
  const book = placedFurnishingModels({ archive: 209, record: 4 });
  assert.ok(Math.abs(book.maxLength - .30) < 1e-6);
  for (const [record, maxLength] of [[0, .78], [8, .58], [9, .58]]) {
    const storage = placedFurnishingModels({ archive: 205, record });
    assert.equal(storage.maxLength, maxLength);
    assert.equal(storage.tabletopPixels, false);
  }
  for (const record of [17, 19, 20]) {
    assert.equal(placedFurnishingModels({ archive: 205, record }).maxLength, undefined);
  }
  assert.deepEqual(drawPlacedFurnishings(renderer, batches, () => ({})), []);
  assert.ok(Math.abs(poses[0][5] - .45) < 1e-6);
  assert.ok(Math.abs(poses[1][5] - .12) < 1e-6);
  assert.equal(poses[0][13], .75);
  for (const batch of batches) releasePlacedFurnishing(renderer, batch, () => {});
});

test('placed book and bottle groups preserve their components and fall back as a unit', () => {
  for (let record = 0; record <= 10; record++) {
    const { spec, assembly } = placedFurnishingModels({ archive: 209, record });
    assert.ok(spec || assembly, '209:' + record);
  }
  for (const [archive, record, count] of [[56790, 4, 3], [209, 6, 2], [205, 31, 5]]) {
    const batch = markPlacedFurnishing({ archive, record, vao: {}, size: { w: .3, h: .2 } }, [[0, 0, 0]]);
    const { assembly } = placedFurnishingModels(batch);
    assert.equal(assembly.parts.length, count);
    assert.ok(assembly.parts.every(([id]) => {
      const [a, r] = id.split(':').map(Number);
      return placedFurnishingModels({ archive: a, record: r }).spec;
    }));
    const batches = [batch];
    assert.equal(drawPlacedFurnishings({}, batches, () => assert.fail()), batches);
    releasePlacedFurnishing({}, batch, () => assert.fail());
  }
});

test('both waterside flats draw three-dimensional racks with the authored height and object pixelation', () => {
  const draws = [];
  const renderer = {
    createMesh: data => data,
    drawMesh: (mesh, pose) => draws.push({ mesh, pose }),
    destroyMesh() {},
    uploadTexture() {},
    releaseTexture() {},
  };
  const batches = [[15, 3.15, 2.8], [16, 3.175, 4.225]].map(([record, w, h]) => markPlacedFurnishing({
    archive: 212, record, vao: {}, size: { w, h }, origin: [10, 0, 2],
  }, [[2, 0, 3]]));
  assert.deepEqual(drawPlacedFurnishings(renderer, batches, acquireTreasureModel), []);
  assert.equal(draws.length, 2);
  for (const [i, { mesh, pose }] of draws.entries()) {
    assert.equal(mesh.pixelKind, 'objects');
    assert.equal(mesh.subMeshes.length, 3);
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.ok(mesh.aabb.extent[2] * pose[10] > .7);
    const top = (mesh.aabb.center[1] + mesh.aabb.extent[1]) * pose[5];
    assert.ok(Math.abs(top - batches[i].size.h) < .04);
    assert.deepEqual(Array.from(pose.slice(12, 15)), [12, 0, 5]);
  }
  assert.ok(draws[1].mesh.indices.length > draws[0].mesh.indices.length);
  for (const batch of batches) releasePlacedFurnishing(renderer, batch, releaseTreasureModel);
});
