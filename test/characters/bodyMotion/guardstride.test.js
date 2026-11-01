// GUARD-TRAVEL: real bundled MAO clips on the retail hierarchy, not hand-authored joint poses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { collectTextKeys, normalizeTextKeys, extractTracks, resetClip, sampleTrack, animVelocity } from '../../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, accumRootRef, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { loopWindow } from '../../../src/combat/leftArmLayer.js';
import { guardMovementGroup } from '../../../src/combat/guardLocomotion.js';
import { createBodyWeight } from '../../../src/characters/bodyMotion/bodyWeight.js';
import { createBlowLegs } from '../../../src/characters/bodyMotion/blowLegs.js';
import { MW_UNITS_PER_METER, MW_WEAPON_TYPE } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { travelStrideProfile } from '../../../src/characters/bodyMotion/travelStride.js';
import { createStride, walkStrideShare, runStrideShare } from '../../../src/characters/bodyMotion/stride.js';

const nif = parseNif(readFileSync(new URL('../../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', import.meta.url)));
const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif), source = { keys, trackMap };
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dist = (a, b) => Math.hypot(...sub(a, b));
const skeleton = () => buildSkeleton(parseNif(retailSkeleton()));
function cycle(group, speedOverride = null, fallbackWalk = false) {
  const base = group.startsWith('run') ? 'runforward' : 'walkforward';
  const picked = guardMovementGroup(base, MW_WEAPON_TYPE.LongBladeTwoHand, (g) => !(fallbackWalk && g === 'walkforward') && resetClip(keys, g).ok, true);
  const sk = skeleton(), state = resetClip(keys, picked.group), win = loopWindow(state, keys);
  assert.ok(state.ok);
  const accumRoot = accumRootRef(sk, trackMap), run = group.startsWith('run');
  const speed = speedOverride ?? (run ? 8.1 : 4.43);
  const animSpeed = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), state.group);
  const layer = createBodyWeight();
  for (let i = 0; i < 120; i++) layer.stepRig(1 / 60, true, { move: { speed } }, null, MW_WEAPON_TYPE.LongBladeTwoHand, false, null, state, source, animSpeed);
  const rows = [];
  for (let i = 0; i < 120; i++) {
    const time = win.start + (win.stop - win.start) * i / 120;
    const pose = poseSkeleton(sk, trackMap, sampleTrack, time, { accumRoot });
    layer.slot(null)(sk, pose, GRAPH_ROOT, sm);
    rows.push({ pose, time, mats: sm(sk, pose, GRAPH_ROOT) });
  }
  return { sk, state, layer, rows, k: speed * 70 / animSpeed };
}

test('GUARD-TRAVEL: the fallback armed walk keeps its shorter stride and bounded hip dip', () => {
  const { sk, rows, layer, k } = cycle('walkforward2c', null, true);
  const hip = sk.byName.get('bip01 l thigh'), L = sk.byName.get('bip01 l foot'), R = sk.byName.get('bip01 r foot');
  const split = Math.max(...rows.map(({ mats: m }) => Math.abs(m.get(L).t[1] - m.get(R).t[1])));
  const z = rows.map(({ mats: m }) => m.get(hip).t[2]);
  assert.ok(split < 82, `foot separation ${split} MW units (before: 92)`);
  assert.ok(Math.max(...z) - Math.min(...z) < 17, 'hip excursion stays below 17 MW units (before: 20.5)');
  assert.ok(layer.moveRate(k, 'walkforward2c') < 1.9, 'the shorter step does not become a frantic 2.5x clip');
});

