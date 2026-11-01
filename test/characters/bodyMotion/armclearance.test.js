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
import { bodyFrames, solveBody } from '../../../src/characters/bodyMotion/bodySolve.js';
import { blendRow } from '../../../src/characters/bodyMotion/carry.js';
import { handFrame } from '../../../src/combat/climbRig.js';

const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
const sk = buildSkeleton(parseNif(retailSkeleton()));
const body = bodyOf(sk, GRAPH_ROOT, sm);
const mul = (a, b) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
const rot = (axis, t) => { const c = Math.cos(t), s = Math.sin(t); return axis === 0 ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === 1 ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1]; };
const off = (m, ref) => { const c = m.get(body.chest).t, e = m.get(ref).t; return Math.hypot((e[0] - c[0]) / (body.shoulderWidth * ARM_CLEARANCE.width), (e[1] - c[1]) / (body.shoulderWidth * ARM_CLEARANCE.depth)) * body.shoulderWidth; };

test('two-handed guard/run transition keeps the blade and edge perpendicular throughout', () => {
  for (let i = 1; i < 200; i++) {
    const run = i / 200;
    const row = blendRow('two', 'R', { idle: 1 - run, run, walk: 0, sneak: 0 });
    const dot = row.blade.reduce((sum, v, j) => sum + v * row.edge[j], 0);
    assert.ok(Math.abs(dot) < 1e-6, `stable weapon frame at run share ${run}`);
  }
});

test('RUN-STOP: from the walk\'s point-forward guard to the run\'s trailing blade the edge rolls evenly along the blade\'s path', () => {
  let prev = null;
  for (let i = 0; i <= 200; i++) {
    const run = i / 200;
    const row = blendRow('two', 'R', { idle: 0, walk: 1 - run, run, sneak: 0 });
    if (prev) {
      const step = Math.acos(Math.min(1, row.edge.reduce((sum, v, j) => sum + v * prev[j], 0))) * 180 / Math.PI;
      assert.ok(step < 2, `edge rolled ${step.toFixed(1)} degrees in a 1/200 step at run share ${run}`);
    }
    prev = row.edge;
  }
});

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

