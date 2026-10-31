// GUARD-TRAVEL: real bundled MAO clips on the retail hierarchy, not hand-authored joint poses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { collectTextKeys, normalizeTextKeys, extractTracks, resetClip, sampleTrack, animVelocity } from '../../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, accumRootRef, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { loopWindow } from '../../../src/combat/leftArmLayer.js';
import { createGuardWalkBalance, kneePole } from '../../../src/characters/bodyMotion/guardWalkBalance.js';
import { createBodyWeight } from '../../../src/characters/bodyMotion/bodyWeight.js';
import { MW_UNITS_PER_METER, MW_WEAPON_TYPE } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { walkStrideShare } from '../../../src/characters/bodyMotion/stride.js';

const nif = parseNif(readFileSync(new URL('../../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', import.meta.url)));
const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif), source = { keys, trackMap };
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dist = (a, b) => Math.hypot(...sub(a, b));
const skeleton = () => buildSkeleton(parseNif(retailSkeleton()));

import { createBodyMotion, motionWord } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { advanceClip } from '../../../src/formats/morrowind/mwAnim.js';
import { poseAssembly } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { createLowerBodyLayer, lowerBodyBones } from '../../../src/combat/lowerBodyLayer.js';
import { createGuardWalkPose, guardWalks } from '../../../src/characters/bodyMotion/guardWalkPose.js';

function walkingWord(cam, shown = true, type = MW_WEAPON_TYPE.LongBladeTwoHand, extra = {}) {
  return motionWord({ cam, third: true, rig: { ok: true, settingsSkeleton: 'meshes/base_anim.nif', mwType: type },
    shown, upper: 'WeaponEquipped', ...extra });
}

test('GUARD-WALK-POSE: only the drawn two-handed ground walk receives the combat posture', () => {
  const cam = { move: { speed: 4.43, forward: 1, grounded: true } };
  assert.equal(guardWalks(walkingWord(cam), 'walkforward'), true);
  for (const word of [walkingWord(cam, false), walkingWord(cam, true, MW_WEAPON_TYPE.LongBladeOneHand),
    walkingWord(cam, true, MW_WEAPON_TYPE.LongBladeTwoHand, { hit: true }),
    walkingWord({ move: { ...cam.move, running: true } }), walkingWord({ move: { ...cam.move, grounded: false } })]) {
    assert.equal(guardWalks(word, 'walkforward'), false);
  }
  for (const group of ['runforward', 'idle2c', 'walkleft2c', 'jump']) assert.equal(guardWalks(walkingWord(cam), group), false);
});

test('GUARD-WALK-POSE: real composed walking stays lower, knees yield through the step, and feet remain smooth at 30/60/120 Hz', () => {
  for (const hz of [30, 60, 120]) {
    const measure = (shown) => {
      const sk = skeleton(), body = bodyOf(sk, GRAPH_ROOT, sm), accumRoot = accumRootRef(sk, trackMap);
      const state = resetClip(keys, 'walkforward'), layer = createBodyWeight(), motion = createBodyMotion();
      const lower = createLowerBodyLayer({ sampleTrack }), mask = lowerBodyBones(sk);
      const assembly = { skeleton: sk, fns: { poseSkeleton, skelMats: sm }, pieces: [] }, rows = [];
      const speed = 4.43, animSpeed = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), state.group);
      for (let f = 0; f < hz * 5; f++) {
        const cam = { yaw: 0, move: { speed, running: false, forward: 1, strafe: 0, grounded: true, bodyYaw: 0, travel: [0, 0, f * speed / hz] } };
        const word = walkingWord(cam, shown);
        assert.ok(word.on);
        advanceClip(state, keys, 1 / hz * layer.moveRate(speed * MW_UNITS_PER_METER / animSpeed, state.group));
        lower.stepRig(1 / hz, true, null, null, null, null, state, source, null, null);
        motion.step(1 / hz, word);
        layer.stepRig(1 / hz, true, cam, null, word.mwType, false, word, state, source, animSpeed);
        poseAssembly(assembly, { tracks: lower.tracks(trackMap, mask), sampleTrack: lower.sampler(sampleTrack),
          time: state.time, accumRoot, skin: false, motion: layer.slot(motion.slot) });
        if (f < hz * 2) continue;
        const mats = assembly.mats, row = { hip: mats.get(body.bones.pelvis).t[2], feet: [], flex: [] };
        for (const side of ['L', 'R']) {
          const b = body.bones[side], h = mats.get(b.thigh).t, k = mats.get(b.calf).t, a = mats.get(b.foot).t;
          const u = sub(h, k), v = sub(a, k);
          row.feet.push(a);
          row.flex.push(180 - Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, x, i) => sum + x * v[i], 0) / Math.hypot(...u) / Math.hypot(...v)))) * 180 / Math.PI);
        }
        rows.push(row);
      }
      let peakAcceleration = 0;
      for (let f = 2; f < rows.length; f++) for (let side = 0; side < 2; side++) {
        const v = sub(rows[f].feet[side], rows[f - 1].feet[side]), old = sub(rows[f - 1].feet[side], rows[f - 2].feet[side]);
        peakAcceleration = Math.max(peakAcceleration, Math.hypot(...sub(v, old)) * hz * hz / MW_UNITS_PER_METER);
      }
      const mean = (a) => a.reduce((sum, v) => sum + v, 0) / a.length;
      const flex = rows.flatMap((r) => r.flex), heights = rows.map((r) => r.hip);
      return { height: mean(heights), bounce: Math.max(...heights) - Math.min(...heights),
        meanFlex: mean(flex), minFlex: Math.min(...flex), maxFlex: Math.max(...flex), peakAcceleration };
    };
    const ordinary = measure(false), guard = measure(true);
    assert.ok(ordinary.height - guard.height > 0.03 * MW_UNITS_PER_METER, `${hz} Hz: no lower combat posture`);
    assert.ok(ordinary.height - guard.height < 0.07 * MW_UNITS_PER_METER, `${hz} Hz: excessive crouch`);
    assert.ok(guard.minFlex > 25, `${hz} Hz: the supporting knee straightens out`);
    assert.ok(guard.meanFlex > ordinary.meanFlex + 8, `${hz} Hz: still ordinary walking`);
    assert.ok(guard.maxFlex - guard.minFlex > 30, `${hz} Hz: knees frozen in a squat`);
    assert.ok(guard.maxFlex < 105, `${hz} Hz: knees fold too far`);
    assert.ok(guard.bounce < ordinary.bounce * 0.8, `${hz} Hz: excessive bounce returns`);
    assert.ok(guard.peakAcceleration < ordinary.peakAcceleration * 1.3, `${hz} Hz: foot whipping returns`);
  }
});