test('GUARD-CONTINUITY: the two-hander keeps the accepted free gait lower body, including when slowed', () => {
  for (const [group, speed] of [['runforward', 8.1], ['runforward', 5.8], ['walkforward', 4.43], ['walkforward', 2.5]]) {
    const { sk, rows, state } = cycle(group, speed);
    assert.equal(state.group, group, 'the real group resolver chooses the accepted gait');
    const accumRoot = accumRootRef(sk, trackMap);
    const animSpeed = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), state.group);
    const reference = createStride({ sampleTrack, loopWindow, groups: /^(walk|run)/i, profile: travelStrideProfile });
    for (let i = 0; i < 120; i++) reference.stepRig(1 / 60, true, state, source, { move: { speed } }, animSpeed, MW_UNITS_PER_METER);
    for (const row of rows) {
      const pose = poseSkeleton(sk, trackMap, sampleTrack, row.time, { accumRoot });
      reference.slot(null)(sk, pose, GRAPH_ROOT, sm);
      const expected = sm(sk, pose, GRAPH_ROOT);
      for (const name of ['bip01 pelvis', 'bip01 l thigh', 'bip01 r thigh', 'bip01 l calf', 'bip01 r calf', 'bip01 l foot', 'bip01 r foot']) {
        const ref = sk.byName.get(name);
        assert.ok(dist(row.mats.get(ref).t, expected.get(ref).t) < 1e-6, `${name}: the guard must not warp the accepted gait trajectory`);
      }
    }
  }
});

test('GUARD-TRAVEL: the shared rig routes only two-handed stance groups to the new cadence', () => {
  for (const group of ['walkforward', 'runforward', 'walkforward1h', 'walkleft2c', 'runback2c', 'walkforward2c', 'runforward2c']) {
    const layer = createBodyWeight(), k = 2.49;
    const state = { group, startTime: 0, stopTime: 1 };
    for (let i = 0; i < 120; i++) layer.stepRig(1 / 60, true, { move: { speed: k / MW_UNITS_PER_METER, grounded: true } }, null, 0, false, null, state, source, 1);
    const rate = layer.moveRate(k, group);
    if (/^walkforward2c$/.test(group)) assert.notEqual(rate, (group.startsWith('run') ? runStrideShare : walkStrideShare)(k).rate);
    else assert.equal(rate, (group.startsWith('run') ? runStrideShare : walkStrideShare)(k).rate);
  }
});

test('GUARD-TRAVEL: a moving strike adds limited sink on the real guard stride, never anchors its feet', () => {
  const { sk, rows } = cycle('walkforward2c'), body = bodyOf(sk, GRAPH_ROOT, sm), layer = createBlowLegs();
  let deepest = 0, footError = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = i % 60, section = p < 20 ? 'windup' : p < 30 ? 'release' : 'follow';
    const progress = p < 20 ? p / 19 : p < 30 ? (p - 20) / 9 : (p - 30) / 29;
    layer.step(1 / 60, true, { on: true, grounded: true, speed: 4.43, shown: true, mwType: MW_WEAPON_TYPE.LongBladeTwoHand, blow: { type: 'chop', section, progress, strength: 1, hand: 'R' } }, 1);
    const { pose, mats: before } = rows[i], afterPose = new Map(pose);
    layer.apply(sk, afterPose, GRAPH_ROOT, sm);
    const after = sm(sk, afterPose, GRAPH_ROOT);
    deepest = Math.max(deepest, before.get(body.bones.pelvis).t[2] - after.get(body.bones.pelvis).t[2]);
    for (const s of ['L', 'R']) footError = Math.max(footError, dist(before.get(body.bones[s].foot).t, after.get(body.bones[s].foot).t));
    assert.equal(layer.status().anchored, false);
  }
  assert.ok(deepest < 0.065 * body.leg, `added sink ${deepest / body.leg} of leg`);
  assert.ok(deepest > 0.01 * body.leg, 'the blow still has lower-body effort');
  assert.ok(footError < 0.04 * body.leg, `foot error ${footError / body.leg} of leg`);
});


