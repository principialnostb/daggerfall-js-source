import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, injectSkeletonNodes, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { offWeaponBoneAddon } from '../../../src/combat/twoHands/mirrorRig.js';
import { createBodyMotion, sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { onRightHand } from '../../../src/characters/bodyMotion/bodySolve.js';
import { handFrame } from '../../../src/combat/climbRig.js';

const nif = parseNif(retailSkeleton()), sk = buildSkeleton(nif), sm = skeletonSpaceMatrices;
injectSkeletonNodes(sk, offWeaponBoneAddon(sk, GRAPH_ROOT, sm, nif));
const body = bodyOf(sk, GRAPH_ROOT, sm);

test('a two-handed grip survives loss of ground contact through a running stop and landing', () => {
  for (const weapon of [2, 4]) {
    const motion = createBodyMotion(); let worst = 0;
    for (let i = 0; i < 600; i++) {
      const running = i >= 120 && i < 300, grounded = !(i >= 280 && i < 320);
      motion.step(1 / 60, sceneInput({ weapon, running, forward: running ? 1 : 0, speed: running ? 8.1 : 0, grounded }));
      const pose = new Map(); motion.apply(sk, pose, GRAPH_ROOT, sm);
      if (i < 120) continue;
      const m = sm(sk, pose, GRAPH_ROOT), r = m.get(sk.byName.get('weapon bone')), l = m.get(sk.byName.get('weapon bone left'));
      const b = [r.a[1], r.a[4], r.a[7]], size = Math.hypot(...b), d = l.t.map((x, j) => x - r.t[j]);
      const along = d.reduce((sum, x, j) => sum + x * b[j] / size, 0);
      const gap = Math.hypot(...d.map((x, j) => x - along * b[j] / size));
      worst = Math.max(worst, gap);
    }
    assert.ok(worst < 1, `weapon ${weapon}: the actual grip left the hilt by ${worst} rig units`);
  }
});

test('retargeting the second grip follows the right hand without rotating the elbow pole with the hilt', () => {
  const mats = sm(sk, new Map(), GRAPH_ROOT), frame = handFrame(mats, body.bones.R, 'R');
  const at = mats.get(body.bones.R.hand).t;
  const pole = [-1, 0.2, -0.3];
  const left = { at: at.map((v, i) => v + (i === 0 ? -10 : 0)), fingers: frame.fingers, palm: frame.palm, pole };
  const right = { at, fingers: frame.fingers.map(v => -v), palm: frame.palm };
  const out = onRightHand(left, right, mats, body);
  assert.deepEqual(out.pole, pole, 'the elbow remains directed by the body');
  assert.ok(Math.hypot(...out.at.map((v, i) => v - left.at[i])) > 1, 'the grip itself is retargeted');
});


test('one-handed airborne behaviour and two-handed recoil still hand control back to their clips', () => {
  for (const [weapon, busy] of [[1, null], [2, 'hit'], [2, 'dead']]) {
    const motion = createBodyMotion();
    for (let i = 0; i < 120; i++) motion.step(1 / 60, sceneInput({ weapon }));
    for (let i = 0; i < 120; i++) motion.step(1 / 60, sceneInput({ weapon, grounded: false, busy }));
    assert.ok(motion.weight() < 0.001, `weapon ${weapon}, busy ${busy}: the clip retains control`);
  }
});


test('ending an attack restores the carry immediately instead of retaining the fading attack gate over a free run', () => {
  for (const endProgress of [0.5, 1]) {
    const motion = createBodyMotion();
    const move = { weapon: 2, running: true, forward: 1, speed: 8.1 };
    for (let i = 0; i < 120; i++) { motion.step(1 / 60, sceneInput(move)); motion.apply(sk, new Map(), GRAPH_ROOT, sm); }
    for (let i = 0; i < 36; i++) {
      motion.step(1 / 60, sceneInput({ ...move, blow: { type: 'slash', hand: 'R', section: 'follow', progress: endProgress * i / 36, strength: 1 } }));
      motion.apply(sk, new Map(), GRAPH_ROOT, sm);
    }
    for (let i = 0; i < 60; i++) {
      motion.step(1 / 60, sceneInput(move));
      const pose = new Map(), report = motion.apply(sk, pose, GRAPH_ROOT, sm);
      assert.ok(report, `the carry is active on post-attack frame ${i}`);
      const m = sm(sk, pose, GRAPH_ROOT), r = m.get(sk.byName.get('weapon bone')), l = m.get(sk.byName.get('weapon bone left'));
      const b = [r.a[1], r.a[4], r.a[7]], size = Math.hypot(...b), d = l.t.map((v, j) => v - r.t[j]);
      const along = d.reduce((sum, v, j) => sum + v * b[j] / size, 0);
      assert.ok(Math.hypot(...d.map((v, j) => v - along * b[j] / size)) < 1, `post-attack grip ${i}`);
    }
  }
});


test('the second fist keeps the same roll relative to the hilt across standing, walking and running', async () => {
  const { carryHands } = await import('../../../src/characters/bodyMotion/carry.js');
  const { bodyFrames } = await import('../../../src/characters/bodyMotion/bodySolve.js');
  const mats = sm(sk, new Map(), GRAPH_ROOT), frames = bodyFrames(body, mats), ctx = { body, mats, frames, skeleton: sk };
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  let first;
  for (const mode of ['idle', 'walk', 'run']) {
    const shares = { idle: 0, walk: 0, run: 0, sneak: 0, [mode]: 1 };
    const h = carryHands('two', { arm: { swing: 0, phase: 0, elbow: [0, 0], bias: 0, abduct: 0 } }, ctx, { armW: { L: 1, R: 1 }, shares });
    const axes = [h.R.frame.edge, h.R.frame.blade, h.R.frame.flat];
    const orientation = [h.L.fingers, h.L.palm].flatMap(v => axes.map(a => dot(v, a)));
    first ??= orientation;
    assert.ok(Math.max(...orientation.map((v, i) => Math.abs(v - first[i]))) < 1e-6, `${mode}: no extra gait-dependent roll around the hilt`);
  }
});
