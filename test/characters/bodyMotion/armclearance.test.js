// ARM-CLEARANCE (MOTION-DOCTRINE 7c): an elbow the clip leaves inside the trunk swings out about the shoulder-wrist line,
// the hand where it was; an arm already clear is untouched; heavier armour clears wider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { clearArms, ARM_CLEARANCE } from '../../../src/characters/bodyMotion/armClearance.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { createBodyMotion, sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { MW_WEAPON_TYPE } from '../../../src/formats/morrowind/mwFirstPerson.js';

const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
const sk = buildSkeleton(parseNif(retailSkeleton()));
const body = bodyOf(sk, GRAPH_ROOT, sm);
const mul = (a, b) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
const rot = (axis, t) => { const c = Math.cos(t), s = Math.sin(t); return axis === 0 ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === 1 ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1]; };
const off = (m, ref) => { const c = m.get(body.chest).t, e = m.get(ref).t; return Math.hypot((e[0] - c[0]) / (body.shoulderWidth * ARM_CLEARANCE.width), (e[1] - c[1]) / (body.shoulderWidth * ARM_CLEARANCE.depth)) * body.shoulderWidth; };

/** A pose whose left elbow is inside the trunk: the upper arm turned in across the chest. */
function crossedPose() {
  const ref = body.bones.L.upper, node = sk.nodes.get(ref);
  const R = body.shoulderWidth * ARM_CLEARANCE.depth;
  for (const axis of [0, 1, 2]) for (const t of [-2, -1.6, -1.2, -0.8, -0.4, 0.4, 0.8, 1.2, 1.6, 2]) for (const axis2 of [0, 1, 2]) for (const u of [-0.8, -0.4, 0, 0.4, 0.8]) {
    const pose = new Map([[ref, { ...node.rest, rotation: Float32Array.from(mul(mul(node.rest.rotation, rot(axis, t)), rot(axis2, u))) }]]);
    const m = sm(sk, pose, GRAPH_ROOT);
    if (off(m, body.bones.L.fore) < body.shoulderWidth * 0.7 && m.get(body.bones.L.fore).t[2] > m.get(body.bones.pelvis).t[2]) return pose;
  }
  return null;
}

test('ARM-CLEARANCE: an elbow inside the trunk swings out and the hand stays where the clip put it', () => {
  const pose = crossedPose();
  assert.ok(pose, 'a crossed arm to test');
  const before = sm(sk, pose, GRAPH_ROOT);
  const hand0 = before.get(body.bones.L.hand).t, e0 = off(before, body.bones.L.fore);
  const turns = clearArms(sk, pose, GRAPH_ROOT, sm, { armor: 0 });
  const after = sm(sk, pose, GRAPH_ROOT);
  assert.ok(Math.abs(turns.L) > 0, 'the left arm turned');
  assert.ok(off(after, body.bones.L.fore) > e0 + 1, `the elbow comes out (${e0} -> ${off(after, body.bones.L.fore)})`);
  assert.ok(Math.hypot(...after.get(body.bones.L.hand).t.map((v, i) => v - hand0[i])) < 0.05, 'the hand does not move');
  assert.ok(Math.abs(turns.L) <= ARM_CLEARANCE.maxTurn + 1e-9);
});

test('ARM-CLEARANCE: an arm already clear of the trunk is left alone; plate clears wider than bare', () => {
  const rest = new Map();
  assert.deepEqual(clearArms(sk, rest, GRAPH_ROOT, sm, { armor: 0 }), { L: 0, R: 0 });
  assert.equal(rest.size, 0, 'nothing written');
  const bare = clearArms(sk, crossedPose(), GRAPH_ROOT, sm, { armor: 0 }).L, plate = clearArms(sk, crossedPose(), GRAPH_ROOT, sm, { armor: 1 }).L;
  assert.ok(Math.abs(plate) >= Math.abs(bare), `plate turns at least as far (${plate} vs ${bare})`);
});

test('ARM-CLEARANCE: a turned two-handed neutral guard keeps both grips and clears consistently with its chest', () => {
  const motion = createBodyMotion();
  for (let i = 0; i < 120; i++) motion.step(1 / 60, sceneInput({ weapon: MW_WEAPON_TYPE.LongBladeTwoHand }));
  const base = new Map();
  motion.apply(sk, base, GRAPH_ROOT, sm);
  let expected;
  for (const yaw of [0, 0.7, -1.2, 2]) {
    const pose = new Map(base);
    const ref = body.bones.root, local = pose.get(ref) ?? sk.nodes.get(ref).rest;
    pose.set(ref, { ...local, rotation: mul(rot(2, yaw), local.rotation) });
    const before = sm(sk, pose, GRAPH_ROOT);
    const turns = clearArms(sk, pose, GRAPH_ROOT, sm, { armor: 1 });
    expected ??= turns;
    for (const side of ['L', 'R']) {
      assert.ok(Math.abs(turns[side] - expected[side]) < 1e-8, 'clearance follows the turned chest');
      const after = sm(sk, pose, GRAPH_ROOT), hand = body.bones[side].hand;
      assert.ok(Math.hypot(...after.get(hand).t.map((v, i) => v - before.get(hand).t[i])) < 0.05, 'grip position preserved');
      assert.ok(Math.max(...after.get(hand).a.map((v, i) => Math.abs(v - before.get(hand).a[i]))) < 1e-5, 'grip rotation preserved');
    }
  }
});
