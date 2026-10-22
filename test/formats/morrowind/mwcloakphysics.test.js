import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloakPhysics, stepCloakPhysics } from '../../../src/formats/morrowind/mwCloakPhysics.js';
import { skinLayout, packSkinStream, restreamMovedRows } from '../../../src/formats/morrowind/mwGpuSkin.js';

function cloakPiece() {
  const batch = {
    positions: Float32Array.from([-1, -1, 2, 1, -1, 2, 1, -1, 0, -1, -1, 0]),
    normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    skin: {
      bones: [{
        ref: 1,
        indices: Uint16Array.from([0, 1, 2, 3]),
        weights: Float32Array.from([1, 1, 1, 1]),
      }],
    },
  };
  return {
    slot: 'cloak (daggerfall_cloak)',
    kind: 'skinned',
    positions: batch.positions,
    normals: batch.normals,
    uvs: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: Uint16Array.from([0, 1, 2, 0, 2, 3]),
    material: { textureFile: 'cape.dds' },
    batch,
    sourceGen: 0,
  };
}

const lanesOf = (piece) => new Float32Array(piece.indices.length * 8);

test('cloak cloth simulation pins the shoulders and gives the hem bounded secondary motion', () => {
  const piece = cloakPiece();
  const rest = Float32Array.from(piece.batch.positions);
  const state = createCloakPhysics(piece);
  assert.ok(state);
  piece.clothPhysics = state;
  piece.clothPhysicsMaxOffset = state.maxOffset;
  assert.ok(state.pinned[0] && state.pinned[1], 'top vertices are pinned to the chest');
  assert.equal(stepCloakPhysics(piece, 1 / 30, 0.8), true);
  assert.equal(piece.sourceGen, 1, 'the renderer can detect the changed source');
  assert.deepEqual(Array.from(piece.batch.positions.slice(0, 6)), Array.from(rest.slice(0, 6)), 'the shoulder pins stay fixed');
  assert.notDeepEqual(Array.from(piece.batch.positions.slice(6, 12)), Array.from(rest.slice(6, 12)), 'the lower hem moves');
  for (let v = 0; v < state.pinned.length; v++) {
    const o = v * 3;
    const d = Math.hypot(piece.batch.positions[o] - rest[o], piece.batch.positions[o + 1] - rest[o + 1], piece.batch.positions[o + 2] - rest[o + 2]);
    assert.ok(d <= state.maxOffset + 1e-5, 'the mesh stays within its rest-shape envelope');
  }
});

test('GPU skin stream restreams only the skinned cloak row after physics changes its bind vertices', () => {
  const piece = cloakPiece();
  const state = createCloakPhysics(piece);
  assert.ok(state);
  piece.clothPhysics = state;
  piece.clothPhysicsMaxOffset = state.maxOffset;
  const layout = skinLayout([piece]);
  assert.equal(layout.ok, true);
  const packed = packSkinStream(layout, lanesOf);
  assert.deepEqual(restreamMovedRows(layout, lanesOf), [], 'an unchanged cloak is not uploaded again');
  assert.equal(stepCloakPhysics(piece, 1 / 30, 1), true);
  const updates = restreamMovedRows(layout, lanesOf);
  assert.equal(updates.length, 1, 'only the changed cloak row is uploaded');
  assert.equal(updates[0].offset, 0);
  assert.notDeepEqual(Array.from(updates[0].data), Array.from(packed.stream), 'the GPU receives the simulated positions and normals');
  assert.deepEqual(restreamMovedRows(layout, lanesOf), [], 'the same state is not uploaded twice');
});
