import { fitGarmentToSurfaces, garmentFitSurfaces } from '../../../src/formats/morrowind/mwSkinTransfer.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyFrameFromBounds, deformPlayerBodyGeometry } from '../../../src/characters/bodyShape.js';
import { configureEquipmentFit, fitMorphedEquipment } from '../../../src/formats/morrowind/mwEquipmentFit.js';

test('trouser clearance follows the morphed pose of a covered thigh', () => {
  const source = {
    fitSlot: 'upperleg',
    fitBone: 'left upper leg',
    positions: Float32Array.of(5, -2, 3, 5, 2, 3, 5, 0, 7),
    indices: Uint16Array.of(0, 1, 2),
  };
  const frame = bodyFrameFromBounds({ minX: -5, maxX: 5, minY: -2, maxY: 2, minZ: 0, maxZ: 20 });
  const piece = {
    positions: Float32Array.of(5.3, 0, 5),
    bodyClearance: { sources: [source], side: 'left', clearance: 0.24 },
  };
  const ctx = {
    pose: 0,
    skinBatch(batch, _skeleton, pose, _mats, out) {
      out.set(batch.positions);
      for (let i = 0; i < out.length; i += 3) out[i] += pose;
    },
  };
  fitMorphedEquipment([piece], {}, frame, ctx);
  assert.ok(Math.abs(piece.positions[0] - 5.3) < 1e-5);
  ctx.pose = 0.5;
  fitMorphedEquipment([piece], { bodyWidth: 1 }, frame, ctx);
  assert.ok(Math.abs(piece.positions[0] - (5.5 * 1.15 + 0.24)) < 1e-5);
  assert.deepEqual(source.positions, Float32Array.of(5, -2, 3, 5, 2, 3, 5, 0, 7));
});

test('reflected trouser panels keep outward normals after the morph and clearance passes', () => {
  const indices = Uint16Array.of(0, 1, 2);
  const source = {
    fitSlot: 'upperleg',
    fitBone: 'left upper leg',
    positions: Float32Array.of(-5, -2, 3, -5, 2, 3, -5, 0, 7),
    indices: Uint16Array.of(0, 2, 1),
  };
  const frame = bodyFrameFromBounds({ minX: -5, maxX: 5, minY: -2, maxY: 2, minZ: 0, maxZ: 20 });
  const piece = {
    slot: 'upperleg',
    mirrored: true,
    indices,
    normals: new Float32Array(9),
    positions: Float32Array.of(-5.1, -1, 4, -5.1, 1, 4, -5.1, 0, 5),
    bodyClearance: { sources: [source], side: 'left', clearance: 0.24, maxClearance: 0.75 },
  };
  const morph = { bodyWidth: 1 };
  const ctx = { skinBatch(batch, _skeleton, _pose, _mats, out) { out.set(batch.positions); } };
  deformPlayerBodyGeometry(piece, morph, frame);
  assert.ok(piece.normals[0] < -0.99, 'the body morph respects the reflected winding');
  fitMorphedEquipment([piece], morph, frame, ctx);
  assert.ok(piece.positions[0] < -5.98);
  assert.ok(piece.normals[0] < -0.99, 'the clearance pass respects the same winding');
  for (let i = 0; i < piece.positions.length; i += 3) piece.positions[i] = -7;
  fitMorphedEquipment([piece], morph, frame, ctx);
  assert.ok(Math.abs(piece.positions[0] - (-5.75 - 0.75)) < 1e-5, 'excess material moves inward to its upper clearance limit');
});

test('rigid thigh equipment follows the body morph as a single shape', () => {
  const source = { fitSlot: 'upperleg', positions: Float32Array.of(1, 0, 5, 5, 0, 5) };
  const frame = bodyFrameFromBounds({ minX: -5, maxX: 5, minY: -2, maxY: 2, minZ: 0, maxZ: 20 });
  const plate = {
    positions: Float32Array.of(0, 0, 5, 6, 0, 5, 3, 2, 5),
    normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
    rigidBodySources: [source],
  };
  const ctx = { skinBatch(batch, _skeleton, _pose, _mats, out) { out.set(batch.positions); } };
  fitMorphedEquipment([plate], { bodyWidth: 1 }, frame, ctx);
  assert.ok(Math.abs(plate.positions[3] - 6.9) < 1e-5);
  assert.ok(Math.abs(plate.positions[7] - 2.3) < 1e-5);
  assert.deepEqual(plate.normals, Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1));
});


