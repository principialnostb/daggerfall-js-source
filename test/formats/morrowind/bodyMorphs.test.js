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