test('RUNNING-BLOW-LEGS: a running attack never re-solves the stride, even below the old speed fade or after a walking/standing blow', () => {
  const { sk, rows } = cycle('runforward2c', 5.8);
  for (const speed of [5.8, 4.4, 2.5, 0.5, 6.5, 8.1]) for (const type of ['chop', 'slash', 'thrust']) {
    const legs = createBlowLegs();
    const blow = { type, section: 'release', progress: 0.7, strength: 1, hand: 'R' };
    // The most dangerous handoff: an already active walking strike, not a fresh empty layer.
    for (let i = 0; i < 60; i++) legs.step(1 / 60, true, { on: true, grounded: true, speed: 4.4, running: false,
      shown: true, mwType: MW_WEAPON_TYPE.LongBladeTwoHand, blow }, 1);
    assert.ok(legs.weight() > 0.9);
    for (const row of rows.slice(0, 12)) {
      legs.step(1 / 60, true, { on: true, grounded: true, speed, running: true,
        shown: true, mwType: MW_WEAPON_TYPE.LongBladeTwoHand, blow }, 1);
      const posed = new Map(row.pose);
      legs.apply(sk, posed, GRAPH_ROOT, sm);
      assert.deepEqual(posed, row.pose, `${type} at ${speed} m/s must leave the full running pose untouched`);
      assert.equal(legs.weight(), 0, 'no residual IK fade may drag the feet');
      assert.equal(legs.status().anchored, false);
    }
  }
});


test('RUNNING-BLOW-LEGS: holding the run key while standing does not disable the accepted standing blow', () => {
  const legs = createBlowLegs();
  for (let i = 0; i < 60; i++) legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, running: true,
    shown: true, mwType: MW_WEAPON_TYPE.LongBladeTwoHand,
    blow: { type: 'chop', section: 'release', progress: 0.7, strength: 1, hand: 'R' } }, 1);
  assert.ok(legs.weight() > 0.99);
  assert.ok(legs.status().drop > 0, 'the standing strike keeps its lower-body effort');
});


test('GUARD-WALK-LEVEL: real-time stance walk reduces hip bounce while preserving both ankle trajectories and knee sides', () => {
  for (const hz of [30, 60, 120]) {
    const sk = skeleton(), state = resetClip(keys, 'walkforward2c'), win = loopWindow(state, keys);
    const accumRoot = accumRootRef(sk, trackMap), body = bodyOf(sk, GRAPH_ROOT, sm), speed = 4.43;
    const animSpeed = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), state.group);
    const reference = createStride({ sampleTrack, loopWindow, groups: /^walkforward2c$/i,
      share: (k) => ({ rate: k / 1.35, stride: 1.35 }), calf: 0, toeMax: 22 });
    const layer = createBodyWeight(), beforeZ = [], afterZ = [];
    let ankleError = 0, turnError = 0, maxStep = 0, oldStep = 0;
    for (let frame = 0; frame < hz * 5; frame++) {
      reference.stepRig(1 / hz, true, state, source, { move: { speed } }, animSpeed, MW_UNITS_PER_METER);
      layer.stepRig(1 / hz, true, { move: { speed } }, null, MW_WEAPON_TYPE.LongBladeTwoHand, false, null, state, source, animSpeed);
      const time = win.start + (frame / hz * layer.moveRate(speed * MW_UNITS_PER_METER / animSpeed, state.group)) % (win.stop - win.start);
      const baseline = poseSkeleton(sk, trackMap, sampleTrack, time, { accumRoot });
      const leveled = new Map(baseline);
      reference.slot(null)(sk, baseline, GRAPH_ROOT, sm);
      layer.slot(null)(sk, leveled, GRAPH_ROOT, sm);
      if (frame < hz * 2) continue;
      const a = sm(sk, baseline, GRAPH_ROOT), b = sm(sk, leveled, GRAPH_ROOT);
      beforeZ.push(a.get(body.bones.pelvis).t[2]);
      afterZ.push(b.get(body.bones.pelvis).t[2]);
      if (afterZ.length > 1) {
        maxStep = Math.max(maxStep, Math.abs(afterZ.at(-1) - afterZ.at(-2)));
        oldStep = Math.max(oldStep, Math.abs(beforeZ.at(-1) - beforeZ.at(-2)));
      }
      for (const side of ['L', 'R']) {
        const { thigh, calf, foot } = body.bones[side];
        ankleError = Math.max(ankleError, dist(a.get(foot).t, b.get(foot).t));
        turnError = Math.max(turnError, ...a.get(foot).a.map((v, i) => Math.abs(v - b.get(foot).a[i])));
        // A height correction must not send the knee across the leg's original bending plane.
        const cross = (x, y) => [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]];
        const normal = (m) => cross(sub(m.get(foot).t, m.get(thigh).t), sub(m.get(calf).t, m.get(thigh).t));
        const oldN = normal(a), newN = normal(b);
        assert.ok(oldN.reduce((v, n, i) => v + n * newN[i], 0) > 0, `${hz} Hz ${side}: knee flipped`);
      }
    }
    const range = (zs) => Math.max(...zs) - Math.min(...zs);
    assert.ok(range(afterZ) < range(beforeZ) * 0.6, `${hz} Hz: excessive hip bounce`);
    assert.ok(ankleError < 1e-3, `${hz} Hz: changed ankle path by ${ankleError}`);
    assert.ok(turnError < 1e-4, `${hz} Hz: changed foot rotation by ${turnError}`);
    assert.ok(maxStep < oldStep * 0.7, `${hz} Hz: abrupt height change ${maxStep}`);
  }
});