test('equipment fitting keeps abbreviated skeleton sides separate', () => {
  const left = { fitBone: 'Bip01 L Calf' };
  const right = { fitBone: 'Bip01 R Calf' };
  const piece = { bone: 'Bip01 L Foot', indices: Uint16Array.of(0, 1, 2) };
  configureEquipmentFit([piece], { fitMode: 'rigid' }, [left, right]);
  assert.deepEqual(piece.rigidBodySources, [left]);
  configureEquipmentFit([piece], { fitMode: 'cloth' }, [left, right]);
  assert.equal(piece.bodyClearance.side, 'left');
});

test('equidistant garment seams keep the normal of the first visited triangle', () => {
  const positions = [];
  const indices = [];
  for (let i = 0; i < 10; i++) {
    positions.push(-1, -1, 0, 1, -1, 0, 0, 1, 0);
    const start = 3 * i;
    // The first triangle of the right leaf faces the opposite way.
    if (i === 5) indices.push(start, start + 2, start + 1);
    else indices.push(start, start + 1, start + 2);
  }
  const source = { positions: Float32Array.from(positions), indices: Uint16Array.from(indices) };
  const surfaces = garmentFitSurfaces([source], (batch, posed) => posed.set(batch.positions));
  const garment = { positions: Float32Array.of(0, 0, 0) };
  const fitted = fitGarmentToSurfaces(garment, surfaces, { clearance: 0.25 });
  assert.deepEqual(fitted.positions, Float32Array.of(0, 0, -0.25));
  assert.deepEqual(garment.positions, Float32Array.of(0, 0, 0));
  assert.equal(fitGarmentToSurfaces(garment, surfaces, { maxDistance: 0 }), garment);
});

test('cached garment neighbourhoods follow moving triangles, poses and topology edits', () => {
  const indices = Uint16Array.from({ length: 36 }, (_, i) => i);
  const body = { indices, positions: new Float32Array(108) };
  const garment = { positions: Float32Array.of(0, 0, 0, 0.2, 0.1, -0.1, 4, 2, 2) };
  const history = new WeakMap();
  const pose = (batch, out) => out.set(batch.positions);
  const compare = (options) => {
    const reference = fitGarmentToSurfaces(garment, garmentFitSurfaces([body], pose), options);
    const fitted = fitGarmentToSurfaces(garment, garmentFitSurfaces([body], pose, history), options);
    assert.deepEqual(fitted.positions, reference.positions);
    assert.deepEqual(fitted.clearanceFit, reference.clearanceFit);
    assert.equal(fitted === garment, reference === garment);
    return fitted;
  };
  for (let frame = 0; frame < 32; frame++) {
    const shift = frame < 12 ? 0 : 48;
    garment.positions[0] = shift;
    garment.positions[3] = shift + 0.2;
    for (let i = 0; i < 12; i++) {
      const x = shift + (i === 0 || frame >= 20 ? 0 : 3 + i);
      const z = i === 0 && frame >= 20 ? 4 : 0;
      body.positions.set([x - 1, -1, z, x + 1, -1, z, x, 1, z], 9 * i);
    }
    // Half the coincident triangles face the other way. Change connectivity in place.
    if (frame === 18) for (let i = 1; i < 12; i += 2) {
      const k = i * 3;
      [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
    }
    compare({ clearance: 0.25, maxDistance: 2 });
    compare({ clearance: 0.1, maxDistance: 4, conform: true, ease: 0.3 });
  }
  body.positions.fill(0);
  compare({ clearance: 0.25 });
});