test('GUARD-WALK-POSE: lowering the guard preserves ankle targets and foot orientation, and releases without a snap', () => {
  const sk = skeleton(), body = bodyOf(sk, GRAPH_ROOT, sm), accumRoot = accumRootRef(sk, trackMap);
  const state = resetClip(keys, 'walkforward'), win = loopWindow(state, keys), cam = { move: { speed: 4.43, grounded: true, forward: 1 } };
  const guard = createGuardWalkPose(), word = walkingWord(cam);
  for (let f = 0; f < 90; f++) guard.step(1 / 60, true, word, state.group);
  const heights = [];
  for (let f = 0; f < 90; f++) {
    const time = win.start + (win.stop - win.start) * f / 90;
    const pose = poseSkeleton(sk, trackMap, sampleTrack, time, { accumRoot }), before = sm(sk, pose, GRAPH_ROOT);
    guard.slot(null)(sk, pose, GRAPH_ROOT, sm);
    const after = sm(sk, pose, GRAPH_ROOT);
    if (f === 0) assert.ok(before.get(body.bones.pelvis).t[2] - after.get(body.bones.pelvis).t[2] > 1, 'the guard must actually lower the body');
    for (const side of ['L', 'R']) {
      const ref = body.bones[side].foot, a = before.get(ref), b = after.get(ref);
      assert.ok(dist(a.t, b.t) < 1e-3, 'combat posture moved an ankle target');
      assert.ok(a.a.every((v, i) => Math.abs(v - b.a[i]) < 1e-4), 'combat posture turned a foot');
    }
  }
  // Hold one sampled pose while withdrawing the guard: only the posture's transition moves it.
  for (let f = 0; f < 100; f++) {
    guard.step(1 / 60, true, walkingWord(cam, false), state.group);
    const pose = poseSkeleton(sk, trackMap, sampleTrack, win.start, { accumRoot });
    guard.slot(null)(sk, pose, GRAPH_ROOT, sm);
    heights.push(sm(sk, pose, GRAPH_ROOT).get(body.bones.pelvis).t[2]);
  }
  assert.ok(Math.max(...heights.slice(1).map((z, i) => Math.abs(z - heights[i]))) < 1, 'guard release pops vertically');
  assert.deepEqual(guard.share(2.49), walkStrideShare(2.49), 'ordinary cadence returns exactly');
});

test('GUARD-KNEE-POLE: a nearly straight leg whose clip knee strays behind its line still bends toward the toes; a bent knee keeps its own way', () => {
  const hip = [0, 0, 100], ankle = [0, 0, 10], toe = [0, 1, 0], length = 90;
  const towardToes = (knee) => {
    const pole = kneePole(hip, knee, toe, length), d = [0, 0, -1], along = pole[0] * d[0] + pole[1] * d[1] + pole[2] * d[2];
    return pole[1] - along * d[1];
  };
  assert.ok(ankle[2] < hip[2]);
  assert.ok(towardToes([0, -0.5, 55]) > 0, 'behind the line by a hair: the toes decide');
  assert.ok(towardToes([0, 12, 55]) > 0, 'a bent knee stays forward');
  assert.ok(towardToes([0, -20, 55]) < 0, 'a real backward knee stays the clip own');
});

test('GUARD-WALK-LEVEL: the partial skeleton walks answer the same pose as whole walks', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const run = (walk) => {
    const balance = createGuardWalkBalance({ share: 0.6, mean: 0.18, ease: 0.01, reach: 0.97, settle: 0.055 });
    balance.step(1, true);
    const pose = new Map();
    balance.apply(sk, pose, GRAPH_ROOT, walk);
    return pose;
  };
  const partial = run(sm), whole = run((s, p, r) => sm(s, p, r));
  assert.ok(partial.size > 0, 'the balance posed');
  assert.equal(partial.size, whole.size);
  for (const [ref, local] of partial) {
    assert.deepEqual([...local.rotation], [...whole.get(ref).rotation], `rotation of ${ref}`);
    assert.deepEqual([...local.translation], [...whole.get(ref).translation], `translation of ${ref}`);
  }
});
