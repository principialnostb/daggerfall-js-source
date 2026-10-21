import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_MORPH_FIELDS } from '../../../src/characters/bodyMorphs.js';
import { deformPlayerBodyGeometry } from '../../../src/formats/morrowind/mwFirstPerson.js';

const bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: 0, maxZ: 1 };

// A deterministic cloud spanning the anatomical zones used by the current
// procedural morphs. These are deliberately broad bounds; the test proves
// that each control has a live geometry path, not that the falloff is
// visually calibrated for every shipped NIF.
function makeBodyPiece() {
  const xs = [-0.9, -0.7, -0.5, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9];
  const ys = [-0.95, -0.7, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.7, 0.95];
  const zs = [0.02, 0.08, 0.13, 0.2, 0.3, 0.4, 0.47, 0.52, 0.56, 0.62, 0.68, 0.75, 0.78, 0.9, 0.98];
  const positions = [];
  for (const z of zs) for (const y of ys) for (const x of xs) positions.push(x, y, z);
  return {
    slot: 'betterBodies',
    positions: Float32Array.from(positions),
    indices: new Uint16Array(),
    normals: new Float32Array(positions.length),
  };
}

function morphState(key) {
  return Object.fromEntries(BODY_MORPH_FIELDS.map(([field]) => [field, field === key ? 1 : 0]));
}

test('appearance body morph controls each deform representative body vertices', () => {
  for (const [key] of BODY_MORPH_FIELDS) {
    if (key === 'headScale') continue; // headScale is applied to the skeleton bone, not body vertices
    const piece = makeBodyPiece();
    const before = new Float32Array(piece.positions);
    deformPlayerBodyGeometry(piece, morphState(key), bounds);
    let changed = false;
    for (let i = 0; i < before.length; i++) {
      if (Math.abs(before[i] - piece.positions[i]) > 1e-6) { changed = true; break; }
    }
    assert.equal(changed, true, `body morph "${key}" must alter geometry`);
  }
});

test('shoulder width is isolated from the waist and outer arm vertices', () => {
  const piece = {
    slot: 'betterBodies',
    // Three representative vertices in the shared anatomical coordinate frame:
    // waist centre, outer arm at shoulder height, and shoulder torso.
    positions: Float32Array.from([
      0.1, 0, 0.56,
      0.5, 0, 0.78,
      0.1, 0, 0.78,
    ]),
    indices: new Uint16Array(),
    normals: new Float32Array(9),
  };
  const before = new Float32Array(piece.positions);
  deformPlayerBodyGeometry(piece, morphState('shoulderWidth'), bounds);
  const delta = (vertex, axis) => Math.abs(piece.positions[vertex * 3 + axis] - before[vertex * 3 + axis]);
  assert.ok(delta(0, 0) < 1e-5, 'shoulder width must not move the waist');
  assert.ok(delta(1, 0) < 1e-5, 'shoulder width must not move the outer arm');
  assert.ok(delta(2, 0) > 1e-4, 'shoulder width must affect the shoulder torso');
});

test('waist width is isolated from the outer arm and shoulder vertices', () => {
  const piece = {
    slot: 'betterBodies',
    positions: Float32Array.from([
      0.1, 0, 0.56,
      0.5, 0, 0.78,
      0.1, 0, 0.78,
    ]),
    indices: new Uint16Array(),
    normals: new Float32Array(9),
  };
  const before = new Float32Array(piece.positions);
  deformPlayerBodyGeometry(piece, morphState('waistWidth'), bounds);
  const delta = (vertex, axis) => Math.abs(piece.positions[vertex * 3 + axis] - before[vertex * 3 + axis]);
  assert.ok(delta(0, 0) > 1e-4, 'waist width must affect the waist');
  assert.ok(delta(1, 0) < 1e-5, 'waist width must not move the outer arm');
  assert.ok(delta(2, 0) < 1e-5, 'waist width must not move the shoulder torso');
});

test('breast size changes lateral volume while breast projection changes only depth', () => {
  const make = () => ({
    slot: 'betterBodies',
    // Front-facing breast surface point in the shared body coordinate frame.
    positions: Float32Array.from([0.2, 0.5, 0.685, -0.2, 0.5, 0.685]),
    indices: new Uint16Array(),
    normals: new Float32Array(6),
  });
  const size = make(), projection = make();
  const sizeBefore = new Float32Array(size.positions);
  const projectionBefore = new Float32Array(projection.positions);
  deformPlayerBodyGeometry(size, morphState('breastSize'), bounds);
  deformPlayerBodyGeometry(projection, morphState('breastProjection'), bounds);
  assert.ok(Math.abs(size.positions[0] - sizeBefore[0]) > 1e-4,
    'breast size must widen the breast volume');
  assert.ok(Math.abs(projection.positions[0] - projectionBefore[0]) < 1e-6,
    'breast projection must not widen the breast volume');
  assert.ok(Math.abs(size.positions[1] - sizeBefore[1]) > 1e-4);
  assert.ok(Math.abs(projection.positions[1] - projectionBefore[1]) > 1e-4);
});

