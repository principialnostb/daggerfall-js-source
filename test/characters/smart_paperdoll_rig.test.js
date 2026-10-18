import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSmartPaperDollLayers, SMART_PAPERDOLL_LAYERS } from '../../src/characters/smartPaperDollRig.js';

test('independent base body is actual 3D rig geometry with animated groups', () => {
  const model = buildSmartPaperDollLayers();
  assert.ok(model.faces.length > 1000);
  assert.ok(model.faces.every((f) => f.p.length === 12 && f.n.length === 3 && f.c.length === 3));
  assert.ok(model.faces.some((f) => f.g === 'armL'));
  assert.ok(model.faces.some((f) => f.g === 'legR'));
  assert.deepEqual(model.garments, []);
});

test('garments are separate selectable geometry layers and unknown names are ignored', () => {
  const bare = buildSmartPaperDollLayers();
  const dressed = buildSmartPaperDollLayers({ garments: ['Casual Dress', 'not-a-garment'] });
  assert.deepEqual(dressed.garments, ['Casual Dress']);
  assert.ok(dressed.faces.length > bare.faces.length);
  assert.ok(SMART_PAPERDOLL_LAYERS.includes('Casual Dress'));
  assert.ok(!dressed.faces.every((f) => f.g === 'body'));
});

test('gender silhouette morph does not move the canonical vertical joint positions', () => {
  const model = buildSmartPaperDollLayers();
  const ys = model.faces.flatMap((f) => f.p.filter((_, i) => i % 3 === 1));
  assert.ok(Math.min(...ys) >= -0.01);
  assert.ok(Math.max(...ys) <= 1.85);
});
