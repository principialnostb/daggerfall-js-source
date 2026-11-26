import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { acquireTreasureModel, releaseTreasureModel } from '../../src/render/treasurePiles.js';
import { buildCourtyardFountain, COURTYARD_PAINT } from '../../src/world/courtyardFountain.js';
import { WORKSHOP_WOOD } from '../../src/world/dungeonWorkshopWood.js';
import { DAMP_POST_WOOD } from '../../src/world/shorePost.js';
import { TreasurePaintBank, treasurePaints, TREASURE_ART } from '../../src/world/treasureModel.js';

test('each procedural picture matches the complete original RGBA bank', () => {
  const full = treasurePaints(), hash = createHash('sha256');
  assert.equal(Object.keys(full).length, 54);
  for (const key of Object.keys(full)) {
    const i = Number(key), paint = full[i];
    hash.update(JSON.stringify([i, paint.width, paint.height]));
    hash.update(paint.colors);
  }
  assert.equal(hash.digest('hex'), 'e2e9663321cd0445bbb67f8408fed9670a6b3d8491974b341813871caac59bc6');
  const sparse = new TreasurePaintBank();
  assert.equal(sparse.size, 0);
  const post = sparse.get(DAMP_POST_WOOD);
  assert.deepEqual([...sparse.keys()], [WORKSHOP_WOOD.beam, DAMP_POST_WOOD]);
  assert.strictEqual(sparse.get(DAMP_POST_WOOD), post);
  assert.deepEqual(post, full[DAMP_POST_WOOD]);
  assert.deepEqual(sparse.get(WORKSHOP_WOOD.beam), full[WORKSHOP_WOOD.beam]);
  assert.equal(sparse.get(-1), undefined);
  assert.equal(sparse.size, 2);
});

function trackingRenderer() {
  const uploaded = [], released = [];
  return {
    uploaded, released,
    createMesh: data => ({ subMeshes: data.subMeshes }),
    destroyMesh() {},
    uploadTexture(archive, slot, paint) { uploaded.push([archive, slot, paint]); },
    releaseTexture(archive, slot) { released.push([archive, slot]); },
  };
}

test('wet and dry fountains share only their final drawn records per renderer and reacquire after cleanup', () => {
  const dry = buildCourtyardFountain(TREASURE_ART, { dry: true }), wet = buildCourtyardFountain(TREASURE_ART);
  const { stone, water } = COURTYARD_PAINT;
  const a = trackingRenderer(), b = trackingRenderer();
  const draw = (renderer, model) => acquireTreasureModel(renderer, model, null, model);
  const slots = renderer => renderer.uploaded.map(([archive, record]) => [archive, record]);
  const first = draw(a, dry);
  assert.strictEqual(draw(a, dry), first);
  assert.deepEqual(slots(a), [[TREASURE_ART, stone]]);
  draw(a, wet);
  assert.deepEqual(slots(a), [[TREASURE_ART, stone], [TREASURE_ART, water]]);
  draw(b, wet);
  assert.deepEqual(new Set(slots(b).map(pair => pair[1])), new Set([stone, water]));
  releaseTreasureModel(a, wet);
  releaseTreasureModel(a, dry);
  assert.deepEqual(a.released, []);
  releaseTreasureModel(a, dry);
  assert.deepEqual(a.released, slots(a));
  assert.deepEqual(b.released, []);
  draw(a, dry);
  releaseTreasureModel(a, dry);
  assert.deepEqual(slots(a), [[TREASURE_ART, stone], [TREASURE_ART, water], [TREASURE_ART, stone]]);
  assert.deepEqual(a.released, slots(a));
  releaseTreasureModel(b, wet);
  assert.deepEqual(b.released, slots(b));
});

test('a supplied remains picture is uploaded only when a submesh uses that archive and record', () => {
  const renderer = trackingRenderer();
  const model = buildCourtyardFountain(TREASURE_ART, { dry: true });
  const source = { width: 1, height: 1, colors: Uint8Array.of(11, 22, 33, 255) };
  const other = { width: 1, height: 1, colors: Uint8Array.of(44, 55, 66, 255) };
  model.subMeshes = model.subMeshes.map((slot, i) => ({ ...slot,
    textureArchive: i === 0 ? TREASURE_ART : 215, textureRecord: i === 0 ? 12 : 13 }));
  const remains = { paints: new Map([[12, source], [13, other]]) };
  acquireTreasureModel(renderer, model, null, model);
  assert.deepEqual(renderer.uploaded, []);
  acquireTreasureModel(renderer, model, remains, model);
  assert.deepEqual(renderer.uploaded, [[TREASURE_ART, 12, source]]);
  releaseTreasureModel(renderer, model);
  assert.deepEqual(renderer.released, []);
  releaseTreasureModel(renderer, model);
  assert.deepEqual(renderer.released, [[TREASURE_ART, 12]]);
});

test('a failed mesh allocation releases only new pictures and permits a retry', () => {
  const renderer = trackingRenderer(), create = renderer.createMesh;
  const dry = buildCourtyardFountain(TREASURE_ART, { dry: true }), wet = buildCourtyardFountain(TREASURE_ART);
  const { stone, water } = COURTYARD_PAINT;
  acquireTreasureModel(renderer, dry, null, dry);
  renderer.createMesh = () => { throw new Error('allocation failed'); };
  assert.throws(() => acquireTreasureModel(renderer, wet, null, wet), /allocation failed/);
  assert.deepEqual(renderer.released, [[TREASURE_ART, water]]);
  renderer.createMesh = create;
  acquireTreasureModel(renderer, wet, null, wet);
  assert.deepEqual(renderer.uploaded.map(([, record]) => record), [stone, water, water]);
  releaseTreasureModel(renderer, dry);
  releaseTreasureModel(renderer, wet);
  assert.deepEqual(renderer.released, [[TREASURE_ART, water], [TREASURE_ART, stone], [TREASURE_ART, water]]);
});
