import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloakPhysics, stepCloakPhysics, resolveCloakShieldContact, releaseCloakShieldContact } from '../../../src/formats/morrowind/mwCloakPhysics.js';
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

test('idle, walking, running, and overhead attacks produce distinct hem poses', () => {
  const poseAfter = (motion) => {
    const piece = cloakPiece();
    piece.clothPhysics = createCloakPhysics(piece);
    assert.ok(piece.clothPhysics);
    stepCloakPhysics(piece, 1 / 30, motion);
    // Vertex 2 is on the lower hem (Z=0); vertices 0 and 1 are shoulder pins.
    return Array.from(piece.batch.positions.slice(6, 9));
  };
  const idle = poseAfter({ gait: 0, gaitPhase: 0.25, turn: 0, attack: 0 });
  const walk = poseAfter({ gait: 0.55, gaitPhase: 0.25, turn: 0, attack: 0 });
  const run = poseAfter({ gait: 1, gaitPhase: 0.25, turn: 0, attack: 0 });
  const overhead = poseAfter({ gait: 0, gaitPhase: 0.25, turn: 0, attack: 1, attackProgress: 0.5, attackGroup: 'overhead' });
  assert.ok(run[1] < walk[1] && walk[1] < idle[1], 'running drags the hem farther back than walking and idle');
  assert.ok(Math.abs(walk[0] - idle[0]) > 0.2, 'walking adds a phase-locked side-to-side swing');
  assert.ok(overhead[1] < idle[1] - 0.8, 'an overhead attack drives the hem back before its inertial return');
});


test('back shield holds only covered cloak vertices at rest and preserves free hem motion', () => {
  const piece = cloakPiece();
  const base = Float32Array.from(piece.batch.positions);
  const pos = Float32Array.from(base);
  const prev = Float32Array.from(base);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 1] += 2;
    prev[i + 1] += 1;
  }
  piece.clothPhysics = createCloakPhysics(piece);
  assert.ok(piece.clothPhysics);
  piece.clothPhysics.pos.set(pos);
  piece.clothPhysics.prev.set(prev);
  piece.batch.positions.set(pos);
  // A simple triangle covers vertices 0, 1 and 2, but not vertex 3.
  const shield = Float32Array.from([-1, 0, 2, 1, 0, 2, 1, 0, 0]);
  const held = resolveCloakShieldContact(piece, base, shield, Uint16Array.from([0, 1, 2]));
  assert.equal(held, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(pos[i * 3], base[i * 3], 'covered vertex keeps fitted X');
    assert.equal(pos[i * 3 + 1], base[i * 3 + 1] + 1.38, 'covered vertex is moved to the body side of the shield surface with clearance');
    assert.equal(pos[i * 3 + 2], base[i * 3 + 2], 'covered vertex keeps fitted Z');
  }
  assert.deepEqual(Array.from(prev.slice(0, 9)), Array.from(pos.slice(0, 9)), 'covered vertices have no stale Verlet velocity');
  assert.equal(pos[10], base[10] + 2, 'the uncovered hem remains dynamic');
  assert.equal(prev[10], base[10] + 1, 'the uncovered hem keeps its Verlet history');
});

test('shield-covered vertices return to the authored pose when the shield is removed', () => {
  const piece = cloakPiece();
  const base = Float32Array.from(piece.batch.positions);
  piece.clothPhysics = createCloakPhysics(piece);
  const state = piece.clothPhysics;
  state.pos[4] -= 0.38;
  state.prev[4] -= 0.38;
  state.shieldPinned[1] = 1;
  releaseCloakShieldContact(piece);
  assert.equal(state.shieldPinned[1], 0);
  assert.equal(state.pos[3], base[3]);
  assert.equal(state.pos[4], base[4]);
  assert.equal(state.pos[5], base[5]);
  assert.equal(state.prev[3], base[3]);
  assert.equal(state.prev[4], base[4]);
  assert.equal(state.prev[5], base[5]);
});

test('vertices leaving the shield footprint do not retain the compressed offset', () => {
  const piece = cloakPiece();
  const base = Float32Array.from(piece.batch.positions);
  const state = createCloakPhysics(piece);
  piece.clothPhysics = state;
  const shield = Float32Array.from([-1, 0, 2, 1, 0, 2, 1, 0, 0]);
  resolveCloakShieldContact(piece, base, shield, Uint16Array.from([0, 1, 2]));
  assert.equal(state.shieldPinned[2], 1);
  // A triangle moved away from the cloth no longer covers any vertex.
  const movedShield = Float32Array.from([20, 0, 20, 22, 0, 20, 22, 0, 18]);
  resolveCloakShieldContact(piece, base, movedShield, Uint16Array.from([0, 1, 2]));
  assert.equal(state.shieldPinned[2], 0);
  assert.equal(state.pos[7], base[7]);
  assert.equal(state.prev[7], base[7]);
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
