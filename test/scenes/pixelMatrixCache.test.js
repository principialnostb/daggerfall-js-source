import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { markFixedPixelLocal, modelWorldMatrix, pixelFrameMatrix } from '../../src/scenes/frameKept.js';
import { identity, multiply, trs } from '../../src/world/mat4.js';
import { StreamingWorldState } from '../../src/world/streamingWorld.js';
import { TERRAIN_SIZE } from '../../src/world/terrain/terrainSampler.js';

function observedModel(local) {
  let writes = 0;
  class ObservedOutput extends Float32Array {
    set(...args) { writes++; return super.set(...args); }
  }
  return { local, _world: new ObservedOutput(16), writes: () => writes };
}

function verify(pixel, model, origin) {
  const frame = identity();
  frame[12] = origin[0]; frame[13] = origin[1]; frame[14] = origin[2];
  const expected = multiply(frame, model.local);
  pixelFrameMatrix(pixel, origin);
  const actual = modelWorldMatrix(pixel, model);
  assert.deepEqual(new Uint8Array(actual.buffer), new Uint8Array(expected.buffer));
}

test('placed models build once at the centre and both sides of a fractional grid and once per recenter', () => {
  const state = new StreamingWorldState();
  state.init(207, 213);
  const cells = [[207, 213], [208, 214], [206, 212]].map(([x, y]) =>
    ({ x, y, pixel: {}, model: observedModel(trs(1.7, -4.2, 5.1, 31, -22, 8, 1, 1.5, .7)) }));
  const sample = () => {
    for (const { x, y, pixel, model } of cells) verify(pixel, model, state.pixelTranslation(x, y));
  };
  sample();
  sample();
  for (const { pixel, model } of cells) {
    assert.equal(model.writes(), 1);
    assert.equal(pixel._worldGen, 1);
  }
  assert.equal(state.update([TERRAIN_SIZE * 1.5, 800.125, TERRAIN_SIZE / 2]).pixelChanged, true);
  sample();
  sample();
  for (const { pixel, model } of cells) {
    assert.equal(model.writes(), 2);
    assert.equal(pixel._worldGen, 2);
  }
});

test('new placements, changed local poses and a model reparented at the same generation use current data', () => {
  const pixel = {}, other = {}, origin = [819.2, -.15, -819.2];
  const model = observedModel(identity());
  verify(pixel, model, origin);
  const second = { local: trs(9, 8, 7, 6, 5, 4) };
  verify(pixel, second, origin);
  assert.notEqual(model._world, second._world);
  model.local[13] = 11.625;
  verify(pixel, model, origin);
  model.local = trs(14.4, .5, -3, 30, 60, 90);
  verify(pixel, model, origin);
  verify(pixel, model, origin);
  assert.equal(model.writes(), 3);
  verify(other, model, [-819.2, 0, 819.2]);
  assert.equal(model.writes(), 4);
  assert.equal(pixel._worldGen, other._worldGen);
});

test('pixelBuild marks its own fixed placements and leaves borrowed world placements mutable', () => {
  const source = readFileSync(new URL('../../src/scenes/pixelBuild.js', import.meta.url), 'utf8');
  const marked = [...source.matchAll(/const local = ([^;]+);\s*markFixedPixelLocal\(local\);/g)].map(match => match[1]);
  assert.deepEqual(marked, [
    'multiply(originMatrix, w.matrix)',
    'multiply(originMatrix, placed.matrix)',
    'trs(locLocal[0], locLocal[1], locLocal[2], 0, 0, 0), box = transformedAabb(archAabb(fabric.modelId, cpuF.positions), local)',
    'multiply(origin, holdModelMatrix(hm))',
  ]);
  assert.equal(source.match(/markFixedPixelLocal\(/g).length, marked.length);
});

test('a fixed placement cache hit reads no local coefficients and a replacement can still animate in place', () => {
  let reads = 0;
  const local = new Proxy([...identity()], {
    get(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
      return target[key];
    },
  });
  markFixedPixelLocal(local);
  const model = observedModel(local), pixel = {};
  pixelFrameMatrix(pixel, [819.2, 0, -819.2]);
  modelWorldMatrix(pixel, model);
  assert.ok(reads > 0);
  assert.equal(model._worldLocal, null);
  reads = 0;
  modelWorldMatrix(pixel, model);
  assert.equal(reads, 0);
  assert.equal(model.writes(), 1);
  model.local = trs(1, 0, 2, 0, 30, 0);
  verify(pixel, model, [819.2, 0, -819.2]);
  model.local[13] += 2.5;
  verify(pixel, model, [819.2, 0, -819.2]);
  assert.equal(model.writes(), 3);
});
