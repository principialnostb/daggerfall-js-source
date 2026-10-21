import test from 'node:test';
import assert from 'node:assert/strict';
import { deformPlayerBodyGeometry } from '../src/formats/morrowind/mwFirstPerson.js';

const bounds = {
  minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: 0, maxZ: 10,
  torsoCenterX: 0, torsoHalfX: 0.3,
};

function makePiece(bones = []) {
  return {
    slot: 'betterbodies',
    positions: new Float32Array([
      0.4, -0.5, 6.5, // target: arm-like position in the shared body frame
      0.2, -0.4, 6.6,
      0.5, -0.6, 6.4,
    ]),
    normals: new Float32Array(9),
    indices: new Uint16Array([0, 1, 2]),
    batch: { skin: { bones } },
  };
}

function applyArmMorph(piece) {
  const skeleton = { nodes: new Map([[1, { name: 'Spine1' }], [2, { name: 'UpperArm' }]]) };
  deformPlayerBodyGeometry(piece, { armThickness: 1 }, bounds, skeleton);
  return piece.positions[0];
}

test('a recognized trunk role does not disable geometric fallback for an unrecognized arm role', () => {
  const piece = makePiece([
    // This NIF exposes spine weights but no arm bone record in this mesh.
    { ref: 1, indices: [1, 2], weights: [1, 1] },
  ]);
  const before = piece.positions[0];
  const after = applyArmMorph(piece);
  assert.ok(after > before + 0.04, `expected arm vertex to move, got delta ${after - before}`);
});

test('a role with real skin influences remains restricted to that role weight map', () => {
  const piece = makePiece([
    { ref: 1, indices: [1, 2], weights: [1, 1] },
    // The arm role exists for this mesh, but the target vertex has no arm influence.
    { ref: 2, indices: [1, 2], weights: [1, 1] },
  ]);
  const before = piece.positions[0];
  const after = applyArmMorph(piece);
  assert.ok(Math.abs(after - before) < 1e-6, `unweighted vertex should stay fixed, got delta ${after - before}`);
});
