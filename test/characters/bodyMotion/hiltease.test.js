// HILT-EASE: the left hand eases from the clip's hold to the carry's grip by the layer's weight - no frame's jump.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices as sm, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { solveBody } from '../../../src/characters/bodyMotion/bodySolve.js';
import { handFrame, rotAxisAngle } from '../../../src/combat/climbRig.js';
import { mul } from '../../../src/characters/bodyMotion/bodyKit.js';

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

test('ARC-EASE: an elbow asked opposite the clip\'s turns along its arc as the layer comes in - never flips in a frame', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton())), body = bodyOf(sk, GRAPH_ROOT, sm);
  const node = sk.nodes.get(body.bones.R.fore), clip = new Map([[body.bones.R.fore, { ...node.rest, rotation: mul(node.rest.rotation, rotAxisAngle([0, 0, 1], 1.2)) }]]);
  const rest = sm(sk, clip, GRAPH_ROOT), S = rest.get(body.bones.R.upper).t;
  const E = rest.get(body.bones.R.fore).t, W = rest.get(body.bones.R.hand).t, mid = [(S[0] + W[0]) / 2, (S[1] + W[1]) / 2, (S[2] + W[2]) / 2];
  const away = [mid[0] - E[0], mid[1] - E[1], mid[2] - E[2]];   // asked the other way from the clip's elbow
  const at = [...W];   // a bent arm, the hand before the chest
  let last = null, leap = 0;
  for (let i = 0; i <= 100; i++) {
    const pose = new Map(clip), fr = handFrame(rest, body.bones.R, 'R');
    solveBody(sk, pose, GRAPH_ROOT, sm, { w: i / 100, arms: () => ({ R: { at, fingers: fr.fingers, palm: fr.palm, pole: away, w: 1 } }) });
    const elbow = sm(sk, pose, GRAPH_ROOT).get(body.bones.R.fore).t;
    if (last) leap = Math.max(leap, dist(elbow, last));
    last = elbow;
  }
  assert.ok(leap < 2, `the elbow leapt ${leap.toFixed(2)} units for a hundredth of weight`);
});