// GRIP-ANATOMY (2026-10-29, the owner's video: the left hand sinks into the body at rest and walking, the run's elbow
// pressed to the chest; then the owner's drawing: the point raised so the elbows bend): the guard - its point raised to
// the waist, the walk's a little higher - held with the left fist against
// the right, the trunk turned and leant under it; the left arm bent and its forearm clear of a full cuirass, standing,
// walking and running. (Its pins of 2026-10-28 - the blade up, the right elbow bent 60 to 120 - were the upright guard's,
// withdrawn with it.)
test('GRIP-ANATOMY: the two-handed carry\'s left forearm clears the cuirass, bent, standing, walking and running', () => {
  const scenes = {
    stand: { weapon: MW_WEAPON_TYPE.LongBladeTwoHand },
    walk: { weapon: MW_WEAPON_TYPE.LongBladeTwoHand, forward: 1, speed: 2.5 },
    run: { weapon: MW_WEAPON_TYPE.LongBladeTwoHand, forward: 1, speed: 8.1, running: true },
  };
  const angle = (a, b) => Math.acos(a.reduce((sum, v, i) => sum + v * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b)));
  for (const [name, scene] of Object.entries(scenes)) {
    const motion = createBodyMotion();
    for (let i = 0; i < 180; i++) motion.step(1 / 60, sceneInput(scene));
    const pose = new Map();
    motion.apply(sk, pose, GRAPH_ROOT, sm);
    clearArms(sk, pose, GRAPH_ROOT, sm, { armor: 1 });
    const mats = sm(sk, pose, GRAPH_ROOT), frame = bodyFrames(body, mats);
    if (name !== 'run') {
      const weapon = mats.get(body.wb), blade = [weapon.a[1], weapon.a[4], weapon.a[7]];
      const up = blade.reduce((sum, v, i) => sum + v * frame.up[i], 0) / Math.hypot(...blade);
      assert.ok(up > -0.3 && up < 0.45, `${name}: the guard's point raised off the ground, not overhead (${up.toFixed(2)})`);
    }
    const S = mats.get(body.bones.L.upper).t, E = mats.get(body.bones.L.fore).t, W = mats.get(body.bones.L.hand).t, C = mats.get(body.chest).t;
    const bend = angle(E.map((v, i) => v - S[i]), W.map((v, i) => v - E[i])) / (Math.PI / 180);
    assert.ok(bend > 30 && bend < 120, `${name}: the left elbow bent (${bend.toFixed(0)} degrees; it stood 5 at rest)`);
    if (name !== 'run') {
      // the left elbow out at the side, not on the chest; the left wrist near the forearm's line (the right's exact mirror
      // bent it 68-70 degrees - LEFT_FIST_ROLL)
      const side = E.map((v, i) => v - C[i]).reduce((sum, v, i) => sum + v * frame.right[i], 0) / body.shoulderWidth;
      assert.ok(side < -0.45, `${name}: the left elbow out at the side (${side.toFixed(2)} shoulder widths)`);
      const fingers = handFrame(mats, body.bones.L, 'L').fingers;
      const flex = angle(W.map((v, i) => v - E[i]), fingers) / (Math.PI / 180);
      assert.ok(flex < (name === 'stand' ? 30 : 50), `${name}: the left wrist ${flex.toFixed(0)} degrees off the forearm`);
    }
    for (const t of [0, 0.25, 0.5, 0.75]) {
      const d = E.map((v, i) => v * (1 - t) + W[i] * t - C[i]);
      const dot = axis => d.reduce((sum, v, i) => sum + v * axis[i], 0);
      const outside = Math.hypot(dot(frame.right) / (body.shoulderWidth * 0.64), dot(frame.fwd) / (body.shoulderWidth * 0.56));
      assert.ok(outside >= 1, `${name}: the forearm at ${t} clears plate (${outside.toFixed(2)})`);
    }
  }
});

test('GRIP-ANATOMY: the trunk leant under the hands leaves them where they were asked (solveBody `trunk`)', () => {
  const ask = (ctx) => {
    // ahead of each shoulder and below it, within the arm's reach before the lean and after it
    const f = ctx.frames, at = (side) => f.shoulder[side].map((v, i) => v + f.fwd[i] * 20 - f.up[i] * 22 + f.right[i] * (side === 'R' ? -3 : 3));
    return { L: { at: at('L'), w: 1 }, R: { at: at('R'), w: 1 } };
  };
  const plain = new Map(), leant = new Map();
  let asked = null;
  solveBody(sk, plain, GRAPH_ROOT, sm, { w: 1, armW: { L: 1, R: 1 }, arms: (ctx) => (asked = ask(ctx)) });
  const report = solveBody(sk, leant, GRAPH_ROOT, sm, { w: 1, armW: { L: 1, R: 1 }, arms: ask, trunk: { yaw: -10 * Math.PI / 180, pitch: 8 * Math.PI / 180 } });
  const m0 = sm(sk, plain, GRAPH_ROOT), m1 = sm(sk, leant, GRAPH_ROOT);
  for (const side of ['L', 'R']) {
    assert.ok(Math.hypot(...m1.get(body.bones[side].hand).t.map((v, i) => v - asked[side].at[i])) < 0.05, `${side} hand where it was asked`);
    assert.ok(report.reach[side] < 0.05, `${side} reached`);
  }
  const f0 = bodyFrames(body, m0), f1 = bodyFrames(body, m1);
  assert.ok(f1.fwd[0] > f0.fwd[0] + Math.sin(8 * Math.PI / 180), 'the chest turned toward the right');
  assert.ok(f1.fwd[2] < f0.fwd[2] - Math.sin(5 * Math.PI / 180), 'the chest leant forward');
});
