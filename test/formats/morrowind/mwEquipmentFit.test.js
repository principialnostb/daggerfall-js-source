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