test('buttock size changes lateral volume while buttock projection changes only depth', () => {
  const make = () => ({
    slot: 'betterBodies',
    // Rear-facing buttock surface point in the shared body coordinate frame.
    positions: Float32Array.from([0.2, -0.5, 0.465, -0.2, -0.5, 0.465]),
    indices: new Uint16Array(),
    normals: new Float32Array(6),
  });
  const size = make(), projection = make();
  const sizeBefore = new Float32Array(size.positions);
  const projectionBefore = new Float32Array(projection.positions);
  deformPlayerBodyGeometry(size, morphState('buttockSize'), bounds);
  deformPlayerBodyGeometry(projection, morphState('buttockProjection'), bounds);
  assert.ok(Math.abs(size.positions[0] - sizeBefore[0]) > 1e-4,
    'buttock size must widen the buttock volume');
  assert.ok(Math.abs(projection.positions[0] - projectionBefore[0]) < 1e-6,
    'buttock projection must not widen the buttock volume');
  assert.ok(Math.abs(size.positions[1] - sizeBefore[1]) > 1e-4);
  assert.ok(Math.abs(projection.positions[1] - projectionBefore[1]) > 1e-4);
});

test('authored skin influences isolate arm controls from trunk and leg vertices', () => {
  const piece = {
    slot: 'betterBodies',
    positions: Float32Array.from([0.1, 0, 0.56, 0.5, 0, 0.65, 0.2, 0, 0.31, 0.2, 0, 0.13]),
    indices: new Uint16Array(),
    normals: new Float32Array(12),
    batch: { skin: { bones: [
      { ref: 1, indices: [0], weights: [1] },
      { ref: 2, indices: [1], weights: [1] },
      { ref: 3, indices: [2], weights: [1] },
      { ref: 4, indices: [3], weights: [1] },
    ] } },
  };
  const before = new Float32Array(piece.positions);
  deformPlayerBodyGeometry(piece, morphState('armThickness'), bounds, {
    nodes: new Map([
      [1, { name: 'Bip01 Spine1' }],
      [2, { name: 'Bip01 Forearm' }],
      [3, { name: 'Bip01 Thigh' }],
      [4, { name: 'Bip01 Calf' }],
    ]),
  });
  const dx = (v) => Math.abs(piece.positions[v * 3] - before[v * 3]);
  assert.ok(dx(1) > 1e-4, 'arm thickness must move the bone-weighted arm vertex');
  assert.ok(dx(0) < 1e-6, 'arm thickness must leave the trunk vertex fixed');
  assert.ok(dx(2) < 1e-6, 'arm thickness must leave the thigh vertex fixed');
  assert.ok(dx(3) < 1e-6, 'arm thickness must leave the calf vertex fixed');
});


test('torso controls do not deform pelvis-weighted vertices', () => {
  const piece = {
    slot: 'betterBodies',
    positions: Float32Array.from([
      0.2, 0, 0.68, // spine/ribcage
      0.2, 0, 0.47, // pelvis
    ]),
    indices: new Uint16Array(),
    normals: new Float32Array(6),
    batch: { skin: { bones: [
      { ref: 1, indices: [0], weights: [1] },
      { ref: 2, indices: [1], weights: [1] },
    ] } },
  };
  const skeleton = { nodes: new Map([
    [1, { name: 'Bip01 Spine1' }],
    [2, { name: 'Bip01 Pelvis' }],
  ]) };
  const before = new Float32Array(piece.positions);
  deformPlayerBodyGeometry(piece, morphState('ribcageWidth'), bounds, skeleton);
  const dx = (v) => Math.abs(piece.positions[v * 3] - before[v * 3]);
  assert.ok(dx(0) > 1e-4, 'ribcage width must affect the spine-weighted torso vertex');
  assert.ok(dx(1) < 1e-6, 'ribcage width must leave the pelvis-weighted vertex fixed');
});

test('leg length uses thigh/calf skin weights instead of moving pelvis vertices', () => {
  const piece = {
    slot: 'betterBodies',
    positions: Float32Array.from([
      0.2, 0, 0.31, // thigh
      0.2, 0, 0.13, // calf
      0.2, 0, 0.47, // pelvis
    ]),
    indices: new Uint16Array(),
    normals: new Float32Array(9),
    batch: { skin: { bones: [
      { ref: 1, indices: [0], weights: [1] },
      { ref: 2, indices: [1], weights: [1] },
      { ref: 3, indices: [2], weights: [1] },
    ] } },
  };
  const skeleton = { nodes: new Map([
    [1, { name: 'Bip01 Thigh' }],
    [2, { name: 'Bip01 Calf' }],
    [3, { name: 'Bip01 Pelvis' }],
  ]) };
  const before = new Float32Array(piece.positions);
  deformPlayerBodyGeometry(piece, morphState('legLength'), bounds, skeleton);
  const dz = (v) => Math.abs(piece.positions[v * 3 + 2] - before[v * 3 + 2]);
  assert.ok(dz(0) > 1e-4, 'leg length must affect the thigh-weighted vertex');
  assert.ok(dz(1) > 1e-4, 'leg length must affect the calf-weighted vertex');
  assert.ok(dz(2) < 1e-6, 'leg length must not move the pelvis-weighted vertex');
});
