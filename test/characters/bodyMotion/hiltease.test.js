// HILT-EASE: the left hand eases from the clip's hold to the carry's grip by the layer's weight - no frame's jump.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices as sm, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { solveBody } from '../../../src/characters/bodyMotion/bodySolve.js';
import { handFrame } from '../../../src/combat/climbRig.js';

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dist = (a, b) => Math.hypot(...sub(a, b));

function leftAt(w) {
  const sk = buildSkeleton(parseNif(retailSkeleton())), pose = new Map(), body = bodyOf(sk, GRAPH_ROOT, sm);
  const arms = ({ mats }) => {
    const req = (s, dx) => {
      const limb = body.bones[s], W = mats.get(limb.hand).t, fr = handFrame(mats, limb, s);
      return { at: [W[0] + dx, W[1] + 25, W[2] + 30], fingers: fr.fingers, palm: fr.palm, pole: [0, 0, -1], w: 1 };
    };
    return { L: req('L', 20), R: req('R', -20) };
  };
  solveBody(sk, pose, GRAPH_ROOT, sm, { w, haft: true, arms });
  const mats = sm(sk, pose, GRAPH_ROOT);
  return { L: mats.get(body.bones.L.hand).t, R: mats.get(body.bones.R.hand).t };
}

test('HILT-EASE: the left hand stands as the clip has it at no weight, on the grip at full, and moves smoothly between', () => {
  const clip = leftAt(0), almost = leftAt(1e-3);
  assert.ok(dist(clip.L, almost.L) < 0.5, `a thousandth of weight threw the left ${dist(clip.L, almost.L).toFixed(2)} units`);
  let last = almost.L, jump = 0;
  for (let i = 1; i <= 20; i++) {
    const now = leftAt(i / 20).L;
    jump = Math.max(jump, dist(now, last));
    last = now;
  }
  const full = leftAt(1);
  assert.ok(dist(clip.L, full.L) > 5, 'the grip moved the left hand');
  assert.ok(jump < dist(clip.L, full.L) / 5, `a step of a twentieth threw the left ${jump.toFixed(2)} units`);
});

test('HILT-THROUGH: with the layer stepped aside for a blow, the left hand still closes on the hilt by the right as the clip holds it', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton())), pose = new Map(), body = bodyOf(sk, GRAPH_ROOT, sm);
  const before = sm(sk, pose, GRAPH_ROOT), L0 = before.get(body.bones.L.hand).t, R0 = before.get(body.bones.R.hand).t;
  const arms = ({ mats }) => {
    const fr = handFrame(mats, body.bones.R, 'R'), R = mats.get(body.bones.R.hand).t;
    return { R: { at: R, fingers: fr.fingers, palm: fr.palm, w: 1 }, L: { at: [R[0] - 20, R[1] + 10, R[2] + 5], fingers: fr.fingers, palm: fr.palm, w: 1 } };
  };
  assert.equal(solveBody(sk, pose, GRAPH_ROOT, sm, { w: 0, hold: 0, haft: true, arms }), null, 'no layer at all: the clip');
  assert.ok(solveBody(sk, pose, GRAPH_ROOT, sm, { w: 0, hold: 1, haft: true, arms }), 'the hold runs through the blow');
  const after = sm(sk, pose, GRAPH_ROOT);
  assert.ok(dist(after.get(body.bones.R.hand).t, R0) < 1e-6, 'the right hand stays the clip\'s');
  assert.ok(dist(after.get(body.bones.L.hand).t, [R0[0] - 20, R0[1] + 10, R0[2] + 5]) < 1, 'the left hand on the hilt');
  assert.ok(dist(L0, [R0[0] - 20, R0[1] + 10, R0[2] + 5]) > 5, 'the clip had it elsewhere');
});