import { advanceClip } from '../../../src/formats/morrowind/mwAnim.js';
import { seamSampler, smoothSampler } from '../../../src/combat/loopSeam.js';

test('GUARD-STEP-BASE: the resolved walk removes the armed clip foot whip at real cadence with smoothing on or off', () => {
  for (const hz of [30, 60, 120]) for (const smooth of [false, true]) {
    const measure = (fallback) => {
      const sk = skeleton(), body = bodyOf(sk, GRAPH_ROOT, sm), layer = createBodyWeight();
      const picked = guardMovementGroup('walkforward', MW_WEAPON_TYPE.LongBladeTwoHand,
        (g) => !(fallback && g === 'walkforward') && resetClip(keys, g).ok, true);
      const state = resetClip(keys, picked.group), accumRoot = accumRootRef(sk, trackMap), win = loopWindow(state, keys);
      const animSpeed = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), state.group);
      const seam = seamSampler(sampleTrack, sampleTrack, state, source, win), sample = smooth ? smoothSampler(seam, 1 / 60, win) : seam;
      const feet = [];
      for (let f = 0; f < hz * 5; f++) {
        advanceClip(state, keys, 1 / hz * layer.moveRate(4.43 * MW_UNITS_PER_METER / animSpeed, state.group));
        layer.stepRig(1 / hz, true, { move: { speed: 4.43 } }, null, MW_WEAPON_TYPE.LongBladeTwoHand, false, null, state, source, animSpeed);
        const pose = poseSkeleton(sk, trackMap, sample, state.time, { accumRoot });
        layer.slot(null)(sk, pose, GRAPH_ROOT, sm);
        if (f < hz * 2) continue;
        const mats = sm(sk, pose, GRAPH_ROOT);
        feet.push(['L', 'R'].map((side) => mats.get(body.bones[side].foot).t));
      }
      let peakSpeed = 0, peakAcceleration = 0;
      for (let f = 2; f < feet.length; f++) for (let side = 0; side < 2; side++) {
        const v = sub(feet[f][side], feet[f - 1][side]), old = sub(feet[f - 1][side], feet[f - 2][side]);
        peakSpeed = Math.max(peakSpeed, Math.hypot(...v) * hz / MW_UNITS_PER_METER);
        peakAcceleration = Math.max(peakAcceleration, Math.hypot(...sub(v, old)) * hz * hz / MW_UNITS_PER_METER);
      }
      return { group: state.group, peakSpeed, peakAcceleration };
    };
    const old = measure(true), chosen = measure(false);
    assert.equal(chosen.group, 'walkforward');
    assert.ok(chosen.peakSpeed < old.peakSpeed * 0.9, 'the foot still whips as fast as the armed clip');
    assert.ok(chosen.peakAcceleration < old.peakAcceleration * 0.75, 'the foot still changes speed as abruptly as the armed clip');
  }
});
